import { access } from 'node:fs/promises'
import { delimiter, join } from 'node:path'

import { HarnessPlanError } from '../errors'
import { createProcessRunner } from '../process'
import type {
  CommandPlan,
  ExtensionFacet,
  HarnessAdapter,
  HarnessContext,
  HarnessDetection,
  HarnessHandle,
  HarnessId,
  HarnessRun,
  HealthReport,
  JsonlOutputRequest,
  ProcessFacet,
  RunOutputRequest,
  RunRequest,
  StructuredOutputRequest,
  TextOutputRequest
} from '../types'

type BuiltInAdapterConfig = {
  id: Extract<HarnessId, 'claude' | 'codex' | 'cursor' | 'kiro' | 'pi'>
  commands: string[]
  identity: RegExp
  identityArgs?: string[]
  installHint: string
  requiresGoogleAccessBeforeSmoke?: boolean
  extensions(context: HarnessContext | undefined): ExtensionFacet
  plan(request: RunRequest<RunOutputRequest>, command: string, cwd: string): CommandPlan<RunOutputRequest>
}

const HEALTH_PROMPT_TIMEOUT_MS = 30_000
const GOOGLE_ACCESS_TIMEOUT_MS = 5_000
const GOOGLE_ACCESS_URL = 'https://www.google.com/generate_204'

export function createBuiltInAdapter(config: BuiltInAdapterConfig): HarnessAdapter {
  return {
    id: config.id,
    async detect(context?: HarnessContext): Promise<HarnessDetection> {
      return detectCommand(config, context)
    },

    async open(context?: HarnessContext): Promise<HarnessHandle> {
      const detection = await detectCommand(config, context)
      const runner = createProcessRunner(config.id)
      const process: ProcessFacet = {
        async plan<Output extends RunOutputRequest = TextOutputRequest>(
          request: RunRequest<Output>
        ): Promise<CommandPlan<Output>> {
          if (!detection.detected || !detection.binary) {
            throw new HarnessPlanError({
              harnessId: config.id,
              kind: 'unsupported_operation',
              message: `${config.id} CLI is not installed or was not recognized.`
            })
          }

          return config.plan(request, detection.binary.command, resolveCwd(context)) as CommandPlan<Output>
        },
        async run<Output extends RunOutputRequest = TextOutputRequest>(
          input: RunRequest<Output> | CommandPlan<Output>
        ): Promise<HarnessRun<Output>> {
          if (isCommandPlan(input)) {
            return runner.run(input)
          }

          const plan = await process.plan(input)
          return runner.run(plan)
        }
      }

      return {
        detection,
        extensions: config.extensions(context),
        health: {
          async check(): Promise<HealthReport> {
            if (!detection.detected || !detection.binary) {
              return {
                message: `${config.id} CLI is not installed or was not recognized. ${config.installHint}`,
                success: false
              }
            }

            if (config.requiresGoogleAccessBeforeSmoke) {
              const googleAccess = await checkGoogleAccess(config.id)
              if (!googleAccess.success) {
                return googleAccess
              }
            }

            const plan = config.plan(
              {
                output: { mode: 'text' },
                prompt: 'Reply with OK.',
                timeoutMs: HEALTH_PROMPT_TIMEOUT_MS
              },
              detection.binary.command,
              resolveCwd(context)
            )

            try {
              const run = await runner.run(plan)
              const result = await run.result
              if (result.finalText.trim().length > 0) {
                return { success: true }
              }

              return {
                message: `${config.id} CLI did not produce output for the health prompt within ${HEALTH_PROMPT_TIMEOUT_MS}ms.`,
                success: false
              }
            } catch (error) {
              return {
                message: `${config.id} CLI did not respond to the health prompt within ${HEALTH_PROMPT_TIMEOUT_MS}ms: ${formatError(error)}`,
                success: false
              }
            }
          }
        },
        process
      }
    }
  }
}

async function checkGoogleAccess(harnessId: HarnessId): Promise<HealthReport> {
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort()
  }, GOOGLE_ACCESS_TIMEOUT_MS)

  try {
    const response = await fetch(GOOGLE_ACCESS_URL, {
      method: 'GET',
      signal: controller.signal
    })

    if (response.ok) {
      return { success: true }
    }

    return {
      message: `${harnessId} CLI smoke prompt was skipped because google.com is not reachable. ${GOOGLE_ACCESS_URL} returned HTTP ${response.status}. Check local network access to google.com.`,
      success: false
    }
  } catch (error) {
    return {
      message: `${harnessId} CLI smoke prompt was skipped because google.com is not reachable within ${GOOGLE_ACCESS_TIMEOUT_MS}ms. Check local network access to google.com: ${formatError(error)}`,
      success: false
    }
  } finally {
    clearTimeout(timeout)
  }
}

function isCommandPlan<Output extends RunOutputRequest>(
  input: RunRequest<Output> | CommandPlan<Output>
): input is CommandPlan<Output> {
  return 'args' in input && 'command' in input && 'harnessId' in input
}

export function unsupportedOutputMode(harnessId: HarnessId, output: RunOutputRequest): never {
  throw new HarnessPlanError({
    harnessId,
    kind: 'unsupported_output_mode',
    message: unsupportedOutputModeMessage(harnessId, output)
  })
}

function unsupportedOutputModeMessage(harnessId: HarnessId, output: RunOutputRequest): string {
  const mode = output.mode ?? 'text'
  const prefix = `${harnessId} adapter does not support ${mode} output mode.`

  if (mode === 'structured') {
    return [
      prefix,
      'The current model path does not support structured output for this harness.',
      'Use text output and put the required JSON shape, field names, constraints, and validation rules directly in the prompt.'
    ].join(' ')
  }

  if (mode === 'jsonl') {
    return [
      prefix,
      'The current model path does not support native JSONL events for this harness.',
      'Use text output and ask the model to emit one valid JSON object per line, or choose a harness with native JSONL support.'
    ].join(' ')
  }

  return prefix
}

export function planTextCommand<Output extends RunOutputRequest>(input: {
  harnessId: HarnessId
  request: RunRequest<Output>
  command: string
  args: string[]
  cwd: string
  output: TextOutputRequest | JsonlOutputRequest
}): CommandPlan<Output> {
  return {
    args: input.args,
    command: input.command,
    cwd: input.request.cwd ?? input.cwd,
    env: input.request.env,
    harnessId: input.harnessId,
    output: input.output as Output,
    stdin: input.request.stdin,
    timeoutMs: input.request.timeoutMs
  }
}

export function planCommand<Output extends RunOutputRequest>(input: {
  harnessId: HarnessId
  request: RunRequest<Output>
  command: string
  args: string[]
  cwd: string
  output: TextOutputRequest | JsonlOutputRequest | StructuredOutputRequest
  env?: Record<string, string | undefined>
}): CommandPlan<Output> {
  return {
    args: input.args,
    command: input.command,
    cwd: input.request.cwd ?? input.cwd,
    env: mergeEnv(input.env, input.request.env),
    harnessId: input.harnessId,
    output: input.output as Output,
    stdin: input.request.stdin,
    timeoutMs: input.request.timeoutMs
  }
}

function mergeEnv(
  base: Record<string, string | undefined> | undefined,
  patch: Record<string, string | undefined> | undefined
): Record<string, string | undefined> | undefined {
  const env = { ...base, ...patch }
  return Object.keys(env).length > 0 ? env : undefined
}

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

async function detectCommand(
  config: BuiltInAdapterConfig,
  context: HarnessContext | undefined
): Promise<HarnessDetection> {
  for (const command of config.commands) {
    const resolved = await resolveCommand(command, context?.env)
    if (!resolved) {
      continue
    }

    const identity = await readIdentity(resolved, context, config.identityArgs ?? ['--version'])
    if (identity && config.identity.test(identity)) {
      return {
        binary: { command: resolved, identity },
        detected: true,
        id: config.id
      }
    }
  }

  return { detected: false, id: config.id }
}

async function resolveCommand(
  command: string,
  env: Record<string, string | undefined> | undefined
): Promise<string | undefined> {
  if (command.includes('/')) {
    return (await isExecutable(command)) ? command : undefined
  }

  for (const directory of (env?.PATH ?? process.env.PATH ?? '').split(delimiter)) {
    if (!directory) {
      continue
    }

    const candidate = join(directory, command)
    if (await isExecutable(candidate)) {
      return candidate
    }
  }

  return undefined
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, 0b001)
    return true
  } catch {
    return false
  }
}

async function readIdentity(
  command: string,
  context: HarnessContext | undefined,
  args: string[]
): Promise<string | undefined> {
  try {
    const subprocess = Bun.spawn({
      cmd: [command, ...args],
      cwd: resolveCwd(context),
      env: Object.fromEntries(
        Object.entries({ ...process.env, ...(context?.env ?? {}) }).filter((entry): entry is [string, string] => {
          return typeof entry[1] === 'string'
        })
      ),
      stderr: 'pipe',
      stdout: 'pipe'
    })
    const [exitCode, stdout, stderr] = await Promise.all([
      subprocess.exited,
      new Response(subprocess.stdout).text(),
      new Response(subprocess.stderr).text()
    ])
    const identity = `${stdout}\n${stderr}`.trim()
    return exitCode === 0 && identity.length > 0 ? identity : undefined
  } catch {
    return undefined
  }
}

function resolveCwd(context: HarnessContext | undefined): string {
  return context?.cwd ?? process.cwd()
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
