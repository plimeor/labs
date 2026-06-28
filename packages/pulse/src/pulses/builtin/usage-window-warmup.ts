import { harness } from '@plimeor/harness'

type AgentId = 'claude' | 'codex'

type RunResult = {
  agents: AgentResult[]
  name: string
  startedAt: string
  success: boolean
}

type AgentResult =
  | {
      agent: AgentId
      status: 'completed'
    }
  | {
      agent: AgentId
      message: string
      status: 'failed'
    }

export const name = 'usage-window-warmup'
export const schedule = '0 4,9,14,23 * * *'

const agents: AgentId[] = ['claude', 'codex']

export async function run(): Promise<void> {
  const result = await runRaw()
  process.stdout.write(`${formatRun(result)}\n`)
  if (!result.success) {
    process.exitCode = 1
  }
}

async function runRaw(): Promise<RunResult> {
  const results: AgentResult[] = []

  // code-lean: agents run sequentially, upgrade when a PULSE needs many agents or runtime overlap matters.
  for (const agent of agents) {
    results.push(await runAgent(agent))
  }

  return {
    agents: results,
    name,
    startedAt: new Date().toISOString(),
    success:
      results.some(result => result.status === 'completed') && results.every(result => result.status !== 'failed')
  }
}

async function runAgent(agent: AgentId): Promise<AgentResult> {
  try {
    const handle = await harness.open(agent)
    const report = await handle.health.check()
    if (report.success) {
      return {
        agent,
        status: 'completed'
      }
    }

    return {
      agent,
      message: report.message,
      status: 'failed'
    }
  } catch (error) {
    return {
      agent,
      message: errorMessage(error),
      status: 'failed'
    }
  }
}

function formatRun(result: RunResult): string {
  const heading = `${result.name} ${result.success ? 'completed' : 'failed'}`
  const lines = result.agents.map(agent => formatAgent(agent))
  return [heading, ...lines].join('\n')
}

function formatAgent(result: AgentResult): string {
  if (result.status === 'completed') {
    return `${result.agent}: ok`
  }

  return `${result.agent}: failed - ${formatSnippet(result.message)}`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function formatSnippet(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) {
    return 'unknown error'
  }

  return trimmed.slice(0, 200)
}
