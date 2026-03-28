# Labs

Personal AI tooling and demo monorepo.

This repository is a workspace for small, reusable experiments that are large
enough to keep under version control but not yet independent products. Current
work is package-first: shared tools live under `packages/`, while future
standalone demos can live under `apps/`.

## Projects

| Project | Description | Stack |
| ------- | ----------- | ----- |
| `packages/skills` | Native manifest-based CLI for installing agent skills | TypeScript, Bun |

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

## Repository Layout

```text
apps/          Standalone demos and experiments
packages/      Reusable local tools and libraries
docs/specs/    Date-prefixed implementation specs
docs/plan/     Date-prefixed implementation plans
```

## Conventions

- Specs and plans use date-prefixed filenames: `YYYY-MM-DD-description.md`.
- Every package under `packages/` extends the root `tsconfig.json`.
- Package boundaries, workspace structure, and generated lockfiles should stay
  stable unless a task explicitly requires changing them.

See [`packages/skills/README.md`](packages/skills/README.md) for the current
package-level usage guide.
