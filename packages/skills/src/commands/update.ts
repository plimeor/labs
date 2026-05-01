import { log } from '@clack/prompts'
import type { OutputMode } from '@plimeor/command-kit'
import { type Static, Type } from '@sinclair/typebox'

import { syncCommand } from './sync.js'

export const updateArgsSchema = Type.Object({})
export const updateOptionsSchema = Type.Object({
  dryRun: Type.Optional(Type.Boolean()),
  global: Type.Optional(Type.Boolean()),
  json: Type.Optional(Type.Boolean())
})

export type UpdateCommandContext = {
  format?: OutputMode
  options: Static<typeof updateOptionsSchema>
}

export async function updateCommand(context: UpdateCommandContext) {
  if (!context.options.dryRun && context.format !== 'json') {
    log.step('Updating skills from manifest')
  }
  return syncCommand({
    format: context.format,
    options: {
      dryRun: context.options.dryRun,
      global: context.options.global,
      json: context.options.json
    }
  })
}
