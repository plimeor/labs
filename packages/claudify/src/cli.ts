#!/usr/bin/env bun

import { DEFAULT_COMMAND, defineCli, defineCommand } from '@plimeor/command-kit'

import { claudify, formatClaudifyResult } from './index'

export function createCli() {
  return defineCli({
    description: 'Create Claude-compatible project files from AGENTS.md and .agent skills directories',
    name: 'claudify',
    commands: [
      defineCommand(DEFAULT_COMMAND, {
        description: 'Scan the current Git repository and create Claude-compatible project files',
        run: async () => {
          const result = await claudify()
          process.stdout.write(`${formatClaudifyResult(result)}\n`)
        }
      })
    ]
  })
}

if (import.meta.main) {
  await createCli().serve(process.argv.slice(2))
}
