# Adopt command-kit for repo-local CLI and agent tools

## Status

Accepted

## Date

2026-05-01

## Context

This repository is accumulating small CLI and agent-facing tools. These tools
need to define commands, validate inputs, expose typed command contexts, render
consistent help, and produce predictable output for both humans and agents.

The current `packages/skills` CLI uses `incur`, which works for basic command
routing and typed handlers but does not model the positional argument shape that
`skills` needs next:

```bash
skills add plimeor/agent-skills skill-1 skill-2 skill-3
```

In this command, `plimeor/agent-skills` should bind to the first positional
argument and the remaining values should bind to a second positional array. This
is not an edge case for the planned CLI shape; it is the primary command flow.

The first users are repo-local tools and agents. The package may be public later,
but the first design pass should validate the local `packages/skills` use case
before generalizing it into a broader framework.

## Decision

Adopt `@plimeor/command-kit` as the Bun-first command declaration package for
repo-local CLI and agent-facing tools.

The first validation target is a complete replacement of `incur` usage in
`packages/skills`. `command-kit` should support the command shapes needed by
`packages/skills` before it is generalized for other packages.

Bun-first means:

- CLI entrypoints may run TypeScript source directly with Bun.
- `#!/usr/bin/env bun` is an acceptable default for repo-local executables.
- Node.js runtime compatibility is not a v1 requirement.
- External publishing and Node-compatible build output require a separate future
  decision.

The v1 schema boundary means:

- TypeBox is the v1 schema contract for command args and options.
- The runtime should infer typed `ctx.args` and `ctx.options` from TypeBox
  schemas.
- Command output is not schema-validated by `command-kit`; command handlers own
  the shape of their returned data.
- Schema-library abstraction is out of scope for v1.

## Alternatives Considered

### Continue using `incur`

`incur` already provides command routing, option parsing, help output, and typed
handlers. It remains a good default for simple CLI packages.

Rejected for `command-kit` because the next `packages/skills` command shape
requires first-class support for rest positional arguments. Hand-rolling that
parsing inside individual commands would keep the core mismatch in place.

### Wrap `incur`

A wrapper could keep the existing dependency while adding repo-local helpers for
validation and output.

Rejected because the main problem is below the wrapper boundary: positional
argument binding. A wrapper would either inherit the same limitation or bypass
enough of `incur` that it is effectively a separate command runtime.

### Build an external general-purpose CLI framework

The desired API could be designed as a publishable framework from the start.

Rejected for v1. The immediate need is a repo-local tool layer for this codebase
and its agents. Designing for external users would add compatibility,
documentation, packaging, and API-stability work before the local command model
has been validated.

### Build only an agent tool declaration layer

An agent-only declaration layer would avoid CLI details and focus on structured
inputs and outputs.

Rejected because `packages/skills` remains a real CLI. The same command
definitions should serve both local shell usage and agent-friendly output.

## Consequences

- Future repo-local CLI tools can share one command declaration model instead of
  choosing parser behavior package by package.
- `packages/skills` becomes the proving ground for `command-kit`, especially for
  positional binding, option parsing, TypeBox validation, help output, and result
  formatting.
- The repository owns a small amount of CLI runtime behavior: argv parsing, help
  text, error formatting, and output envelopes.
- TypeBox becomes the first schema dependency for this command layer.
- Bun is the assumed runtime for v1, which keeps local TypeScript execution
  simple but postpones Node.js compatibility.
- The root agent guidance should continue to mention `incur` until the new
  package proves out. After implementation, update repo guidance to point new
  internal CLI work at `command-kit`.

## Boundaries

The v1 runtime should not include:

- Plugin systems.
- Automatic MCP server generation.
- Shell completion.
- OpenAPI mounting.
- Multiple schema libraries or Standard Schema adapters.
- External publish-readiness guarantees.

These may be reconsidered later only after the repo-local runtime proves useful
in `packages/skills`.
