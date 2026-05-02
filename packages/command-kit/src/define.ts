import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec'

import { type PositionalSpec, parseArgv } from './argv.js'
import { type CommandError, CommandErrorCode, CommandRuntimeError } from './errors.js'
import { type CommandResult, normalizeFailure, normalizeSuccess, writeJsonResult } from './output.js'
import {
  type JsonObjectSchema,
  type JsonSchemaProperty,
  resolveJsonObjectSchema,
  type SchemaAdapter,
  validateSchema
} from './schema.js'

type EmptyObject = Record<string, never>
type EmptyObjectSchema = typeof emptyObjectSchema

export type CommandContext<ArgsSchema extends StandardSchemaV1, OptionsSchema extends StandardSchemaV1> = {
  args: StandardSchemaV1.InferOutput<ArgsSchema>
  assertInteractive: () => void
  options: StandardSchemaV1.InferOutput<OptionsSchema>
}

export type CommandDefinition<
  ArgsSchema extends StandardSchemaV1 = EmptyObjectSchema,
  OptionsSchema extends StandardSchemaV1 = EmptyObjectSchema
> = CommandConfig<ArgsSchema, OptionsSchema> & {
  name: string
}

export type CommandConfig<
  ArgsSchema extends StandardSchemaV1 = EmptyObjectSchema,
  OptionsSchema extends StandardSchemaV1 = EmptyObjectSchema
> = {
  aliases?: string[]
  args?: ArgsSchema
  description: string
  optionAliases?: Record<string, string>
  options?: OptionsSchema
  positionals?: PositionalSpec[]
  run: (
    context: CommandContext<ArgsSchema, OptionsSchema>
  ) => Promise<unknown | CommandResult<unknown>> | unknown | CommandResult<unknown>
  validate?: StandardSchemaV1
}

export type CliDefinition = {
  commands: CommandDefinition<any, any>[]
  description: string
  name: string
  schemaAdapter?: SchemaAdapter
}

export function defineCommand<
  ArgsSchema extends StandardSchemaV1 = EmptyObjectSchema,
  OptionsSchema extends StandardSchemaV1 = EmptyObjectSchema
>(name: string, config: CommandConfig<ArgsSchema, OptionsSchema>): CommandDefinition<ArgsSchema, OptionsSchema> {
  return {
    ...config,
    name
  }
}

export function defineCli(definition: CliDefinition): CliDefinition & { serve: (argv: string[]) => Promise<void> } {
  return {
    ...definition,
    serve: argv => serve(definition, argv)
  }
}

async function serve(cli: CliDefinition, argv: string[]): Promise<void> {
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    process.stdout.write(formatCliHelp(cli))
    return
  }

  const commandName = argv[0]
  const command = findCommand(cli.commands, commandName)
  if (!command) {
    const result = normalizeFailure(
      new CommandRuntimeError(CommandErrorCode.CommandNotFound, `Unknown command: ${commandName}`)
    )
    writeErrorResult(result)
    return
  }

  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(formatCommandHelp(cli, command, resolveCommandJsonSchemas(cli, command)))
    return
  }

  let json = wantsJsonResult(argv.slice(1), command, cli.schemaAdapter)
  try {
    const parsed = parseArgv(argv.slice(1), {
      optionAliases: command.optionAliases,
      optionSchema: resolveJsonObjectSchema(getOptionsSchema(command), cli.schemaAdapter),
      positionals: command.positionals ?? []
    })
    json = isJsonResult(parsed.options, command, cli.schemaAdapter)
    const args = await validateSchema(
      getArgsSchema(command),
      parsed.args,
      CommandErrorCode.InvalidArguments,
      'arguments'
    )
    const options = await validateSchema(
      getOptionsSchema(command),
      parsed.options,
      CommandErrorCode.InvalidOptions,
      'options'
    )
    const context = {
      args,
      assertInteractive: createInteractiveGuard(json),
      options
    }
    const output = await runCommand(command, context, json)
    const result = normalizeSuccess(output)
    if (json) {
      writeJsonResult(result)
    }
  } catch (error) {
    const result = normalizeFailure(error)
    if (json) {
      writeJsonResult(result)
    } else {
      writeErrorResult(
        result,
        shouldPrintCommandHelp(result.error)
          ? formatCommandHelp(cli, command, resolveCommandJsonSchemas(cli, command))
          : undefined
      )
    }
  }
}

async function runCommand<ArgsSchema extends StandardSchemaV1, OptionsSchema extends StandardSchemaV1>(
  command: CommandDefinition<ArgsSchema, OptionsSchema>,
  context: CommandContext<ArgsSchema, OptionsSchema>,
  json: boolean
): Promise<unknown | CommandResult<unknown>> {
  if (!json) {
    await validateCommandRequest(command, context)
    return command.run(context)
  }

  return withSuppressedOutput(async () => {
    await validateCommandRequest(command, context)
    return command.run(context)
  })
}

async function validateCommandRequest<ArgsSchema extends StandardSchemaV1, OptionsSchema extends StandardSchemaV1>(
  command: CommandDefinition<ArgsSchema, OptionsSchema>,
  context: CommandContext<ArgsSchema, OptionsSchema>
): Promise<void> {
  if (!command.validate) {
    return
  }

  await validateSchema(
    command.validate,
    {
      args: context.args,
      options: context.options
    },
    CommandErrorCode.InvalidArguments,
    'request'
  )
}

async function withSuppressedOutput<T>(callback: () => Promise<T> | T): Promise<T> {
  const stdoutWrite = process.stdout.write
  const stderrWrite = process.stderr.write
  process.stdout.write = (() => true) as typeof process.stdout.write
  process.stderr.write = (() => true) as typeof process.stderr.write

  try {
    return await callback()
  } finally {
    process.stdout.write = stdoutWrite
    process.stderr.write = stderrWrite
  }
}

function createInteractiveGuard(json: boolean): () => void {
  if (!json) {
    return () => undefined
  }

  return () => {
    throw new CommandRuntimeError(
      CommandErrorCode.InvalidOptions,
      'Interactive prompts are not available with --json; remove --json and run the command again.'
    )
  }
}

function findCommand(commands: CommandDefinition<any, any>[], name: string): CommandDefinition<any, any> | undefined {
  return commands.find(command => command.name === name || command.aliases?.includes(name))
}

function getArgsSchema<ArgsSchema extends StandardSchemaV1>(command: {
  args?: ArgsSchema
}): ArgsSchema | EmptyObjectSchema {
  return command.args ?? emptyObjectSchema
}

function getOptionsSchema<OptionsSchema extends StandardSchemaV1>(command: {
  options?: OptionsSchema
}): OptionsSchema | EmptyObjectSchema {
  return command.options ?? emptyObjectSchema
}

function wantsJsonResult(
  argv: string[],
  command: CommandDefinition<any, any>,
  adapter: SchemaAdapter | undefined
): boolean {
  for (const token of argv) {
    if (token === '--') {
      return false
    }

    if ((token === '--json' || token === '--json=true') && hasBooleanJsonOption(command, adapter)) {
      return true
    }
  }

  return false
}

function hasBooleanJsonOption(command: CommandDefinition<any, any>, adapter: SchemaAdapter | undefined): boolean {
  const optionsSchema = resolveJsonObjectSchema(getOptionsSchema(command), adapter)
  const jsonOption = optionsSchema?.properties?.json
  return jsonOption ? hasJsonSchemaType(jsonOption, 'boolean') : false
}

function isJsonResult(
  options: Record<string, unknown>,
  command: CommandDefinition<any, any>,
  adapter: SchemaAdapter | undefined
): boolean {
  return hasBooleanJsonOption(command, adapter) && options.json === true
}

function camelToKebab(value: string): string {
  return value.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)
}

function shouldPrintCommandHelp(error: CommandError): boolean {
  return error.code === CommandErrorCode.MissingArgument || error.code === CommandErrorCode.InvalidArguments
}

function writeErrorResult(result: { error: CommandError; ok: false }, help?: string): void {
  process.stderr.write(help ? `${result.error.message}\n\n${help}` : `${result.error.message}\n`)
  process.exitCode = 1
}

function formatCliHelp(cli: CliDefinition): string {
  const commandLines = cli.commands
    .map(command => `  ${formatCommandNames(command).padEnd(18)} ${command.description}`)
    .join('\n')

  return `${cli.name} — ${cli.description}\n\nUsage: ${cli.name} <command>\n\nCommands:\n${commandLines}\n\nGlobal Options:\n  --help, -h  Show help\n`
}

type CommandJsonSchemas = {
  args: JsonObjectSchema | undefined
  options: JsonObjectSchema | undefined
}

function resolveCommandJsonSchemas(cli: CliDefinition, command: CommandDefinition): CommandJsonSchemas {
  return {
    args: resolveJsonObjectSchema(getArgsSchema(command), cli.schemaAdapter),
    options: resolveJsonObjectSchema(getOptionsSchema(command), cli.schemaAdapter)
  }
}

function formatCommandHelp(cli: CliDefinition, command: CommandDefinition, schemas: CommandJsonSchemas): string {
  return [
    `${cli.name} ${command.name} — ${command.description}`,
    '',
    `Usage: ${cli.name} ${command.name}${formatPositionals(command.positionals ?? [])} [options]`,
    formatAliases(command),
    formatArguments(command, schemas.args),
    formatOptions(command, schemas.options),
    'Global Options:',
    '  --help, -h  Show help',
    ''
  ]
    .filter(section => section !== undefined)
    .join('\n')
}

function formatCommandNames(command: CommandDefinition): string {
  return command.aliases?.length ? `${command.name}, ${command.aliases.join(', ')}` : command.name
}

function formatPositionals(positionals: PositionalSpec[]): string {
  if (positionals.length === 0) {
    return ''
  }

  return ` ${positionals
    .map(positional => {
      if (positional.rest) {
        return positional.optional ? `[${positional.name}...]` : `<${positional.name}...>`
      }

      return positional.optional ? `[${positional.name}]` : `<${positional.name}>`
    })
    .join(' ')}`
}

function formatAliases(command: CommandDefinition): string | undefined {
  return command.aliases?.length ? `Aliases: ${command.aliases.join(', ')}` : undefined
}

function formatArguments(command: CommandDefinition, argsSchema: JsonObjectSchema | undefined): string | undefined {
  const positionals = command.positionals ?? []
  if (positionals.length === 0) {
    return undefined
  }

  const formatted = positionals.map(positional => ({
    description: formatDescription(argsSchema?.properties?.[positional.name]),
    usage: formatArgumentName(positional)
  }))
  const width = Math.max(...formatted.map(argument => argument.usage.length))
  const lines = formatted.map(argument => {
    if (!argument.description) {
      return `  ${argument.usage}`
    }

    return `  ${argument.usage.padEnd(width)}  ${argument.description}`
  })
  return `Arguments:\n${lines.join('\n')}`
}

function formatArgumentName(positional: PositionalSpec): string {
  return positional.rest ? `${positional.name}...` : positional.name
}

function formatOptions(command: CommandDefinition, optionsSchema: JsonObjectSchema | undefined): string | undefined {
  const entries = Object.entries(optionsSchema?.properties ?? {})
  if (entries.length === 0) {
    return undefined
  }

  const formatted = entries.map(([name, schema]) => ({
    description: formatDescription(schema),
    usage: `${formatOptionName(name, command)}${formatOptionValue(schema)}`
  }))
  const width = Math.max(...formatted.map(option => option.usage.length))
  const lines = formatted.map(option => {
    if (!option.description) {
      return `  ${option.usage}`
    }

    return `  ${option.usage.padEnd(width)}  ${option.description}`
  })
  return `Options:\n${lines.join('\n')}`
}

function formatOptionName(name: string, command: CommandDefinition): string {
  const longName = `--${camelToKebab(name)}`
  const alias = command.optionAliases?.[name]
  return alias ? `${longName}, -${alias}` : longName
}

function formatOptionValue(schema: JsonSchemaProperty): string {
  if (hasJsonSchemaType(schema, 'boolean')) {
    return ''
  }

  if (hasJsonSchemaType(schema, 'array')) {
    return ' <array>'
  }

  return ' <string>'
}

function formatDescription(schema: JsonSchemaProperty | undefined): string | undefined {
  if (!isJsonSchemaObject(schema) || typeof schema.description !== 'string' || schema.description.length === 0) {
    return undefined
  }

  return schema.description
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

function createEmptyObjectSchema(): StandardSchemaV1<unknown, EmptyObject> &
  StandardJSONSchemaV1<unknown, EmptyObject> {
  const jsonSchema = {
    properties: {},
    type: 'object'
  }

  return {
    '~standard': {
      vendor: 'command-kit',
      version: 1,
      jsonSchema: {
        input: () => jsonSchema,
        output: () => jsonSchema
      },
      validate(value) {
        if (isRecord(value)) {
          return { value: {} }
        }

        return { issues: [{ message: 'Expected object' }] }
      }
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const emptyObjectSchema = createEmptyObjectSchema()
