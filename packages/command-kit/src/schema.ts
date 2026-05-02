import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec'
import type { JSONSchema7, JSONSchema7Definition } from 'json-schema'

import { type CommandErrorCode, CommandRuntimeError } from './errors.js'

export type InferSchema<T extends StandardSchemaV1> = StandardSchemaV1.InferOutput<T>

export type JsonSchemaProperty = JSONSchema7Definition
export type JsonObjectSchema = JSONSchema7

export type SchemaAdapter = {
  toStandardJsonSchema: (schema: any) => StandardJSONSchemaV1 | undefined
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

    const jsonSchema = standardJsonSchema['~standard'].jsonSchema.input({
      target: 'draft-07',
      libraryOptions: {
        errorMode: 'ignore',
        ignoreActions: ['check']
      }
    })
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

function isJsonObjectSchema(value: unknown): value is JSONSchema7 {
  if (!isRecord(value)) {
    return false
  }

  return value.type === 'object' || isRecord(value.properties)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
