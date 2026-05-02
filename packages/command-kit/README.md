# @plimeor/command-kit

Bun-first command declaration runtime for CLI and agent tools.

Schemas are accepted through `StandardSchemaV1`. A CLI can optionally provide a
`schemaAdapter.toStandardJsonSchema` function when help output should include
field descriptions. Commands that do not need args or options can omit those
fields.

## Install

```bash
bun add @plimeor/command-kit valibot @valibot/to-json-schema
```

## Minimal Usage

```ts
import { defineCli, defineCommand, defineGroup } from '@plimeor/command-kit'
import { toStandardJsonSchema } from '@valibot/to-json-schema'
import * as v from 'valibot'

const cli = defineCli({
  description: 'Example CLI',
  name: 'example',
  schemaAdapter: { toStandardJsonSchema },
  commands: [
    defineCommand('add', {
      args: v.object({
        items: v.array(v.string()),
        source: v.string()
      }),
      description: 'Add items from a source',
      options: v.object({
        json: v.optional(v.pipe(v.boolean(), v.description('Write a JSON result envelope')))
      }),
      positionals: [{ name: 'source' }, { name: 'items', rest: true }],
      run: context => ({
        items: context.args.items,
        source: context.args.source
      })
    }),
    defineGroup('projects', {
      description: 'Manage projects',
      commands: [
        defineCommand('add', {
          args: v.object({
            project: v.string()
          }),
          description: 'Add a project',
          positionals: [{ name: 'project' }],
          run: context => ({
            project: context.args.project
          })
        })
      ]
    })
  ]
})

await cli.serve(process.argv.slice(2))
```

```bash
bun example.ts add repo item-a item-b --json
bun example.ts projects add web-app
```

When a command declares a boolean `json` option, command-kit writes the JSON
envelope and suppresses handler stdout/stderr while the handler runs. Commands
that may prompt can call `context.assertInteractive()` before the prompt to
reject `--json` with a clear error.

Command groups are one level deep. Groups only declare `description` and a flat
`commands` list; they do not support aliases, group-level schema adapters, or
nested groups. Group subcommands use the parent CLI's `schemaAdapter`.
