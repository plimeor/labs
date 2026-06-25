import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec'

export function resolveOutputJsonSchema(schema: StandardSchemaV1): Record<string, unknown> | undefined {
  if (!isStandardJsonSchema(schema)) {
    return undefined
  }

  try {
    return schema['~standard'].jsonSchema.output({ target: 'draft-07' })
  } catch {
    return undefined
  }
}

function isStandardJsonSchema(schema: StandardSchemaV1): schema is StandardSchemaV1 & StandardJSONSchemaV1 {
  const candidate = schema as StandardSchemaV1 & Partial<StandardJSONSchemaV1>
  return typeof candidate['~standard'].jsonSchema?.output === 'function'
}
