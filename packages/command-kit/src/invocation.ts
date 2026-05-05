export type ArgvTokenBinding = {
  name: string
  rest?: boolean
}

export type ArgvTokenAliases = Record<string, string | string[]>

export type ArgvTokensInput = {
  args?: Record<string, unknown>
  argBindings?: ArgvTokenBinding[]
  optionAliases?: ArgvTokenAliases
  options?: Record<string, unknown>
}

export function createArgvTokens(input: ArgvTokensInput = {}): string[] {
  return [
    ...createArgumentValues(input.args ?? {}, input.argBindings ?? []),
    ...createOptionValues(input.options ?? {}, input.optionAliases)
  ]
}

function createArgumentValues(args: Record<string, unknown>, argBindings: ArgvTokenBinding[]): string[] {
  const values: string[] = []

  for (const binding of argBindings) {
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

function createOptionValues(options: Record<string, unknown>, optionAliases: ArgvTokenAliases | undefined): string[] {
  const values: string[] = []

  for (const [name, value] of Object.entries(options)) {
    if (value === undefined || value === false) {
      continue
    }

    const token = optionToken(name, optionAliases)
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

function optionToken(name: string, optionAliases: ArgvTokenAliases | undefined): string {
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
