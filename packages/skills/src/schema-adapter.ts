import type { SchemaAdapter } from '@plimeor/command-kit'
import { toJsonSchema } from '@valibot/to-json-schema'
import type * as v from 'valibot'

const SUPPORTED_TARGETS = new Set(['draft-07', 'draft-2020-12', 'openapi-3.0'])

export const toStandardJsonSchema: SchemaAdapter['toStandardJsonSchema'] = schema => {
  if (!isValibotSchema(schema)) {
    return undefined
  }

  return {
    '~standard': {
      vendor: 'valibot',
      version: 1,
      jsonSchema: {
        input: options => convert(schema, options),
        output: options => convert(schema, options)
      }
    }
  }
}

function convert(schema: v.GenericSchema, options: { target: string }): Record<string, unknown> {
  return toJsonSchema(schema, {
    errorMode: 'ignore',
    ignoreActions: ['check'],
    target: normalizeTarget(options.target)
  }) as unknown as Record<string, unknown>
}

function isValibotSchema(schema: Parameters<SchemaAdapter['toStandardJsonSchema']>[0]): schema is v.GenericSchema {
  return schema['~standard'].vendor === 'valibot' && (schema as { kind?: unknown }).kind === 'schema'
}

function normalizeTarget(target: string): 'draft-07' | 'draft-2020-12' | 'openapi-3.0' {
  return SUPPORTED_TARGETS.has(target) ? (target as 'draft-07' | 'draft-2020-12' | 'openapi-3.0') : 'draft-07'
}
