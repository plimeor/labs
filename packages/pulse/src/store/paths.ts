import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export type PulsePaths = {
  daemonPidPath: string
  daemonSocketPath: string
  home: string
  lockPath: string
  logDir: string
  runtimePath: string
  statePath: string
}

export function resolvePulseHome(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(env.PULSE_HOME ?? join(homedir(), '.pulse'))
}

export function resolvePulsePaths(home = resolvePulseHome()): PulsePaths {
  return {
    daemonPidPath: join(home, 'daemon.pid'),
    daemonSocketPath: join(home, 'daemon.sock'),
    home,
    lockPath: join(home, '.state.lock'),
    logDir: join(home, 'logs'),
    runtimePath: join(home, 'runtime.json'),
    statePath: join(home, 'state.json')
  }
}

export async function ensurePulseHome(paths: PulsePaths): Promise<void> {
  await mkdir(paths.logDir, { recursive: true })
}

export function sourceRootPath(): string {
  return dirname(dirname(fileURLToPath(import.meta.url)))
}

export function runnerScriptPath(): string {
  return join(sourceRootPath(), 'runtime', 'runner.ts')
}

export function daemonScriptPath(): string {
  return join(sourceRootPath(), 'runtime', 'daemon.ts')
}
