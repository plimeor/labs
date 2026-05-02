# Labs

Personal AI tooling and demo monorepo.

This repository is a workspace for small, reusable experiments that are large
enough to keep under version control but not yet independent products. Current
work is package-first: shared tools live under `packages/`, while future
standalone demos can live under `apps/`.

## Packages

| Package | Purpose | Stack |
| ------- | ------- | ----- |
| [`@plimeor/code-wiki`](packages/code-wiki) | Scan-only code wiki CLI. It registers Git projects by portable remote URL and ref, scans managed clones into Markdown wikis with deterministic routing indexes, and supports Codex as the only configured runtime for this phase. | TypeScript, Bun |
| [`@plimeor/skills`](packages/skills) | Manifest-based CLI for installing and syncing agent skills. It keeps `skills.json` as desired state, `skills.lock.json` as resolved state, and installs skills into global or project-local `.agents/skills` directories. | TypeScript, Bun |

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
apps/            Standalone demos and experiments
packages/        Reusable local tools and libraries
docs/specs/      Living implementation specs
docs/ideas/      Date-prefixed idea snapshots
docs/plan/       Date-prefixed implementation plans
docs/decisions/  Date-prefixed historical decision records, created when needed
```

## Conventions

- Specs use stable topic filenames under `docs/specs/`; plans use
  date-prefixed filenames under `docs/plan/`: `YYYY-MM-DD-description.md`.
- Idea snapshots use date-prefixed filenames under `docs/ideas/` and are not
  maintained as living specs.
- Decision records use date-prefixed filenames under `docs/decisions/` when a
  significant historical decision needs a durable record.
- Every package under `packages/` extends the root `tsconfig.json`.
- Package boundaries, workspace structure, and generated lockfiles should stay
  stable unless a task explicitly requires changing them.

See each package README for package-level usage and maintainer notes.
