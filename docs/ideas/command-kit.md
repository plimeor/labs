# Idea: command-kit

## Original Motivation

`packages/skills` needs a command declaration layer that works well for both a
human CLI and agent execution. The immediate blocker in the existing `incur`
setup is positional argument binding:

```bash
skills add plimeor/agents skill-1 skill-2 skill-3
```

The desired shape is:

- `plimeor/agents` binds to the first positional argument.
- `skill-1 skill-2 skill-3` binds to a second positional array.
- Command handlers receive typed `ctx.args` and `ctx.options`.
- Agent-facing runs can return a stable `{ ok, data | error }` envelope.

This is a small command kit, not a full CLI framework.

## Name

Use `@plimeor/command-kit`.

The name should describe the package's job: declaring commands, parsing argv,
validating inputs, rendering help, and normalizing results. It should not encode
the current schema implementation detail. TypeBox is the first supported schema
source, but the package name should still make sense if that internal choice
changes later.

## First-Version Scope

- Bun runtime first.
- TypeBox schemas for command args and options.
- Declarative command definition with `defineCommand(name, config)`.
- Positional binding, including first positional plus rest-array positional.
- Help output for root commands, subcommands, missing arguments, and `--help`.
- JSON result envelopes only when a command explicitly declares `--json`; the
  runtime owns envelope writing and hides pretty/log output in that mode.
- No command output schema validation.

## Non-Goals

- Replacing full-featured CLI frameworks.
- Supporting multiple schema systems in v1.
- Providing a plugin system.
- Generating an MCP server.
- Shell completion.
- OpenAPI mounting.
- Global `--format json`.

## First Adoption Target

The MVP is considered useful when `packages/skills` is fully migrated from
`incur` to `@plimeor/command-kit` without changing its business behavior beyond
the explicitly intended command-line contract improvements.
