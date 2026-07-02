# Labs

Personal AI tooling and infrastructure monorepo.

This repository is a workspace for reusable tools that start as local
experiments and harden into publishable packages. Workspaces are organized in
three tiers: cross-suite shared tools live under `packages/`, theme-scoped
groups of related packages live under `suites/<suite>/`, and standalone apps
with no suite affiliation live under `apps/`.

Several packages are already more than prototypes. `@plimeor/skills` owns the
manifest and lock workflow for agent skills, `@plimeor/harness` provides the
agent SDK layer, and `@plimeor/pulse` runs local automation jobs. The surrounding
packages fill in command routing, Git operations, browser data inspection, and
Claude-compatible project file generation.

## Packages

All current packages are TypeScript and Bun-first.

| Package | Purpose | Stack |
| ------- | ------- | ----- |
| [`@plimeor/browser-peek`](packages/browser-peek) | CLI and library for reading cookies and local storage from local browser profiles. | TypeScript, Bun |
| [`@plimeor/claudify`](packages/claudify) | CLI for creating Claude-compatible project files from existing agent project conventions. | TypeScript, Bun |
| [`@plimeor/command-kit`](packages/command-kit) | Bun-first command declaration package for repo-local CLI and agent tools. It handles command groups, positional binding, Standard Schema validation, help metadata, and JSON result envelopes. | TypeScript, Bun |
| [`@plimeor/git-kit`](packages/git-kit) | Git source and checkout primitives for repo-local CLIs. It models remote sources, local worktrees, ref resolution, checkout lifecycle, worktree file listing, and Git ignore paths. | TypeScript, Bun |
| [`@plimeor/harness`](packages/harness) | Library-only SDK for detecting, health-checking, running, and integrating CLI coding-agent harnesses. | TypeScript, Bun |
| [`@plimeor/pulse`](packages/pulse) | CLI and daemon for managing local PULSE jobs, schedules, runtime state, and captured logs. | TypeScript, Bun |
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
- `@plimeor/harness` provides the shared agent SDK contract used by packages
  that need detection, health checks, process execution, or user-scope
  integrations.
- `@plimeor/pulse` owns the local automation runtime for scheduled and manual
  PULSE jobs.

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
bun run --filter @plimeor/skills prepack
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
apps/            Standalone apps with no suite affiliation
packages/        Cross-suite reusable local tools and libraries
suites/<suite>/  Theme-scoped groups of related workspace packages
AGENTS.md        Durable agent rules; per-package AGENTS.md hold local rules
.agentdocs/      Ephemeral agent working docs (cursor, plans, tasking) while active
```

## Conventions

- Package README files own public CLI, API, schema, file format, and stable
  behavior docs.
- Durable agent rules live in `AGENTS.md` at the narrowest owning scope;
  `CLAUDE.md` is a symlink to it. Ephemeral agent working docs live in
  `.agentdocs/` while active and are deleted once the work ships.
- Every workspace package extends the root `tsconfig.json`: `apps/*` and
  `packages/*` use `../../tsconfig.json`, while `suites/<suite>/*` uses
  `../../../tsconfig.json`.
- Keep package boundaries, workspace structure, and generated lockfiles stable
  unless a task explicitly requires changing them.

See each package README for package-level usage and maintainer notes.
