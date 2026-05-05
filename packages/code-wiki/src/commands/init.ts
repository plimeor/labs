import { log } from '@clack/prompts'

import { initSharedWorkspace, workspaceRelative } from '../workspace'

export type InitCommandContext = {
  options: Record<string, never>
}

export async function initCommand(_context?: InitCommandContext) {
  const workspace = await initSharedWorkspace(process.cwd())
  log.success(`Initialized CodeWiki workspace at ${workspaceRelative(workspace, workspace.stateDir)}`)
}
