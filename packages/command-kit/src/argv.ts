import { CommandErrorCode, CommandRuntimeError } from './errors.js'
import type { JsonObjectSchema, JsonSchemaProperty } from './schema.js'

export type ArgBindingSpec = {
  name: string
  optional?: boolean
  rest?: boolean
}

export type ParsedArgv = {
  args: Record<string, unknown>
  options: Record<string, unknown>
}

export type ParseArgvOptions = {
  argBindings: ArgBindingSpec[]
  optionAliases?: Partial<Record<string, string>>
  optionSchema: JsonObjectSchema | undefined
}

export function parseArgv(argv: string[], options: ParseArgvOptions): ParsedArgv {
  validateArgBindings(options.argBindings)
  const parsed = parseOptionsAndArgValues(argv, options)
  const args = bindArgValues(parsed.argValues, options.argBindings)

  return {
    args,
    options: parsed.options
  }
}

function parseOptionsAndArgValues(
  argv: string[],
  { optionAliases = {}, optionSchema }: ParseArgvOptions
): { argValues: string[]; options: Record<string, unknown> } {
  const argValues: string[] = []
  const options: Record<string, unknown> = {}
  const aliasMap = new Map(Object.entries(optionAliases).map(([name, alias]) => [alias, name]))
  let argValuesOnly = false

  for (let index = 0; index < argv.length; index++) {
    const token = argv[index]
    if (argValuesOnly) {
      argValues.push(token)
      continue
    }

    if (token === '--') {
      argValuesOnly = true
      continue
    }

    if (token.startsWith('--') && token.length > 2) {
      const [rawName, inlineValue] = splitLongOption(token)
      const name = kebabToCamel(rawName)
      const property = optionProperty(optionSchema, name, rawName)
      const kind = optionKind(property)
      if (kind === 'boolean') {
        setOption(options, name, inlineValue === undefined ? true : parseBoolean(rawName, inlineValue))
        continue
      }

      const value = inlineValue ?? readOptionValue(argv, ++index, rawName)
      setOption(options, name, value, kind === 'array')
      continue
    }

    if (token.startsWith('-') && token.length > 1) {
      const alias = token.slice(1)
      const name = aliasMap.get(alias)
      if (!name) {
        throw new CommandRuntimeError(CommandErrorCode.UnknownOption, `Unknown option: -${alias}`)
      }

      const property = optionProperty(optionSchema, name, alias)
      const kind = optionKind(property)
      if (kind === 'boolean') {
        setOption(options, name, true)
        continue
      }

      const value = readOptionValue(argv, ++index, alias)
      setOption(options, name, value, kind === 'array')
      continue
    }

    argValues.push(token)
  }

  return { argValues, options }
}

function bindArgValues(values: string[], bindings: ArgBindingSpec[]): Record<string, unknown> {
  const args: Record<string, unknown> = {}
  let valueIndex = 0

  for (const binding of bindings) {
    if (binding.rest) {
      args[binding.name] = values.slice(valueIndex)
      valueIndex = values.length
      continue
    }

    const value = values[valueIndex]
    if (value === undefined) {
      if (!binding.optional) {
        throw new CommandRuntimeError(CommandErrorCode.MissingArgument, `Missing argument: ${binding.name}`)
      }
      continue
    }

    args[binding.name] = value
    valueIndex++
  }

  if (valueIndex < values.length) {
    throw new CommandRuntimeError(CommandErrorCode.UnknownArgument, `Unknown argument: ${values[valueIndex]}`)
  }

  return args
}

function validateArgBindings(bindings: ArgBindingSpec[]): void {
  const restIndex = bindings.findIndex(binding => binding.rest)
  if (restIndex !== -1 && restIndex !== bindings.length - 1) {
    throw new CommandRuntimeError(CommandErrorCode.InvalidArguments, 'Only the final arg binding may use rest: true')
  }
}

function splitLongOption(token: string): [string, string | undefined] {
  const raw = token.slice(2)
  const separator = raw.indexOf('=')
  if (separator === -1) {
    return [raw, undefined]
  }

  return [raw.slice(0, separator), raw.slice(separator + 1)]
}

function readOptionValue(argv: string[], index: number, name: string): string {
  const value = argv[index]
  if (value === undefined || value.startsWith('-')) {
    throw new CommandRuntimeError(CommandErrorCode.InvalidOptions, `Option requires a value: --${name}`)
  }

  return value
}

function optionProperty(schema: JsonObjectSchema | undefined, name: string, displayName: string): JsonSchemaProperty {
  const property = schema?.properties?.[name]
  if (!isJsonSchemaObject(property)) {
    throw new CommandRuntimeError(CommandErrorCode.UnknownOption, `Unknown option: --${displayName}`)
  }

  return property
}

function optionKind(schema: JsonSchemaProperty): 'array' | 'boolean' | 'string' {
  if (hasJsonSchemaType(schema, 'boolean')) {
    return 'boolean'
  }

  if (hasJsonSchemaType(schema, 'array')) {
    return 'array'
  }

  return 'string'
}

function hasJsonSchemaType(schema: JsonSchemaProperty, type: 'array' | 'boolean' | 'string'): boolean {
  if (!isJsonSchemaObject(schema)) {
    return false
  }

  if (Array.isArray(schema.type) && schema.type.includes(type)) {
    return true
  }

  if (schema.type === type) {
    return true
  }

  return [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])].some(option => hasJsonSchemaType(option, type))
}

function isJsonSchemaObject(schema: JsonSchemaProperty | undefined): schema is JsonObjectSchema {
  return typeof schema === 'object' && schema !== null && !Array.isArray(schema)
}

function setOption(options: Record<string, unknown>, name: string, value: unknown, append = false): void {
  if (!append) {
    options[name] = value
    return
  }

  const previous = options[name]
  options[name] = Array.isArray(previous) ? [...previous, value] : [value]
}

function parseBoolean(name: string, value: string): boolean {
  if (value === 'true') {
    return true
  }

  if (value === 'false') {
    return false
  }

  throw new CommandRuntimeError(CommandErrorCode.InvalidOptions, `Option --${name} must be true or false`)
}

function kebabToCamel(value: string): string {
  return value.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase())
}
