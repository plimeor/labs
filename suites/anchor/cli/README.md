# anchor-cli

`anchor` — the local structured command contract over an Anchor vault
(D31 Phase-2, user-approved 2026-06-10). A pure dispatch shell over
[`anchor-core`](../core/README.md): every write goes through the core's single
validated dispatch and lands as one immutable op segment; every read is
materialized replay. The CLI defines **no truth vocabulary of its own** — rows
are projections of core DTOs, and it is a local command contract, **not MCP**.

> **Status: v0.0.0, pre-release.** `apiVersion = 1`. The crate is not published;
> build it from the workspace.

## Build & first command

```sh
cargo build --manifest-path suites/anchor/Cargo.toml -p anchor-cli
alias anchor=suites/anchor/target/debug/anchor

anchor init ~/notes-vault          # create a vault
anchor --vault ~/notes-vault import note.md
anchor --vault ~/notes-vault notes
```

## Global I/O contract [stable]

- **Vault resolution:** `--vault <path>` → `$ANCHOR_VAULT` → upward discovery
  of a `.anchor/` directory from the working directory.
- **`--format tsv|json`** — `tsv` (default) is grep-friendly: one row per
  line, no header, tabs/newlines escaped in values. `json` wraps rows in the
  stable envelope `{"apiVersion":1,"command":…,"data":[…]}` (canonical
  serialization: sorted keys, no floats).
- **`--fields a,b,c`** — project these row fields, in order (unknown field =
  usage error).
- **`--limit <n>`** — cap the row count. **`--count`** — print only the count.
- **Fixed exit codes:** `0` ok, `1` usage, `2` not_found, `3` conflict,
  `4` blocked, `5` vault_not_open, `6` io.

## Commands [stable]

| Command | What it does |
|---|---|
| `init [path]` | Create a vault (idempotent: an existing vault is opened). |
| `notes` | List notes: `id, life, blocks, title, rev`. |
| `note <id>` | One note: `id, parent, order, life, visible, type, tags, rev`. |
| `blocks <note_id>` | The note's block tree, depth-first: `id, parent, order, life, type, text`. |
| `import <file.md>` | Import markdown as one new note (one atomic macro). |
| `export <note_id \| --all>` | Write the lossy `.md` mirror to stdout (raw, not a row table). |
| `move <id> --parent <id\|root> [--after <id>]` | Reparent/reorder via dispatch; the CLI derives the order key for the slot. |
| `type <id> (--set <type> \| --clear)` | Set the primary type. |
| `prop <id> <key> [--set <v> \| --clear]` | Read (no flag) or write one prop. |
| `delete <id>` | Trash — `life = trashed`, reversible. |
| `restore-subtree <id>` | Restore a trashed subtree root (`life = active`; descendants keep their own life, non-cascading). |
| `restore-order <parent_id\|root>` | Renormalize the children's order keys (F26; collapses against concurrent moves, F26c). |
| `conflicts` | List open `ConflictRecord`s. **Exits 3 when any are open.** |
| `resolve <id> (--text <s> \| --keep-winner \| --keep-loser <op_id>)` | Resolve an open body keep-both via `dispatch_resolve_body`. |
| `doctor` | Diagnostics: vault/device ids, segment & op counts, notes/blocks, open conflicts, `snapshot_revision`. Loading at all proves every segment decodes strictly canonical. |

## The conflict schema (D31 Phase-2) [stable]

`conflicts` rows are the public projection of the replay-derived
`ConflictRecord` (never persisted, recomputed from the op-log):

| field | meaning |
|---|---|
| `target_id` | the conflicted Note/Block |
| `kind` | `body_overlap \| scalar \| tag \| move_skipped \| location_relocated \| reorder_blend \| life_tie \| ancestor_life_vs_descendant_edit \| split_merge_structural \| journal_merge` |
| `sub_field_key` | the content cell (e.g. `body`), when applicable |
| `live_op_id` | the currently winning op |
| `losing_op_ids` | comma-joined pinned losers |
| `pinned_op_ids` | comma-joined ops compaction must not truncate while open |

Every kind derives from the frozen D24 op envelope (the D31 stop condition);
`resolve` consumes the D24-reserved `supersedes_rev` hook and never rewrites
the log.

## Vault layout [stable]

```
<vault>/.anchor/
  config/vault.toml          # source_of_truth = "op-log", sync = "none", vault_id
  operations/<device>/<seq>.seg   # immutable op segments (canonical codec bytes)
  cache/                     # device-local derived state — never synced
```

One write command = one segment. Segments are content-addressed canonical
bytes (`anchor-core::codec`): written once, never modified; a vault synced by
file transport re-delivers them idempotently. The CLI owns clock/entropy
(D36): it stamps ops; the core never self-sources ids or time.

## Boundaries

- No merge/diff/order-key/validation logic lives here — deterministic
  algorithms run only in `anchor-core` (D37).
- No cloud, account, or file-coordination types (covered by the same boundary
  audit as the core).
- `delete` is always the reversible trash; terminal deletion stays inside the
  core's life lattice rules and is not exposed as a command.
