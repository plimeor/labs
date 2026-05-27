import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec'

import { type ArgBindingSpec, type OptionTokenMap, parseArgv } from './argv'
import { type CommandError, CommandErrorCode, CommandRuntimeError } from './errors'
import { type CommandResult, normalizeFailure, normalizeSuccess, writeJsonResult } from './output'
import {
  hasJsonSchemaType,
  isJsonSchemaObject,
  type JsonObjectSchema,
  type JsonSchemaProperty,
  resolveJsonObjectSchema,
  type SchemaAdapter,
  validateSchema
} from './schema'

type EmptyObject = Record<never, never>
type EmptyObjectSchema = typeof emptyObjectSchema
type SchemaFieldName<Schema extends StandardSchemaV1> = Extract<keyof StandardSchemaV1.InferOutput<Schema>, string>

export const DEFAULT_COMMAND: unique symbol = Symbol('command-kit.defaultCommand')

export type CommandArgBinding<ArgsSchema extends StandardSchemaV1> = Omit<ArgBindingSpec, 'name'> & {
  name: SchemaFieldName<ArgsSchema>
}

type CommandOptionTokens<OptionsSchema extends StandardSchemaV1> =
  SchemaFieldName<OptionsSchema> extends never
    ? never
    : Partial<Record<SchemaFieldName<OptionsSchema>, string | string[]>>

export type CommandOptionAliases<OptionsSchema extends StandardSchemaV1> = CommandOptionTokens<OptionsSchema>

export type CommandOptionShortcuts<OptionsSchema extends StandardSchemaV1> = CommandOptionTokens<OptionsSchema>

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

export type RootCommandDefinition<
  ArgsSchema extends StandardSchemaV1 = EmptyObjectSchema,
  OptionsSchema extends StandardSchemaV1 = EmptyObjectSchema
> = RootCommandConfig<ArgsSchema, OptionsSchema> & {
  name: typeof DEFAULT_COMMAND
}

export type CommandGroupDefinition = CommandGroupConfig & {
  name: string
}

export type CommandConfig<
  ArgsSchema extends StandardSchemaV1 = EmptyObjectSchema,
  OptionsSchema extends StandardSchemaV1 = EmptyObjectSchema
> = {
  aliases?: string[]
  args?: ArgsSchema
  description: string
  optionAliases?: CommandOptionAliases<OptionsSchema>
  optionShortcuts?: CommandOptionShortcuts<OptionsSchema>
  options?: OptionsSchema
  argBindings?: CommandArgBinding<ArgsSchema>[]
  run: (
    context: CommandContext<ArgsSchema, OptionsSchema>
  ) => Promise<unknown | CommandResult<unknown>> | unknown | CommandResult<unknown>
}

export type RootCommandConfig<
  ArgsSchema extends StandardSchemaV1 = EmptyObjectSchema,
  OptionsSchema extends StandardSchemaV1 = EmptyObjectSchema
> = Omit<CommandConfig<ArgsSchema, OptionsSchema>, 'aliases'>

export type CommandGroupConfig = {
  commands: CommandDefinition<any, any>[]
  description: string
}

export type CliEntry = CommandDefinition<any, any> | RootCommandDefinition<any, any> | CommandGroupDefinition

type NamedCliEntry = CommandDefinition<any, any> | CommandGroupDefinition

export type CliDefinition = {
  commands: CliEntry[]
  description: string
  name: string
  schemaAdapter?: SchemaAdapter
}

export function defineCommand<
  ArgsSchema extends StandardSchemaV1 = EmptyObjectSchema,
  OptionsSchema extends StandardSchemaV1 = EmptyObjectSchema
>(
  name: typeof DEFAULT_COMMAND,
  config: RootCommandConfig<ArgsSchema, OptionsSchema>
): RootCommandDefinition<ArgsSchema, OptionsSchema>
export function defineCommand<
  ArgsSchema extends StandardSchemaV1 = EmptyObjectSchema,
  OptionsSchema extends StandardSchemaV1 = EmptyObjectSchema
>(name: string, config: CommandConfig<ArgsSchema, OptionsSchema>): CommandDefinition<ArgsSchema, OptionsSchema>
export function defineCommand<
  ArgsSchema extends StandardSchemaV1 = EmptyObjectSchema,
  OptionsSchema extends StandardSchemaV1 = EmptyObjectSchema
>(
  name: string | typeof DEFAULT_COMMAND,
  config: CommandConfig<ArgsSchema, OptionsSchema>
): CommandDefinition<ArgsSchema, OptionsSchema> | RootCommandDefinition<ArgsSchema, OptionsSchema> {
  return {
    ...config,
    name
  } as CommandDefinition<ArgsSchema, OptionsSchema> | RootCommandDefinition<ArgsSchema, OptionsSchema>
}

export function defineGroup(name: string, config: CommandGroupConfig): CommandGroupDefinition {
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
  const defaultCommand = findRootCommand(cli.commands)
  const namedEntries = cli.commands.filter(entry => !isRootCommand(entry))

  if (argv.length === 0) {
    if (defaultCommand) {
      await serveCommand(cli, defaultCommand, [], { rootCommand: true })
      return
    }

    process.stdout.write(formatCliHelp(cli, namedEntries, defaultCommand))
    return
  }

  if (argv[0] === '--help' || argv[0] === '-h') {
    if (defaultCommand && namedEntries.length === 0) {
      process.stdout.write(
        formatCommandHelp(cli, defaultCommand, resolveCommandJsonSchemas(cli, defaultCommand), {
          rootCommand: true
        })
      )
      return
    }

    process.stdout.write(formatCliHelp(cli, namedEntries, defaultCommand))
    return
  }

  if (defaultCommand && namedEntries.length === 0) {
    await serveCommand(cli, defaultCommand, argv, { rootCommand: true })
    return
  }

  if (defaultCommand && isOptionToken(argv[0] as string)) {
    await serveCommand(cli, defaultCommand, argv, { rootCommand: true })
    return
  }

  const commandName = argv[0]
  const entry = findEntry(namedEntries, commandName)
  if (!entry) {
    const result = normalizeFailure(
      new CommandRuntimeError(CommandErrorCode.CommandNotFound, `Unknown command: ${commandName}`)
    )
    writeErrorResult(result)
    return
  }

  if (isCommandGroup(entry)) {
    await serve(
      {
        commands: entry.commands,
        description: entry.description,
        name: `${cli.name} ${entry.name}`,
        schemaAdapter: cli.schemaAdapter
      },
      argv.slice(1)
    )
    return
  }

  await serveCommand(cli, entry, argv.slice(1))
}

async function serveCommand(
  cli: CliDefinition,
  command: CommandConfig<any, any>,
  argv: string[],
  options: { rootCommand?: boolean } = {}
): Promise<void> {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(formatCommandHelp(cli, command, resolveCommandJsonSchemas(cli, command), options))
    return
  }

  let json = wantsJsonResult(argv, command, cli.schemaAdapter)
  try {
    const parsed = parseArgv(argv, {
      argBindings: command.argBindings ?? [],
      optionAliases: command.optionAliases,
      optionSchema: resolveJsonObjectSchema(getOptionsSchema(command), cli.schemaAdapter),
      optionShortcuts: command.optionShortcuts
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
          ? formatCommandHelp(cli, command, resolveCommandJsonSchemas(cli, command), options)
          : undefined
      )
    }
  }
}

async function runCommand<ArgsSchema extends StandardSchemaV1, OptionsSchema extends StandardSchemaV1>(
  command: CommandConfig<ArgsSchema, OptionsSchema>,
  context: CommandContext<ArgsSchema, OptionsSchema>,
  json: boolean
): Promise<unknown | CommandResult<unknown>> {
  if (!json) {
    return command.run(context)
  }

  return withSuppressedOutput(() => command.run(context))
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

function findEntry(entries: NamedCliEntry[], name: string): NamedCliEntry | undefined {
  return entries.find(entry => entry.name === name || (!isCommandGroup(entry) && entry.aliases?.includes(name)))
}

function isCommandGroup(entry: CliEntry): entry is CommandGroupDefinition {
  return 'commands' in entry
}

function findRootCommand(entries: CliEntry[]): RootCommandDefinition<any, any> | undefined {
  return entries.find(isRootCommand)
}

function isRootCommand(entry: CliEntry): entry is RootCommandDefinition<any, any> {
  return !isCommandGroup(entry) && entry.name === DEFAULT_COMMAND
}

function isOptionToken(token: string): boolean {
  return token === '--' || (token.startsWith('-') && token.length > 1)
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
  command: CommandConfig<any, any>,
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

function hasBooleanJsonOption(command: CommandConfig<any, any>, adapter: SchemaAdapter | undefined): boolean {
  const optionsSchema = resolveJsonObjectSchema(getOptionsSchema(command), adapter)
  const jsonOption = optionsSchema?.properties?.json
  return jsonOption ? hasJsonSchemaType(jsonOption, 'boolean') : false
}

function isJsonResult(
  options: Record<string, unknown>,
  command: CommandConfig<any, any>,
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

function formatCliHelp(
  cli: CliDefinition,
  entries: NamedCliEntry[] = cli.commands.filter(entry => !isRootCommand(entry)),
  defaultCommand = findRootCommand(cli.commands)
): string {
  const commandLines = entries.map(entry => `  ${formatEntryNames(entry).padEnd(18)} ${entry.description}`).join('\n')
  const defaultCommandLine = defaultCommand ? `\nDefault Action:\n  ${defaultCommand.description}\n` : ''
  const commandsSection = commandLines ? `\nCommands:\n${commandLines}\n` : ''

  return `${cli.name} — ${cli.description}\n\nUsage: ${cli.name} ${
    defaultCommand ? '[command]' : '<command>'
  }\n${defaultCommandLine}${commandsSection}\nGlobal Options:\n  --help, -h  Show help\n`
}

type CommandJsonSchemas = {
  args: JsonObjectSchema | undefined
  options: JsonObjectSchema | undefined
}

function resolveCommandJsonSchemas(cli: CliDefinition, command: CommandConfig<any, any>): CommandJsonSchemas {
  return {
    args: resolveJsonObjectSchema(getArgsSchema(command), cli.schemaAdapter),
    options: resolveJsonObjectSchema(getOptionsSchema(command), cli.schemaAdapter)
  }
}

function formatCommandHelp(
  cli: CliDefinition,
  command: CommandConfig<any, any> & { name?: string | typeof DEFAULT_COMMAND },
  schemas: CommandJsonSchemas,
  options: { rootCommand?: boolean } = {}
): string {
  const commandLabel =
    options.rootCommand || typeof command.name !== 'string' ? cli.name : `${cli.name} ${command.name}`
  return [
    `${commandLabel} — ${command.description}`,
    '',
    `Usage: ${commandLabel}${formatArgBindings(command.argBindings ?? [])} [options]`,
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

function formatCommandNames(command: CommandDefinition<any, any>): string {
  return command.aliases?.length ? `${command.name}, ${command.aliases.join(', ')}` : command.name
}

function formatEntryNames(entry: NamedCliEntry): string {
  return isCommandGroup(entry) ? entry.name : formatCommandNames(entry)
}

function formatArgBindings(argBindings: ArgBindingSpec[]): string {
  if (argBindings.length === 0) {
    return ''
  }

  return ` ${argBindings
    .map(binding => {
      if (binding.rest) {
        return binding.optional ? `[${binding.name}...]` : `<${binding.name}...>`
      }

      return binding.optional ? `[${binding.name}]` : `<${binding.name}>`
    })
    .join(' ')}`
}

function formatAliases(command: CommandConfig<any, any>): string | undefined {
  return command.aliases?.length ? `Aliases: ${command.aliases.join(', ')}` : undefined
}

function formatArguments(
  command: CommandConfig<any, any>,
  argsSchema: JsonObjectSchema | undefined
): string | undefined {
  const argBindings = command.argBindings ?? []
  if (argBindings.length === 0) {
    return undefined
  }

  const formatted = argBindings.map(binding => ({
    description: formatDescription(argsSchema?.properties?.[binding.name]),
    usage: formatArgumentName(binding)
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

function formatArgumentName(binding: ArgBindingSpec): string {
  return binding.rest ? `${binding.name}...` : binding.name
}

function formatOptions(
  command: CommandConfig<any, any>,
  optionsSchema: JsonObjectSchema | undefined
): string | undefined {
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

function formatOptionName(name: string, command: CommandConfig<any, any>): string {
  return [
    ...formatLongOptionNames(name, command.optionAliases),
    ...formatShortOptionNames(name, command.optionShortcuts)
  ].join(', ')
}

function formatLongOptionNames(name: string, aliases: OptionTokenMap | undefined): string[] {
  return [...optionTokens(aliases?.[name]).map(token => `--${stripLongPrefix(token)}`), `--${camelToKebab(name)}`]
}

function formatShortOptionNames(name: string, shortcuts: OptionTokenMap | undefined): string[] {
  return optionTokens(shortcuts?.[name]).map(token => `-${stripShortPrefix(token)}`)
}

function optionTokens(value: string | string[] | undefined): string[] {
  if (!value) {
    return []
  }

  return Array.isArray(value) ? value : [value]
}

function stripLongPrefix(value: string): string {
  return value.startsWith('--') ? value.slice(2) : value
}

function stripShortPrefix(value: string): string {
  return value.startsWith('-') ? value.slice(1) : value
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
