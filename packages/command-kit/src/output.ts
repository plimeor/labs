import { type CommandError, normalizeError } from './errors.js'

export type OutputMode = 'json' | 'pretty'

export type CommandResult<T> = { data: T; ok: true } | { error: CommandError; ok: false }

export function isCommandResult(value: unknown): value is CommandResult<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ok' in value &&
    ((value as { ok: unknown }).ok === true || (value as { ok: unknown }).ok === false)
  )
}

export function normalizeSuccess(value: unknown): CommandResult<unknown> {
  if (isCommandResult(value)) {
    return value
  }

  return {
    data: value,
    ok: true
  }
}

export function normalizeFailure(error: unknown): { error: CommandError; ok: false } {
  return {
    error: normalizeError(error),
    ok: false
  }
}

export function writeJsonResult(result: CommandResult<unknown>): void {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
