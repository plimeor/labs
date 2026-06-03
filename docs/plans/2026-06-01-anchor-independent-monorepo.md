# Plan: Anchor independent monorepo migration

创建日期：2026-06-01
状态：已执行（迁移后记录）

> Planning record. Stable public contracts belong in package READMEs. This
> document records the repository, package, CLI, editor, and distribution
> boundary decisions used for the migration.

## Goal

Move `anchor` from `/Users/plimeor/Documents/labs` to
`/Users/plimeor/Documents/anchor` as an independent monorepo while preserving
git history. The migrated repository should separate the web app, desktop app,
Rust operation core, Rust CLI binary entry, and Anchor editor into clear
boundaries. The Tauri distribution must not require a bundled Bun runtime for
the CLI.

## Target repository layout

```text
/Users/plimeor/Documents/anchor
  apps/
    anchor-web/        # Solid/Vite frontend: routes, page state, app shell
    anchor/            # Tauri desktop app: bundle, permissions, CLI install UI

  packages/
    anchor-core/       # Rust library plus CLI bin target
    anchor-editor/     # TS/Solid/CodeMirror: Anchor Markdown editor

  scripts/
```

## Package responsibilities

### `apps/anchor-web`

Owns the product UI composition layer: routes, layout, data loading, backend
client wiring, page-level state, and note route integration. It uses
`packages/anchor-editor` and passes note body, revision, callbacks, and config
into it.

`apps/anchor-web` owns the app-facing operation client interface. HTTP and Tauri
are adapters behind that interface; routes and page loaders call the interface
instead of importing transport-specific code directly.

`apps/anchor-web` must not own editor internals, vault semantics, or desktop
system integration.

### `apps/anchor`

Owns the desktop shell: Tauri config, permissions, app bundle, system
capabilities, and the settings UI for installing the CLI. It reuses the
`apps/anchor-web` build output and must not maintain a second UI implementation.

### `packages/anchor-core`

Owns the semantic core: vault I/O, note semantics, index/search, revisions,
operation records, graph, error types, and core data structures. It is the
single semantic source of truth for the desktop app, web development bridge,
and CLI.

`anchor-core` is one Cargo package with both a library entry and a CLI binary
entry:

- `src/lib.rs`: semantic core and public Rust library surface.
- `src/bin/anchor-cli.rs`: CLI process shell for the public `anchor` command.

The CLI binary handles `clap` arguments, help, stdout/stderr, exit codes, shell
completion, and `anchor serve`, while calling the library in the same package.
The internal bin target is `anchor-cli`; the user-facing command name is
`anchor` through `clap` metadata and the installed shim or symlink at
`~/.local/bin/anchor`. This avoids colliding with the Tauri desktop app binary,
which can also be named `anchor`.

The library layer in `anchor-core` must not depend on CLI display concerns,
Tauri APIs, Solid, CodeMirror, stdout/stderr handling, shell completion, or
process exit codes.

The old Bun wrapper path is removed from the shipped CLI design. Bun can remain
part of frontend development and build tooling, but the distributed CLI must not
need Bun at runtime.

### `packages/anchor-editor`

Owns the Anchor Markdown editing runtime: CodeMirror setup, decorations, live
preview, keymap, autosave controller, editor-only state, and editor extension
components such as code blocks, lists, inline code, wiki links, normal links,
and future Anchor Markdown extension syntax.

`anchor-editor` may know Anchor's Markdown rendering rules and editor
interaction model. It must not own vault I/O, route navigation, search, note
loading, or core mutations.

## Architecture relationships

```text
apps/anchor-web
  -> packages/anchor-editor
  -> AnchorClient interface
  -> HTTP adapter / Tauri adapter
  -> packages/anchor-core

apps/anchor
  -> apps/anchor-web build output
  -> packages/anchor-core through Tauri commands

anchor serve
  -> packages/anchor-core bin target
  -> packages/anchor-core library
  -> HTTP bridge for anchor-web development
```

## Transport boundary

`apps/anchor-web` owns an `AnchorClient` interface for note, vault, search,
operation, and graph workflows. The interface is the only app-level boundary
that routes and page loaders call.

Transport adapters:

- HTTP adapter: used by browser development and backed by `anchor serve`.
- Tauri adapter: used by the packaged desktop app and backed by Tauri commands.

The adapters translate transport details into the same app-facing operation
types. Transport fallback, Tauri API calls, HTTP URLs, and response normalization
must stay behind these adapters. `packages/anchor-editor` receives callbacks and
data only; it must never receive an `AnchorClient` instance.

## Key decisions

- Preserve git history. Do not migrate by ordinary file copy.
- Perform history rewriting only in a fresh clone or temporary clone, not in the
  current `/Users/plimeor/Documents/labs` working tree.
- Do not migrate the existing `docs/` tree into the new repository. Historical
  docs such as `docs/anchor` and `docs/plans` remain in `labs` unless a separate
  cleanup is explicitly authorized.
- New package README files may be created in the new repository when they are
  current interface contracts. They are not a migration of historical docs.
- Do not keep the Bun `packages/anchor-cli` implementation as the production
  CLI. Replace it with a Rust CLI bin target inside `packages/anchor-core`.
- Keep `anchor-core` and the CLI in one Cargo package: library entry
  `src/lib.rs`, CLI entry `src/bin/anchor-cli.rs`.
- Name the internal Rust CLI bin target `anchor-cli`. Expose `anchor` only as
  the public command name and installed user entrypoint.
- Do not add `apps/anchor-dev-server`. The development HTTP server is the
  `anchor serve` subcommand in the `anchor-core` CLI bin target.
- Do not expose `anchor-core` as the primary user-facing command. `anchor-core`
  is the Cargo package and library boundary; users see `anchor`.
- Add `packages/anchor-editor` because the editor is a long-lived product
  kernel, not just an app page component.
- Establish the editor package boundary before doing large editor-internal
  refactors.

## Editor package boundary

First-stage structure should stay close to the existing implementation:

```text
packages/anchor-editor/
  src/
    Editor.tsx
    autosave-controller.ts
    code-block.ts
    complex-note.ts
    keymap.ts
    live-preview.ts
    index.ts
    __tests__/
```

After the package boundary is stable, the editor can evolve toward:

```text
packages/anchor-editor/
  src/
    components/
      code-block.tsx
      list.tsx
      inline-code.tsx
      wiki-link.tsx
      link.tsx
    extensions/
      code-block.ts
      list.ts
      inline-code.ts
      wiki-link.ts
      link.ts
    syntax/
      anchor-markdown.ts
```

`anchor-editor` receives external capabilities through props, callbacks, CSS
variables, and explicit extension config:

- `body`
- `baseRevision`
- `noteId`
- `onAutosave(body, baseRevision)`
- `onDirtyChange(dirty)`
- `onOpenWikilink(target)`
- theme values through CSS variables or editor config

`anchor-editor` must not import from:

- `apps/anchor-web/src/routes`
- `apps/anchor-web/src/backend`
- app-level theme stores such as `apps/anchor-web/src/lib/theme`
- Tauri APIs
- vault or core clients

## Migration sequence

1. Record the current `labs` baseline before history extraction. Capture the
   exact command, result, and known failures for `bun run check`,
   `bun run lint`, `bun run test`, `cd apps/anchor && bun run test:e2e`,
   `cd apps/anchor/src-tauri && cargo test`, and
   `cd apps/anchor && bun run tauri:build`.
2. Create a fresh clone or temporary clone of `labs` and extract Anchor history
   into `/Users/plimeor/Documents/anchor`. Include code and package paths such
   as `apps/anchor` and the old CLI implementation path needed for history; do
   not include `docs/anchor`, `docs/plans`, or other historical docs.
3. Make the new repository runnable with the existing shape first. Add only the
   required root workspace config, TypeScript config, formatter config, Cargo
   workspace config, README, and scripts needed to preserve current behavior.
4. Move the current editor from `apps/anchor/src/editor` to
   `packages/anchor-editor`. Keep the first move mechanical: fix imports,
   exports, package metadata, and tests without redesigning editor internals.
5. Split `apps/anchor-web` out of the current app source. The web app imports
   `packages/anchor-editor` and owns routes, layout, page state, and client
   wiring. Introduce the `AnchorClient` interface and keep HTTP/Tauri adapters
   behind it.
6. Make `apps/anchor` consume the `apps/anchor-web` build output as the Tauri
   frontend. Keep desktop-only code in the Tauri app boundary.
7. Extract `packages/anchor-core` from the current Rust modules. Tauri commands,
   the development HTTP bridge, and the CLI should all call this library.
8. Replace the Bun CLI with `packages/anchor-core/src/bin/anchor-cli.rs`, a
   Rust CLI binary preserving the existing CLI contract. Use `anchor-cli` as the
   internal bin target and expose `anchor` through help metadata and
   installation.
9. Implement the development HTTP bridge as
   `anchor serve --vault ... --http 127.0.0.1:4317`.
10. Configure the Tauri bundle to include the Rust CLI and add a desktop settings
   action to install the CLI.
11. After the new repository is verified, remove migrated Anchor code/package
    paths from `labs` in a separate cleanup commit. Do not remove historical docs
    from `labs` unless that cleanup is separately authorized.

## CLI distribution and install rules

The desktop app exposes an `Install CLI` action that installs the public command
at:

```text
~/.local/bin/anchor
```

Install behavior:

- Create `~/.local/bin` when missing.
- Install or update `~/.local/bin/anchor`.
- Only overwrite a symlink or shim managed by Anchor.
- If a non-Anchor file already exists at `~/.local/bin/anchor`, stop and show a
  conflict message.
- If `~/.local/bin` is not on `PATH`, show instructions instead of silently
  changing shell configuration.

Fish users should be shown:

```fish
fish_add_path ~/.local/bin
```

## Acceptance and verification

- `git log --follow` can trace key migrated files back to their pre-migration
  history in `labs`.
- All repository test suites pass in the migrated repository, including unit,
  integration, Rust/Cargo, package-level, app-level, and e2e tests.
- Baseline results from pre-migration `labs` are recorded so migration-caused
  regressions can be distinguished from pre-existing failures.
- The new repository does not contain a copied `docs/` tree, `docs/anchor`, or
  historical `docs/plans` material from `labs`.
- `packages/anchor-editor` tests pass, and the editor works in the note route
  and playground.
- `apps/anchor-web` can run in development and build independently.
- `apps/anchor` can run under Tauri development and build as a Tauri app while
  consuming the `apps/anchor-web` build output.
- `anchor --help` and core commands such as `anchor list`, `anchor search`,
  `anchor cat`, and `anchor create` preserve the intended CLI contract.
- `anchor serve` supports `apps/anchor-web` development through the local HTTP
  bridge.
- The desktop settings action installs `~/.local/bin/anchor` and points it at
  the current app bundle's CLI.
- The shipped CLI runs without a Bun runtime.

Required verification matrix after migration:

```sh
bun run check
bun run lint
bun run test
cd apps/anchor-web && bun run build
cd apps/anchor && bun run tauri:build
cd apps/anchor && bun run test:e2e
cargo test --workspace
cargo build --workspace
```

If a command has to change because the migrated repository uses different root
scripts, the replacement command must be documented next to this matrix and must
cover the same scope. A narrower command is not enough to claim completion.

## Risks and constraints

- The migration can become an editor rewrite. The constraint is to establish the
  `anchor-editor` package boundary first and postpone internal component
  redesign.
- The editor can leak app state into a package. The constraint is that external
  capabilities flow through props, callbacks, CSS variables, and explicit config.
- Transport handling can scatter across web routes and editor callbacks. The
  constraint is that routes call the `AnchorClient` interface and transport
  details stay inside HTTP/Tauri adapters.
- The web and desktop apps can drift into two UI sources. The constraint is that
  UI belongs to `apps/anchor-web`; `apps/anchor` is the desktop shell.
- CLI display concerns can leak into core. The constraint is that `anchor-core`
  keeps CLI display/process code in `src/bin/anchor-cli.rs`; library modules do
  not know about `clap`, shell completion, stdout/stderr, or exit codes.
- History migration can damage the source repo if run in the wrong place. The
  constraint is to rewrite history only in a fresh clone or temporary clone.
- Documentation cleanup can accidentally delete historical planning records. The
  constraint is that `docs/` does not migrate to the new repo and does not get
  deleted from `labs` without separate authorization.
- Existing untracked or experimental files must be classified before migration;
  do not assume they are disposable.

## Stop condition

Stop when `/Users/plimeor/Documents/anchor` is an independent monorepo with
preserved Anchor history; `apps/anchor-web`, `apps/anchor`,
`packages/anchor-core`, and `packages/anchor-editor` have stable boundaries;
pre-migration baseline results are recorded; the full post-migration
verification matrix passes, including e2e tests; the Rust CLI bin target can be
bundled and installed as `~/.local/bin/anchor` without an internal binary name
collision; the new repository contains no migrated `docs/` tree or historical
docs; and the migrated code/package paths in `labs` can be removed in a separate
cleanup commit without deleting historical docs.
