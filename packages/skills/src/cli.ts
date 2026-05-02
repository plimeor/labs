#!/usr/bin/env bun

import { defineCli, defineCommand } from '@plimeor/command-kit'
import { toStandardJsonSchema } from '@valibot/to-json-schema'

import { addArgsSchema, addCommand, addOptionsSchema, addRequestSchema } from './commands/add.js'
import { listCommand, listOptionsSchema } from './commands/list.js'
import { migrateArgsSchema, migrateCommand, migrateOptionsSchema } from './commands/migrate.js'
import { removeArgsSchema, removeCommand, removeOptionsSchema } from './commands/remove.js'
import { syncCommand, syncOptionsSchema } from './commands/sync.js'
import { updateCommand, updateOptionsSchema } from './commands/update.js'

export function createCli() {
  return defineCli({
    description: 'Manage agent skills from a stable manifest and lock file',
    name: 'skills',
    schemaAdapter: { toStandardJsonSchema },
    commands: [
      defineCommand('add', {
        aliases: ['a'],
        args: addArgsSchema,
        description: 'Install skills and update skills.json plus skills.lock.json',
        options: addOptionsSchema,
        positionals: [{ name: 'source' }, { name: 'skills', optional: true, rest: true }],
        run: addCommand,
        validate: addRequestSchema,
        optionAliases: {
          global: 'g'
        }
      }),
      defineCommand('remove', {
        aliases: ['rm'],
        args: removeArgsSchema,
        description: 'Remove installed skills and update state files',
        options: removeOptionsSchema,
        positionals: [{ name: 'skills', rest: true }],
        run: removeCommand,
        optionAliases: {
          global: 'g'
        }
      }),
      defineCommand('update', {
        aliases: ['upgrade'],
        description: 'Refresh lock entries and reinstall manifest skills',
        options: updateOptionsSchema,
        run: updateCommand,
        optionAliases: {
          global: 'g'
        }
      }),
      defineCommand('sync', {
        description: 'Converge installed skills to skills.json',
        options: syncOptionsSchema,
        run: syncCommand,
        optionAliases: {
          global: 'g'
        }
      }),
      defineCommand('list', {
        aliases: ['ls'],
        description: 'List installed skills from skills.lock.json',
        options: listOptionsSchema,
        run: listCommand,
        optionAliases: {
          global: 'g'
        }
      }),
      defineCommand('migrate', {
        args: migrateArgsSchema,
        description: 'Convert an old skills lock file into skills.json',
        options: migrateOptionsSchema,
        positionals: [{ name: 'input', optional: true }],
        run: migrateCommand,
        optionAliases: {
          global: 'g'
        }
      })
    ]
  })
}

if (import.meta.main) {
  const argv = process.argv.slice(2)
  await createCli().serve(argv)
}
