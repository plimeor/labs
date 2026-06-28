import { describe, expect, test } from 'bun:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

describe('usage-window-warmup', () => {
  test('uses Harness health checks for Claude and Codex', async () => {
    const pulsePath = fileURLToPath(new URL('../src/pulses/builtin/usage-window-warmup.ts', import.meta.url))
    const script = `
import { mock } from 'bun:test'

const calls = {
  healthChecks: 0,
  opened: [],
  plans: 0,
  runs: 0
}

mock.module('@plimeor/harness', () => ({
  harness: {
    open: async agent => {
      calls.opened.push(agent)
      return {
        health: {
          check: async () => {
            calls.healthChecks += 1
            return { success: true }
          }
        },
        process: {
          plan: async () => {
            calls.plans += 1
            throw new Error('usage-window-warmup should call health.check(), not process.plan()')
          },
          run: async () => {
            calls.runs += 1
            throw new Error('usage-window-warmup should call health.check(), not process.run()')
          }
        }
      }
    }
  }
}))

const write = process.stdout.write
let output = ''
process.stdout.write = chunk => {
  output += chunk.toString()
  return true
}

try {
  const pulse = await import(${JSON.stringify(pathToFileURL(pulsePath).href)})
  await pulse.run()
} finally {
  process.stdout.write = write
}

if (JSON.stringify(calls.opened) !== JSON.stringify(['claude', 'codex'])) {
  throw new Error(\`opened agents mismatch: \${JSON.stringify(calls.opened)}\`)
}

if (calls.healthChecks !== 2 || calls.plans !== 0 || calls.runs !== 0) {
  throw new Error(\`unexpected calls: \${JSON.stringify(calls)}\`)
}

if (!output.includes('usage-window-warmup completed')) {
  throw new Error(\`unexpected output: \${output}\`)
}
`

    const subprocess = Bun.spawn({
      cmd: [process.execPath, '--eval', script],
      stderr: 'pipe',
      stdout: 'pipe'
    })
    const [exitCode, stdout, stderr] = await Promise.all([
      subprocess.exited,
      streamText(subprocess.stdout),
      streamText(subprocess.stderr)
    ])

    expect({ exitCode, stderr, stdout }).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: ''
    })
  })
})

async function streamText(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text()
}
