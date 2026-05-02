import { log } from '@clack/prompts'
import * as v from 'valibot'

import { optionalBoolean } from './schemas.js'
import { syncCommand } from './sync.js'

export const updateOptionsSchema = v.object({
  dryRun: optionalBoolean('Print the planned changes without writing state'),
  global: optionalBoolean('Use the global skills manifest and lock file')
})

export type UpdateCommandContext = {
  options: v.InferOutput<typeof updateOptionsSchema>
}

export async function updateCommand(context: UpdateCommandContext) {
  if (!context.options.dryRun) {
    log.step('Updating skills from manifest')
  }
  await syncCommand({
    options: {
      dryRun: context.options.dryRun,
      global: context.options.global
    }
  })
}
