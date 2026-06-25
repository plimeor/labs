import { decodeRunOutput } from './output'
import type { CommandPlan, HarnessId, HarnessRun, HarnessRunEvent, RunOutputRequest } from './types'

class AsyncQueue<T> implements AsyncIterable<T> {
  private readonly values: T[] = []
  private readonly waiters: Array<(result: IteratorResult<T>) => void> = []
  private closed = false

  push(value: T): void {
    const waiter = this.waiters.shift()
    if (waiter) {
      waiter({ done: false, value })
      return
    }

    this.values.push(value)
  }

  close(): void {
    this.closed = true
    for (const waiter of this.waiters.splice(0)) {
      waiter({ done: true, value: undefined })
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => this.next()
    }
  }

  private next(): Promise<IteratorResult<T>> {
    const value = this.values.shift()
    if (value !== undefined) {
      return Promise.resolve({ done: false, value })
    }

    if (this.closed) {
      return Promise.resolve({ done: true, value: undefined })
    }

    return new Promise(resolve => {
      this.waiters.push(resolve)
    })
  }
}

export function runCommandPlan<Output extends RunOutputRequest>(
  harnessId: HarnessId,
  plan: CommandPlan<Output>
): HarnessRun<Output> {
  if (plan.harnessId !== harnessId) {
    throw new Error(`CommandPlan harnessId mismatch: expected ${harnessId}, received ${plan.harnessId}`)
  }

  const stdout = new AsyncQueue<Uint8Array>()
  const stderr = new AsyncQueue<Uint8Array>()
  const events = new AsyncQueue<HarnessRunEvent>()
  const decoder = new TextDecoder()
  let stdoutText = ''

  const subprocess = Bun.spawn({
    cmd: [plan.command, ...plan.args],
    cwd: plan.cwd,
    env: resolveEnv(plan.env),
    stderr: 'pipe',
    stdin: plan.stdin === undefined ? 'ignore' : 'pipe',
    stdout: 'pipe'
  })

  if (plan.stdin !== undefined && subprocess.stdin) {
    void writeStdin(subprocess.stdin, plan.stdin)
  }

  const timeout = plan.timeoutMs
    ? setTimeout(() => {
        subprocess.kill()
      }, plan.timeoutMs)
    : undefined

  const stdoutDone = pipeStream(subprocess.stdout, stdout, chunk => {
    const text = decoder.decode(chunk, { stream: true })
    stdoutText += text
  })
  const stderrDone = pipeStream(subprocess.stderr, stderr)

  const result = (async () => {
    const exitCode = await subprocess.exited
    clearTimeout(timeout)
    await Promise.all([stdoutDone, stderrDone])
    const tail = decoder.decode()
    stdoutText += tail

    try {
      const decoded = await decodeRunOutput({
        exitCode,
        finalText: stdoutText,
        output: plan.output,
        signal: subprocess.signalCode ?? undefined
      })

      for (const event of decoded.events) {
        events.push(event)
      }
      return decoded.result
    } finally {
      events.close()
    }
  })()

  return {
    events,
    kill(signal?: string) {
      subprocess.kill(signal as NodeJS.Signals | undefined)
    },
    plan,
    result,
    stderr,
    stdout
  }
}

export function createProcessRunner(harnessId: HarnessId): {
  run<Output extends RunOutputRequest>(plan: CommandPlan<Output>): Promise<HarnessRun<Output>>
} {
  return {
    async run<Output extends RunOutputRequest>(plan: CommandPlan<Output>): Promise<HarnessRun<Output>> {
      return runCommandPlan(harnessId, plan)
    }
  }
}

function resolveEnv(patch: Record<string, string | undefined> | undefined): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [name, value] of Object.entries(process.env)) {
    if (typeof value === 'string') {
      env[name] = value
    }
  }

  for (const [name, value] of Object.entries(patch ?? {})) {
    if (value === undefined) {
      delete env[name]
      continue
    }

    env[name] = value
  }

  return env
}

async function pipeStream(
  stream: ReadableStream<Uint8Array> | null,
  queue: AsyncQueue<Uint8Array>,
  onChunk?: (chunk: Uint8Array) => void
): Promise<void> {
  if (!stream) {
    queue.close()
    return
  }

  const reader = stream.getReader()
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) {
        return
      }

      queue.push(chunk.value)
      onChunk?.(chunk.value)
    }
  } finally {
    queue.close()
    reader.releaseLock()
  }
}

async function writeStdin(stdin: Bun.FileSink, value: string | Uint8Array): Promise<void> {
  stdin.write(value)
  stdin.end()
}
