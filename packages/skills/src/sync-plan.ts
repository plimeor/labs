import type { Lock } from './lock'
import type { Manifest } from './manifest'
import { type RepositoryRequest, repositoryRequestKey } from './repository'
import { formatDisplayPath, type Scope } from './scope'

export namespace SyncPlan {
  export type Document = {
    installRequests: RepositoryRequest[]
    installRequestsBySkillName: Record<string, RepositoryRequest>
    installSkills: Manifest.Skill[]
    pruneNames: string[]
    useLockedCommits: boolean
  }

  export function plan(manifest: Manifest.Document, lock: Lock.Document, options: { locked: boolean }): Document {
    const manifestNames = new Set(manifest.skills.map(skill => skill.name))
    const pruneNames = Object.keys(lock.skills)
      .filter(skillName => !manifestNames.has(skillName))
      .sort((a, b) => a.localeCompare(b))
    const useLockedCommits = options.locked

    if (options.locked) {
      assertLockSatisfiesManifest(manifest, lock)
    }

    const installSkills = [...manifest.skills].sort((a, b) => a.name.localeCompare(b.name))
    const installRequestsBySkillName = Object.fromEntries(
      installSkills.map(skill => [
        skill.name,
        repositoryRequest(skill, useLockedCommits ? lock.skills[skill.name]?.commit : undefined)
      ])
    )
    const installRequests = installSkills.map(skill => installRequestsBySkillName[skill.name])

    return {
      installRequests,
      installRequestsBySkillName,
      installSkills,
      pruneNames,
      useLockedCommits
    }
  }

  export function repositoryRequest(skill: Manifest.Skill, lockedCommit?: string): RepositoryRequest {
    return {
      commit: skill.commit ?? lockedCommit,
      ref: skill.commit || lockedCommit ? undefined : skill.ref,
      source: skill.source
    }
  }

  export function formatDryRun(syncPlan: Document, scope: Scope): string {
    const lines: string[] = []
    for (const skillName of syncPlan.pruneNames) {
      lines.push(`remove ${skillName} from ${formatDisplayPath(scope.installDir)}`)
    }

    const uniqueRequests = new Map<string, RepositoryRequest>()
    for (const request of syncPlan.installRequests) {
      uniqueRequests.set(repositoryRequestKey(request), request)
    }

    for (const request of [...uniqueRequests.values()].sort(formatRequestSort)) {
      lines.push(`checkout ${formatRequest(request)}`)
    }

    for (const skill of syncPlan.installSkills) {
      lines.push(`install ${skill.name} to ${formatDisplayPath(scope.installDir)}`)
    }

    return lines.length > 0 ? `${lines.join('\n')}\n` : ''
  }

  function assertLockSatisfiesManifest(manifest: Manifest.Document, lock: Lock.Document): void {
    for (const skill of manifest.skills) {
      const locked = lock.skills[skill.name]
      if (!locked) {
        throw new Error(`Missing locked skill: ${skill.name}`)
      }

      if (locked.source !== skill.source || locked.path !== skill.path || locked.ref !== skill.ref) {
        throw new Error(`Lock entry does not match manifest skill: ${skill.name}`)
      }

      if (skill.commit && locked.commit !== skill.commit) {
        throw new Error(`Lock commit does not match pinned manifest skill: ${skill.name}`)
      }
    }
  }

  function formatRequest(request: RepositoryRequest): string {
    let target = 'default ref'
    if (request.commit) {
      target = `commit ${request.commit}`
    } else if (request.ref) {
      target = `ref ${request.ref}`
    }

    return `${formatDisplayPath(request.source)} at ${target}`
  }

  function formatRequestSort(a: RepositoryRequest, b: RepositoryRequest): number {
    return formatRequest(a).localeCompare(formatRequest(b))
  }
}
