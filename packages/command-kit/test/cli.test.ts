import { describe, expect, test } from 'bun:test'

import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec'
import type { JSONSchema7, JSONSchema7Definition } from 'json-schema'

import { defineCli, defineCommand, defineGroup } from '../src/index.js'

type TestSchema<T extends Record<string, unknown>> = StandardSchemaV1<unknown, T> & StandardJSONSchemaV1<unknown, T>

function objectSchema<T extends Record<string, unknown>>(
  properties: Record<string, JSONSchema7Definition>,
  validate?: (value: T) => StandardSchemaV1.Issue[]
): TestSchema<T> {
  const jsonSchema: JSONSchema7 = {
    properties,
    type: 'object'
  }

  return {
    '~standard': {
      vendor: 'command-kit-test',
      version: 1,
      jsonSchema: {
        input: () => jsonSchema as unknown as Record<string, unknown>,
        output: () => jsonSchema as unknown as Record<string, unknown>
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
  properties: Record<string, JSONSchema7Definition>
): StandardSchemaV1.Issue[] {
  return Object.entries(properties).flatMap(([name, property]) => {
    if (!isJsonSchemaObject(property)) {
      return []
    }

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

function isJsonSchemaObject(schema: JSONSchema7Definition): schema is JSONSchema7 {
  return typeof schema === 'object' && schema !== null && !Array.isArray(schema)
}

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
  test('binds first arg value and rest arg value array', async () => {
    const cli = defineCli({
      description: 'Test CLI',
      name: 'test',
      commands: [
        defineCommand('add', {
          argBindings: [{ name: 'source' }, { name: 'skills', rest: true }],
          args: objectSchema<{ skills: string[]; source: string }>({
            skills: { items: { type: 'string' }, type: 'array' },
            source: { type: 'string' }
          }),
          description: 'Add skills',
          options: jsonOptionSchema,
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
          description: 'No options',
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
          description: 'No options',
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
          argBindings: [{ name: 'source' }],
          args: objectSchema<{ source: string }>({
            source: { type: 'string' }
          }),
          description: 'Add items',
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
          argBindings: [{ name: 'source' }],
          args: objectSchema<{ source: string }>({
            source: { type: 'string' }
          }),
          description: 'Add items',
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
          argBindings: [{ name: 'source' }],
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

  test('command help includes aliases and options', async () => {
    const cli = defineCli({
      description: 'Test CLI',
      name: 'test',
      commands: [
        defineCommand('add', {
          aliases: ['a'],
          argBindings: [{ name: 'source' }, { name: 'items', rest: true }],
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

  test('root help includes command groups in declaration order', async () => {
    const cli = defineCli({
      description: 'Test CLI',
      name: 'test',
      commands: [
        defineCommand('init', {
          description: 'Initialize',
          run: () => ({})
        }),
        defineGroup('projects', {
          description: 'Manage projects',
          commands: [
            defineCommand('list', {
              description: 'List projects',
              run: () => ({})
            })
          ]
        }),
        defineCommand('scan', {
          description: 'Scan projects',
          run: () => ({})
        })
      ]
    })

    const output = await captureStdout(async () => {
      await cli.serve(['--help'])
    })

    expect(output).toContain('Usage: test <command>')
    expect(output).toContain('  init               Initialize\n  projects           Manage projects\n  scan')
  })

  test('prints group help with the derived cli name', async () => {
    const cli = defineCli({
      description: 'Test CLI',
      name: 'test',
      commands: [
        defineGroup('projects', {
          description: 'Manage projects',
          commands: [
            defineCommand('add', {
              argBindings: [{ name: 'project' }],
              args: objectSchema<{ project: string }>({
                project: { type: 'string' }
              }),
              description: 'Add project',
              run: () => ({})
            })
          ]
        })
      ]
    })

    const output = await captureStdout(async () => {
      await cli.serve(['projects', '--help'])
    })

    expect(output).toContain('test projects — Manage projects')
    expect(output).toContain('Usage: test projects <command>')
    expect(output).toContain('  add')
  })

  test('routes group subcommands through the parent schema adapter', async () => {
    const optionsJson = objectSchema<{ repo: string }>({
      repo: { description: 'Project repo URL', type: 'string' }
    })
    const options = standardOnlySchema(optionsJson)
    const jsonSchemas = new WeakMap<StandardSchemaV1, StandardJSONSchemaV1>([[options, optionsJson]])
    let handled: { project: string; repo: string } | undefined
    const cli = defineCli({
      description: 'Test CLI',
      name: 'test',
      commands: [
        defineGroup('projects', {
          description: 'Manage projects',
          commands: [
            defineCommand('add', {
              args: objectSchema<{ project: string }>({
                project: { type: 'string' }
              }),
              description: 'Add project',
              options,
              argBindings: [{ name: 'project' }],
              run: context => {
                handled = {
                  project: context.args.project,
                  repo: context.options.repo
                }
              }
            })
          ]
        })
      ],
      schemaAdapter: {
        toStandardJsonSchema: schema => jsonSchemas.get(schema)
      }
    })

    const output = await captureStdout(async () => {
      await cli.serve(['projects', 'add', 'web-app', '--repo', 'git@example.com:org/web-app.git'])
    })

    expect(output).toBe('')
    expect(handled).toEqual({
      project: 'web-app',
      repo: 'git@example.com:org/web-app.git'
    })
  })

  test('group subcommand help and missing argument help use the derived command path', async () => {
    const cli = defineCli({
      description: 'Test CLI',
      name: 'test',
      commands: [
        defineGroup('projects', {
          description: 'Manage projects',
          commands: [
            defineCommand('add', {
              argBindings: [{ name: 'project' }],
              args: objectSchema<{ project: string }>({
                project: { description: 'Project id', type: 'string' }
              }),
              description: 'Add project',
              run: () => ({})
            })
          ]
        })
      ]
    })

    const help = await captureStdout(async () => {
      await cli.serve(['projects', 'add', '--help'])
    })
    const error = await captureStderr(async () => {
      await cli.serve(['projects', 'add'])
    })

    expect(help).toContain('test projects add — Add project')
    expect(help).toContain('Usage: test projects add <project> [options]')
    expect(error).toContain('Missing argument: project')
    expect(error).toContain('Usage: test projects add <project> [options]')
  })

  test('reports unknown subcommands inside command groups', async () => {
    const cli = defineCli({
      description: 'Test CLI',
      name: 'test',
      commands: [
        defineGroup('projects', {
          description: 'Manage projects',
          commands: [
            defineCommand('list', {
              description: 'List projects',
              run: () => ({})
            })
          ]
        })
      ]
    })

    const output = await captureStderr(async () => {
      await cli.serve(['projects', 'missing'])
    })

    expect(output).toContain('Unknown command: missing')
  })

  test('types constrain arg binding and option alias names to schema fields', () => {
    const args = objectSchema<{ age: string; name: string }>({
      age: { type: 'string' },
      name: { type: 'string' }
    })
    const options = objectSchema<{ global?: boolean }>({
      global: { type: 'boolean' }
    })

    defineCommand('typed', {
      args,
      description: 'Typed command',
      options,
      argBindings: [{ name: 'name' }, { name: 'age' }],
      optionAliases: {
        global: 'g'
      },
      run: () => ({})
    })

    defineCommand('bad-arg-binding', {
      args,
      // @ts-expect-error argBindings must reference args schema fields
      argBindings: [{ name: 'missing' }],
      description: 'Bad arg binding',
      run: () => ({})
    })

    defineCommand('bad-option-alias', {
      description: 'Bad option alias',
      options,
      optionAliases: {
        // @ts-expect-error optionAliases must reference options schema fields
        missing: 'm'
      },
      run: () => ({})
    })
  })
})
