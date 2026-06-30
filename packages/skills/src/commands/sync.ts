import { readdir, realpath } from 'node:fs/promises'
import { join } from 'node:path'

import { log, tasks } from '@clack/prompts'
import * as Git from '@plimeor/git-kit'
import * as v from 'valibot'

import {
  type InstallResult,
  installedSkillContentHash,
  installedSkillPath,
  installSkill,
  removeInstalledSkill,
  sourceSkillContentHash
} from '../installer'
import { isNotFound } from '../json'
import { Lock } from '../lock'
import { Manifest } from '../manifest'
import { type RepositoryRequest, repositoryRequestKey, repositoryRequestRef } from '../repository'
import { formatDisplayPath, resolveScope, type Scope } from '../scope'
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

type InstallGroup = {
  request: RepositoryRequest
  skills: Manifest.Skill[]
}

type InstallPlan = {
  pendingGroups: InstallGroup[]
  skippedSkills: Manifest.Skill[]
}

type InstallOperation = {
  checkout: Git.Checkout
  kind: 'install' | 'update'
  skill: Manifest.Skill
}

type SkippedLockRefresh = {
  checkout: Git.Checkout
  contentHash: string
  locked: Lock.Entry
  skill: Manifest.Skill
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
    const dryRunPlan = await formatDryRun(syncPlan, lock, scope)
    if (!dryRunPlan) {
      log.message('Skills are already in sync', { withGuide: false })
      return
    }

    log.message(dryRunPlan.trimEnd(), { withGuide: false })
    return
  }

  let nextLock = lock
  let appliedChanges = 0
  if (syncPlan.pruneNames.length > 0) {
    log.info(`Applying ${syncPlan.pruneNames.length} removals`)
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
    appliedChanges += syncPlan.pruneNames.length
  }

  const installResult = await installPlannedSkills(syncPlan, nextLock, scope)
  nextLock = installResult.lock
  appliedChanges += installResult.installedCount + installResult.refreshedCount

  if (appliedChanges === 0) {
    log.success('Skills are already in sync')
  }

  await Lock.write(scope, nextLock)
  if (appliedChanges > 0) {
    log.success(`Updated ${formatDisplayPath(scope.lockPath)}`)
  }
  await promptForPendingAgentTargetLinks(scope)
}

async function installPlannedSkills(
  syncPlan: SyncPlan.Document,
  lock: Lock.Document,
  scope: Scope
): Promise<{ installedCount: number; lock: Lock.Document; refreshedCount: number }> {
  let installedCount = 0
  let nextLock = lock
  let refreshedCount = 0
  const { pendingGroups, skippedSkills } = await planInstallGroups(syncPlan, lock, scope)
  if (pendingGroups.length === 0) {
    logSkippedSkills(skippedSkills)
    return { installedCount, lock: nextLock, refreshedCount }
  }

  for (const request of uniqueRepositoryRequests(pendingGroups.map(group => group.request))) {
    log.step(`Resolving ${formatCheckoutTarget(request)}`)
  }

  await withRepositories(
    pendingGroups.map(group => group.request),
    async checkouts => {
      const installOperations: InstallOperation[] = []
      const skippedLockRefreshes: SkippedLockRefresh[] = []

      for (const group of pendingGroups) {
        const checkout = requireRepository(checkouts, group.request, group.skills[0]?.name ?? group.request.source)
        for (const skill of group.skills) {
          const sourceContentHash = await sourceSkillContentHash(skill, checkout)
          const locked = lock.skills[skill.name]
          if (locked && (await isSkillContentCurrent(skill, locked, scope, sourceContentHash))) {
            skippedSkills.push(skill)
            skippedLockRefreshes.push({ checkout, contentHash: sourceContentHash, locked, skill })
            continue
          }

          installOperations.push({ checkout, kind: locked ? 'update' : 'install', skill })
        }
      }

      logSkippedSkills(skippedSkills)
      for (const skipped of skippedLockRefreshes) {
        nextLock = Lock.setSkill(nextLock, skipped.skill.name, refreshedLockEntry(skipped, scope))
      }
      refreshedCount += skippedLockRefreshes.length

      if (installOperations.length === 0) {
        return
      }

      log.info(formatInstallOperationSummary(installOperations, scope))
      const installResults = new Map<
        string,
        {
          checkout: Git.Checkout
          result: InstallResult
          skill: Manifest.Skill
        }
      >()

      await tasks(
        installOperations.map(operation => ({
          title: `${formatInstallOperationVerb(operation.kind)} ${operation.skill.name}`,
          task: async () => {
            const result = await installSkillWithContext(operation.skill, operation.checkout, scope)
            installResults.set(operation.skill.name, {
              checkout: operation.checkout,
              result,
              skill: operation.skill
            })
            return `${formatInstallOperationPast(operation.kind)} ${formatDisplayPath(result.installPath)}`
          }
        }))
      )

      for (const operation of installOperations) {
        const installed = installResults.get(operation.skill.name)
        if (!installed) {
          throw new Error(`Missing install result for ${operation.skill.name}`)
        }
        nextLock = Lock.setSkill(
          nextLock,
          installed.skill.name,
          Lock.createEntry(
            installed.skill,
            installed.checkout,
            installed.result.contentHash,
            installed.result.installPath,
            new Date().toISOString()
          )
        )
      }
      installedCount = installOperations.length
    }
  )

  return { installedCount, lock: nextLock, refreshedCount }
}

async function formatDryRun(syncPlan: SyncPlan.Document, lock: Lock.Document, scope: Scope): Promise<string> {
  const { pendingGroups } = await planInstallGroups(syncPlan, lock, scope)
  return SyncPlan.formatDryRun(withInstallGroups(syncPlan, pendingGroups), scope)
}

async function planInstallGroups(syncPlan: SyncPlan.Document, lock: Lock.Document, scope: Scope): Promise<InstallPlan> {
  const pendingGroups: InstallGroup[] = []
  const skippedSkills: Manifest.Skill[] = []
  const unresolvedGroups: InstallGroup[] = []
  for (const group of groupInstallSkills(syncPlan)) {
    const targetCommit = await resolveRequestTargetCommit(group.request)
    if (!targetCommit) {
      unresolvedGroups.push(group)
      continue
    }

    if (await isInstallGroupCurrent(group, lock, scope, targetCommit)) {
      skippedSkills.push(...group.skills)
      continue
    }

    pendingGroups.push(group)
  }

  await withRepositories(
    unresolvedGroups.map(group => group.request),
    async checkouts => {
      for (const group of unresolvedGroups) {
        const checkout = requireRepository(checkouts, group.request, group.skills[0]?.name ?? group.request.source)
        if (await isInstallGroupCurrent(group, lock, scope, checkout.headSha)) {
          skippedSkills.push(...group.skills)
          continue
        }

        pendingGroups.push(group)
      }
    }
  )

  return {
    pendingGroups,
    skippedSkills: skippedSkills.sort((a, b) => a.name.localeCompare(b.name))
  }
}

function logSkippedSkills(skippedSkills: Manifest.Skill[]): void {
  if (skippedSkills.length === 0) {
    return
  }

  const sortedSkills = [...skippedSkills].sort((a, b) => a.name.localeCompare(b.name))
  const label = sortedSkills.length === 1 ? 'skill' : 'skills'
  const names = sortedSkills.map(skill => `- ${skill.name}`).join('\n')
  log.info(`Skipped ${sortedSkills.length} ${label} already in sync:\n${names}`)
}

function refreshedLockEntry(refresh: SkippedLockRefresh, scope: Scope): Lock.Entry {
  return {
    commit: refresh.checkout.headSha,
    contentHash: refresh.contentHash,
    installedAt: refresh.locked.installedAt,
    installPath: installedSkillPath(refresh.skill.name, scope),
    method: 'copy',
    path: refresh.skill.path,
    ref: refresh.skill.ref,
    source: refresh.skill.source
  }
}

function formatInstallOperationSummary(operations: InstallOperation[], scope: Scope): string {
  const installCount = operations.filter(operation => operation.kind === 'install').length
  const updateCount = operations.filter(operation => operation.kind === 'update').length
  const parts = [
    installCount > 0 ? `installing ${installCount} ${installCount === 1 ? 'skill' : 'skills'}` : undefined,
    updateCount > 0 ? `updating ${updateCount} ${updateCount === 1 ? 'skill' : 'skills'}` : undefined
  ].filter(Boolean)

  return `Applying ${operations.length} skill changes into ${formatDisplayPath(scope.installDir)}: ${parts.join(', ')}`
}

function formatInstallOperationVerb(kind: InstallOperation['kind']): string {
  return kind === 'install' ? 'Install' : 'Update'
}

function formatInstallOperationPast(kind: InstallOperation['kind']): string {
  return kind === 'install' ? 'Installed' : 'Updated'
}

function withInstallGroups(syncPlan: SyncPlan.Document, installGroups: InstallGroup[]): SyncPlan.Document {
  const installSkills = installGroups.flatMap(group => group.skills).sort((a, b) => a.name.localeCompare(b.name))
  const installRequestsBySkillName = Object.fromEntries(
    installGroups.flatMap(group => group.skills.map(skill => [skill.name, group.request]))
  )

  return {
    ...syncPlan,
    installRequests: installSkills.map(skill => installRequestsBySkillName[skill.name]),
    installRequestsBySkillName,
    installSkills
  }
}

function groupInstallSkills(syncPlan: SyncPlan.Document): InstallGroup[] {
  const groups = new Map<string, InstallGroup>()
  for (const skill of syncPlan.installSkills) {
    const request = syncPlan.installRequestsBySkillName[skill.name]
    const key = repositoryRequestKey(request)
    const group = groups.get(key) ?? { request, skills: [] }
    group.skills.push(skill)
    groups.set(key, group)
  }

  return [...groups.values()].map(group => ({
    request: group.request,
    skills: group.skills.sort((a, b) => a.name.localeCompare(b.name))
  }))
}

async function isInstallGroupCurrent(
  group: InstallGroup,
  lock: Lock.Document,
  scope: Scope,
  targetCommit: string
): Promise<boolean> {
  for (const skill of group.skills) {
    if (!(await isSkillCurrent(skill, lock.skills[skill.name], scope, targetCommit))) {
      return false
    }
  }

  return true
}

async function isSkillCurrent(
  skill: Manifest.Skill,
  locked: Lock.Entry | undefined,
  scope: Scope,
  targetCommit: string
): Promise<boolean> {
  if (!locked || locked.commit !== targetCommit || !lockEntryMatchesSkill(skill, locked)) {
    return false
  }

  if (!(await installPathsMatch(locked.installPath, installedSkillPath(skill.name, scope)))) {
    return false
  }

  if (!locked.contentHash) {
    return false
  }

  return (await installedSkillContentHash(skill.name, scope)) === locked.contentHash
}

async function isSkillContentCurrent(
  skill: Manifest.Skill,
  locked: Lock.Entry,
  scope: Scope,
  sourceContentHash: string
): Promise<boolean> {
  if (!lockEntryMatchesSkill(skill, locked)) {
    return false
  }

  if (!(await installPathsMatch(locked.installPath, installedSkillPath(skill.name, scope)))) {
    return false
  }

  return (await installedSkillContentHash(skill.name, scope)) === sourceContentHash
}

async function installPathsMatch(lockedPath: string, expectedPath: string): Promise<boolean> {
  try {
    const [lockedRealPath, expectedRealPath] = await Promise.all([realpath(lockedPath), realpath(expectedPath)])
    return lockedRealPath === expectedRealPath
  } catch (error) {
    if (isNotFound(error)) {
      return false
    }

    throw error
  }
}

function lockEntryMatchesSkill(skill: Manifest.Skill, locked: Lock.Entry): boolean {
  return (
    locked.method === 'copy' &&
    locked.source === skill.source &&
    locked.ref === skill.ref &&
    effectiveSkillPath(skill.name, locked.path) === effectiveSkillPath(skill.name, skill.path)
  )
}

function effectiveSkillPath(skillName: string, path: string | undefined): string {
  return path ?? Manifest.defaultPath(skillName)
}

async function resolveRequestTargetCommit(request: RepositoryRequest): Promise<string | undefined> {
  if (request.commit) {
    return isFullCommitSha(request.commit) ? request.commit : undefined
  }

  try {
    return (await Git.resolveRemoteRef({ ref: request.ref, source: request.source })).headSha
  } catch {
    return undefined
  }
}

function isFullCommitSha(value: string): boolean {
  return /^[0-9a-f]{40}$/i.test(value)
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
  const sourcesToCheckout: Manifest.Source[] = []
  for (const source of allSources) {
    const cachedSkills = await resolveCachedAllSourceSkills(source, lock)
    if (cachedSkills) {
      resolvedSkills.push(...cachedSkills)
      continue
    }

    sourcesToCheckout.push(source)
  }

  await withRepositories(
    sourcesToCheckout.map(source => ({ commit: source.commit, ref: source.ref, source: source.source })),
    async checkouts => {
      for (const source of sourcesToCheckout) {
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

async function resolveCachedAllSourceSkills(
  source: Manifest.Source,
  lock: Lock.Document
): Promise<Manifest.Skill[] | undefined> {
  const targetCommit = await resolveRequestTargetCommit({
    commit: source.commit,
    ref: source.ref,
    source: source.source
  })
  if (!targetCommit) {
    return undefined
  }

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
    return undefined
  }

  if (!sourceSkills.every(skill => lock.skills[skill.name]?.commit === targetCommit)) {
    return undefined
  }

  return sourceSkills
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
