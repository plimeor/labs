import { mkdir } from 'node:fs/promises'
import { styleText } from 'node:util'

import { cancel, confirm, isCancel, isTTY, log } from '@clack/prompts'
import * as v from 'valibot'

import {
  type AgentListGroupId,
  type AgentTargetPlanEntry,
  listAgentTargets,
  planAgentTargetReconciliation,
  reconcileAgentTarget
} from '../agent-targets'
import { agentRegistry, resolveAgentMarker } from '../agents'
import { formatDisplayPath, resolveScope } from '../scope'
import { nonBlankString, optionalBoolean } from './schemas'

export const agentsAddArgsSchema = v.object({
  agentId: nonBlankString('Supported agent id to link to the current scope canonical skills directory')
})
export const agentsAddOptionsSchema = v.object({
  global: optionalBoolean('Use the global skills scope'),
  json: optionalBoolean('Write a JSON result envelope')
})

export const agentsListOptionsSchema = v.object({
  all: optionalBoolean('Show detected and undetected agents'),
  global: optionalBoolean('Use the global skills scope'),
  json: optionalBoolean('Write a JSON result envelope')
})

export type AgentsListCommandContext = {
  options: v.InferOutput<typeof agentsListOptionsSchema>
}

export type AgentsAddCommandContext = {
  args: v.InferOutput<typeof agentsAddArgsSchema>
  assertInteractive?: () => void
  confirmCreateAgentMarker?: ConfirmCreateAgentMarker
  options: v.InferOutput<typeof agentsAddOptionsSchema>
}

type ConfirmCreateAgentMarker = (options: Parameters<typeof confirm>[0]) => Promise<boolean | symbol>

export async function agentsAddCommand(context: AgentsAddCommandContext) {
  const scope = resolveScope(context.options.global ?? false)
  const prepared = await prepareAgentTargetForAdd(scope, context)
  if (prepared.action === 'skip-undetected') {
    log.info(`Skipped ${prepared.id}; agent marker directory was not created.`)
    return prepared
  }

  const entry = await reconcileAgentTarget(scope, context.args.agentId)

  if (entry.action === 'create-directory-symlink') {
    log.success(`Linked ${formatDisplayPath(entry.targetDir)} to ${formatDisplayPath(scope.installDir)}`)
  } else if (entry.action === 'replace-directory-symlink') {
    log.success(`Replaced ${formatDisplayPath(entry.targetDir)} with a link to ${formatDisplayPath(scope.installDir)}`)
  } else if (entry.action === 'keep-directory-symlink') {
    log.info(`${formatDisplayPath(entry.targetDir)} already links to ${formatDisplayPath(scope.installDir)}`)
  } else {
    log.info(`${entry.displayName} already reads ${formatDisplayPath(scope.installDir)} directly`)
  }

  return entry
}

async function prepareAgentTargetForAdd(
  scope: ReturnType<typeof resolveScope>,
  context: AgentsAddCommandContext
): Promise<AgentTargetPlanEntry> {
  const plan = await planAgentTargetReconciliation(scope)
  const entry = plan.entries.find(item => item.id === context.args.agentId)
  if (!entry) {
    throw new Error(`Unknown agent id: ${context.args.agentId}`)
  }

  if (entry.action !== 'skip-undetected') {
    return entry
  }

  const agent = agentRegistry.find(item => item.id === context.args.agentId)
  if (!agent) {
    throw new Error(`Unknown agent id: ${context.args.agentId}`)
  }

  const confirmCreateAgentMarker = context.confirmCreateAgentMarker ?? confirm
  if (!context.confirmCreateAgentMarker) {
    context.assertInteractive?.()
    if (!canPrompt()) {
      throw new Error(`Agent is not detected on this machine: ${context.args.agentId}`)
    }
  }

  const markerDir = requireAgentMarkerDir(resolveAgentMarker(agent, scope), entry.id, scope.scope)
  const shouldCreate = await confirmCreateAgentMarker({
    active: 'Create',
    inactive: 'Skip',
    initialValue: true,
    message: `${entry.id} was not detected at ${formatDisplayPath(markerDir)}. Create that directory and link ${formatDisplayPath(entry.targetDir)}?`
  })
  if (isCancel(shouldCreate)) {
    cancel('Skipped agent target linking')
    return entry
  }

  if (!shouldCreate) {
    return entry
  }

  await mkdir(markerDir, { recursive: true })
  const nextPlan = await planAgentTargetReconciliation(scope)
  return nextPlan.entries.find(item => item.id === context.args.agentId) ?? entry
}

function requireAgentMarkerDir(markerDir: string | undefined, agentId: string, scope: string): string {
  if (!markerDir) {
    throw new Error(`Agent cannot be safely detected in ${scope} scope: ${agentId}`)
  }

  return markerDir
}

function canPrompt(): boolean {
  return isTTY(process.stdout) && process.stdin.isTTY !== false
}

export async function agentsListCommand(context: AgentsListCommandContext) {
  const scope = resolveScope(context.options.global ?? false)
  const data = await listAgentTargets(scope, { all: context.options.all })

  printAgentGroups(data.groups)
  return data
}

function printAgentGroups(groups: { agents: AgentTargetPlanEntry[]; id: AgentListGroupId }[]): void {
  for (const group of groups) {
    printAgentGroup(group)
  }
}

function printAgentGroup(group: { agents: AgentTargetPlanEntry[]; id: AgentListGroupId }): void {
  log.info(formatGroupName(group.id), { spacing: 1 })

  if (group.id === 'detected') {
    log.message(dim('  🔗 linked to standard path  ⚪ not linked to standard path'), { spacing: 0 })
  }

  group.agents.forEach((agent, index) => {
    const agentLabel = formatAgentEntry(agent, group.id)
    const spacing = index === 0 && group.id === 'detected' ? 1 : 0
    log.message(agentLabel, { spacing })
  })
}

function formatGroupName(groupId: AgentListGroupId): string {
  if (groupId === 'standard') {
    return 'Standard'
  }

  if (groupId === 'detected') {
    return 'Detected'
  }

  return 'Not Detected'
}

function formatAgentEntry(entry: AgentTargetPlanEntry, groupId: AgentListGroupId): string {
  const target = entry.native ? '' : ` ${dim(formatDisplayPath(entry.targetDir))}`
  const linkState = groupId === 'detected' ? `${formatLinkState(entry)} ` : ''
  const line = `  ${linkState}${entry.id}${target}`
  return entry.linkMode === 'blocked' ? styleText('dim', line) : line
}

function formatLinkState(entry: AgentTargetPlanEntry): string {
  return entry.action === 'keep-directory-symlink' ? '🔗' : '⚪'
}

function dim(value: string): string {
  return styleText('gray', value)
}
