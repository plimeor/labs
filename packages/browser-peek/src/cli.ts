#!/usr/bin/env bun
import { defineCli, defineGroup } from '@plimeor/command-kit'
import { toStandardJsonSchema } from '@valibot/to-json-schema'

import { createGetCommand } from './commands/get'
import { createListCommand } from './commands/list'

const cookieGroup = defineGroup('cookie', {
  description: 'Read cookies from a browser profile',
  commands: [
    createListCommand('cookie', 'List cookies for a browser profile'),
    createGetCommand('cookie', 'Get a cookie value by name (interactive when ambiguous)')
  ]
})

const storageGroup = defineGroup('storage', {
  description: 'Read local storage from a browser profile',
  commands: [
    createListCommand('local-storage', 'List local storage for a browser profile'),
    createGetCommand('local-storage', 'Get a local-storage value by name (interactive when ambiguous)')
  ]
})

const cli = defineCli({
  commands: [cookieGroup, storageGroup],
  description: 'Read cookies and local storage from local browser profiles (Chrome, Safari)',
  name: 'browser-peek',
  schemaAdapter: { toStandardJsonSchema }
})

await cli.serve(process.argv.slice(2))
