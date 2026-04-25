import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { consola } from 'consola'
import { z } from 'incur'

import { Checkout } from '../checkout.js'
import { installSkill, removeInstalledSkill } from '../installer.js'
import { Lock } from '../lock.js'
import { Manifest } from '../manifest.js'
import { formatDisplayPath, resolveScope } from '../scope.js'
import { SyncPlan } from '../sync-plan.js'

export const syncOptionsSchema = z.object({
  dryRun: z.boolean().optional(),
  global: z.boolean().optional(),
  locked: z.boolean().optional()
})

export type SyncCommandContext = {
  options: z.infer<typeof syncOptionsSchema>
}

export async function syncCommand(context: SyncCommandContext) {
  const scope = resolveScope(context.options.global ?? false)
  if (!context.options.dryRun) {
    consola.start(`Using ${formatScope(scope)} skills state`)
  }
  const lock = context.options.locked ? await Lock.read(scope) : await Lock.ensure(scope)
  const rawManifest = await Manifest.read(scope)
  const allSources = Manifest.allSourceRequests(rawManifest)
  if (!context.options.dryRun && allSources.length > 0) {
    consola.start(`Resolving ${allSources.length} all-skills sources`)
  }
  const manifest = await resolveAllSources(rawManifest, lock, context.options.locked ?? false)
  const syncPlan = SyncPlan.plan(manifest, lock, {
    locked: context.options.locked ?? false
  })

  if (context.options.dryRun) {
    process.stdout.write(SyncPlan.formatDryRun(syncPlan, scope))
    return
  }

  let nextLock = lock
  const plannedChanges = syncPlan.pruneNames.length + syncPlan.installSkills.length
  if (plannedChanges === 0) {
    consola.success('Skills are already in sync')
  } else {
    consola.info(
      `Applying ${plannedChanges} changes: ${syncPlan.pruneNames.length} removals, ${syncPlan.installSkills.length} installs`
    )

    for (const skillName of syncPlan.pruneNames) {
      consola.start(`Removing ${skillName}`)
      await removeInstalledSkill(skillName, scope)
      nextLock = Lock.removeSkill(nextLock, skillName)
      consola.success(`Removed ${skillName}`)
    }

    for (const request of uniqueCheckoutRequests(syncPlan.installRequests)) {
      consola.start(`Resolving ${formatCheckoutTarget(request)}`)
    }

    await Checkout.withAll(syncPlan.installRequests, async checkouts => {
      for (const skill of syncPlan.installSkills) {
        const request = syncPlan.installRequestsBySkillName[skill.name]
        const checkout = Checkout.requireResult(checkouts, request, skill.name)
        const result = await installSkillWithContext(skill, checkout, scope)
        nextLock = Lock.setSkill(
          nextLock,
          skill.name,
          Lock.createEntry(skill, checkout, result.installPath, new Date().toISOString())
        )
        consola.success(`Installed ${formatDisplayPath(result.installPath)}`)
      }
    })
  }

  await Lock.write(scope, nextLock)
  if (plannedChanges > 0) {
    consola.success(`Updated ${formatDisplayPath(scope.lockPath)}`)
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
