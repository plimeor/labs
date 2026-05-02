import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { log, tasks } from '@clack/prompts'
import * as v from 'valibot'

import { Checkout } from '../checkout.js'
import { type InstallResult, installSkill, removeInstalledSkill } from '../installer.js'
import { Lock } from '../lock.js'
import { Manifest } from '../manifest.js'
import { formatDisplayPath, resolveScope } from '../scope.js'
import { SyncPlan } from '../sync-plan.js'
import { optionalBoolean } from './schemas.js'

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
    process.stdout.write(dryRunPlan)
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

    for (const request of uniqueCheckoutRequests(syncPlan.installRequests)) {
      log.step(`Resolving ${formatCheckoutTarget(request)}`)
    }

    await Checkout.withAll(syncPlan.installRequests, async checkouts => {
      const installResults = new Map<
        string,
        {
          checkout: Checkout.Result
          result: InstallResult
          skill: Manifest.Skill
        }
      >()

      await tasks(
        syncPlan.installSkills.map(skill => ({
          title: `Install ${skill.name}`,
          task: async () => {
            const request = syncPlan.installRequestsBySkillName[skill.name]
            const checkout = Checkout.requireResult(checkouts, request, skill.name)
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
  await Checkout.withAll(
    allSources.map(source => ({ commit: source.commit, ref: source.ref, source: source.source })),
    async checkouts => {
      for (const source of allSources) {
        const request = { commit: source.commit, ref: source.ref, source: source.source }
        const checkout = Checkout.requireResult(checkouts, request, source.source)
        const skillNames = await discoverSkillNames(checkout.dir)
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
  checkout: Checkout.Result,
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

function formatCheckoutTarget(request: Checkout.Request): string {
  const source = formatDisplayPath(request.source)
  if (request.commit) {
    const commit = request.commit === 'local' ? request.commit : request.commit.slice(0, 7)
    return `${source} at commit ${commit}`
  }

  return request.ref ? `${source} at ref ${request.ref}` : `${source} at HEAD`
}

function uniqueCheckoutRequests(requests: Checkout.Request[]): Checkout.Request[] {
  return [...new Map(requests.map(request => [Checkout.key(request), request])).values()]
}
