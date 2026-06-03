# Plan: Anchor Operation Core — public CLI & exposed API

创建日期：2026-05-30
状态：设计（实现前的契约约定）

> Planning record. The authoritative, stable contract will live in the operation-core
> package README once implemented (per repo `AGENTS.md`). This doc fixes the shape we
> agreed before writing code.

## Goal

Make the Rust operation core the single semantic source of truth and give it one stable,
documented public API. The editor (and agents, scripts, dev tooling) must never
re-implement note semantics. The byte-for-byte Markdown boundary lives in the core: `cat`
returns the exact source; writes take exact bytes and return the new revision.

This replaces the duplicated TypeScript semantics (`domain/markdown.ts` +
`backend/local-operation-core.ts`) and removes the editor's fidelity workarounds — they
become a non-problem once the editor reads/writes raw source through the core.

## Architecture: one op registry, four bindings

```
                         anchor-core (Rust lib)          <- the only implementation
                         note semantics · vault I/O ·
                         index · ops log · references ·
                         proposals · graph
                                  │
        ┌──────────────┬──────────┴───────────┬─────────────────────┐
        │              │                       │                     │
  Tauri commands   anchor-core CLI       anchor-core serve      (future) ACP/MCP
  (in-process,     (one-shot subcmds,    (Axum HTTP, local       adapter — agent
   bundled app)     stdin/stdout, json)   dev only)              transport
                          │                     │
                          ▼                     ▼
                  anchor (Bun CLI)        web dev build (`bun dev`)
                  @plimeor/command-kit    editor → HTTP → core
                  wrapper: public,
                  documented, --json
```

- **`anchor-core` (Rust lib)** — all logic. Every binding is a thin shell over it.
- **`anchor-core` (Rust binary)** — two modes: one-shot subcommands (`anchor-core show <id> --format json`, body via stdin) and `anchor-core serve` (Axum HTTP, dev only).
- **Tauri commands** — in-process bindings for the bundled desktop/mobile app (Rust is always available to the webview).
- **`anchor` (Bun CLI, `@plimeor/command-kit`)** — the public, documented CLI. Shells to the `anchor-core` binary and presents help/field docs/`--json` envelope via command-kit (command-kit is Bun-only, so it wraps rather than re-implements).

Transport matrix:

| Consumer | Path |
| --- | --- |
| Bundled app editor | Tauri command → core lib (in-process) |
| Web dev build editor | HTTP → `anchor-core serve` (Axum) → core lib |
| Public / agents / scripts | `anchor` (command-kit) → `anchor-core` binary → core lib |

## HTTP framework: Axum

Local, dev-only JSON bridge embedded next to the core. **Axum 0.8.x**: tokio-native (same
runtime Tauri uses), minimal/composable, serde JSON out of the box, no macro framework to
carry. Rocket 0.5.x is viable but batteries-included/macro-heavy — more than a thin
wrapper needs. Decision: Axum.

## Global I/O contract (modeled on `bearcli`, extended for Anchor)

- `--format tsv|json` — tsv default (human); `json` is a single valid document, **including errors**: `{"error":{"code","message"}}`. Editor/HTTP/agents always pass `--format json`.
- `--fields a,b,c` — field selection (or `all`); `--limit N`; `--count` → `{"count":N}`.
- Vault resolution: `--vault <path>` → `$ANCHOR_VAULT` → upward discovery from cwd.
- **Reads** print to stdout: `show` → object, `list`/`search` → array, `cat` → `{"content":"…"}`.
- **Writes** read the note body from **stdin**, take an explicit `<id>`, and — unlike Bear — **return JSON** `{"id","revision","path"}`. Callers (editor autosave, agent chains) need the new `revision`.
- **Concurrency**: writes accept `--if-match <revision>`; mismatch → conflict (no write). The `revision` is the content hash the core already computes.
- Every mutating command appends an **operation record** (audit / undo / replay).
- Exit codes: `0` ok · `1` usage · `2` not_found · `3` conflict · `4` blocked/unsupported · `5` vault_not_open · `6` io. JSON mode still prints the error envelope.

## Command surface (idea-doc capability groups × Bear verbs)

```
READ      show <id> [--fields]              cat <id>
          list [--kind --type --tag --limit --count --fields]
          search <q> [--scope --tag --type --limit --fields]
          search-in <id> <q>
CREATE    create [--title --type --kind] < body            -> {id,revision,path}
/EDIT     append <id> [--prepend --if-match] < body         -> {revision}
          edit <id> --find <s> [--replace <s>] [--if-match] -> {revision}
          overwrite <id> [--if-match] < body                -> {revision}
ORGANIZE  tag <id> add|rm <t>     type set <id> <Type>
          prop set|rm <id> <k> [v]     archive|trash|restore <id>
RELATIONS links <id>     backlinks <id>     mentions <id>
          link apply <id> --target <t> [--if-match]
JOURNAL   journal today          journal open <YYYY-MM-DD>
REF/PROP  reference create …     proposal list|create|accept|reject
          change show|apply|reject <id>     (Proposed Change diffs)
GRAPH     graph <id> [--depth 1|2]
MAINTAIN  vault open <path>      index rebuild      doctor
          types                  ops [--limit]      (operation-record log)
DAEMON    serve [--http <addr> | --stdio]            (dev bridge / future agent host)
```

Capability parity with today's 23 operations, re-cut along the idea doc's seven groups
(Read/Search, Create/Edit, Organize, Relations, Journal, Reference/Proposal,
Analyze/Maintain) using Bear's proven verb shapes. Agent mode/approval (explore/ask/
execute) is layered above this core, not inside it — the CLI is the trusted local shell.

## Divergence from `bearcli` (deliberate)

- Writes return structured JSON (`revision`) so optimistic-concurrency autosave and agent
  chaining work; Bear emits nothing and defers to its MCP server.
- `--if-match` concurrency: Anchor has multiple writers (editor, CLI, agents); Bear is single-app.
- Frontmatter/metadata, Reference/Proposal, operation records, and graph are first-class
  (the agent-safe layer); Bear is tag-only.

## How the editor consumes it (and why this unblocks CM6)

The CM6 spike calls `cat <id>` to load exact source into the text buffer and `overwrite <id> --if-match` / `append` / `edit` to save exact bytes. Decoration parsing (links/tags/checkboxes) can reuse the core's parser via HTTP/Tauri, or use CM6/Lezer locally — decided during the spike. Because the buffer *is* the source and the core round-trips bytes, fidelity is structural, not bolted on.

## Build sequence

1. Carve `anchor-core` lib out of the current `src-tauri` modules (domain/vault/operations already split); define the op registry once.
2. `anchor-core` binary: one-shot subcommands + the global I/O contract; port the real parser (`comrak`/`markdown-rs`) for extraction so semantics are robust and single-sourced.
3. Tauri commands re-expressed as thin calls into the op registry (no logic change).
4. `anchor-core serve` (Axum) — dev HTTP bridge.
5. `anchor` Bun CLI (`@plimeor/command-kit`) wrapping the binary, with help/field docs.
6. Delete the duplicated TS semantics (`domain/markdown.ts`, `backend/local-operation-core.ts`) once the editor reads/writes through the core.
7. CM6 editor spike consuming the core.

## Non-goals (this stage)

ACP/MCP agent transport, agent mode/approval enforcement, sync/cloud, and the full
Reference/Proposal review UI. The core exposes the capabilities; the agent layer and
experience layer build on top later.
