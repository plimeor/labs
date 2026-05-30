import * as v from 'valibot'

import { getAdapter } from '../registry'
import {
  type BrowserAdapter,
  type BrowserId,
  BrowserPeekError,
  type Profile,
  type StoreRecord,
  type StoreType
} from '../types'
import { color } from '../ui/ansi'
import { selectProfile } from '../ui/prompts'

export const baseOptionFields = {
  browser: v.optional(v.pipe(v.picklist(['chrome', 'safari']), v.description('Browser to read (default: chrome)'))),
  domain: v.optional(v.pipe(v.string(), v.description('Case-insensitive substring filter on origin/host'))),
  profile: v.optional(v.pipe(v.string(), v.description('Profile id or name to use (skips the picker)')))
}

export const baseOptionShortcuts = {
  browser: '-b',
  domain: '-d',
  profile: '-p'
} as const

export type ResolvedOptions = {
  browser?: BrowserId
  profile?: string
  domain?: string
  json?: boolean
}

export async function resolveTarget(options: ResolvedOptions): Promise<{ adapter: BrowserAdapter; profile: Profile }> {
  const adapter = getAdapter(options.browser ?? 'chrome')
  const profiles = await adapter.listProfiles()
  if (profiles.length === 0) {
    throw new BrowserPeekError(`No profiles found for ${adapter.displayName}.`)
  }

  if (options.profile) {
    return { adapter, profile: matchProfile(adapter, profiles, options.profile) }
  }

  if (options.json) {
    if (profiles.length > 1) {
      throw new BrowserPeekError(
        `${adapter.displayName} has multiple profiles; pass --profile <id> when using --json. ` +
          `Available: ${profiles.map(profile => profile.id).join(', ')}.`
      )
    }
    return { adapter, profile: profiles[0] as Profile }
  }

  const fallback = profiles.find(profile => profile.isDefault) ?? profiles[0]
  const profile = await selectProfile(profiles, fallback?.id)
  return { adapter, profile }
}

function matchProfile(adapter: BrowserAdapter, profiles: Profile[], wanted: string): Profile {
  const lower = wanted.toLowerCase()
  const match = profiles.find(profile => profile.id === wanted || profile.name.toLowerCase() === lower)
  if (match) {
    return match
  }

  throw new BrowserPeekError(
    `Profile "${wanted}" not found for ${adapter.displayName}. ` +
      `Available: ${profiles.map(profile => `${profile.name} (${profile.id})`).join(', ')}.`
  )
}

export type Collected = {
  records: StoreRecord[]
  warnings: string[]
}

export async function collectRecords(
  adapter: BrowserAdapter,
  profile: Profile,
  store: StoreType,
  options: ResolvedOptions
): Promise<Collected> {
  const records: StoreRecord[] = []
  const warnings: string[] = []

  if (store === 'cookie') {
    if (!adapter.capabilities.cookies) {
      throw new BrowserPeekError(`${adapter.displayName} does not expose cookies.`)
    }
    await collectInto(records, warnings, 'cookies', () => adapter.readCookies(profile))
  } else {
    if (!adapter.capabilities.localStorage) {
      throw new BrowserPeekError(`${adapter.displayName} does not expose local storage.`)
    }
    await collectInto(records, warnings, 'local storage', () => adapter.readLocalStorage(profile))
  }

  const filtered = options.domain ? records.filter(record => matchesDomain(record, options.domain as string)) : records
  return { records: filtered, warnings }
}

async function collectInto(
  records: StoreRecord[],
  warnings: string[],
  label: string,
  read: () => Promise<StoreRecord[]>
): Promise<void> {
  try {
    records.push(...(await read()))
  } catch (error) {
    warnings.push(`${label}: ${errorMessage(error)}`)
  }
}

function matchesDomain(record: StoreRecord, domain: string): boolean {
  return record.origin.toLowerCase().includes(domain.toLowerCase())
}

export function failIfEmpty(collected: Collected): void {
  if (collected.records.length === 0 && collected.warnings.length > 0) {
    throw new BrowserPeekError(collected.warnings.join('; '))
  }
}

export function emitWarnings(warnings: string[]): void {
  for (const warning of warnings) {
    process.stderr.write(`${color.yellow(`! ${warning}`)}\n`)
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
