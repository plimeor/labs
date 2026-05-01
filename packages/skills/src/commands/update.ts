import { log } from '@clack/prompts'
import { z } from 'incur'

import { syncCommand } from './sync.js'

export const updateOptionsSchema = z.object({
  dryRun: z.boolean().optional(),
  global: z.boolean().optional()
})

export type UpdateCommandContext = {
  options: z.infer<typeof updateOptionsSchema>
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
