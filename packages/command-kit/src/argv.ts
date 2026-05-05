import { CommandErrorCode, CommandRuntimeError } from './errors.js'
import { hasJsonSchemaType, isJsonSchemaObject, type JsonObjectSchema, type JsonSchemaProperty } from './schema.js'

export type OptionTokenMap = Partial<Record<string, string | string[]>>

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
  optionAliases?: OptionTokenMap
  optionShortcuts?: OptionTokenMap
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
  { optionAliases = {}, optionSchema, optionShortcuts = {} }: ParseArgvOptions
): { argValues: string[]; options: Record<string, unknown> } {
  const argValues: string[] = []
  const options: Record<string, unknown> = {}
  const longAliasMap = createTokenMap(optionAliases, stripLongPrefix)
  const shortcutMap = createTokenMap(optionShortcuts, stripShortPrefix)
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
      const name = longAliasMap.get(rawName) ?? kebabToCamel(rawName)
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
      const shortcut = token.slice(1)
      const name = shortcutMap.get(shortcut)
      if (!name) {
        throw new CommandRuntimeError(CommandErrorCode.UnknownOption, `Unknown option: -${shortcut}`)
      }

      const property = optionProperty(optionSchema, name, shortcut)
      const kind = optionKind(property)
      if (kind === 'boolean') {
        setOption(options, name, true)
        continue
      }

      const value = readOptionValue(argv, ++index, shortcut)
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

function createTokenMap(optionTokens: OptionTokenMap, normalize: (token: string) => string): Map<string, string> {
  const map = new Map<string, string>()

  for (const [name, tokens] of Object.entries(optionTokens)) {
    if (!tokens) {
      continue
    }
    for (const token of asArray(tokens)) {
      map.set(normalize(token), name)
    }
  }

  return map
}

function asArray(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value]
}

function stripLongPrefix(value: string): string {
  return value.startsWith('--') ? value.slice(2) : value
}

function stripShortPrefix(value: string): string {
  return value.startsWith('-') ? value.slice(1) : value
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
