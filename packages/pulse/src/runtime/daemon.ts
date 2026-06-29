#!/usr/bin/env bun
import { link, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { createConnection, createServer, type Server, type Socket } from 'node:net'

import type { CatalogPulse } from '../pulses/catalog'
import { catalogPulseStatus, isCustomEntryChanged, listCatalogPulses, resolveCatalogPulse } from '../pulses/catalog'
import { reloadBuiltInPulses } from '../pulses/index'
import type { PulseKind } from '../pulses/types'
import { daemonScriptPath, ensurePulseHome, resolvePulseHome, resolvePulsePaths } from '../store/paths'
import {
  type PulseRuntimeState,
  type PulseState,
  readState,
  removeRuntime,
  updateState,
  writeRuntime
} from '../store/state'
import { isDaemonAutostartInstalled, startDaemonAutostart } from './autostart'
import { appendEvent, type ManagedRun, type PulseRunResult, startManagedRun } from './logs'

type DaemonRequest =
  | { command: 'disable'; name: string }
  | { command: 'enable'; name: string }
  | { command: 'list' }
  | { command: 'ping' }
  | { command: 'reload'; name: string }
  | { command: 'run'; name: string }
  | { command: 'status'; name?: string }
  | { command: 'stop' }

type DaemonResponse =
  | {
      data: unknown
      ok: true
    }
  | {
      error: string
      ok: false
    }

type CronJob = {
  stop(): void
}

type ActiveRun = {
  process: ManagedRun
  startedAt: string
}

type RuntimeEntry = {
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

const IN_PROCESS_CRON = Bun.cron as unknown as (schedule: string, handler: () => void | Promise<void>) => CronJob
const STOP_TIMEOUT_MS = 1_000

export class PulseDaemon {
  private activeRuns = new Map<string, ActiveRun>()
  private schedules = new Map<string, CronJob>()
  private server: Server | undefined
  private stopped = false
  private runtime = new Map<string, RuntimeEntry>()

  constructor(private readonly home = resolvePulseHome()) {}

  async start(): Promise<void> {
    const paths = resolvePulsePaths(this.home)
    await ensurePulseHome(paths)
    await acquireDaemonLock(paths.daemonLockPath)
    try {
      if (await isDaemonRunning(this.home)) {
        throw new Error(`Pulse daemon already running for home: ${this.home}`)
      }

      await removeSocket(paths.daemonSocketPath)
      await this.reconcileAll()

      this.server = createServer({ allowHalfOpen: true }, socket => {
        void this.handleSocket(socket)
      })
      await new Promise<void>((resolve, reject) => {
        this.server?.once('error', reject)
        this.server?.listen(paths.daemonSocketPath, () => {
          this.server?.off('error', reject)
          resolve()
        })
      })

      await writeFile(paths.daemonPidPath, String(process.pid))
      await this.writeRuntime()
    } catch (error) {
      await releaseDaemonLock(paths.daemonLockPath)
      throw error
    }
  }

  async stop(): Promise<void> {
    this.stopped = true
    for (const name of [...this.schedules.keys()]) {
      this.stopSchedule(name)
    }
    for (const name of [...this.activeRuns.keys()]) {
      await this.stopActiveRun(name)
    }

    await new Promise<void>(resolve => {
      this.server?.close(() => resolve())
      if (!this.server) {
        resolve()
      }
    })

    const paths = resolvePulsePaths(this.home)
    await Promise.all([
      removeSocket(paths.daemonSocketPath),
      removeSocket(paths.daemonPidPath),
      removeRuntime(paths.runtimePath),
      releaseDaemonLock(paths.daemonLockPath)
    ])
  }

  private async handleSocket(socket: Socket): Promise<void> {
    let text = ''
    let handled = false
    const handle = () => {
      if (handled) {
        return
      }
      handled = true
      void this.respond(socket, text)
    }

    socket.on('data', chunk => {
      text += chunk.toString()
      if (text.includes('\n')) {
        handle()
      }
    })
    socket.on('end', handle)
  }

  private async respond(socket: Socket, text: string): Promise<void> {
    try {
      const response = await this.handleRequest(JSON.parse(text) as DaemonRequest)
      socket.end(`${JSON.stringify(response)}\n`)
    } catch (error) {
      socket.end(
        `${JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
          ok: false
        } satisfies DaemonResponse)}\n`
      )
    }
  }

  private async handleRequest(request: DaemonRequest): Promise<DaemonResponse> {
    try {
      if (request.command === 'ping') {
        return { data: { pid: process.pid }, ok: true }
      }

      if (request.command === 'stop') {
        queueMicrotask(() => {
          void this.stop()
        })
        return { data: { stopped: true }, ok: true }
      }

      if (request.command === 'list') {
        return { data: await this.list(), ok: true }
      }

      if (request.command === 'status') {
        return { data: await this.status(request.name), ok: true }
      }

      if (request.command === 'enable') {
        return { data: await this.enable(request.name), ok: true }
      }

      if (request.command === 'disable') {
        return { data: await this.disable(request.name), ok: true }
      }

      if (request.command === 'reload') {
        return { data: await this.reload(request.name), ok: true }
      }

      if (request.command === 'run') {
        return { data: await this.runOnce(request.name), ok: true }
      }

      return { error: 'Unknown daemon command', ok: false }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error), ok: false }
    }
  }

  private async list() {
    const state = await readState(resolvePulsePaths(this.home).statePath)
    await this.refreshRuntimeFromActiveRuns()
    return listCatalogPulses(state).map(pulse => {
      const runtime = this.runtime.get(pulse.name)
      return {
        enabled: Boolean(state.enabled[pulse.name]),
        kind: pulse.kind,
        name: pulse.name,
        status: runtime?.status ?? 'stopped'
      }
    })
  }

  private async status(name: string | undefined) {
    const state = await readState(resolvePulsePaths(this.home).statePath)
    await this.refreshRuntimeFromActiveRuns()
    if (name) {
      const pulse = resolveCatalogPulse(state, name)
      return {
        enabled: Boolean(state.enabled[pulse.name]),
        pulse: await catalogPulseStatus(pulse),
        runtime: this.runtime.get(pulse.name)
      }
    }

    return {
      daemon: { pid: process.pid },
      runtime: Object.fromEntries(this.runtime)
    }
  }

  private async enable(name: string) {
    const paths = resolvePulsePaths(this.home)
    const next = await updateState(paths.statePath, paths.lockPath, async state => {
      const pulse = await this.resolveFreshPulse(state, name)
      if (pulse.kind === 'manual') {
        throw new Error(`Manual PULSE cannot be enabled: ${name}`)
      }

      state.enabled[pulse.name] = {
        enabledAt: new Date().toISOString(),
        kind: pulse.kind
      }
      return state
    })

    await this.reconcilePulse(await this.resolveFreshPulse(next, name), next)
    await this.writeRuntime()
    return { enabled: true, name }
  }

  private async disable(name: string) {
    const paths = resolvePulsePaths(this.home)
    const state = await readState(paths.statePath)
    const pulse = resolveCatalogPulse(state, name)

    await updateState(paths.statePath, paths.lockPath, async state => {
      delete state.enabled[name]
      return state
    })

    this.stopSchedule(name)
    await this.stopActiveRun(name)
    this.runtime.set(name, {
      enabled: false,
      kind: pulse.kind,
      name: pulse.name,
      status: 'stopped'
    })
    await this.writeRuntime()
    return { disabled: true, name }
  }

  private async reload(name: string) {
    const state = await readState(resolvePulsePaths(this.home).statePath)
    const pulse = await this.resolveFreshPulse(state, name)
    if (!pulse.builtIn && (await isCustomEntryChanged(pulse))) {
      throw new Error(`Custom PULSE source changed: ${name}. Run pulse update ${name}.`)
    }

    if (pulse.kind === 'scheduled') {
      this.stopSchedule(name)
      if (state.enabled[name]) {
        this.startSchedule(pulse as CatalogPulse & { kind: 'scheduled'; schedule: string })
      }
      this.runtime.set(name, {
        enabled: Boolean(state.enabled[name]),
        kind: pulse.kind,
        lastReloadAt: new Date().toISOString(),
        name,
        nextRunAt: nextRunAt(pulse.schedule),
        status: state.enabled[name] ? 'enabled' : 'stopped'
      })
    } else {
      this.runtime.set(name, {
        enabled: false,
        kind: pulse.kind,
        lastReloadAt: new Date().toISOString(),
        name,
        status: 'idle'
      })
    }

    await this.writeRuntime()
    return { name, reloaded: true }
  }

  private async runOnce(name: string) {
    const state = await readState(resolvePulsePaths(this.home).statePath)
    const pulse = await this.resolveFreshPulse(state, name)

    if (!pulse.builtIn && (await isCustomEntryChanged(pulse))) {
      throw new Error(`Custom PULSE source changed: ${name}. Run pulse update ${name}.`)
    }

    if (this.activeRuns.has(name)) {
      throw new Error(`PULSE already has an active run: ${name}`)
    }

    const startedAt = new Date().toISOString()
    const run = await startManagedRun(this.home, 'installed', name, name)
    this.activeRuns.set(name, { process: run, startedAt })
    this.runtime.set(name, {
      activePid: run.pid,
      enabled: Boolean(state.enabled[name]),
      kind: pulse.kind,
      lastRunAt: startedAt,
      name,
      status: 'active'
    })
    await this.writeRuntime()
    const result = await run.result
    await this.finishRun(pulse, run.pid, startedAt, result)

    return result
  }

  private async resolveFreshPulse(state: PulseState, name: string): Promise<CatalogPulse> {
    const pulse = resolveCatalogPulse(state, name)
    if (!pulse.builtIn) {
      return pulse
    }

    await reloadBuiltInPulses()
    return resolveCatalogPulse(state, name)
  }

  private async reconcileAll(): Promise<void> {
    const state = await readState(resolvePulsePaths(this.home).statePath)
    for (const pulse of listCatalogPulses(state)) {
      await this.reconcilePulse(pulse, state)
    }
    await this.writeRuntime()
  }

  private async reconcilePulse(pulse: CatalogPulse, state: PulseState): Promise<void> {
    const enabled = Boolean(state.enabled[pulse.name])
    if (!enabled) {
      this.runtime.set(pulse.name, {
        enabled: false,
        kind: pulse.kind,
        name: pulse.name,
        status: pulse.kind === 'manual' ? 'idle' : 'stopped'
      })
      return
    }

    if (pulse.kind === 'scheduled') {
      this.startSchedule(pulse as CatalogPulse & { kind: 'scheduled'; schedule: string })
      this.runtime.set(pulse.name, {
        enabled: true,
        kind: pulse.kind,
        name: pulse.name,
        nextRunAt: nextRunAt(pulse.schedule),
        status: 'enabled'
      })
      return
    }
  }

  private startSchedule(pulse: CatalogPulse & { kind: 'scheduled'; schedule: string }): void {
    this.stopSchedule(pulse.name)
    const job = IN_PROCESS_CRON(pulse.schedule, async () => {
      if (this.activeRuns.has(pulse.name)) {
        await appendEvent(this.home, pulse.name, { type: 'skipped-active-run' })
        return
      }

      const run = await startManagedRun(this.home, 'installed', pulse.name, pulse.name)
      const startedAt = new Date().toISOString()
      this.activeRuns.set(pulse.name, { process: run, startedAt })
      this.runtime.set(pulse.name, {
        activePid: run.pid,
        enabled: true,
        kind: pulse.kind,
        lastRunAt: startedAt,
        name: pulse.name,
        nextRunAt: nextRunAt(pulse.schedule),
        status: 'active'
      })
      await this.writeRuntime()
      const result = await run.result
      await this.finishRun(pulse, run.pid, startedAt, result)
    })
    this.schedules.set(pulse.name, job)
  }

  private stopSchedule(name: string): void {
    this.schedules.get(name)?.stop()
    this.schedules.delete(name)
  }

  private async stopActiveRun(name: string): Promise<void> {
    const active = this.activeRuns.get(name)
    if (!active) {
      return
    }

    active.process.kill('SIGINT')
    if (!(await waitForResult(active.process.result, STOP_TIMEOUT_MS))) {
      active.process.kill('SIGKILL')
      await waitForResult(active.process.result, STOP_TIMEOUT_MS)
    }

    if (this.activeRuns.get(name)?.process.pid === active.process.pid) {
      this.activeRuns.delete(name)
    }
  }

  private async refreshRuntimeFromActiveRuns(): Promise<void> {
    for (const [name, active] of this.activeRuns) {
      this.runtime.set(name, {
        activePid: active.process.pid,
        enabled: this.runtime.get(name)?.enabled ?? false,
        kind: this.runtime.get(name)?.kind ?? 'manual',
        lastRunAt: active.startedAt,
        name,
        status: 'active'
      })
    }
    await this.writeRuntime()
  }

  private async writeRuntime(): Promise<void> {
    if (this.stopped) {
      return
    }

    const runtime: PulseRuntimeState = {
      daemonPid: process.pid,
      pulses: Object.fromEntries(this.runtime),
      updatedAt: new Date().toISOString(),
      version: 1
    }
    await writeRuntime(resolvePulsePaths(this.home).runtimePath, runtime)
  }

  private async finishRun(pulse: CatalogPulse, pid: number, startedAt: string, result: PulseRunResult): Promise<void> {
    if (this.activeRuns.get(pulse.name)?.process.pid !== pid) {
      return
    }

    this.activeRuns.delete(pulse.name)
    const state = await readState(resolvePulsePaths(this.home).statePath)
    const enabled = Boolean(state.enabled[pulse.name])
    this.runtime.set(pulse.name, {
      enabled,
      kind: pulse.kind,
      lastExitCode: result.exitCode,
      lastRunAt: startedAt,
      name: pulse.name,
      nextRunAt: enabled && pulse.kind === 'scheduled' ? nextRunAt(pulse.schedule) : undefined,
      status: enabled ? 'enabled' : pulse.kind === 'manual' ? 'idle' : 'stopped'
    })
    await this.writeRuntime()
  }
}

export async function requestDaemon(home: string, request: DaemonRequest): Promise<unknown> {
  const paths = resolvePulsePaths(home)
  const response = await new Promise<DaemonResponse>((resolve, reject) => {
    const socket = createConnection(paths.daemonSocketPath)
    let text = ''
    socket.on('connect', () => {
      socket.write(`${JSON.stringify(request)}\n`)
    })
    socket.on('data', chunk => {
      text += chunk.toString()
    })
    socket.on('error', reject)
    socket.on('end', () => {
      try {
        resolve(JSON.parse(text) as DaemonResponse)
      } catch (error) {
        reject(error)
      }
    })
  })

  if (!response.ok) {
    throw new Error(response.error)
  }

  return response.data
}

export async function isDaemonRunning(home: string): Promise<boolean> {
  try {
    await requestDaemon(home, { command: 'ping' })
    return true
  } catch {
    return false
  }
}

export async function ensureDaemon(home: string): Promise<void> {
  if (await isDaemonRunning(home)) {
    return
  }

  if (await isDaemonAutostartInstalled(home)) {
    await startDaemonAutostart()
    await waitForDaemonRunning(home)
    return
  }

  const paths = resolvePulsePaths(home)
  await ensurePulseHome(paths)
  const subprocess = Bun.spawn({
    cmd: [process.execPath, daemonScriptPath(), '--home', home],
    detached: true,
    env: { ...process.env, PULSE_HOME: home },
    stderr: 'ignore',
    stdout: 'ignore'
  })
  subprocess.unref()

  await waitForDaemonRunning(home)
}

export async function waitForDaemonRunning(home: string, timeoutMs = 5_000): Promise<void> {
  await waitForDaemonState(home, true, timeoutMs)
}

export async function waitForDaemonStopped(home: string, timeoutMs = 5_000): Promise<void> {
  await waitForDaemonState(home, false, timeoutMs)
}

async function waitForDaemonState(home: string, running: boolean, timeoutMs: number): Promise<void> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if ((await isDaemonRunning(home)) === running) {
      return
    }
    await Bun.sleep(100)
  }

  // Re-check once past the deadline so a transition during the final sleep is not reported as a timeout.
  if ((await isDaemonRunning(home)) === running) {
    return
  }

  throw new Error(running ? 'Timed out starting pulse daemon' : 'Timed out stopping pulse daemon')
}

if (import.meta.main) {
  const homeFlagIndex = process.argv.indexOf('--home')
  const home = homeFlagIndex >= 0 ? process.argv[homeFlagIndex + 1] : resolvePulseHome()
  const daemon = new PulseDaemon(home)
  let stopping = false
  const stopAndExit = (code: number) => {
    if (stopping) {
      return
    }

    stopping = true
    void daemon.stop().finally(() => {
      process.exit(code)
    })
  }

  process.on('SIGTERM', () => stopAndExit(0))
  process.on('SIGINT', () => stopAndExit(0))
  await daemon.start()
}

function nextRunAt(schedule: string | undefined): string | undefined {
  if (!schedule) {
    return undefined
  }

  return Bun.cron.parse(schedule)?.toISOString()
}

async function removeSocket(path: string): Promise<void> {
  try {
    await unlink(path)
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      throw error
    }
  }
}

async function acquireDaemonLock(lockPath: string): Promise<void> {
  // code-lean: local daemon lock only, upgrade when PULSE_HOME is shared across hosts or filesystems.
  // Stage the PID in a temp file then link() it into place: the lock file appears atomically already
  // holding the PID, so a concurrent starter never observes an empty lock and cannot mistake an
  // in-progress acquire for a stale one.
  const tempPath = `${lockPath}.${process.pid}`
  await writeFile(tempPath, String(process.pid))
  try {
    while (true) {
      try {
        await link(tempPath, lockPath)
        return
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) {
          throw error
        }

        if (await isLockOwnerAlive(lockPath)) {
          throw new Error(`Pulse daemon already starting or running: ${lockPath}`)
        }

        await releaseDaemonLock(lockPath)
      }
    }
  } finally {
    await rm(tempPath, { force: true })
  }
}

async function releaseDaemonLock(lockPath: string): Promise<void> {
  // recursive also clears a leftover directory-style lock written by an older pulse build.
  await rm(lockPath, { force: true, recursive: true })
}

async function isLockOwnerAlive(lockPath: string): Promise<boolean> {
  try {
    const pid = Number((await readFile(lockPath, 'utf8')).trim())
    return Number.isInteger(pid) && pid > 0 && isProcessAlive(pid)
  } catch {
    return false
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'EPERM'
  }
}

async function waitForResult(result: Promise<unknown>, timeoutMs: number): Promise<boolean> {
  return Promise.race([result.then(() => true), Bun.sleep(timeoutMs).then(() => false)])
}
