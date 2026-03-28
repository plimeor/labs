# Implementation Plan: Native Skills Manifest Installer

## Overview

Replace the upstream-wrapper implementation with a native installer that manages desired state in `skills.json` and resolved install state in `skills.lock.json`.

## Architecture Decisions

- Treat `skills.json` as the user-owned desired state file.
- Treat `skills.lock.json` as generated install state with exact commits and install metadata.
- Install each skill by copying a directory containing `SKILL.md` into the scope install directory.
- Group checkout work by source plus target commit/ref so `sync` clones once per group instead of once per skill.
- Keep the first version limited to Git and local filesystem sources.

## Task List

### Phase 1: State Model

- Keep `skills.json` source-grouped while normalizing explicit skills internally for install planning.
- Add `skills.lock.json` parsing, normalization, and atomic writes.
- Extend scope planning with `lockPath` and `installDir`.

### Phase 2: Native Backend

- Resolve source strings into Git URLs or local paths.
- Add checkout planning keyed by `{source, commit || ref || default ref}`.
- Implement grouped checkout with parallel clone work.
- Implement directory copy installation and installed directory removal.

### Phase 3: Commands

- Rewrite `add` to install explicit `--skill` entries and write both state files.
- Rewrite `sync` to prune, batch checkout, install, and refresh lock state.
- Rewrite `remove` to remove installed directories and state entries.
- Rewrite `list` to read `skills.lock.json`.
- Rewrite `update` as default `sync`.
- Keep `migrate` as an old-lock-to-new-manifest conversion command.

### Phase 4: Cleanup

- Remove the upstream `skills` dependency.
- Remove the upstream process runner.
- Update command descriptions and docs.

## Current Non-Goals

- Interactive install flow beyond explicit `--skill` and source-level `--all`.
- Multi-agent fan-out.
- `find` and `init`.
- Compatibility with every upstream CLI flag.

## Verification

Project instructions currently disallow adding tests or running test commands unless explicitly requested. Use:

```bash
bun run check
bun run --filter @plimeor/skills build
bun run lint
```
