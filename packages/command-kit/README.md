# @plimeor/command-kit

Bun-first command declaration package for CLI and agent tools.

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
      argBindings: [{ name: 'source' }, { name: 'items', rest: true }],
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
          argBindings: [{ name: 'project' }],
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

## Public API

`command-kit` exports command declaration helpers:

- `defineCommand(name, config)`
- `defineGroup(name, config)`
- `defineCli(definition)`

`defineCommand` accepts:

- `description`: required help text for the command.
- `aliases`: optional alternate command names.
- `args`: optional `StandardSchemaV1` schema for positional arguments.
- `options`: optional `StandardSchemaV1` schema for options.
- `argBindings`: optional positional binding rules.
- `optionAliases`: optional extra long option names, such as accepting
  `--no-update-modified` for `preserveModified`.
- `optionShortcuts`: optional short flags, such as `-g` for `global`.
- `run`: command handler.

`defineGroup` accepts `description` plus a flat `commands` list. Groups are
only one level deep.

`defineCli` accepts a CLI `name`, `description`, command/group declarations, and
an optional `schemaAdapter.toStandardJsonSchema` function. `serve(argv)` parses
the argv list, validates command inputs, and runs the selected handler.

## Schema Contract

`args` and `options` schemas use `StandardSchemaV1`. Runtime validation calls:

```ts
await schema['~standard'].validate(value)
```

`ctx.args` and `ctx.options` are inferred from
`StandardSchemaV1.InferOutput<typeof schema>`. Commands that omit `args` or
`options` receive empty objects for that side of the context.

`argBindings[].name`, `optionAliases`, and `optionShortcuts` are typed against
the output keys of the relevant schema. Cross-field business rules belong in
the command implementation.

## Help Metadata

Standard Schema does not provide option names, option kinds, or field
descriptions by itself. Help output uses JSON Schema metadata when available:

1. If the schema implements `StandardJSONSchemaV1`, command-kit reads it
   directly.
2. Otherwise, if `defineCli` provides `schemaAdapter.toStandardJsonSchema`,
   command-kit calls that adapter.
3. If conversion is unavailable or fails, the command still runs, but help
   omits field descriptions.

Option parsing also uses JSON Schema metadata to identify declared option names
and basic option kinds: boolean, string, and array.

## Positional Arguments

`argBindings` map positional argv values into the validated args object:

```ts
argBindings: [{ name: 'source' }, { name: 'skills', optional: true, rest: true }]
```

Rules:

- A non-rest binding consumes one raw positional value.
- A `rest` binding consumes all remaining raw positional values.
- Only the last binding may use `rest: true`.
- Missing required bindings fail before `run(ctx)`.
- Extra positional values fail unless the command has a rest binding.
- Final shape and type validation still belongs to the args schema.

## Options

Supported option forms:

- Boolean flags: `--global`, `--dry-run`, `--locked`
- Shortcuts declared by `optionShortcuts`, such as `-g`
- Extra long names declared by `optionAliases`
- String options: `--ref main`, `--commit abc123`, `--output path`
- Repeatable string options when the JSON Schema property is an array

Unknown options fail before the handler runs. Negated boolean options are not
part of the contract.

## Result and JSON Mode

Handlers can return raw data or a success envelope:

```ts
type CommandResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: CommandError }
```

Successful raw values are normalized to `{ ok: true, data }`. Thrown errors are
normalized to `{ ok: false, error }`.

There is no global JSON mode. A command opts in only by declaring a boolean
`json` option. In JSON mode, stdout contains only the JSON result envelope, and
handler stdout/stderr are suppressed while the handler runs. Commands that may
prompt should call `context.assertInteractive()` before prompting, so `--json`
fails with a clear error instead of hanging.

Stable runtime error codes:

- `COMMAND_NOT_FOUND`
- `INVALID_ARGUMENTS`
- `INVALID_OPTIONS`
- `UNKNOWN_OPTION`
- `UNKNOWN_ARGUMENT`
- `MISSING_ARGUMENT`
- `COMMAND_FAILED`

## Boundaries

`command-kit` does not provide a custom schema DSL, nested command groups,
group-level schema adapters, shell completion, OpenAPI mounting, plugin
systems, MCP server generation, or command output schema validation.
