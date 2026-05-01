# Spec: TypeBox Command Runtime

## Objective

Build a Bun-runtime-first, TypeBox-first command declaration runtime for
repo-local CLI and agent tools.

The first user is this repository: the runtime must support a full replacement of
the current `packages/skills` command layer. It is also intended for agent
execution, where structured result envelopes are more useful than ad hoc stdout.

The main problem is positional argument modeling. The current `incur` usage does
not naturally support commands such as:

```bash
skills add plimeor/agent-skills code-scope-gate writing-blog
```

The runtime must bind `plimeor/agent-skills` to the first positional argument and
bind the remaining values to a second rest-array argument. This must be expressed
declaratively and reflected in the inferred `run(ctx)` types.

This is not a general CLI framework. It is a small command runtime for the
concrete needs of Bun-executed `packages/skills` commands and adjacent
agent-facing tools.

## Assumptions

1. The runtime is for the user and local agents first; it does not need a
   publication-ready external API in the next six months.
2. The first implementation lives inside `packages/skills` unless a later plan
   explicitly authorizes a package boundary change.
3. TypeBox is the only schema system in scope for the first version.
4. Bun is the primary runtime target. The implementation may use Node-compatible
   APIs that Bun supports, but it does not need to optimize for direct Node.js
   execution in the first version.
5. `incur` is no longer the target command-routing layer for `packages/skills`
   because the required positional model is a known blocker.
6. Existing business behavior of `packages/skills` should remain unchanged
   except where command argument syntax, structured output, or error formatting
   is explicitly changed by this spec.

## Tech Stack

- Runtime: Bun first, TypeScript, ESM.
- Schema: `@sinclair/typebox`.
- Validation: TypeBox value checking or compilation from the TypeBox ecosystem.
- Terminal interaction: keep using `@clack/prompts` for human progress output
  inside command handlers.
- Existing package context: `packages/skills` currently uses `incur`; this spec
  authorizes replacing that command layer for this feature.

The runtime should assume Bun execution semantics for the CLI entrypoint,
subprocess behavior, filesystem behavior, package scripts, and test runner.
Node.js compatibility is not a first-version success criterion.

No other schema libraries are in scope for the first version.

## Commands

Repository commands remain:

```bash
bun run check
bun run lint
bun run format
```

Package-level verification commands remain:

```bash
bun --cwd packages/skills test
bun --cwd packages/skills lint
bun --cwd packages/skills src/cli.ts --help
```

Do not run or add tests during specification-only work. Test execution belongs
to an implementation task where the user has authorized verification.

## Project Structure

Target structure for the first implementation:

```text
packages/skills/src/cli.ts
  CLI executable entrypoint. Creates the skills CLI with the new runtime.

packages/skills/src/command-runtime/
  Small TypeBox-first command runtime.

packages/skills/src/command-runtime/define.ts
  Public declaration helpers such as defineCommand and defineCli.

packages/skills/src/command-runtime/argv.ts
  argv tokenization, option parsing, positional binding, and unknown argument errors.

packages/skills/src/command-runtime/schema.ts
  TypeBox validation and error normalization.

packages/skills/src/command-runtime/output.ts
  Result envelopes, output modes, and stdout/stderr rendering.

packages/skills/src/commands/
  Existing command handlers adapted to the new context shape.

packages/skills/test/command-runtime/
  Runtime-level tests, if implementation testing is authorized.
```

This structure is intentionally internal to `packages/skills`. Creating a shared
workspace package is a separate package-boundary decision and is out of scope for
the first version.

## Public Interface

The core declaration API should be small enough to read at the call site:

```ts
import { Type, type Static } from '@sinclair/typebox'

const addArgs = Type.Object({
  source: Type.String(),
  skills: Type.Array(Type.String())
})

const addOptions = Type.Object({
  all: Type.Optional(Type.Boolean()),
  global: Type.Optional(Type.Boolean()),
  ref: Type.Optional(Type.String()),
  commit: Type.Optional(Type.String())
})

const addOutput = Type.Object({
  installed: Type.Array(Type.String()),
  manifestPath: Type.String(),
  lockPath: Type.String()
})

export const addCommand = defineCommand({
  name: 'add',
  aliases: ['a'],
  description: 'Install skills and update skills.json plus skills.lock.json',
  args: addArgs,
  positionals: [{ name: 'source' }, { name: 'skills', rest: true }],
  options: addOptions,
  output: addOutput,
  optionAliases: {
    global: 'g'
  },
  async run(ctx) {
    const source: string = ctx.args.source
    const skills: string[] = ctx.args.skills
    const global: boolean | undefined = ctx.options.global

    return {
      installed: skills,
      manifestPath: ctx.meta.scope.manifestPath,
      lockPath: ctx.meta.scope.lockPath
    }
  }
})

type AddArgs = Static<typeof addArgs>
type AddOptions = Static<typeof addOptions>
type AddOutput = Static<typeof addOutput>
```

`args`, `options`, and `output` are TypeBox schemas. `positionals` defines how
raw argv values map into the `args` object. TypeBox describes the final data
shape; it does not describe CLI argv binding by itself.

## Positional Arguments

The runtime must support these positional forms:

```ts
positionals: [{ name: 'source' }]
positionals: [{ name: 'input', optional: true }]
positionals: [{ name: 'source' }, { name: 'skills', rest: true }]
```

Rules:

- A positional entry maps to a property in the `args` TypeBox object.
- A non-rest positional consumes exactly one raw argument.
- A rest positional consumes all remaining raw arguments and must map to a
  TypeBox array property.
- Only the final positional may use `rest: true`.
- Missing required positionals are validation errors.
- Extra positionals without a rest binding are unknown argument errors.
- Positional binding happens before TypeBox validation, so validation sees the
  final object shape.

The `skills add` target syntax is:

```bash
skills add <source> [skill...]
```

Examples:

```bash
skills add plimeor/agent-skills
# args = { source: 'plimeor/agent-skills', skills: [] }

skills add plimeor/agent-skills code-scope-gate writing-blog
# args = { source: 'plimeor/agent-skills', skills: ['code-scope-gate', 'writing-blog'] }
```

## Options

The runtime must support:

- Long boolean options: `--global`, `--dry-run`, `--locked`.
- Short aliases: `-g`.
- Long string options: `--ref main`, `--commit abc123`, `--output path`.
- Repeatable string options when the TypeBox option property is an array.
- Negated booleans are out of scope for the first version.

Unknown options fail before command execution. Option values are validated against
the TypeBox `options` schema after parsing.

## Output Model

Every command execution returns a result envelope:

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

`run(ctx)` may return either raw output data or a full success envelope. The
runtime normalizes successful values into `{ ok: true, data }`.

Thrown errors are normalized into `{ ok: false, error }`. Validation errors must
use stable machine-readable codes:

- `COMMAND_NOT_FOUND`
- `INVALID_ARGUMENTS`
- `INVALID_OPTIONS`
- `INVALID_OUTPUT`
- `UNKNOWN_OPTION`
- `UNKNOWN_ARGUMENT`
- `MISSING_ARGUMENT`
- `COMMAND_FAILED`

The `output` schema validates only successful command data. Error envelopes use
the runtime's `CommandError` shape.

## Output Modes

The runtime must support two first-version modes:

- `pretty`: human-facing mode. Command handlers may use `@clack/prompts` for
  progress. Final structured data does not need to be printed unless the command
  already has a human-facing summary.
- `json`: machine and agent mode. stdout contains only the result envelope as
  formatted JSON. Progress logs must not be written to stdout in this mode.

The mode may be selected by a runtime-level `--format json` option or by command
metadata that marks an existing option as JSON output. `skills list --json`
should continue to be supported for compatibility, but the runtime-level format
path is the preferred direction.

Agent-friendly output means JSON envelope output. A separate agent protocol,
MCP server, or tool registry is out of scope.

## Code Style

Command declarations should keep the interface contract near the handler:

```ts
const removeArgs = Type.Object({
  skills: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 })
})

export const removeCommand = defineCommand({
  name: 'remove',
  aliases: ['rm'],
  description: 'Remove installed skills and update state files',
  args: removeArgs,
  positionals: [{ name: 'skills', rest: true }],
  options: Type.Object({
    global: Type.Optional(Type.Boolean())
  }),
  output: Type.Object({
    removed: Type.Array(Type.String())
  }),
  async run(ctx) {
    const skillNames = ctx.args.skills
    // Existing business logic stays in the command module.
    return { removed: skillNames }
  }
})
```

Conventions:

- Keep schemas named after the command surface: `addArgs`, `addOptions`,
  `addOutput`.
- Prefer explicit `if` branches over nested ternary expressions.
- Keep argv parsing and TypeBox validation in the runtime, not in individual
  command handlers.
- Command handlers should receive already validated `ctx.args` and
  `ctx.options`.
- Do not add a schema adapter abstraction until another schema system is
  actually authorized.

## Testing Strategy

If implementation testing is authorized, use `bun test` under
`packages/skills/test`.

Runtime-level coverage should focus on:

- Positional binding, especially first positional plus rest array.
- Missing, extra, and unknown arguments.
- Boolean, string, alias, and repeatable option parsing.
- TypeBox validation errors for args, options, and output.
- JSON mode producing only the result envelope on stdout.
- Existing `packages/skills` command compatibility after replacement.

Command-level compatibility checks should cover at least:

```bash
skills add plimeor/agent-skills
skills add plimeor/agent-skills code-scope-gate writing-blog
skills remove code-scope-gate writing-blog
skills list -g --json
skills sync -g --dry-run
skills migrate -g
```

The implementation should not add broad end-to-end coverage beyond the command
runtime and affected command compatibility unless separately requested.

## Boundaries

Always:

- Treat Bun as the primary runtime and verification target.
- Use TypeBox as the only schema source for args, options, and output.
- Validate external CLI input at the runtime boundary before calling handlers.
- Preserve existing `packages/skills` business behavior unless this spec names a
  CLI contract change.
- Keep output envelopes stable in JSON mode.
- Keep the first implementation inside `packages/skills` unless a later plan
  authorizes extracting it.

Ask first:

- Creating a new workspace package for the runtime.
- Publishing the runtime as a standalone package.
- Adding Node.js-first compatibility requirements or a dual-runtime support
  matrix.
- Adding support for Zod, Valibot, ArkType, Standard Schema, or another schema
  abstraction.
- Changing state file schemas, install/sync semantics, or package boundaries.
- Removing existing command aliases or user-facing command names.
- Adding shell completion, MCP server support, OpenAPI generation, or plugin
  loading.

Never:

- Implement a custom schema DSL.
- Keep `incur` in the command path if it blocks the required positional model.
- Print non-JSON progress logs to stdout in JSON mode.
- Let command handlers hand-parse positional arrays that the runtime should bind.
- Treat generated or timestamped runtime data as desired state in
  `skills.json`.

## Success Criteria

The spec is implemented when all of these are true:

- `packages/skills` no longer depends on `incur` for command routing, argument
  parsing, or typed handlers.
- Commands are declared through the TypeBox-first runtime.
- The runtime is executed and verified primarily through Bun commands, including
  the `#!/usr/bin/env bun` CLI entrypoint path.
- `skills add plimeor/agent-skills code-scope-gate writing-blog` binds
  `ctx.args.source` to `plimeor/agent-skills` and `ctx.args.skills` to
  `['code-scope-gate', 'writing-blog']`.
- `skills remove code-scope-gate writing-blog` binds all skill names as an array
  instead of requiring comma splitting.
- `ctx.args`, `ctx.options`, and successful output data are inferred from
  TypeBox schemas at command call sites.
- JSON mode returns `{ ok: true, data }` for successful commands and
  `{ ok: false, error }` for failures.
- Output data is validated against the command's `output` schema before a
  success envelope is emitted.
- Existing `packages/skills` commands still support their documented command
  names and aliases unless a later migration spec changes them.

## Open Questions

- Should `--format json` become a global runtime option for every command, or
  should existing command-specific JSON flags remain the only public surface in
  `packages/skills`?
- Should pretty mode print a final success envelope anywhere, or should it
  remain purely human-facing with Clack progress and summaries?
- Should command handlers be allowed to return `void` for pretty-only commands,
  or should every command define an explicit output schema?
- Should runtime errors preserve original stack traces behind a debug flag?
