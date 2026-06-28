import { appendFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ensurePulseHome, resolvePulsePaths, runnerScriptPath } from '../store/paths'

export type PulseRunResult = {
  exitCode: number | null
  stderr: string
  stdout: string
}

export type ManagedRun = {
  kill(signal?: NodeJS.Signals): void
  pid: number
  result: Promise<PulseRunResult>
}

export type RunMode = 'file' | 'installed'

export async function startManagedRun(
  home: string,
  mode: RunMode,
  value: string,
  logName: string
): Promise<ManagedRun> {
  const paths = resolvePulsePaths(home)
  await ensurePulseHome(paths)

  const subprocess = Bun.spawn({
    cmd: [process.execPath, runnerScriptPath(), mode, value],
    env: { ...process.env, PULSE_HOME: home },
    stderr: 'pipe',
    stdout: 'pipe'
  })

  const stdout = collectAndAppend(subprocess.stdout, logPath(home, logName, 'out'))
  const stderr = collectAndAppend(subprocess.stderr, logPath(home, logName, 'error'))

  const result = Promise.all([subprocess.exited, stdout, stderr]).then(async ([exitCode, stdoutText, stderrText]) => {
    await appendEvent(home, logName, {
      exitCode,
      stderrLength: stderrText.length,
      stdoutLength: stdoutText.length,
      type: 'exit'
    })

    return {
      exitCode,
      stderr: stderrText,
      stdout: stdoutText
    }
  })

  return {
    pid: subprocess.pid,
    kill: signal => subprocess.kill(signal),
    result
  }
}

export async function appendEvent(home: string, name: string, event: Record<string, unknown>): Promise<void> {
  const payload = {
    at: new Date().toISOString(),
    ...event
  }
  await appendFile(logPath(home, name, 'jsonl'), `${JSON.stringify(payload)}\n`)
}

export async function readPulseLogs(home: string, name: string): Promise<string> {
  const [out, error, events] = await Promise.all([
    readTextIfExists(logPath(home, name, 'out')),
    readTextIfExists(logPath(home, name, 'error')),
    readTextIfExists(logPath(home, name, 'jsonl'))
  ])

  return [
    `== ${name} stdout ==`,
    out.trimEnd(),
    `== ${name} stderr ==`,
    error.trimEnd(),
    `== ${name} events ==`,
    events.trimEnd()
  ].join('\n')
}

export function logPath(home: string, name: string, stream: 'error' | 'jsonl' | 'out'): string {
  const paths = resolvePulsePaths(home)
  if (stream === 'jsonl') {
    return join(paths.logDir, `${name}.jsonl`)
  }

  return join(paths.logDir, `${name}-${stream}.log`)
}

async function collectAndAppend(stream: ReadableStream<Uint8Array>, path: string): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let text = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    const chunk = decoder.decode(value, { stream: true })
    text += chunk
    await appendFile(path, chunk)
  }

  const final = decoder.decode()
  if (final) {
    text += final
    await appendFile(path, final)
  }

  return text
}

async function readTextIfExists(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return ''
    }

    throw error
  }
}
