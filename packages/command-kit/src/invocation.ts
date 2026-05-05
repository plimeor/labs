import type { StandardSchemaV1 } from '@standard-schema/spec'

import type { CommandConfig } from './define.js'

export type CommandInvocationInput<ArgsSchema extends StandardSchemaV1, OptionsSchema extends StandardSchemaV1> = {
  args?: Partial<StandardSchemaV1.InferOutput<ArgsSchema>>
  options?: Partial<StandardSchemaV1.InferOutput<OptionsSchema>>
}

export type CommandInvocation = {
  argv: string[]
  commandLine: string
}

export function createCommandInvocation<ArgsSchema extends StandardSchemaV1, OptionsSchema extends StandardSchemaV1>(
  name: string,
  config: Omit<CommandConfig<ArgsSchema, OptionsSchema>, 'run'>,
  input: CommandInvocationInput<ArgsSchema, OptionsSchema> = {}
): CommandInvocation {
  const argv = [
    name,
    ...createArgumentValues(config, input.args ?? {}),
    ...createOptionValues(config, input.options ?? {})
  ]

  return {
    argv,
    commandLine: argv.map(quoteShellToken).join(' ')
  }
}

function createArgumentValues<ArgsSchema extends StandardSchemaV1, OptionsSchema extends StandardSchemaV1>(
  config: Omit<CommandConfig<ArgsSchema, OptionsSchema>, 'run'>,
  args: Partial<StandardSchemaV1.InferOutput<ArgsSchema>>
): string[] {
  const values: string[] = []

  for (const binding of config.argBindings ?? []) {
    const value = args[binding.name]
    if (binding.rest) {
      if (value === undefined) {
        continue
      }
      const restValues = Array.isArray(value) ? value : [value]
      values.push(...restValues.map(item => String(item)))
      continue
    }

    if (value === undefined) {
      continue
    }

    values.push(String(value))
  }

  return values
}

function createOptionValues<ArgsSchema extends StandardSchemaV1, OptionsSchema extends StandardSchemaV1>(
  config: Omit<CommandConfig<ArgsSchema, OptionsSchema>, 'run'>,
  options: Partial<StandardSchemaV1.InferOutput<OptionsSchema>>
): string[] {
  const values: string[] = []

  for (const [name, value] of Object.entries(options)) {
    if (value === undefined || value === false) {
      continue
    }

    const token = optionToken(name, config)
    if (value === true) {
      values.push(token)
      continue
    }

    if (Array.isArray(value)) {
      values.push(...value.flatMap(item => [token, String(item)]))
      continue
    }

    values.push(token, String(value))
  }

  return values
}

function optionToken<ArgsSchema extends StandardSchemaV1, OptionsSchema extends StandardSchemaV1>(
  name: string,
  config: Omit<CommandConfig<ArgsSchema, OptionsSchema>, 'run'>
): string {
  const optionAliases = config.optionAliases as Record<string, string | string[]> | undefined
  const longName = firstOptionToken(optionAliases?.[name]) ?? camelToKebab(name)
  return `--${stripLongPrefix(longName)}`
}

function firstOptionToken(value: string | string[] | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  return Array.isArray(value) ? value[0] : value
}

function camelToKebab(value: string): string {
  return value.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)
}

function stripLongPrefix(value: string): string {
  return value.startsWith('--') ? value.slice(2) : value
}

function quoteShellToken(value: string): string {
  if (/^[A-Za-z0-9_./:=@%+-]+$/.test(value)) {
    return value
  }

  return `'${value.replaceAll("'", "'\\''")}'`
}
