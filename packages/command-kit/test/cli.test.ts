import { describe, expect, test } from 'bun:test'

import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec'

import { defineCli, defineCommand } from '../src/index.js'

type TestJsonSchemaProperty = {
  description?: string
  items?: TestJsonSchemaProperty
  type: 'array' | 'boolean' | 'object' | 'string'
}

type TestSchema<T extends Record<string, unknown>> = StandardSchemaV1<unknown, T> & StandardJSONSchemaV1<unknown, T>

function objectSchema<T extends Record<string, unknown>>(
  properties: Record<string, TestJsonSchemaProperty>,
  validate?: (value: T) => StandardSchemaV1.Issue[]
): TestSchema<T> {
  const jsonSchema = {
    properties,
    type: 'object'
  }

  return {
    '~standard': {
      vendor: 'command-kit-test',
      version: 1,
      jsonSchema: {
        input: () => jsonSchema,
        output: () => jsonSchema
      },
      validate(value) {
        if (!isRecord(value)) {
          return { issues: [{ message: 'Expected object' }] }
        }

        const issues = validateTypes(value, properties)
        if (issues.length > 0) {
          return { issues }
        }

        const customIssues = validate?.(value as T) ?? []
        if (customIssues.length > 0) {
          return { issues: customIssues }
        }

        return { value: value as T }
      }
    }
  }
}

function standardOnlySchema<T extends Record<string, unknown>>(schema: TestSchema<T>): StandardSchemaV1<unknown, T> {
  return {
    '~standard': {
      validate: schema['~standard'].validate,
      vendor: 'command-kit-test',
      version: 1
    }
  }
}

function validateTypes(
  value: Record<string, unknown>,
  properties: Record<string, TestJsonSchemaProperty>
): StandardSchemaV1.Issue[] {
  return Object.entries(properties).flatMap(([name, property]) => {
    const field = value[name]
    if (field === undefined) {
      return []
    }

    if (property.type === 'array' && Array.isArray(field)) {
      return []
    }

    if (property.type === 'object' && isRecord(field)) {
      return []
    }

    if (property.type !== 'array' && typeof field === property.type) {
      return []
    }

    return [{ message: `Expected ${property.type}`, path: [name] }]
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const emptySchema = objectSchema<Record<string, never>>({})

const jsonOptionSchema = objectSchema<{ json?: boolean }>({
  json: { type: 'boolean' }
})

async function captureStdout(callback: () => Promise<void>): Promise<string> {
  let output = ''
  const write = process.stdout.write
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += chunk.toString()
    return true
  }) as typeof process.stdout.write

  try {
    await callback()
    return output
  } finally {
    process.stdout.write = write
  }
}

async function captureStderr(callback: () => Promise<void>): Promise<string> {
  let output = ''
  const write = process.stderr.write
  const previousExitCode = process.exitCode
  process.stderr.write = ((chunk: string | Uint8Array) => {
    output += chunk.toString()
    return true
  }) as typeof process.stderr.write

  try {
    await callback()
    return output
  } finally {
    process.stderr.write = write
    process.exitCode = previousExitCode ?? 0
  }
}

describe('command runtime', () => {
  test('binds first positional and rest positional array', async () => {
    const cli = defineCli({
      description: 'Test CLI',
      name: 'test',
      commands: [
        defineCommand('add', {
          args: objectSchema<{ skills: string[]; source: string }>({
            skills: { items: { type: 'string' }, type: 'array' },
            source: { type: 'string' }
          }),
          description: 'Add skills',
          options: jsonOptionSchema,
          positionals: [{ name: 'source' }, { name: 'skills', rest: true }],
          run: context => ({
            skills: context.args.skills,
            source: context.args.source
          })
        })
      ]
    })

    const output = await captureStdout(async () => {
      await cli.serve(['add', 'plimeor/agent-skills', 'code-scope-gate', 'writing-blog', '--json'])
    })

    expect(JSON.parse(output)).toEqual({
      ok: true,
      data: {
        skills: ['code-scope-gate', 'writing-blog'],
        source: 'plimeor/agent-skills'
      }
    })
  })

  test('supports option aliases, kebab-case options, and json option triggers', async () => {
    const cli = defineCli({
      description: 'Test CLI',
      name: 'test',
      commands: [
        defineCommand('sync', {
          args: emptySchema,
          description: 'Sync',
          options: objectSchema<{ dryRun?: boolean; global?: boolean; json?: boolean }>({
            dryRun: { type: 'boolean' },
            global: { type: 'boolean' },
            json: { type: 'boolean' }
          }),
          optionAliases: {
            global: 'g'
          },
          run: context => ({
            dryRun: context.options.dryRun ?? false,
            global: context.options.global ?? false
          })
        })
      ]
    })

    const output = await captureStdout(async () => {
      await cli.serve(['sync', '-g', '--dry-run', '--json'])
    })

    expect(JSON.parse(output)).toEqual({
      ok: true,
      data: {
        dryRun: true,
        global: true
      }
    })
  })

  test('does not validate command output before writing the json envelope', async () => {
    const cli = defineCli({
      description: 'Test CLI',
      name: 'test',
      commands: [
        defineCommand('bad', {
          args: emptySchema,
          description: 'Bad output',
          options: jsonOptionSchema,
          run: () => ({ value: 1 })
        })
      ]
    })

    const output = await captureStdout(async () => {
      await cli.serve(['bad', '--json'])
    })

    expect(JSON.parse(output)).toEqual({
      ok: true,
      data: {
        value: 1
      }
    })
  })

  test('normalizes parse errors into a json error envelope', async () => {
    const cli = defineCli({
      description: 'Test CLI',
      name: 'test',
      commands: [
        defineCommand('noop', {
          args: emptySchema,
          description: 'No options',
          options: jsonOptionSchema,
          run: () => ({})
        })
      ]
    })

    const output = await captureStdout(async () => {
      await cli.serve(['noop', '--json', '--missing'])
    })

    expect(JSON.parse(output)).toMatchObject({
      ok: false,
      error: {
        code: 'UNKNOWN_OPTION',
        message: 'Unknown option: --missing'
      }
    })
  })

  test('rejects --json for commands that do not declare a json option', async () => {
    const cli = defineCli({
      description: 'Test CLI',
      name: 'test',
      commands: [
        defineCommand('noop', {
          args: emptySchema,
          description: 'No options',
          options: emptySchema,
          run: () => ({})
        })
      ]
    })

    const output = await captureStderr(async () => {
      await cli.serve(['noop', '--json'])
    })

    expect(output).toContain('Unknown option: --json')
  })

  test('does not provide --format as a global output option', async () => {
    const cli = defineCli({
      description: 'Test CLI',
      name: 'test',
      commands: [
        defineCommand('noop', {
          args: emptySchema,
          description: 'No options',
          options: emptySchema,
          run: () => ({})
        })
      ]
    })

    const output = await captureStderr(async () => {
      await cli.serve(['noop', '--format', 'json'])
    })

    expect(output).toContain('Unknown option: --format')
  })

  test('prints command help when required arguments are missing in pretty mode', async () => {
    const cli = defineCli({
      description: 'Test CLI',
      name: 'test',
      commands: [
        defineCommand('add', {
          args: objectSchema<{ source: string }>({
            source: { type: 'string' }
          }),
          description: 'Add items',
          options: emptySchema,
          positionals: [{ name: 'source' }],
          run: () => ({})
        })
      ]
    })

    const output = await captureStderr(async () => {
      await cli.serve(['add'])
    })

    expect(output).toContain('Missing argument: source')
    expect(output).toContain('Usage:')
    expect(output).toContain('test add <source> [options]')
    expect(output).toContain('Arguments:')
    expect(output).toContain('source')
  })

  test('supports command help by default', async () => {
    const cli = defineCli({
      description: 'Test CLI',
      name: 'test',
      commands: [
        defineCommand('add', {
          args: objectSchema<{ source: string }>({
            source: { type: 'string' }
          }),
          description: 'Add items',
          options: emptySchema,
          positionals: [{ name: 'source' }],
          run: () => ({})
        })
      ]
    })

    const output = await captureStdout(async () => {
      await cli.serve(['add', '--help'])
    })

    expect(output).toContain('Add items')
    expect(output).toContain('Usage:')
    expect(output).toContain('test add <source> [options]')
    expect(output).toContain('Arguments:')
    expect(output).toContain('source')
  })

  test('uses schemaAdapter for help descriptions when schemas do not expose json schema', async () => {
    const argsJson = objectSchema<{ source: string }>({
      source: { description: 'Repository source', type: 'string' }
    })
    const optionsJson = objectSchema<{ global?: boolean }>({
      global: { description: 'Use global state', type: 'boolean' }
    })
    const args = standardOnlySchema(argsJson)
    const options = standardOnlySchema(optionsJson)
    const jsonSchemas = new WeakMap<StandardSchemaV1, StandardJSONSchemaV1>([
      [args, argsJson],
      [options, optionsJson]
    ])
    const cli = defineCli({
      description: 'Test CLI',
      name: 'test',
      commands: [
        defineCommand('add', {
          args,
          description: 'Add items',
          options,
          positionals: [{ name: 'source' }],
          run: () => ({})
        })
      ],
      schemaAdapter: {
        toStandardJsonSchema: schema => jsonSchemas.get(schema)
      }
    })

    const output = await captureStdout(async () => {
      await cli.serve(['add', '--help'])
    })

    expect(output).toContain('source  Repository source')
    expect(output).toContain('--global  Use global state')
  })

  test('validates request-level args and options before running commands', async () => {
    let ran = false
    const cli = defineCli({
      description: 'Test CLI',
      name: 'test',
      commands: [
        defineCommand('add', {
          args: objectSchema<{ source: string }>({
            source: { type: 'string' }
          }),
          description: 'Add items',
          options: objectSchema<{ all?: boolean }>({
            all: { type: 'boolean' }
          }),
          positionals: [{ name: 'source' }],
          validate: objectSchema<{ args: { source: string }; options: { all?: boolean } }>(
            {
              args: { type: 'object' },
              options: { type: 'object' }
            },
            value => (value.args.source === 'repo' && value.options.all ? [{ message: 'invalid combination' }] : [])
          ),
          run: () => {
            ran = true
            return {}
          }
        })
      ]
    })

    const output = await captureStderr(async () => {
      await cli.serve(['add', 'repo', '--all'])
    })

    expect(output).toContain('Invalid request')
    expect(ran).toBe(false)
  })

  test('command help includes aliases and options', async () => {
    const cli = defineCli({
      description: 'Test CLI',
      name: 'test',
      commands: [
        defineCommand('add', {
          aliases: ['a'],
          args: objectSchema<{ items: string[]; source: string }>({
            items: { items: { type: 'string' }, type: 'array' },
            source: { type: 'string' }
          }),
          description: 'Add items',
          options: objectSchema<{ global?: boolean; skill?: string[] }>({
            global: { description: 'Use global state', type: 'boolean' },
            skill: {
              description: 'Item to add; can be repeated',
              items: { type: 'string' },
              type: 'array'
            }
          }),
          positionals: [{ name: 'source' }, { name: 'items', rest: true }],
          optionAliases: {
            global: 'g'
          },
          run: () => ({})
        })
      ]
    })

    const output = await captureStdout(async () => {
      await cli.serve(['add', '--help'])
    })

    expect(output).toContain('test add — Add items')
    expect(output).toContain('Usage: test add <source> <items...> [options]')
    expect(output).toContain('Aliases: a')
    expect(output).toContain('Arguments:')
    expect(output).toContain('source')
    expect(output).toContain('items...')
    expect(output).toContain('Options:')
    expect(output).toContain('--global, -g')
    expect(output).toContain('Use global state')
    expect(output).toContain('--skill <array>')
    expect(output).toContain('Item to add; can be repeated')
  })
})
