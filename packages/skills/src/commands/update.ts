import { log } from '@clack/prompts'
import { type Static, Type } from '@sinclair/typebox'

import { syncCommand } from './sync.js'

export const updateArgsSchema = Type.Object({})
export const updateOptionsSchema = Type.Object({
  dryRun: Type.Optional(Type.Boolean({ description: 'Print the planned changes without writing state' })),
  global: Type.Optional(Type.Boolean({ description: 'Use the global skills manifest and lock file' }))
})

export type UpdateCommandContext = {
  options: Static<typeof updateOptionsSchema>
}

export async function updateCommand(context: UpdateCommandContext) {
  if (!context.options.dryRun) {
    log.step('Updating skills from manifest')
  }
  return syncCommand({
    options: {
      dryRun: context.options.dryRun,
      global: context.options.global
    }
  })
}
