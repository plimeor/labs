# Labs

Personal AI tooling and infrastructure monorepo.

This repository is a workspace for reusable tools that start as local
experiments and harden into publishable packages. Current work is package-first:
shared tools live under `packages/`, while future standalone demos can live
under `apps/`.

Several packages are already more than prototypes. `@plimeor/skills` is the
clearest example: it owns a manifest and lock workflow for agent skills, supports
global and project scopes, provides dry-run and JSON output where those matter,
and has migration support for earlier lock files. The surrounding packages are
forming the same toolchain: command routing and Git operations.

## Packages

All current packages are TypeScript and Bun-first.

| Package | Purpose | Stack |
| ------- | ------- | ----- |
| [`@plimeor/command-kit`](packages/command-kit) | Bun-first command declaration package for repo-local CLI and agent tools. It handles command groups, positional binding, Standard Schema validation, help metadata, and JSON result envelopes. | TypeScript, Bun |
| [`@plimeor/git-kit`](packages/git-kit) | Git repository operations for repo-local CLIs. It normalizes repository inputs, clones and switches refs, fetches remote refs, reads repository status, and applies Git ignore rules. | TypeScript, Bun |
| [`@plimeor/skills`](packages/skills) | Manifest-based CLI for installing and syncing agent skills. It keeps `skills.json` as desired state, `skills.lock.json` as resolved state, and installs skills into global or project-local `.agents/skills` directories. | TypeScript, Bun |

## Package Highlights

- `@plimeor/skills` is the most mature user-facing CLI in the workspace. It is
  designed around reviewable desired state, reproducible resolved state, scoped
  installation, dry-run previews, locked sync, source grouping, and migration
  from the older Vercel Labs lock format.
- `@plimeor/command-kit` is the shared command layer for Bun CLIs. It keeps
  command declarations typed through Standard Schema, supports one-level command
  groups, and provides consistent help, parsing, and result envelopes.
- `@plimeor/git-kit` keeps local Git operations behind an explicit package
  boundary instead of embedding those operations in each CLI.

## Quick Start

```bash
bun install
bun run check
bun run lint
```

## Commands

| Command | Description |
| ------- | ----------- |
| `bun run check` | Type-check the workspace with `tsc --noEmit` |
| `bun run lint` | Run Biome checks and write safe fixes |
| `bun run format` | Format supported files with Biome |
| `bun run link-package <package>` | Link a workspace package binary for local use |

Package-specific commands are run with Bun filters:

```bash
bun run --filter @plimeor/skills build
bun run --filter @plimeor/skills lint
```

## Contributing

This workspace is package-first: keep public contracts in package READMEs,
change code under `packages/<package>`, and verify with the smallest relevant
Bun-filtered check.

```bash
bun run link-package <package>
```

Use this for local manual testing. It resolves the workspace package, installs
its dependencies, runs `build` or `prepack`, then runs `bun link` from that
package directory.

## Repository Layout

```text
apps/            Standalone demos and experiments
packages/        Reusable local tools and libraries
docs/ideas/      Date-prefixed idea snapshots
docs/plans/      Date-prefixed implementation plans
docs/decisions/  Date-prefixed historical decision records, created when needed
```

## Conventions

- Package README files own public CLI, API, schema, file format, and stable
  behavior docs.
- Use `docs/ideas/`, `docs/plans/`, and `docs/decisions/` for date-prefixed
  historical records, not current interface contracts.
- Every package under `packages/` extends the root `tsconfig.json`.
- Keep package boundaries, workspace structure, and generated lockfiles stable
  unless a task explicitly requires changing them.

See each package README for package-level usage and maintainer notes.
