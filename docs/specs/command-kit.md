# Spec: command-kit

## Objective

Build `@plimeor/command-kit`, a Bun-runtime-first command declaration package
for repo-local CLI and agent tools.

The first production user is `packages/skills`. The runtime must replace that
package's command layer while preserving its business behavior and fixing the
positional argument model that blocked the old command stack:

```bash
skills add plimeor/agent-skills code-scope-gate writing-blog
```

`plimeor/agent-skills` binds to `ctx.args.source`; every following positional
binds to `ctx.args.skills` as an array.

## Current Scope

- Bun first, TypeScript, ESM.
- Command declarations through `defineCommand(name, config)`.
- CLI declarations through `defineCli({ ..., schemaAdapter })`.
- `args` and `options` schemas use `StandardSchemaV1` from
  `@standard-schema/spec`.
- Help metadata may use `StandardJSONSchemaV1` from `@standard-schema/spec`.
- `packages/skills` uses Valibot for validation and `@valibot/to-json-schema`
  for help metadata conversion.
- Command output is not schema-validated by `command-kit`.

## Non-Goals

- Replacing full-featured CLI frameworks.
- Building a custom schema DSL.
- Automatic MCP server generation.
- Shell completion.
- OpenAPI mounting.
- Global `--format json`.
- A plugin system.

## Dependencies

`packages/command-kit` depends on:

- `@standard-schema/spec`
- `@types/json-schema` for TypeScript JSON Schema helper types

`packages/skills` depends on:

- `@plimeor/command-kit`
- `valibot`
- `@valibot/to-json-schema`
- `@clack/prompts`

TypeBox is not part of the current command-kit or skills command contract.

## Public Interface

```ts
import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec'

type SchemaAdapter = {
  toStandardJsonSchema: (schema: StandardSchemaV1) => StandardJSONSchemaV1 | undefined
}

type CommandConfig<ArgsSchema extends StandardSchemaV1, OptionsSchema extends StandardSchemaV1> = {
  aliases?: string[]
  args?: ArgsSchema
  description: string
  optionAliases?: Record<string, string>
  options?: OptionsSchema
  positionals?: PositionalSpec[]
  run: (ctx: CommandContext<ArgsSchema, OptionsSchema>) => unknown | Promise<unknown>
  validate?: StandardSchemaV1
}

function defineCommand(name: string, config: CommandConfig): CommandDefinition

function defineCli(definition: {
  commands: CommandDefinition[]
  description: string
  name: string
  schemaAdapter?: SchemaAdapter
}): CliDefinition & { serve(argv: string[]): Promise<void> }
```

`ctx.args` and `ctx.options` are inferred from
`StandardSchemaV1.InferOutput<typeof schema>`. If a command does not need args
or options, callers omit the corresponding field and command-kit treats it as an
empty object.

`validate`, when present, validates `{ args, options }` after the individual
`args` and `options` schemas pass. It exists for cross-field and cross-schema
rules such as `skills add --all <skill>`.

## Standard Schema Validation

The runtime validates user input with:

```ts
await schema['~standard'].validate(value)
```

Success uses `result.value`; failure normalizes `result.issues` into a
`CommandRuntimeError`.

Validation stages:

1. Parse raw argv into an args object and options object.
2. Validate args with the command's `args` `StandardSchemaV1`, or an internal
   empty-object schema when omitted.
3. Validate options with the command's `options` `StandardSchemaV1`, or an
   internal empty-object schema when omitted.
4. Validate `{ args, options }` with optional command `validate` schema.
5. Call `run(ctx)` only after all validation succeeds.

## JSON Schema Metadata

Standard Schema does not provide runtime introspection for option names, option
kinds, or descriptions. `command-kit` therefore uses JSON Schema metadata when
available.

Resolution order:

1. If the schema itself implements `StandardJSONSchemaV1`, use it.
2. Otherwise, if `defineCli` provides `schemaAdapter.toStandardJsonSchema`, use
   that adapter.
3. If conversion is unavailable or throws, proceed without field descriptions.

Help output reads `description` from JSON Schema object properties for both
positional arguments and options. If JSON Schema is unavailable, field
descriptions are omitted.

Option parsing also uses JSON Schema metadata for declared option names and basic
kinds:

- boolean
- string
- array

Commands with options should provide either schemas that implement
`StandardJSONSchemaV1` or a CLI-level adapter.

## Positional Arguments

Supported forms:

```ts
positionals: [{ name: 'source' }]
positionals: [{ name: 'input', optional: true }]
positionals: [{ name: 'source' }, { name: 'skills', optional: true, rest: true }]
```

Rules:

- A positional entry maps to a property in the `args` schema output.
- A non-rest positional consumes exactly one raw argument.
- A rest positional consumes all remaining raw arguments.
- Only the final positional may use `rest: true`.
- Missing required positionals fail before command execution.
- Extra positionals without a rest binding are unknown argument errors.
- Final validation belongs to the `args` Standard Schema.

## Options

Supported forms:

- `--global`, `--dry-run`, `--locked`
- `-g` through `optionAliases`
- `--ref main`, `--commit abc123`, `--output path`
- repeatable string options when the JSON Schema property is an array

Unknown options fail before command execution. Parsed values are validated
against the `options` Standard Schema.

Negated boolean options are out of scope.

## Output Model

```ts
type CommandResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: CommandError }

type CommandError = {
  code: string
  message: string
  details?: unknown
}
```

`run(ctx)` may return raw data or a full success envelope. The runtime normalizes
successful values into `{ ok: true, data }`.

Thrown errors normalize into `{ ok: false, error }`.

Stable error codes:

- `COMMAND_NOT_FOUND`
- `INVALID_ARGUMENTS`
- `INVALID_OPTIONS`
- `UNKNOWN_OPTION`
- `UNKNOWN_ARGUMENT`
- `MISSING_ARGUMENT`
- `COMMAND_FAILED`

## JSON Mode

There is no global JSON mode. A command opts in by declaring a boolean `json`
option. If a command does not declare `json`, `--json` is an unknown option.

In JSON mode:

- stdout contains only the JSON result envelope.
- command stdout/stderr is suppressed while validation and `run(ctx)` execute.
- command handlers do not inspect a runtime format field.
- commands that may prompt call `ctx.assertInteractive()` before prompting; in
  JSON mode this throws an error telling the caller to remove `--json`.

For the first skills migration, only `skills list` declares `--json`.

## Skills Migration Contract

`packages/skills` uses Valibot schemas for args, options, and request-level
validation:

- Field shape and type validation live in Valibot object schemas.
- Parameter constraints use `v.check`.
- Cross-field rules use a command-level `validate` schema over `{ args, options }`.
- Help descriptions use Valibot `v.description`.
- The CLI passes `schemaAdapter: { toStandardJsonSchema }` to `defineCli`.

Because Valibot `check` actions are validation logic rather than JSON Schema, the
skills adapter converts schemas for help with `@valibot/to-json-schema` while
ignoring `check` actions. Runtime validation still uses Valibot through Standard
Schema.

## Testing Strategy

Runtime tests should focus on public behavior:

- first positional plus rest-array binding
- missing, extra, and unknown arguments
- boolean, string, alias, and repeatable options
- Standard Schema validation failures for args, options, and request validation
- help descriptions derived from JSON Schema metadata
- JSON mode suppressing command output and writing only the envelope

Skills tests should cover only affected command compatibility:

```bash
skills add plimeor/agent-skills
skills add plimeor/agent-skills code-scope-gate writing-blog
skills remove code-scope-gate writing-blog
skills list -g --json
skills sync -g --dry-run
skills migrate -g
```

## Success Criteria

- `packages/command-kit` has no TypeBox dependency or TypeBox-specific API.
- `packages/command-kit` accepts `StandardSchemaV1` for args and options, and
  lets callers omit either field when a command does not need it.
- `defineCli` accepts optional `schemaAdapter.toStandardJsonSchema`.
- Help output shows field descriptions when JSON Schema metadata is available
  and omits them when it is not.
- `packages/skills` uses Valibot instead of TypeBox.
- `packages/skills` parameter validation rules are implemented with Valibot
  `check`.
- `skills add plimeor/agent-skills code-scope-gate writing-blog` binds source
  and skills correctly.
- `skills remove code-scope-gate writing-blog` binds skill names as an array.
- Only `skills list` accepts `--json`.
- JSON mode writes only the result envelope.
- `bun run check`, `bun run lint`, and relevant Bun tests pass.
