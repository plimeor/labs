#!/usr/bin/env bun

import { defineCli, defineCommand, defineGroup } from '@plimeor/command-kit'
import { toStandardJsonSchema } from '@valibot/to-json-schema'

import { addArgsSchema, addCommand, addOptionsSchema } from './commands/add'
import {
  agentsAddArgsSchema,
  agentsAddCommand,
  agentsAddOptionsSchema,
  agentsListCommand,
  agentsListOptionsSchema
} from './commands/agents'
import { listCommand, listOptionsSchema } from './commands/list'
import { migrateArgsSchema, migrateCommand, migrateOptionsSchema } from './commands/migrate'
import { removeArgsSchema, removeCommand, removeOptionsSchema } from './commands/remove'
import { syncCommand, syncOptionsSchema } from './commands/sync'
import { updateCommand, updateOptionsSchema } from './commands/update'

export function createCli() {
  return defineCli({
    description: 'Manage agent skills from a stable manifest and lock file',
    name: 'skills',
    schemaAdapter: { toStandardJsonSchema },
    commands: [
      defineCommand('add', {
        aliases: ['a'],
        argBindings: [{ name: 'source' }, { name: 'skills', optional: true, rest: true }],
        args: addArgsSchema,
        description: 'Install skills and update skills.json plus skills.lock.json',
        options: addOptionsSchema,
        run: addCommand,
        optionShortcuts: {
          global: 'g'
        }
      }),
      defineCommand('remove', {
        aliases: ['rm'],
        argBindings: [{ name: 'skills', rest: true }],
        args: removeArgsSchema,
        description: 'Remove installed skills and update state files',
        options: removeOptionsSchema,
        run: removeCommand,
        optionShortcuts: {
          global: 'g'
        }
      }),
      defineCommand('update', {
        aliases: ['upgrade'],
        description: 'Refresh lock entries and reinstall manifest skills',
        options: updateOptionsSchema,
        run: updateCommand,
        optionShortcuts: {
          global: 'g'
        }
      }),
      defineCommand('sync', {
        description: 'Converge installed skills to skills.json',
        options: syncOptionsSchema,
        run: syncCommand,
        optionShortcuts: {
          global: 'g'
        }
      }),
      defineCommand('list', {
        aliases: ['ls'],
        description: 'List installed skills from skills.lock.json',
        options: listOptionsSchema,
        run: listCommand,
        optionShortcuts: {
          global: 'g'
        }
      }),
      defineGroup('agents', {
        description: 'Inspect supported coding agent targets',
        commands: [
          defineCommand('add', {
            argBindings: [{ name: 'agentId' }],
            args: agentsAddArgsSchema,
            description: 'Link a detected agent skills directory to the current scope skills store',
            options: agentsAddOptionsSchema,
            run: agentsAddCommand,
            optionShortcuts: {
              global: 'g'
            }
          }),
          defineCommand('list', {
            description: 'List detected agents with target link status',
            options: agentsListOptionsSchema,
            run: agentsListCommand,
            optionShortcuts: {
              global: 'g'
            }
          })
        ]
      }),
      defineCommand('migrate', {
        argBindings: [{ name: 'input', optional: true }],
        args: migrateArgsSchema,
        description: 'Convert an old skills lock file into skills.json',
        options: migrateOptionsSchema,
        run: migrateCommand,
        optionShortcuts: {
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
