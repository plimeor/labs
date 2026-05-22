import { cancel, confirm, isCancel, isTTY, log, tasks } from '@clack/prompts'

import { type AgentTargetPlanEntry, planAgentTargetReconciliation, reconcileAgentTarget } from '../agent-targets'
import { formatDisplayPath, type Scope } from '../scope'

const LINKABLE_ACTIONS = new Set<AgentTargetPlanEntry['action']>([
  'create-directory-symlink',
  'replace-directory-symlink'
])

export async function promptForPendingAgentTargetLinks(scope: Scope): Promise<void> {
  const plan = await planAgentTargetReconciliation(scope)
  const pending = plan.entries.filter(entry => LINKABLE_ACTIONS.has(entry.action))
  if (pending.length === 0) {
    return
  }

  const agentIds = pending.map(entry => entry.id).join(', ')
  if (!canPrompt()) {
    const globalFlag = scope.scope === 'global' ? ' -g' : ''
    log.info(
      `Detected linkable agent targets: ${agentIds}. Run skills agents add <agent-id>${globalFlag} for each target to link them.`
    )
    return
  }

  log.info(`Detected linkable agent targets: ${agentIds}`)
  const shouldLink = await confirm({
    active: 'Yes',
    inactive: 'No',
    initialValue: true,
    message: formatLinkPrompt(pending, scope)
  })
  if (isCancel(shouldLink)) {
    cancel('Skipped agent target linking')
    return
  }

  if (!shouldLink) {
    log.info('Skipped agent target linking')
    return
  }

  await tasks(
    pending.map(entry => ({
      title: `Link ${entry.id}`,
      task: async () => {
        const linked = await reconcileAgentTarget(scope, entry.id)
        return `Linked ${formatDisplayPath(linked.targetDir)}`
      }
    }))
  )
  log.success(`Linked ${pending.length} agent target${pending.length === 1 ? '' : 's'}`)
}

function formatLinkPrompt(pending: AgentTargetPlanEntry[], scope: Scope): string {
  const verb = pending.some(entry => entry.action === 'replace-directory-symlink')
    ? 'Create or replace links'
    : 'Create links'
  return `${verb} for ${pending.length} detected agent target${pending.length === 1 ? '' : 's'} to ${formatDisplayPath(scope.installDir)}?`
}

function canPrompt(): boolean {
  return isTTY(process.stdout) && process.stdin.isTTY !== false
}
