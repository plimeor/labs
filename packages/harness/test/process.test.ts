import { describe, expect, test } from 'bun:test'

import type { CommandPlan, HarnessRunEvent, RunOutputRequest } from '../src/index'
import { runCommandPlan } from '../src/process'

describe('process runner', () => {
  test('runs the exact command plan and exposes stdout, stderr, env, cwd, stdin, and result', async () => {
    const cwd = await makeTempDir()
    const plan = bunPlan({
      cwd,
      env: { HARNESS_TEST: 'ok', REMOVE_ME: undefined },
      script: `
        const input = await new Response(Bun.stdin.stream()).text()
        console.log(process.cwd())
        console.log(process.env.HARNESS_TEST)
        console.log(process.env.REMOVE_ME === undefined ? 'removed' : 'present')
        console.error('stderr:' + input.trim())
      `,
      stdin: 'hello\n'
    })

    const run = runCommandPlan('test', plan)
    const [stdout, stderr, result] = await Promise.all([collectText(run.stdout), collectText(run.stderr), run.result])

    expect(stdout).toContain(cwd)
    expect(stdout).toContain('ok')
    expect(stdout).toContain('removed')
    expect(stderr).toContain('stderr:hello')
    expect(result.finalText).toBe(stdout)
    expect(result.exitCode).toBe(0)
  })

  test('emits parsed JSON events for JSONL output', async () => {
    const plan = bunPlan({
      output: { mode: 'jsonl' },
      script: `
        console.log(JSON.stringify({ type: 'one' }))
        console.log(JSON.stringify({ type: 'two' }))
      `
    })

    const run = runCommandPlan('test', plan)
    const result = await run.result
    const events = await collectEvents(run.events)

    expect(result.exitCode).toBe(0)
    expect(events).toEqual([
      { type: 'json', value: { type: 'one' } },
      { type: 'json', value: { type: 'two' } }
    ])
  })

  test('supports timeout', async () => {
    const plan = bunPlan({
      script: 'await Bun.sleep(5000)',
      timeoutMs: 20
    })

    const run = runCommandPlan('test', plan)
    const result = await run.result

    expect(result.exitCode).not.toBe(0)
  })

  test('supports kill', async () => {
    const plan = bunPlan({
      script: 'await Bun.sleep(5000)'
    })

    const run = runCommandPlan('test', plan)
    run.kill()
    const result = await run.result

    expect(result.exitCode).not.toBe(0)
  })

  test('rejects mismatched harness ids before spawning', () => {
    const plan = bunPlan({ script: 'console.log("no")' })

    expect(() => runCommandPlan('other', plan)).toThrow('CommandPlan harnessId mismatch')
  })
})

function bunPlan(input: {
  script: string
  cwd?: string
  env?: Record<string, string | undefined>
  stdin?: string
  output?: RunOutputRequest
  timeoutMs?: number
}): CommandPlan<RunOutputRequest> {
  return {
    args: ['-e', input.script],
    command: process.execPath,
    cwd: input.cwd ?? process.cwd(),
    env: input.env,
    harnessId: 'test',
    output: input.output ?? { mode: 'text' },
    stdin: input.stdin,
    timeoutMs: input.timeoutMs
  }
}

async function collectText(iterable: AsyncIterable<Uint8Array>): Promise<string> {
  let text = ''
  const decoder = new TextDecoder()
  for await (const chunk of iterable) {
    text += decoder.decode(chunk, { stream: true })
  }
  return text + decoder.decode()
}

async function collectEvents(iterable: AsyncIterable<HarnessRunEvent>): Promise<HarnessRunEvent[]> {
  const events: HarnessRunEvent[] = []
  for await (const event of iterable) {
    events.push(event)
  }
  return events
}

async function makeTempDir(): Promise<string> {
  return await Bun.$`mktemp -d`.text().then(path => path.trim())
}
