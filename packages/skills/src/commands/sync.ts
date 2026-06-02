import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { log, tasks } from '@clack/prompts'
import * as Git from '@plimeor/git-kit'
import * as v from 'valibot'

import { type InstallResult, installSkill, removeInstalledSkill } from '../installer'
import { Lock } from '../lock'
import { Manifest } from '../manifest'
import { type RepositoryRequest, repositoryRequestKey, repositoryRequestRef } from '../repository'
import { formatDisplayPath, resolveScope } from '../scope'
import { SyncPlan } from '../sync-plan'
import { promptForPendingAgentTargetLinks } from './agent-targets'
import { optionalBoolean } from './schemas'

export const syncOptionsSchema = v.object({
  dryRun: optionalBoolean('Print the planned changes without writing state'),
  global: optionalBoolean('Use the global skills manifest and lock file'),
  locked: optionalBoolean('Use locked commits instead of resolving sources')
})

export type SyncCommandContext = {
  options: v.InferOutput<typeof syncOptionsSchema>
}

export async function syncCommand(context: SyncCommandContext) {
  const scope = resolveScope(context.options.global ?? false)
  if (!context.options.dryRun) {
    log.step(`Using ${formatScope(scope)} skills state`)
  }
  const lock = context.options.locked ? await Lock.read(scope) : await Lock.ensure(scope)
  const rawManifest = await Manifest.read(scope)
  const allSources = Manifest.allSourceRequests(rawManifest)
  let manifest: Manifest.Document
  if (!context.options.dryRun && allSources.length > 0) {
    manifest = rawManifest
    await tasks([
      {
        title: `Resolving ${allSources.length} all-skills sources`,
        task: async () => {
          manifest = await resolveAllSources(rawManifest, lock, context.options.locked ?? false)
          return `Resolved ${allSources.length} all-skills sources`
        }
      }
    ])
  } else {
    manifest = await resolveAllSources(rawManifest, lock, context.options.locked ?? false)
  }
  const syncPlan = SyncPlan.plan(manifest, lock, {
    locked: context.options.locked ?? false
  })

  if (context.options.dryRun) {
    const dryRunPlan = SyncPlan.formatDryRun(syncPlan, scope)
    log.message(dryRunPlan.trimEnd(), { withGuide: false })
    return
  }

  let nextLock = lock
  const plannedChanges = syncPlan.pruneNames.length + syncPlan.installSkills.length
  if (plannedChanges === 0) {
    log.success('Skills are already in sync')
  } else {
    log.info(
      `Applying ${plannedChanges} changes: ${syncPlan.pruneNames.length} removals, ${syncPlan.installSkills.length} installs`
    )

    await tasks(
      syncPlan.pruneNames.map(skillName => ({
        title: `Remove ${skillName}`,
        task: async () => {
          await removeInstalledSkill(skillName, scope)
          return `Removed ${skillName}`
        }
      }))
    )
    for (const skillName of syncPlan.pruneNames) {
      nextLock = Lock.removeSkill(nextLock, skillName)
    }

    for (const request of uniqueRepositoryRequests(syncPlan.installRequests)) {
      log.step(`Resolving ${formatCheckoutTarget(request)}`)
    }

    await withRepositories(syncPlan.installRequests, async checkouts => {
      const installResults = new Map<
        string,
        {
          checkout: Git.Checkout
          result: InstallResult
          skill: Manifest.Skill
        }
      >()

      await tasks(
        syncPlan.installSkills.map(skill => ({
          title: `Install ${skill.name}`,
          task: async () => {
            const request = syncPlan.installRequestsBySkillName[skill.name]
            const checkout = requireRepository(checkouts, request, skill.name)
            const result = await installSkillWithContext(skill, checkout, scope)
            installResults.set(skill.name, { checkout, result, skill })
            return `Installed ${formatDisplayPath(result.installPath)}`
          }
        }))
      )

      for (const skill of syncPlan.installSkills) {
        const installed = installResults.get(skill.name)
        if (!installed) {
          throw new Error(`Missing install result for ${skill.name}`)
        }
        nextLock = Lock.setSkill(
          nextLock,
          installed.skill.name,
          Lock.createEntry(installed.skill, installed.checkout, installed.result.installPath, new Date().toISOString())
        )
      }
    })
  }

  await Lock.write(scope, nextLock)
  if (plannedChanges > 0) {
    log.success(`Updated ${formatDisplayPath(scope.lockPath)}`)
  }
  await promptForPendingAgentTargetLinks(scope)
}

async function resolveAllSources(
  manifest: Manifest.Document,
  lock: Lock.Document,
  locked: boolean
): Promise<Manifest.Document> {
  const allSources = Manifest.allSourceRequests(manifest)
  if (allSources.length === 0) {
    return manifest
  }

  if (locked) {
    return Manifest.withResolvedAllSources(manifest, resolveLockedAllSourceSkills(allSources, lock))
  }

  const resolvedSkills: Manifest.Skill[] = []
  await withRepositories(
    allSources.map(source => ({ commit: source.commit, ref: source.ref, source: source.source })),
    async checkouts => {
      for (const source of allSources) {
        const request = { commit: source.commit, ref: source.ref, source: source.source }
        const checkout = requireRepository(checkouts, request, source.source)
        const skillNames = await discoverSkillNames(checkout.directory)
        resolvedSkills.push(
          ...skillNames.map(name => ({
            commit: source.commit,
            name,
            path: Manifest.defaultPath(name),
            ref: source.ref,
            source: source.source
          }))
        )
      }
    }
  )

  return Manifest.withResolvedAllSources(manifest, resolvedSkills)
}

function resolveLockedAllSourceSkills(allSources: Manifest.Source[], lock: Lock.Document): Manifest.Skill[] {
  const skills: Manifest.Skill[] = []
  for (const source of allSources) {
    const sourceSkills = Object.entries(lock.skills)
      .filter(([_name, skill]) => matchesAllSource(source, skill))
      .map(([name, skill]) => ({
        commit: source.commit,
        name,
        path: skill.path,
        ref: source.commit ? undefined : skill.ref,
        source: skill.source
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    if (sourceSkills.length === 0) {
      throw new Error(`Missing locked skills for all-skills source: ${source.source}`)
    }

    skills.push(...sourceSkills)
  }

  return skills
}

function matchesAllSource(source: Manifest.Source, skill: Lock.Entry): boolean {
  if (skill.source !== source.source) {
    return false
  }

  if (source.commit) {
    return skill.commit === source.commit
  }

  if (source.ref) {
    return skill.ref === source.ref
  }

  return true
}

async function discoverSkillNames(checkoutDir: string): Promise<string[]> {
  const skillsDir = join(checkoutDir, 'skills')
  const entries = await readdir(skillsDir, { withFileTypes: true })
  const skillNames = entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b))
  if (skillNames.length === 0) {
    throw new Error('sync found no skills in all-skills source')
  }

  return skillNames
}

async function installSkillWithContext(
  skill: Manifest.Skill,
  checkout: Git.Checkout,
  scope: ReturnType<typeof resolveScope>
) {
  try {
    return await installSkill(skill, checkout, scope)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to install ${skill.name}: ${message}`)
  }
}

function formatScope(scope: ReturnType<typeof resolveScope>): string {
  return scope.scope === 'global'
    ? `global (${formatDisplayPath(scope.globalDir)})`
    : `project (${formatDisplayPath(process.cwd())})`
}

function formatCheckoutTarget(request: RepositoryRequest): string {
  const source = formatDisplayPath(request.source)
  if (request.commit) {
    const commit = request.commit.slice(0, 7)
    return `${source} at commit ${commit}`
  }

  return request.ref ? `${source} at ref ${request.ref}` : `${source} at HEAD`
}

function uniqueRepositoryRequests(requests: RepositoryRequest[]): RepositoryRequest[] {
  return [...new Map(requests.map(request => [repositoryRequestKey(request), request])).values()]
}

async function withRepositories<T>(
  requests: RepositoryRequest[],
  callback: (checkouts: Map<string, Git.Checkout>) => Promise<T>
): Promise<T> {
  const checkouts = new Map<string, Git.Checkout>()
  try {
    for (const request of uniqueRepositoryRequests(requests)) {
      checkouts.set(
        repositoryRequestKey(request),
        await Git.checkout({ ref: repositoryRequestRef(request), source: request.source })
      )
    }
  } catch (error) {
    await Promise.all([...checkouts.values()].map(checkout => checkout.dispose()))
    throw error
  }

  try {
    return await callback(checkouts)
  } finally {
    await Promise.all([...checkouts.values()].map(checkout => checkout.dispose()))
  }
}

function requireRepository(
  checkouts: Map<string, Git.Checkout>,
  request: RepositoryRequest,
  skillName: string
): Git.Checkout {
  const checkout = checkouts.get(repositoryRequestKey(request))
  if (!checkout) {
    throw new Error(`Missing checkout for ${skillName}`)
  }

  return checkout
}
