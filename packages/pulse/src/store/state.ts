import { mkdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import type { PulseKind } from '../pulses/types'

export type InstalledPulseState = {
  installedAt: string
  kind: PulseKind
  name: string
  schedule?: string
  source: {
    path: string
    sha256: string
    type: 'file'
  }
  updatedAt?: string
}

export type EnabledPulseState = {
  enabledAt: string
  kind: PulseKind
}

export type PulseState = {
  enabled: Record<string, EnabledPulseState>
  installed: Record<string, InstalledPulseState>
  version: 1
}

export type RuntimePulseSnapshot = {
  activePid?: number
  enabled: boolean
  kind: PulseKind
  lastExitCode?: number | null
  lastReloadAt?: string
  lastRunAt?: string
  name: string
  nextRunAt?: string
  status: 'active' | 'enabled' | 'idle' | 'stopped'
}

export type PulseRuntimeState = {
  daemonPid: number
  pulses: Record<string, RuntimePulseSnapshot>
  updatedAt: string
  version: 1
}

const DEFAULT_STATE: PulseState = {
  enabled: {},
  installed: {},
  version: 1
}

export async function readState(path: string): Promise<PulseState> {
  try {
    const value = JSON.parse(await readFile(path, 'utf8'))
    return normalizeState(value)
  } catch (error) {
    if (isMissingFile(error)) {
      return structuredClone(DEFAULT_STATE)
    }

    throw error
  }
}

export async function writeState(path: string, state: PulseState): Promise<void> {
  await writeJsonAtomic(path, normalizeState(state))
}

export async function updateState(path: string, lockPath: string, update: (state: PulseState) => Promise<PulseState>) {
  return withStateLock(lockPath, async () => {
    const state = await readState(path)
    const next = await update(state)
    await writeState(path, next)
    return next
  })
}

export async function readRuntime(path: string): Promise<PulseRuntimeState | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as PulseRuntimeState
  } catch (error) {
    if (isMissingFile(error)) {
      return undefined
    }

    throw error
  }
}

export async function writeRuntime(path: string, runtime: PulseRuntimeState): Promise<void> {
  await writeJsonAtomic(path, runtime)
}

export async function removeRuntime(path: string): Promise<void> {
  try {
    await unlink(path)
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error
    }
  }
}

export async function withStateLock<T>(lockPath: string, run: () => Promise<T>): Promise<T> {
  await acquireLock(lockPath)
  try {
    return await run()
  } finally {
    await rm(lockPath, { force: true, recursive: true })
  }
}

export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmpPath = join(dirname(path), `.${basename(path)}.${process.pid}.${Date.now()}.tmp`)
  await writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`)
  await rename(tmpPath, path)
}

function normalizeState(value: unknown): PulseState {
  if (!value || typeof value !== 'object') {
    return structuredClone(DEFAULT_STATE)
  }

  const candidate = value as Partial<PulseState>
  return {
    enabled: objectRecord(candidate.enabled),
    installed: objectRecord(candidate.installed),
    version: 1
  }
}

function objectRecord<T>(value: T | undefined): T {
  return value && typeof value === 'object' ? value : ({} as T)
}

async function acquireLock(lockPath: string): Promise<void> {
  await mkdir(dirname(lockPath), { recursive: true })
  const startedAt = Date.now()
  while (true) {
    try {
      // code-lean: local filesystem lock only, upgrade when PULSE_HOME is shared across hosts or filesystems.
      await mkdir(lockPath)
      await writeFile(join(lockPath, 'pid'), String(process.pid))
      return
    } catch (error) {
      if (!isFileExists(error)) {
        throw error
      }

      if (Date.now() - startedAt > 5_000) {
        throw new Error(`Timed out waiting for pulse state lock: ${lockPath}`)
      }

      await Bun.sleep(50)
    }
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function isFileExists(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'EEXIST'
}
