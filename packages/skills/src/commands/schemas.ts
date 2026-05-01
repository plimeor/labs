import * as v from 'valibot'

export const emptyArgsSchema = v.object({})

export function optionalBoolean(description: string) {
  return v.optional(v.pipe(v.boolean(), v.description(description)))
}

export function optionalString(description: string) {
  return v.optional(nonBlankString(description))
}

export function optionalStringArray(description: string) {
  return v.optional(v.pipe(v.array(nonBlankString()), v.description(description)))
}

export function nonBlankString(description?: string) {
  const schema = v.pipe(
    v.string(),
    v.check(value => value.trim().length > 0, 'Expected a non-empty string')
  )
  if (!description) {
    return schema
  }

  return v.pipe(schema, v.description(description))
}

export function nonEmptyStringArray(description?: string) {
  const schema = v.pipe(
    v.array(nonBlankString()),
    v.check(values => values.length > 0, 'Expected at least one value')
  )
  if (!description) {
    return schema
  }

  return v.pipe(schema, v.description(description))
}
