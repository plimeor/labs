import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec'

import { type CommandErrorCode, CommandRuntimeError } from './errors.js'

export type InferSchema<T extends StandardSchemaV1> = StandardSchemaV1.InferOutput<T>

export type JsonSchemaProperty = {
  anyOf?: JsonSchemaProperty[]
  description?: unknown
  oneOf?: JsonSchemaProperty[]
  type?: string | string[]
}

export type JsonObjectSchema = {
  properties?: Record<string, JsonSchemaProperty>
  type?: unknown
}

export type SchemaAdapter = {
  toStandardJsonSchema: (schema: StandardSchemaV1) => StandardJSONSchemaV1 | undefined
}

export async function validateSchema<T extends StandardSchemaV1>(
  schema: T,
  value: unknown,
  code: CommandErrorCode,
  label: string
): Promise<StandardSchemaV1.InferOutput<T>> {
  const result = await schema['~standard'].validate(value)
  if (!result.issues) {
    return result.value as StandardSchemaV1.InferOutput<T>
  }

  const details = result.issues.map(issue => ({
    message: issue.message,
    path: formatIssuePath(issue.path)
  }))
  throw new CommandRuntimeError(code, `Invalid ${label}`, details)
}

export function resolveJsonObjectSchema(
  schema: StandardSchemaV1,
  adapter: SchemaAdapter | undefined
): JsonObjectSchema | undefined {
  try {
    const standardJsonSchema = resolveStandardJsonSchema(schema, adapter)
    if (!standardJsonSchema) {
      return undefined
    }

    const jsonSchema = standardJsonSchema['~standard'].jsonSchema.input({ target: 'draft-07' })
    return isJsonObjectSchema(jsonSchema) ? jsonSchema : undefined
  } catch {
    return undefined
  }
}

function resolveStandardJsonSchema(
  schema: StandardSchemaV1,
  adapter: SchemaAdapter | undefined
): StandardJSONSchemaV1 | undefined {
  if (isStandardJsonSchema(schema)) {
    return schema
  }

  return adapter?.toStandardJsonSchema(schema)
}

function isStandardJsonSchema(schema: StandardSchemaV1): schema is StandardSchemaV1 & StandardJSONSchemaV1 {
  const candidate = schema as StandardSchemaV1 & Partial<StandardJSONSchemaV1>
  return typeof candidate['~standard'].jsonSchema?.input === 'function'
}

function isJsonObjectSchema(value: Record<string, unknown>): value is JsonObjectSchema {
  return value.type === 'object' || typeof value.properties === 'object'
}

function formatIssuePath(path: StandardSchemaV1.Issue['path']): string {
  if (!path || path.length === 0) {
    return ''
  }

  return path.map(formatPathSegment).join('.')
}

function formatPathSegment(segment: PropertyKey | StandardSchemaV1.PathSegment): string {
  if (typeof segment === 'object' && 'key' in segment) {
    return String(segment.key)
  }

  return String(segment)
}
