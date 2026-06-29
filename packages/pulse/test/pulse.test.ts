import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { installCustomPulse, logs as readManagedLogs, runPulse, updateCustomPulse } from '../src/manager'
import { listCatalogPulses } from '../src/pulses/catalog'
import { builtInPulses, loadBuiltInPulses } from '../src/pulses/index'
import { hashFile, loadCustomPulseMetadata } from '../src/pulses/loader'
import { PulseDaemon, requestDaemon } from '../src/runtime/daemon'
import { readPulseLogs } from '../src/runtime/logs'
import { resolvePulsePaths } from '../src/store/paths'
import { type PulseState, readState, writeState } from '../src/store/state'

describe('pulse', () => {
  test('registers usage-window-warmup as a built-in scheduled PULSE', async () => {
    expect(builtInPulses.map(pulse => [pulse.name, pulse.kind, pulse.schedule])).toEqual([
      ['usage-window-warmup', 'scheduled', '0 4,9,14,23 * * *']
    ])
    expect(listCatalogPulses(emptyState()).map(pulse => pulse.name)).toEqual(['usage-window-warmup'])
  })

  test('loads built-in PULSE files from a directory', async () => {
    const pulses = await loadBuiltInPulses(fixturePulseDirectory())
    expect(
      pulses
        .map(pulse => [pulse.name, pulse.kind, pulse.schedule])
        .sort((left, right) => String(left[0]).localeCompare(String(right[0])))
    ).toEqual([['test-scheduled-pulse', 'scheduled', '0 0 1 1 *']])
  })

  test('reloads built-in PULSE files with a fresh import', async () => {
    const dir = await tempDir()
    const file = join(dir, 'reloadable.ts')
    await writeFile(
      file,
      `
export const name = 'reloadable-pulse'
export const schedule = '0 1 * * *'
export async function run() {}
`
    )

    const before = await loadBuiltInPulses(dir, { fresh: true })
    expect(before[0]?.schedule).toBe('0 1 * * *')

    await writeFile(
      file,
      `
export const name = 'reloadable-pulse'
export const schedule = '0 2 * * *'
export async function run() {}
`
    )

    const after = await loadBuiltInPulses(dir, { fresh: true })
    expect(after[0]?.schedule).toBe('0 2 * * *')
  })

  test('reloads custom PULSE metadata from the same file path', async () => {
    const dir = await tempDir()
    const file = join(dir, 'daily-note.ts')
    await writeFile(
      file,
      `
export const name = 'daily-note'
export const schedule = '0 8 * * *'
export async function run() {}
`
    )
    expect((await loadCustomPulseMetadata(file, await hashFile(file))).schedule).toBe('0 8 * * *')

    await writeFile(
      file,
      `
export const name = 'daily-note'
export const schedule = '0 9 * * *'
export async function run() {}
`
    )

    expect((await loadCustomPulseMetadata(file, await hashFile(file))).schedule).toBe('0 9 * * *')
  })

  test('loads custom PULSE metadata from a Bun file', async () => {
    const dir = await tempDir()
    const file = join(dir, 'daily-note.ts')
    await writeFile(
      file,
      `
export const name = 'daily-note'
export const schedule = '0 9 * * *'
export async function run() {}
`
    )

    const metadata = await loadCustomPulseMetadata(file)
    expect(metadata).toMatchObject({
      kind: 'scheduled',
      name: 'daily-note',
      schedule: '0 9 * * *'
    })
  })

  test('rejects invalid custom PULSE exports', async () => {
    const dir = await tempDir()
    const file = join(dir, 'bad.ts')
    await writeFile(
      file,
      `
export const name = 'Bad Name'
export const schedule = '0 9 * * *'
export async function run() {}
`
    )

    await expect(loadCustomPulseMetadata(file)).rejects.toThrow('Invalid PULSE name')
  })

  test('rejects missing run', async () => {
    const dir = await tempDir()
    const missingRun = join(dir, 'missing-run.ts')
    await writeFile(missingRun, `export const name = 'missing-run'`)

    await expect(loadCustomPulseMetadata(missingRun)).rejects.toThrow('PULSE must export function run()')
  })

  test('does not import a custom PULSE when install confirmation is rejected', async () => {
    const dir = await tempDir()
    const home = join(dir, 'home')
    const marker = join(dir, 'marker.txt')
    const file = join(dir, 'manual.ts')
    await writeFile(
      file,
      `
await Bun.write(${JSON.stringify(marker)}, 'imported')
export const name = 'manual-pulse'
export async function run() {}
`
    )

    await expect(
      installCustomPulse(home, file, {
        confirmPrompt: async () => false
      })
    ).rejects.toThrow('Cancelled')
    await expect(readFile(marker, 'utf8')).rejects.toThrow()
  })

  test('rejects custom PULSE name collisions without writing installed state', async () => {
    const dir = await tempDir()
    const home = join(dir, 'home')
    const file = join(dir, 'collision.ts')
    await writeFile(
      file,
      `
export const name = 'usage-window-warmup'
export async function run() {}
`
    )

    await expect(
      installCustomPulse(home, file, {
        confirmPrompt: async () => true
      })
    ).rejects.toThrow('PULSE already exists')
    await expect(readState(resolvePulsePaths(home).statePath)).resolves.toMatchObject({ installed: {} })
  })

  test('updates custom PULSE hash before changed entry can run', async () => {
    const dir = await tempDir()
    const home = join(dir, 'home')
    const file = join(dir, 'manual.ts')
    await writeFile(
      file,
      `
export const name = 'manual-pulse'
export async function run() {
  console.log('v1')
}
`
    )

    await installCustomPulse(home, file, { confirmPrompt: promptSequence(true, true) })
    const before = await readState(resolvePulsePaths(home).statePath)
    await writeFile(
      file,
      `
export const name = 'manual-pulse'
export async function run() {
  console.log('v2')
}
`
    )

    await updateCustomPulse(home, 'manual-pulse', { confirmPrompt: promptSequence(true, true) })
    const after = await readState(resolvePulsePaths(home).statePath)
    expect(after.installed['manual-pulse']?.source.sha256).toBe(await hashFile(file))
    expect(after.installed['manual-pulse']?.source.sha256).not.toBe(before.installed['manual-pulse']?.source.sha256)

    const daemon = new PulseDaemon(home)
    await daemon.start()
    try {
      const result = (await requestDaemon(home, { command: 'run', name: 'manual-pulse' })) as { stdout: string }
      expect(result.stdout).toContain('v2')
    } finally {
      await daemon.stop()
    }
  })

  test('runs a local Bun file once without installing it', async () => {
    const dir = await tempDir()
    const home = join(dir, 'home')
    const counter = join(dir, 'counter.txt')
    const file = join(dir, 'run-once.ts')
    await writeFile(
      file,
      `
const path = ${JSON.stringify(counter)}
const current = Number(await Bun.file(path).text().catch(() => '0'))
await Bun.write(path, String(current + 1))
export const name = 'run-once'
export async function run() {
  console.log('ran')
}
`
    )

    await expect(runPulse(home, file)).resolves.toContain('ran')
    await expect(readFile(counter, 'utf8')).resolves.toBe('1')
  })

  test('captures console and Bun stdout/stderr writes in managed logs', async () => {
    const dir = await tempDir()
    const home = join(dir, 'home')
    const file = join(dir, 'logging.ts')
    await writeFile(
      file,
      `
export const name = 'logging-pulse'
export async function run() {
  console.log('console stdout')
  console.error('console stderr')
  await Bun.write(Bun.stdout, 'bun stdout\\n')
  await Bun.write(Bun.stderr, 'bun stderr\\n')
}
`
    )

    const paths = resolvePulsePaths(home)
    await writeState(paths.statePath, {
      enabled: {},
      version: 1,
      installed: {
        'logging-pulse': {
          installedAt: new Date().toISOString(),
          kind: 'manual',
          name: 'logging-pulse',
          source: { path: file, sha256: await hashFile(file), type: 'file' }
        }
      }
    })

    const daemon = new PulseDaemon(home)
    await daemon.start()
    try {
      const result = (await requestDaemon(home, { command: 'run', name: 'logging-pulse' })) as {
        stderr: string
        stdout: string
      }
      expect(result.stdout).toContain('console stdout')
      expect(result.stdout).toContain('bun stdout')
      expect(result.stderr).toContain('console stderr')
      expect(result.stderr).toContain('bun stderr')

      const logs = await readPulseLogs(home, 'logging-pulse')
      expect(logs).toContain('console stdout')
      expect(logs).toContain('bun stdout')
      expect(logs).toContain('console stderr')
      expect(logs).toContain('bun stderr')

      const allLogs = await readManagedLogs(home)
      expect(allLogs).toContain('== usage-window-warmup stdout ==')
      expect(allLogs).toContain('== logging-pulse stdout ==')
      expect(allLogs).toContain('console stdout')
    } finally {
      await daemon.stop()
    }
  })

  test('enables scheduled PULSE without running it and can run the same file once', async () => {
    const dir = await tempDir()
    const home = join(dir, 'home')
    const marker = join(dir, 'scheduled-ran.txt')
    const scheduled = fixturePulsePath('test-scheduled-pulse.ts')

    const paths = resolvePulsePaths(home)
    await writeState(paths.statePath, {
      enabled: {},
      version: 1,
      installed: {
        'test-scheduled-pulse': {
          installedAt: new Date().toISOString(),
          kind: 'scheduled',
          name: 'test-scheduled-pulse',
          schedule: '0 0 1 1 *',
          source: { path: scheduled, sha256: await hashFile(scheduled), type: 'file' }
        }
      }
    })

    const previousMarker = process.env.PULSE_TEST_MARKER
    process.env.PULSE_TEST_MARKER = marker
    const daemon = new PulseDaemon(home)
    await daemon.start()
    try {
      await requestDaemon(home, { command: 'enable', name: 'test-scheduled-pulse' })
      const list = (await requestDaemon(home, { command: 'list' })) as Array<{ name: string; status: string }>
      expect(list).toContainEqual(expect.objectContaining({ name: 'test-scheduled-pulse', status: 'enabled' }))
      await Bun.sleep(100)
      await expect(readFile(marker, 'utf8')).rejects.toThrow()
      await requestDaemon(home, { command: 'run', name: 'test-scheduled-pulse' })
      await expect(readFile(marker, 'utf8')).resolves.toBe('scheduled')
    } finally {
      await daemon.stop()
      restoreEnv('PULSE_TEST_MARKER', previousMarker)
    }
  })

  test('daemon rejects manual enable and changed custom entry', async () => {
    const dir = await tempDir()
    const home = join(dir, 'home')
    const manual = join(dir, 'manual.ts')
    await writeFile(manual, `export const name = 'manual-pulse'\nexport async function run() {}`)

    const paths = resolvePulsePaths(home)
    await writeState(paths.statePath, {
      enabled: {},
      version: 1,
      installed: {
        'manual-pulse': {
          installedAt: new Date().toISOString(),
          kind: 'manual',
          name: 'manual-pulse',
          source: { path: manual, sha256: await hashFile(manual), type: 'file' }
        }
      }
    })

    const daemon = new PulseDaemon(home)
    await daemon.start()
    try {
      await expect(requestDaemon(home, { command: 'enable', name: 'manual-pulse' })).rejects.toThrow(
        'Manual PULSE cannot be enabled'
      )
      await expect(requestDaemon(home, { command: 'disable', name: 'missing-pulse' })).rejects.toThrow('Unknown PULSE')
      await writeFile(
        manual,
        `export const name = 'manual-pulse'\nexport async function run() { console.log('changed') }`
      )
      await expect(requestDaemon(home, { command: 'run', name: 'manual-pulse' })).rejects.toThrow(
        'Custom PULSE source changed'
      )
    } finally {
      await daemon.stop()
    }
  })

  test('daemon accepts fragmented socket requests', async () => {
    const dir = await tempDir()
    const home = join(dir, 'home')
    const daemon = new PulseDaemon(home)
    await daemon.start()
    try {
      const response = await requestDaemonInChunks(home, { command: 'ping' })
      expect(response).toMatchObject({ ok: true })
    } finally {
      await daemon.stop()
    }
  })

  test('daemon rejects a second instance for the same home', async () => {
    const dir = await tempDir()
    const home = join(dir, 'home')
    const daemon = new PulseDaemon(home)
    await daemon.start()
    try {
      await expect(new PulseDaemon(home).start()).rejects.toThrow('already')
      await expect(requestDaemon(home, { command: 'ping' })).resolves.toMatchObject({ pid: process.pid })
    } finally {
      await daemon.stop()
    }
  })

  test('daemon reclaims a stale lock that no live process owns', async () => {
    const dir = await tempDir()
    const home = join(dir, 'home')
    await mkdir(home, { recursive: true })
    // A lock without a live owning PID must be reclaimed, not mistaken for a running daemon.
    await writeFile(resolvePulsePaths(home).daemonLockPath, 'not-a-pid')
    const daemon = new PulseDaemon(home)
    await daemon.start()
    try {
      await expect(requestDaemon(home, { command: 'ping' })).resolves.toMatchObject({ pid: process.pid })
    } finally {
      await daemon.stop()
    }
  })
})

function emptyState(): PulseState {
  return {
    enabled: {},
    installed: {},
    version: 1
  }
}

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'pulse-test-'))
}

function fixturePulseDirectory(): string {
  return fileURLToPath(new URL('./fixtures/pulses', import.meta.url))
}

function fixturePulsePath(name: string): string {
  return join(fixturePulseDirectory(), name)
}

async function requestDaemonInChunks(home: string, request: Record<string, unknown>): Promise<unknown> {
  const paths = resolvePulsePaths(home)
  return new Promise((resolve, reject) => {
    const socket = createConnection(paths.daemonSocketPath)
    const payload = JSON.stringify(request)
    let text = ''
    socket.on('connect', () => {
      socket.write(payload.slice(0, 3))
      setTimeout(() => socket.write(`${payload.slice(3)}\n`), 0)
    })
    socket.on('data', chunk => {
      text += chunk.toString()
    })
    socket.on('error', reject)
    socket.on('end', () => {
      try {
        resolve(JSON.parse(text))
      } catch (error) {
        reject(error)
      }
    })
  })
}

function promptSequence(...answers: boolean[]) {
  let index = 0
  return async () => answers[index++] ?? answers.at(-1) ?? true
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
    return
  }

  process.env[name] = value
}
