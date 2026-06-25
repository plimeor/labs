import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec'

export function objectSchema<T extends Record<string, unknown>>(
  validate: (value: Record<string, unknown>) => value is T
): StandardSchemaV1<unknown, T> {
  return {
    '~standard': {
      vendor: 'harness-test',
      version: 1,
      validate(value) {
        if (isRecord(value) && validate(value)) {
          return { value }
        }

        return { issues: [{ message: 'Invalid object' }] }
      }
    }
  }
}

export function jsonObjectSchema<T extends Record<string, unknown>>(
  jsonSchema: Record<string, unknown>,
  validate: (value: Record<string, unknown>) => value is T
): StandardSchemaV1<unknown, T> & StandardJSONSchemaV1<unknown, T> {
  return {
    '~standard': {
      vendor: 'harness-test',
      version: 1,
      jsonSchema: {
        input: () => jsonSchema,
        output: () => jsonSchema
      },
      validate(value) {
        if (isRecord(value) && validate(value)) {
          return { value }
        }

        return { issues: [{ message: 'Invalid object' }] }
      }
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
