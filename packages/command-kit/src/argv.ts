import type { TObject, TSchema } from '@sinclair/typebox'

import { CommandErrorCode, CommandRuntimeError } from './errors.js'

export type PositionalSpec = {
  name: string
  optional?: boolean
  rest?: boolean
}

export type ParsedArgv = {
  args: Record<string, unknown>
  options: Record<string, unknown>
}

export type ParseArgvOptions = {
  optionAliases?: Record<string, string>
  optionSchema: TObject
  positionals: PositionalSpec[]
}

export function parseArgv(argv: string[], options: ParseArgvOptions): ParsedArgv {
  validatePositionals(options.positionals)
  const parsed = parseOptionsAndPositionals(argv, options)
  const args = bindPositionals(parsed.positionals, options.positionals)

  return {
    args,
    options: parsed.options
  }
}

function parseOptionsAndPositionals(
  argv: string[],
  { optionAliases = {}, optionSchema }: ParseArgvOptions
): { options: Record<string, unknown>; positionals: string[] } {
  const options: Record<string, unknown> = {}
  const positionals: string[] = []
  const aliasMap = new Map(Object.entries(optionAliases).map(([name, alias]) => [alias, name]))
  let positionalOnly = false

  for (let index = 0; index < argv.length; index++) {
    const token = argv[index]
    if (positionalOnly) {
      positionals.push(token)
      continue
    }

    if (token === '--') {
      positionalOnly = true
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

    positionals.push(token)
  }

  return { options, positionals }
}

function bindPositionals(values: string[], specs: PositionalSpec[]): Record<string, unknown> {
  const args: Record<string, unknown> = {}
  let valueIndex = 0

  for (const spec of specs) {
    if (spec.rest) {
      args[spec.name] = values.slice(valueIndex)
      valueIndex = values.length
      continue
    }

    const value = values[valueIndex]
    if (value === undefined) {
      if (!spec.optional) {
        throw new CommandRuntimeError(CommandErrorCode.MissingArgument, `Missing argument: ${spec.name}`)
      }
      continue
    }

    args[spec.name] = value
    valueIndex++
  }

  if (valueIndex < values.length) {
    throw new CommandRuntimeError(CommandErrorCode.UnknownArgument, `Unknown argument: ${values[valueIndex]}`)
  }

  return args
}

function validatePositionals(specs: PositionalSpec[]): void {
  const restIndex = specs.findIndex(spec => spec.rest)
  if (restIndex !== -1 && restIndex !== specs.length - 1) {
    throw new CommandRuntimeError(CommandErrorCode.InvalidArguments, 'Only the final positional may use rest: true')
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

function optionProperty(schema: TObject, name: string, displayName: string): TSchema {
  const property = schema.properties[name]
  if (!property) {
    throw new CommandRuntimeError(CommandErrorCode.UnknownOption, `Unknown option: --${displayName}`)
  }

  return property
}

function optionKind(schema: TSchema): 'array' | 'boolean' | 'string' {
  if (schema.type === 'boolean') {
    return 'boolean'
  }

  if (schema.type === 'array') {
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
