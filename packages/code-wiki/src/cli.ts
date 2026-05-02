#!/usr/bin/env bun

import { defineCli, defineCommand, defineGroup } from '@plimeor/command-kit'
import { toStandardJsonSchema } from '@valibot/to-json-schema'

import { initCommand, initOptionsSchema } from './commands/init.js'
import {
  projectAddArgsSchema,
  projectAddCommand,
  projectAddOptionsSchema,
  projectListCommand,
  projectSetArgsSchema,
  projectSetCommand,
  projectSetOptionsSchema
} from './commands/project.js'
import { scanArgsSchema, scanCommand } from './commands/scan.js'

export function createCli() {
  const schemaAdapter = { toStandardJsonSchema }
  const project = defineGroup('project', {
    description: 'Manage scanned CodeWiki projects',
    commands: [
      defineCommand('add', {
        argBindings: [{ name: 'project' }],
        args: projectAddArgsSchema,
        description: 'Register a project by Git remote URL and optional ref',
        options: projectAddOptionsSchema,
        run: projectAddCommand
      }),
      defineCommand('set', {
        argBindings: [{ name: 'project' }],
        args: projectSetArgsSchema,
        description: 'Update a registered project ref, remote, or scan filters',
        options: projectSetOptionsSchema,
        run: projectSetCommand
      }),
      defineCommand('list', {
        description: 'List registered projects',
        run: projectListCommand
      })
    ]
  })

  return defineCli({
    description: 'Code wiki CLI for scanning repositories into durable Markdown wikis',
    name: 'code-wiki',
    commands: [
      defineCommand('init', {
        description: 'Initialize a shared or embedded CodeWiki workspace',
        options: initOptionsSchema,
        run: initCommand
      }),
      project,
      defineCommand('scan', {
        argBindings: [{ name: 'project', optional: true }],
        args: scanArgsSchema,
        description: 'Scan changed projects into durable Markdown wikis',
        run: scanCommand
      })
    ],
    schemaAdapter
  })
}

if (import.meta.main) {
  await createCli().serve(process.argv.slice(2))
}
