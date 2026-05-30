import { type CommandDefinition, defineCommand } from '@plimeor/command-kit'
import * as v from 'valibot'

import type { StoreRecord, StoreType } from '../types'
import { color } from '../ui/ansi'
import { selectRecord } from '../ui/prompts'
import { renderDetail } from '../ui/render'
import {
  baseOptionFields,
  baseOptionShortcuts,
  collectRecords,
  emitWarnings,
  failIfEmpty,
  type ResolvedOptions,
  resolveTarget
} from './shared'

export function createGetCommand(store: StoreType, description: string): CommandDefinition<any, any> {
  return defineCommand('get', {
    argBindings: [{ name: 'name' }],
    args: v.object({ name: v.string() }),
    description,
    optionShortcuts: { ...baseOptionShortcuts },
    options: v.object({
      ...baseOptionFields,
      json: v.optional(v.pipe(v.boolean(), v.description('Emit a JSON result envelope')))
    }),
    run: async context => {
      const options = context.options as ResolvedOptions
      const { name } = context.args as { name: string }
      const { adapter, profile } = await resolveTarget(options)
      const collected = await collectRecords(adapter, profile, store, options)
      failIfEmpty(collected)

      const candidates = matchByName(collected.records, name)

      if (options.json) {
        return {
          browser: adapter.id,
          matches: candidates,
          profile: profile.id,
          query: name,
          store
        }
      }

      emitWarnings(collected.warnings)
      const chosen = await resolveChoice(candidates, collected.records, name)
      renderDetail(chosen)
      return undefined
    }
  })
}

function matchByName(records: StoreRecord[], query: string): StoreRecord[] {
  const lower = query.toLowerCase()
  const exact = records.filter(record => record.name.toLowerCase() === lower)
  if (exact.length > 0) {
    return exact
  }
  return records.filter(record => record.name.toLowerCase().includes(lower))
}

async function resolveChoice(candidates: StoreRecord[], all: StoreRecord[], query: string): Promise<StoreRecord> {
  if (candidates.length === 1) {
    return candidates[0] as StoreRecord
  }

  if (candidates.length > 1) {
    return selectRecord(candidates, `Multiple matches for "${query}" — choose one`)
  }

  process.stderr.write(`${color.dim(`No record named "${query}". Choose from all ${all.length} records.`)}\n`)
  return selectRecord(all, `No match for "${query}" — choose a record`)
}
