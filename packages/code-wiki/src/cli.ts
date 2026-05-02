#!/usr/bin/env bun

import { defineCli, defineCommand, defineGroup } from '@plimeor/command-kit'
import { toStandardJsonSchema } from '@valibot/to-json-schema'

import { correctArgsSchema, correctCommand } from './commands/correct.js'
import { initCommand, initOptionsSchema } from './commands/init.js'
import {
  projectsAddArgsSchema,
  projectsAddCommand,
  projectsAddOptionsSchema,
  projectsListCommand
} from './commands/projects.js'
import { reviewArgsSchema, reviewCommand, reviewOptionsSchema } from './commands/review.js'
import {
  runtimeCurrentCommand,
  runtimeSelectCommand,
  runtimeSetArgsSchema,
  runtimeSetCommand
} from './commands/runtime.js'
import { scanArgsSchema, scanCommand } from './commands/scan.js'

export function createCli() {
  const schemaAdapter = { toStandardJsonSchema }
  const runtime = defineGroup('runtime', {
    description: 'Configure the local agent runtime',
    commands: [
      defineCommand('set', {
        argBindings: [{ name: 'runtime' }],
        args: runtimeSetArgsSchema,
        description: 'Select a runtime without an interactive prompt',
        run: runtimeSetCommand
      }),
      defineCommand('current', {
        description: 'Print the configured runtime',
        run: runtimeCurrentCommand
      }),
      defineCommand('select', {
        description: 'Select a runtime interactively',
        run: runtimeSelectCommand
      })
    ]
  })

  const projects = defineGroup('projects', {
    description: 'Manage shared CodeWiki projects',
    commands: [
      defineCommand('add', {
        argBindings: [{ name: 'project' }],
        args: projectsAddArgsSchema,
        description: 'Register a shared project by Git remote URL',
        options: projectsAddOptionsSchema,
        run: projectsAddCommand
      }),
      defineCommand('list', {
        description: 'List shared projects',
        run: projectsListCommand
      })
    ]
  })

  return defineCli({
    description: 'PRD review-first code wiki CLI',
    name: 'code-wiki',
    commands: [
      defineCommand('init', {
        description: 'Initialize a shared or embedded CodeWiki workspace',
        options: initOptionsSchema,
        run: initCommand
      }),
      runtime,
      projects,
      defineCommand('scan', {
        argBindings: [{ name: 'project', optional: true }],
        args: scanArgsSchema,
        description: 'Scan changed projects into durable Markdown wikis',
        run: scanCommand
      }),
      defineCommand('review', {
        argBindings: [{ name: 'prd', optional: true }],
        args: reviewArgsSchema,
        description: 'Review a PRD against selected project wikis',
        options: reviewOptionsSchema,
        run: reviewCommand
      }),
      defineCommand('correct', {
        argBindings: [{ name: 'project' }, { name: 'correction', optional: true }],
        args: correctArgsSchema,
        description: 'Append a human correction to the project log',
        run: correctCommand
      })
    ],
    schemaAdapter
  })
}

if (import.meta.main) {
  await createCli().serve(process.argv.slice(2))
}
