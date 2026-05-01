import { describe, expect, test } from 'bun:test'

import { Type } from '@sinclair/typebox'

import { defineCli, defineCommand } from '../src/index.js'

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
          args: Type.Object({
            skills: Type.Array(Type.String()),
            source: Type.String()
          }),
          description: 'Add skills',
          options: Type.Object({
            json: Type.Optional(Type.Boolean())
          }),
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
          args: Type.Object({}),
          description: 'Sync',
          options: Type.Object({
            dryRun: Type.Optional(Type.Boolean()),
            global: Type.Optional(Type.Boolean()),
            json: Type.Optional(Type.Boolean())
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
          args: Type.Object({}),
          description: 'Bad output',
          options: Type.Object({
            json: Type.Optional(Type.Boolean())
          }),
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
          args: Type.Object({}),
          description: 'No options',
          options: Type.Object({
            json: Type.Optional(Type.Boolean())
          }),
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
          args: Type.Object({}),
          description: 'No options',
          options: Type.Object({}),
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
          args: Type.Object({}),
          description: 'No options',
          options: Type.Object({}),
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
          args: Type.Object({
            source: Type.String()
          }),
          description: 'Add items',
          options: Type.Object({}),
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
          args: Type.Object({
            source: Type.String()
          }),
          description: 'Add items',
          options: Type.Object({}),
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

  test('command help includes aliases and options', async () => {
    const cli = defineCli({
      description: 'Test CLI',
      name: 'test',
      commands: [
        defineCommand('add', {
          aliases: ['a'],
          args: Type.Object({
            items: Type.Array(Type.String()),
            source: Type.String()
          }),
          description: 'Add items',
          options: Type.Object({
            global: Type.Optional(Type.Boolean({ description: 'Use global state' })),
            skill: Type.Optional(Type.Array(Type.String(), { description: 'Item to add; can be repeated' }))
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
