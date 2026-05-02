import { cancel, isCancel, log, select } from '@clack/prompts'
import * as v from 'valibot'

import { assertRuntimeAvailable } from '../runtime/index.js'
import { TextSchema } from '../types.js'
import { requireRuntimeId, resolveWorkspace, setWorkspaceRuntime } from '../workspace.js'

const runtimeIds = ['codex'] as const

export const runtimeSetArgsSchema = v.object({
  runtime: TextSchema
})

export type RuntimeSetCommandContext = {
  args: v.InferOutput<typeof runtimeSetArgsSchema>
}

export async function runtimeSetCommand(context: RuntimeSetCommandContext) {
  const runtime = requireRuntimeId(context.args.runtime)
  const workspace = await setWorkspaceRuntime(await resolveWorkspace(), runtime)
  log.success(`Selected ${workspace.config.runtime} runtime`)
}

export async function runtimeCurrentCommand() {
  const workspace = await resolveWorkspace()
  if (!workspace.config.runtime) {
    log.info('No runtime configured')
    return
  }

  process.stdout.write(`${workspace.config.runtime}\n`)
}

export async function runtimeSelectCommand() {
  if (!process.stdin.isTTY) {
    throw new Error('runtime select requires an interactive terminal. Use `code-wiki runtime set codex` in scripts.')
  }

  const workspace = await resolveWorkspace()
  const runtime = await select({
    message: 'Select runtime',
    options: runtimeIds.map(runtime => ({
      label: runtime,
      value: runtime
    }))
  })

  if (isCancel(runtime)) {
    cancel('Runtime selection cancelled.')
    return
  }

  await assertRuntimeAvailable(runtime)
  await setWorkspaceRuntime(workspace, runtime)
  log.success(`Selected ${runtime} runtime`)
}
