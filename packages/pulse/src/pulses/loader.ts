import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import type { LoadedPulse, PulseMetadata, PulseSource } from './types'

export type CustomPulseMetadata = PulseMetadata & {
  source: Extract<PulseSource, { type: 'file' }>
}

export type PulseImportOptions = {
  fresh?: boolean
}

const moduleRequire = createRequire(import.meta.url)

export async function hashFile(path: string): Promise<string> {
  const data = await readFile(path)
  return createHash('sha256').update(data).digest('hex')
}

export async function loadCustomPulseMetadata(path: string, sha256?: string): Promise<CustomPulseMetadata> {
  const absolutePath = resolve(path)
  const entrySha256 = sha256 ?? (await hashFile(absolutePath))
  const module = await importCustomPulse(absolutePath, { fresh: Boolean(sha256) })
  return metadataFromModule(module, {
    path: absolutePath,
    sha256: entrySha256,
    type: 'file'
  }) as CustomPulseMetadata
}

export async function loadPulseFile(
  path: string,
  source: PulseSource,
  options: PulseImportOptions = {}
): Promise<LoadedPulse> {
  const module = await importCustomPulse(path, options)
  return pulseFromModule(module, source)
}

export async function importCustomPulse(path: string, options: PulseImportOptions = {}): Promise<unknown> {
  const absolutePath = resolve(path)
  if (options.fresh) {
    clearPulseModuleCache(absolutePath)
  }

  return import(pathToFileURL(absolutePath).href)
}

export function clearPulseModuleCache(path: string): void {
  const cacheKey = moduleRequire.resolve(resolve(path))
  delete moduleRequire.cache[cacheKey]
}

export function metadataFromModule(module: unknown, source: PulseSource): PulseMetadata {
  return pulseFromModule(module, source)
}

export function pulseFromModule(module: unknown, source: PulseSource): LoadedPulse {
  if (!module || typeof module !== 'object') {
    throw new Error('PULSE module must export named members')
  }

  const exports = module as Record<string, unknown>
  const name = validateName(exports.name)
  const run = exports.run
  if (typeof run !== 'function') {
    throw new Error('PULSE must export function run()')
  }

  const hasSchedule = exports.schedule !== undefined
  if (hasSchedule) {
    const schedule = validateSchedule(exports.schedule)
    return {
      kind: 'scheduled',
      name,
      schedule,
      source
    }
  }

  return {
    kind: 'manual',
    name,
    source
  }
}

export function validatePulseName(name: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(name)) {
    throw new Error(`Invalid PULSE name: ${name}`)
  }

  return name
}

export function validateScheduleValue(schedule: string): string {
  if (!Bun.cron.parse(schedule)) {
    throw new Error(`Cron schedule has no next run: ${schedule}`)
  }

  return schedule
}

function validateName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('PULSE must export string name')
  }

  return validatePulseName(value)
}

function validateSchedule(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('PULSE schedule must be a string when provided')
  }

  return validateScheduleValue(value)
}
