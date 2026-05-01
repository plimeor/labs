import type { Static, TSchema } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'

import { type CommandErrorCode, CommandRuntimeError } from './errors.js'

export type InferSchema<T extends TSchema> = Static<T>

export function validateSchema<T extends TSchema>(
  schema: T,
  value: unknown,
  code: CommandErrorCode,
  label: string
): Static<T> {
  if (Value.Check(schema, value)) {
    return value
  }

  const details = [...Value.Errors(schema, value)].map(error => ({
    message: error.message,
    path: error.path,
    value: error.value
  }))
  throw new CommandRuntimeError(code, `Invalid ${label}`, details)
}
