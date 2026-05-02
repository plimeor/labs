import { log } from '@clack/prompts'
import * as v from 'valibot'

import { initEmbeddedWorkspace, initSharedWorkspace, workspaceRelative } from '../workspace.js'

export const initOptionsSchema = v.object({
  shared: v.optional(v.boolean())
})

export type InitCommandContext = {
  options: v.InferOutput<typeof initOptionsSchema>
}

export async function initCommand(context: InitCommandContext) {
  const workspace = context.options.shared
    ? await initSharedWorkspace(process.cwd())
    : await initEmbeddedWorkspace(process.cwd())
  log.success(
    `Initialized ${workspace.config.mode} CodeWiki workspace at ${workspaceRelative(workspace, workspace.stateDir)}`
  )
}
