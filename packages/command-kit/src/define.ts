import type { Static, TObject, TSchema } from '@sinclair/typebox'
import { Type } from '@sinclair/typebox'

import { type PositionalSpec, parseArgv } from './argv.js'
import { type CommandError, CommandErrorCode, CommandRuntimeError } from './errors.js'
import { type CommandResult, normalizeFailure, normalizeSuccess, writeJsonResult } from './output.js'
import { validateSchema } from './schema.js'

export type CommandContext<ArgsSchema extends TObject, OptionsSchema extends TObject> = {
  args: Static<ArgsSchema>
  assertInteractive: () => void
  options: Static<OptionsSchema>
}

export type CommandDefinition<
  ArgsSchema extends TObject = TObject,
  OptionsSchema extends TObject = TObject
> = CommandConfig<ArgsSchema, OptionsSchema> & {
  name: string
}

export type CommandConfig<ArgsSchema extends TObject = TObject, OptionsSchema extends TObject = TObject> = {
  aliases?: string[]
  args: ArgsSchema
  description: string
  optionAliases?: Record<string, string>
  options: OptionsSchema
  positionals?: PositionalSpec[]
  run: (
    context: CommandContext<ArgsSchema, OptionsSchema>
  ) => Promise<unknown | CommandResult<unknown>> | unknown | CommandResult<unknown>
}

export type CliDefinition = {
  commands: CommandDefinition<any, any>[]
  description: string
  name: string
}

export function defineCommand<ArgsSchema extends TObject, OptionsSchema extends TObject>(
  name: string,
  config: CommandConfig<ArgsSchema, OptionsSchema>
): CommandDefinition<ArgsSchema, OptionsSchema> {
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
    process.stdout.write(formatCommandHelp(cli, command))
    return
  }

  let json = wantsJsonResult(argv.slice(1), command)
  try {
    const parsed = parseArgv(argv.slice(1), {
      optionAliases: command.optionAliases,
      optionSchema: command.options,
      positionals: command.positionals ?? []
    })
    json = isJsonResult(parsed.options, command)
    const args = validateSchema(command.args, parsed.args, CommandErrorCode.InvalidArguments, 'arguments')
    const options = validateSchema(command.options, parsed.options, CommandErrorCode.InvalidOptions, 'options')
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
      writeErrorResult(result, shouldPrintCommandHelp(result.error) ? formatCommandHelp(cli, command) : undefined)
    }
  }
}

async function runCommand<ArgsSchema extends TObject, OptionsSchema extends TObject>(
  command: CommandDefinition<ArgsSchema, OptionsSchema>,
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

function findCommand(commands: CommandDefinition<any, any>[], name: string): CommandDefinition<any, any> | undefined {
  return commands.find(command => command.name === name || command.aliases?.includes(name))
}

function wantsJsonResult(argv: string[], command: CommandDefinition<any, any>): boolean {
  for (const token of argv) {
    if (token === '--') {
      return false
    }

    if ((token === '--json' || token === '--json=true') && hasBooleanJsonOption(command)) {
      return true
    }
  }

  return false
}

function hasBooleanJsonOption(command: CommandDefinition<any, any>): boolean {
  return command.options.properties.json?.type === 'boolean'
}

function isJsonResult(options: Record<string, unknown>, command: CommandDefinition<any, any>): boolean {
  return hasBooleanJsonOption(command) && options.json === true
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

function formatCommandHelp(cli: CliDefinition, command: CommandDefinition): string {
  return [
    `${cli.name} ${command.name} — ${command.description}`,
    '',
    `Usage: ${cli.name} ${command.name}${formatPositionals(command.positionals ?? [])} [options]`,
    formatAliases(command),
    formatArguments(command),
    formatOptions(command),
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

function formatArguments(command: CommandDefinition): string | undefined {
  const positionals = command.positionals ?? []
  if (positionals.length === 0) {
    return undefined
  }

  const lines = positionals.map(positional => `  ${formatArgumentName(positional)}`)
  return `Arguments:\n${lines.join('\n')}`
}

function formatArgumentName(positional: PositionalSpec): string {
  return positional.rest ? `${positional.name}...` : positional.name
}

function formatOptions(command: CommandDefinition): string | undefined {
  const entries = Object.entries(command.options.properties)
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

function formatOptionValue(schema: TSchema): string {
  if (schema.type === 'boolean') {
    return ''
  }

  if (schema.type === 'array') {
    return ' <array>'
  }

  return ' <string>'
}

function formatDescription(schema: TSchema): string | undefined {
  return typeof schema.description === 'string' && schema.description.length > 0 ? schema.description : undefined
}

export const emptyArgsSchema = Type.Object({})
export const emptyOptionsSchema = Type.Object({})
