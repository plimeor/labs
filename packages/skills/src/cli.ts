#!/usr/bin/env bun

import { Cli } from 'incur'

import { addArgsSchema, addCommand, addOptionsSchema } from './commands/add.js'
import { listCommand, listOptionsSchema } from './commands/list.js'
import { migrateArgsSchema, migrateCommand, migrateOptionsSchema } from './commands/migrate.js'
import { removeArgsSchema, removeCommand, removeOptionsSchema } from './commands/remove.js'
import { syncCommand, syncOptionsSchema } from './commands/sync.js'
import { updateCommand, updateOptionsSchema } from './commands/update.js'

export function createCli() {
  return Cli.create('skills', {
    description: 'Manage agent skills from a stable manifest and lock file'
  })
    .command('add', {
      aliases: ['a'],
      args: addArgsSchema,
      description: 'Install skills and update skills.json plus skills.lock.json',
      options: addOptionsSchema,
      run: addCommand,
      alias: {
        global: 'g'
      }
    })
    .command('remove', {
      aliases: ['rm'],
      args: removeArgsSchema,
      description: 'Remove installed skills and update state files',
      options: removeOptionsSchema,
      run: removeCommand,
      alias: {
        global: 'g'
      }
    })
    .command('update', {
      aliases: ['upgrade'],
      description: 'Refresh lock entries and reinstall manifest skills',
      options: updateOptionsSchema,
      run: updateCommand,
      alias: {
        global: 'g'
      }
    })
    .command('sync', {
      description: 'Converge installed skills to skills.json',
      options: syncOptionsSchema,
      run: syncCommand,
      alias: {
        global: 'g'
      }
    })
    .command('list', {
      aliases: ['ls'],
      description: 'List installed skills from skills.lock.json',
      options: listOptionsSchema,
      run: listCommand,
      alias: {
        global: 'g'
      }
    })
    .command('migrate', {
      args: migrateArgsSchema,
      description: 'Convert an old skills lock file into skills.json',
      options: migrateOptionsSchema,
      run: migrateCommand,
      alias: {
        global: 'g'
      }
    })
}

if (import.meta.main) {
  const argv = process.argv.slice(2)
  await createCli().serve(argv)
}
