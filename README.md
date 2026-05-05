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
forming the same toolchain: command routing, Git operations, Bear access, note
gateway utilities, and code-wiki generation.

## Packages

All current packages are TypeScript and Bun-first.

| Package | Purpose | Stack |
| ------- | ------- | ----- |
| [`@plimeor/bear-sdk`](packages/bear-sdk) | Typed Bun SDK for Bear's local CLI. It calls `bear` or `bearcli`, validates JSON output with Valibot, and exposes note, tag, pin, attachment, and location operations through the `Bear` namespace. | TypeScript, Bun |
| [`@plimeor/command-kit`](packages/command-kit) | Bun-first command declaration and argv utility package for repo-local CLI and agent tools. It handles command groups, positional binding, Standard Schema validation, help metadata, JSON result envelopes, and structured command invocation generation. | TypeScript, Bun |
| [`@plimeor/code-wiki`](packages/code-wiki) | Code wiki CLI. It registers Git projects by portable remote URL and ref, scans managed clones into Markdown wikis with deterministic routing indexes, and writes an `AGENTS.md` reading protocol for external CLIs. | TypeScript, Bun |
| [`@plimeor/git-kit`](packages/git-kit) | Git repository operations for repo-local CLIs. It normalizes repository inputs, clones and switches refs, fetches remote refs, reads repository status, and applies Git ignore rules. | TypeScript, Bun |
| [`@plimeor/note-kit`](packages/note-kit) | Note gateway and Codex runner utilities for agent workflows. It provides a scoped Bear-backed note gateway, a readonly `note-gateway` CLI, and a Codex runner that tells agents how to inspect notes through that CLI. | TypeScript, Bun |
| [`@plimeor/skills`](packages/skills) | Manifest-based CLI for installing and syncing agent skills. It keeps `skills.json` as desired state, `skills.lock.json` as resolved state, and installs skills into global or project-local `.agents/skills` directories. | TypeScript, Bun |

## Package Highlights

- `@plimeor/skills` is the most mature user-facing CLI in the workspace. It is
  designed around reviewable desired state, reproducible resolved state, scoped
  installation, dry-run previews, locked sync, source grouping, and migration
  from the older Vercel Labs lock format.
- `@plimeor/command-kit` is the shared command layer for Bun CLIs. It keeps
  command declarations typed through Standard Schema, supports one-level command
  groups, and generates argv token fragments for agent tools that should avoid
  shell-string assembly.
- `@plimeor/git-kit`, `@plimeor/bear-sdk`, and `@plimeor/note-kit` are small
  infrastructure packages that keep local Git, Bear, and note access behind
  explicit package boundaries instead of embedding those operations in each CLI.
- `@plimeor/code-wiki` is the current code-inspection workflow package. It is
  still intentionally scan-first, but it already produces deterministic Markdown
  and index files for external agent context.

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
