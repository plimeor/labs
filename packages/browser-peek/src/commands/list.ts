import { type CommandDefinition, defineCommand } from '@plimeor/command-kit'
import * as v from 'valibot'

import { BrowserPeekError, type StoreType } from '../types'
import { renderList } from '../ui/render'
import {
  baseOptionFields,
  baseOptionShortcuts,
  collectRecords,
  emitWarnings,
  failIfEmpty,
  type ResolvedOptions,
  resolveTarget
} from './shared'

const DEFAULT_LIMIT = 50

type ListOptions = ResolvedOptions & { all?: boolean; full?: boolean; limit?: string }

export function createListCommand(store: StoreType, description: string): CommandDefinition<any, any> {
  return defineCommand('list', {
    description,
    optionShortcuts: { ...baseOptionShortcuts, all: '-a', limit: '-l' },
    options: v.object({
      ...baseOptionFields,
      all: v.optional(v.pipe(v.boolean(), v.description('Show every row (overrides --limit)'))),
      full: v.optional(v.pipe(v.boolean(), v.description('Show full values instead of truncating'))),
      limit: v.optional(v.pipe(v.string(), v.description('Max rows to show (0 = no limit, default: 50)')))
    }),
    run: async context => {
      const options = context.options as ListOptions
      const { adapter, profile } = await resolveTarget(options)
      const collected = await collectRecords(adapter, profile, store, options)

      emitWarnings(collected.warnings)
      failIfEmpty(collected)

      renderList(collected.records, {
        browser: adapter.displayName,
        detail: Boolean(options.domain),
        full: options.full,
        limit: resolveLimit(options),
        profile: profile.name,
        store
      })
      return undefined
    }
  })
}

function resolveLimit(options: ListOptions): number {
  if (options.all) {
    return Number.POSITIVE_INFINITY
  }
  if (options.limit === undefined) {
    return DEFAULT_LIMIT
  }

  const value = Number(options.limit)
  if (!Number.isInteger(value) || value < 0) {
    throw new BrowserPeekError('--limit must be a non-negative integer (0 = no limit).')
  }
  return value === 0 ? Number.POSITIVE_INFINITY : value
}
