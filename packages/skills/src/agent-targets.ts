import { lstat, mkdir, readlink, rm, symlink } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'

import {
  type AgentLinkMode,
  agentRegistry,
  detectAgentInstalled,
  resolveAgentTarget,
  usesCanonicalTarget
} from './agents'
import { formatDisplayPath, type Scope } from './scope'

export type AgentTargetAction =
  | 'blocked'
  | 'create-directory-symlink'
  | 'keep-directory-symlink'
  | 'replace-directory-symlink'
  | 'skip-native'
  | 'skip-undetected'

export type AgentTargetPlanEntry = {
  action: AgentTargetAction
  detected: boolean
  displayName: string
  id: string
  linkMode: AgentLinkMode
  native: boolean
  reason?: string
  targetDir: string
}

export type AgentTargetPlan = {
  entries: AgentTargetPlanEntry[]
}

export type AgentListData = {
  groups: {
    agents: AgentTargetPlanEntry[]
    id: AgentListGroupId
  }[]
}

export type AgentListGroupId = 'detected' | 'not-detected' | 'standard'

export async function listAgentTargets(scope: Scope, options: { all?: boolean } = {}): Promise<AgentListData> {
  const plan = await planAgentTargetReconciliation(scope)
  const nativeEntries = options.all
    ? plan.entries.filter(entry => entry.native)
    : plan.entries.filter(entry => entry.detected && entry.native)
  const detectedOtherEntries = plan.entries.filter(entry => entry.detected && !entry.native)

  if (options.all) {
    return {
      groups: [
        {
          agents: nativeEntries,
          id: 'standard'
        },
        {
          agents: detectedOtherEntries,
          id: 'detected'
        },
        {
          agents: plan.entries.filter(entry => !entry.detected && !entry.native),
          id: 'not-detected'
        }
      ]
    }
  }

  return {
    groups: [
      {
        agents: nativeEntries,
        id: 'standard'
      },
      {
        agents: detectedOtherEntries,
        id: 'detected'
      }
    ]
  }
}

export async function planAgentTargetReconciliation(scope: Scope): Promise<AgentTargetPlan> {
  const entries = await Promise.all(
    agentRegistry
      .filter(agent => agent.showInUniversalList !== false)
      .map(async agent => {
        const detected = await detectAgentInstalled(agent, scope)
        const native = usesCanonicalTarget(agent, scope)
        const targetDir = resolveAgentTarget(agent, scope)
        if (native) {
          return createEntry(agent, { action: 'skip-native', detected, linkMode: 'native', native, targetDir })
        }

        if (!detected) {
          return createEntry(agent, {
            action: 'skip-undetected',
            detected,
            linkMode: 'undetected',
            native,
            reason: 'agent not detected in current scope',
            targetDir
          })
        }

        if (isSamePath(targetDir, scope.installDir)) {
          return createEntry(agent, {
            action: 'blocked',
            detected,
            linkMode: 'blocked',
            native,
            reason: 'target and canonical install directory are the same path',
            targetDir
          })
        }

        if (isNestedPath(targetDir, scope.installDir) || isNestedPath(scope.installDir, targetDir)) {
          return createEntry(agent, {
            action: 'blocked',
            detected,
            linkMode: 'blocked',
            native,
            reason: 'target and canonical install directory would create a link loop',
            targetDir
          })
        }

        const target = await inspectTarget(targetDir, scope.installDir)
        if (target.state === 'missing') {
          return createEntry(agent, {
            action: 'create-directory-symlink',
            detected,
            linkMode: 'directory-symlink',
            native,
            targetDir
          })
        }

        if (target.state === 'canonical-symlink') {
          return createEntry(agent, {
            action: 'keep-directory-symlink',
            detected,
            linkMode: 'directory-symlink',
            native,
            reason: 'target already links to the canonical install directory',
            targetDir
          })
        }

        return createEntry(agent, {
          action: 'replace-directory-symlink',
          detected,
          linkMode: 'directory-symlink',
          native,
          reason: target.reason,
          targetDir
        })
      })
  )

  return { entries }
}

export async function reconcileAgentTarget(scope: Scope, agentId: string): Promise<AgentTargetPlanEntry> {
  const plan = await planAgentTargetReconciliation(scope)
  const entry = plan.entries.find(item => item.id === agentId)
  if (!entry) {
    throw new Error(`Unknown agent id: ${agentId}`)
  }

  if (entry.action === 'skip-undetected') {
    throw new Error(`Agent is not detected on this machine: ${agentId}`)
  }

  if (entry.action === 'blocked') {
    throw new Error(`Blocked agent target for ${entry.id}: ${entry.reason}`)
  }

  if (entry.action !== 'create-directory-symlink' && entry.action !== 'replace-directory-symlink') {
    return entry
  }

  await applyAgentTargetEntry(scope, entry)
  return entry
}

async function applyAgentTargetEntry(scope: Scope, entry: AgentTargetPlanEntry): Promise<void> {
  await mkdir(scope.installDir, { recursive: true })
  await mkdir(dirname(entry.targetDir), { recursive: true })
  const latestTarget = await inspectTarget(entry.targetDir, scope.installDir)
  if (latestTarget.state === 'canonical-symlink') {
    return
  }

  if (latestTarget.state === 'replaceable') {
    await rm(entry.targetDir, { force: true, recursive: true })
  }

  await symlink(scope.installDir, entry.targetDir, 'dir')
}

function createEntry(
  agent: { displayName: string; id: string },
  entry: Omit<AgentTargetPlanEntry, 'displayName' | 'id'>
): AgentTargetPlanEntry {
  return {
    displayName: agent.displayName,
    id: agent.id,
    ...entry
  }
}

async function inspectTarget(
  targetDir: string,
  installDir: string
): Promise<{ state: 'canonical-symlink' } | { state: 'missing' } | { reason: string; state: 'replaceable' }> {
  let stats: Awaited<ReturnType<typeof lstat>>
  try {
    stats = await lstat(targetDir)
  } catch (error) {
    if (isNotFound(error)) {
      return { state: 'missing' }
    }

    throw error
  }

  if (!stats.isSymbolicLink()) {
    return {
      reason: stats.isDirectory() ? 'target already exists as a directory' : 'target already exists as a file',
      state: 'replaceable'
    }
  }

  const linkTarget = await readlink(targetDir)
  const resolvedLinkTarget = resolveSymlinkTarget(targetDir, linkTarget)
  if (isSamePath(resolvedLinkTarget, installDir)) {
    return { state: 'canonical-symlink' }
  }

  return { reason: `target symlink points to ${formatDisplayPath(resolvedLinkTarget)}`, state: 'replaceable' }
}

function resolveSymlinkTarget(linkPath: string, linkTarget: string): string {
  return isAbsolute(linkTarget) ? resolve(linkTarget) : resolve(dirname(linkPath), linkTarget)
}

function isSamePath(a: string, b: string): boolean {
  return resolve(a) === resolve(b)
}

function isNestedPath(parent: string, child: string): boolean {
  const relation = relative(resolve(parent), resolve(child))
  return relation !== '' && !relation.startsWith('..') && !isAbsolute(relation)
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
