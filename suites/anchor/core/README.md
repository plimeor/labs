# anchor-core

The platform-agnostic deterministic **truth layer** for Anchor — a local-first,
Apple-native-first knowledge *Note* workbench. `anchor-core` owns the model,
validation, the append-only op-log, replay/materialization, every merge rule,
content-addressed identity, and the DTO/schema vocabulary. Clients (Swift/TextKit,
the `anchor` CLI in `../cli`, `OpSyncPort` transport adapters) are dispatch
shells that own **zero business truth**.

> **Status: v0.0.0, pre-release ground floor.** This README is the authoritative
> API / schema / file-format contract for what is implemented today. Sections
> marked **[stable]** are frozen shapes; **[evolving]** may change before 1.0;
> **[planned]** is not yet built. The crate is `#![no_std]` + `alloc`, `forbid(unsafe_code)`,
> with **zero external runtime dependencies** — BLAKE3, diff3, fractional-index
> order keys, and the HLC total order are vendored in-crate, so it compiles to
> `wasm32-unknown-unknown` and `aarch64-linux-android` by construction (D36) and
> the diff3 / order-key implementation is the single pinned one (D19 / D26).

## Design invariants

1. **Append-only op-log is the only truth.** Materialized state, `.md` / `.json`
   mirrors, and any SQLite projection are **derived** by replay — never a merge
   input, never synced.
2. **Single validated dispatch [stable].** Every local persistent write funnels
   through one append-front-validated chokepoint. There is exactly one op-log
   append site per log owner, grep-provable:
   ```
   rg "self\.log\.(extend|push)" suites/anchor/core/src
   #  dto.rs    Session::commit       — local dispatch, gated by validate_batch
   #  ingest.rs IngestState::ingest   — sync ingestion, gated by dedup + per-actor HWM
   ```
3. **Replay is a pure fold over the op *set*.** Deduped by `op_id`, sorted by the
   total order `T = (hlc.wall, hlc.logical, hlc.device, actor, op_id)`. Any two
   replicas holding the same op set materialize **byte-identical** state and
   `snapshot_revision`. Arrival order never matters.
4. **No cloud types in core.** The crate contains zero Apple cloud, file-coordination,
   or account types (CI-enforced: the boundary audit returns 0 matches).
   Deterministic algorithms run **only** here, never re-implemented in Swift.

## Domain model [stable shape]

`Note` and `Block` are the only first-class persistent objects (`model::TargetKind`).
A materialized `model::Node` carries `{ id, kind, location, content, life, visible,
has_body_conflict }`. `content` decomposes into named sub-field cells
`{ body, type_id, props[k], tags[t] }`, each guarded by its own `sub_rev`.

## The op envelope [stable — D24 frozen]

`op::Op` is the on-disk operation shape. `OP_ENVELOPE_VERSION = 1`. The full
envelope is canonically serialized by `op::op_envelope_canonical(&Op) -> CanonicalValue`
and identified by `op::op_envelope_rev(&Op)`. **Every field is part of the frozen
shape**; omitting/renaming/re-typing any one changes the bytes and would force an
op-log migration (proven by `tests/op_shape_freeze.rs`, golden
`18582d53…e75dfe0`). Fields: identity/order (`op_id`, `op_envelope_version`, `hlc`,
`actor`, `seq`); target/register (`target_id`, `target_kind`, `register`,
`sub_field_key`, `op_kind`); guards (`base/new_register_rev`, `base/new_sub_rev`,
`supersedes_rev`); merge mechanism (`dominates_frontier`, `observed_adds`,
`macro_op_id`, `macro_size`, `diff_algo_version`); reserved hooks (`provenance`,
`approval_state`); and the `payload`. Reserved fields are carried but not yet
consumed by merge.

> The formal freeze *signature* (authorizing any later cloud record schema) is a
> human checkpoint act; this crate provides the byte-frozen golden vector as the
> evidence.

## Three-register merge [stable rules]

Exactly three dispatch registers — `location` / `content` / `life` (`op::Register`).
Resolution (`replay::replay`):

- **`location`** — `{parent, order}` atomic LWW by `T`, with an apply-time cycle
  guard; fractional-index order keys live only in `order` (any precision, never
  floats). `Renormalize` (order-key maintenance, produced by
  `Session::dispatch_renormalize_children`) applies **compare-and-swap** (F26c):
  each op carries the location rev it was computed against, and the whole atomic
  rebalance macro collapses if any base went stale — a concurrent move always
  wins over maintenance, and a partial rebalance can never reorder siblings.
- **`content.body`** — deterministic 3-way **diff3** merge; disjoint hunks
  auto-merge, overlap or unrecoverable base ⇒ **keep-both** (`BodyState::MultiValue`,
  winner = higher `T`, losers pinned) — **never a silent LWW**. UTF-16 mark
  offsets are re-clamped over merged text. A plain edit concurrent with a
  structural split/merge macro is first run through the deterministic
  **intent-rebase** (replay-time, log never mutated): hunks entirely on one side
  of the split point are re-applied onto that side (a tail edit follows its text
  into the split-created block; an edit on a merged-away block folds into the
  absorbing block); straddling/unrecoverable cases keep the surface+pin floor.
- **`content.props[k]` / `type_id`** — causality-aware per-cell LWW (`base_sub_rev`
  guards staleness).
- **`content.tags[t]`** — OR-Set, add-wins, `op_id` as add-identity.
- **`life`** — clock-free priority lattice `active < {trashed, archived} < deleted`;
  non-cascading; terminal `deleted` reachable only from `trashed` and only when
  `dominates_frontier` causally dominates the edits; dispatch rejects direct
  `active → deleted`.

Concurrency that cannot be auto-resolved is surfaced (not dropped) as a
`model::ConflictRecord` with `pinned_op_ids` that compaction must not truncate
(no silent loss). Kinds include `body_overlap`, `scalar`, `move_skipped`,
`location_relocated`, `reorder_blend`, `life_tie`, `ancestor_life_vs_descendant_edit`,
and `split_merge_structural`. An edit whose base chain leads back to a rev a
structural macro itself produced is causal history (e.g. an ordinary edit of an
imported block), never flagged as concurrent with that macro.

**Resolution** (`Session::dispatch_resolve_body`, the D31 Phase-2 producer):
a body keep-both is closed by dispatching a resolution op set that bases on
the winner (`base_sub_rev`) and explicitly supersedes every pinned loser via
the D24-reserved `supersedes_rev` field — first consumed by replay here. The
log is never rewritten; after replay the chosen body is a plain `Single` and
the `body_overlap` record disappears. Two frontier ops holding byte-identical
bodies share one rev and are never a conflict.

## Editor dispatch [evolving]

```rust
use anchor_core::dto::{Session, EditorIntent, OpStamp};
use anchor_core::hlc::Hlc;

let mut session = Session::open_fixture();
let result = session.dispatch(
    EditorIntent::InsertText { target_id: "blk_a".into(), at: 0, text: "Hi ".into() },
    OpStamp { op_id: "op1".into(), hlc: Hlc::new(2_000, 0, "device"), actor: "user".into(), seq: 1 },
);
assert!(result.validation_error.is_none());
```

- `dto::EditorIntent` — text edits `InsertText` / `DeleteText` / `ReplaceText`
  (UTF-16 range edits; insert and delete are special cases of replace), content
  cells `SetType` / `SetProp` / `AddTag` / `RemoveTag`, inline formatting
  `ApplyMark` / `RemoveMark` (remove trims an overlapping mark to its parts
  outside the range), tree `Move` / `SetLife`, block-level gestures
  `IndentBlock` / `OutdentBlock` / `ExitContainerOnEmpty` (outdent only when
  the body is empty) / `TransformBlock`, and the structural macros
  `SplitBlock` / `MergeBackward` / `CreateBlock` / `InsertCodeBlock` (the F21
  embedded-editor payload: create + type + language + body, selection enters
  the embedded editor) / `PasteFragment` (paste runs through the importer; one
  atomic multi-block fragment, caret at the end) / the multi-block selection
  edits `DeleteBlocks` / `MoveBlocks`. Structural macros emit ops sharing a
  `macro_op_id` and replay **all-or-nothing** (`macro_size`); a partially
  delivered macro never materializes a half-applied edit.
- `editor::escalate` / `editor::demote` — the F21 selection ladder, owned by
  the core (not platform adapters): repeated select-all escalates
  `partial → full payload → block`; escape demotes `embedded/text → block →
  None` (workspace focus, adapter-owned).
- Maintenance/bulk producers (not editor intents, same chokepoint):
  `Session::dispatch_import_markdown` (markdown → one atomic note import),
  `Session::dispatch_renormalize_children` (F26 order-key rebalance), and
  `Session::dispatch_resolve_body` (body keep-both resolution, D31 Phase-2).
- `dto::TransactionResult` — `{ changed_ids, validation_error, new_revisions,
  selection_hint, editor_patches, undo_group, conflicts, projection_fresh,
  mirror_fresh }`. (`projection_fresh` / `mirror_fresh` are Stage-1 always-true
  placeholders.)
- **Clock/entropy come from the caller** (`OpStamp`); the core never self-sources
  `op_id` / HLC (D36).

### DTO / error vocabulary [stable — frozen]

`dto::ValidationError` is exactly three core codes, owned by Rust and mirrored
(never redefined) by bindings:

| `code()` | meaning |
|---|---|
| `invalid_utf16_offset` | a text edit produced an invalid UTF-16 boundary |
| `direct_active_to_deleted` | direct `active → deleted` rejected; trash first |
| `structural_dispatch_deferred` | a structural precondition was not met (e.g. merge on the first sibling) |

Adapter-local errors (`adapter_null_session`, `adapter_parse_error`) live in the
binding layer and are **not** part of the core vocabulary.

## Identity & content addressing [stable]

`rev = blake3(canonical_serialize(value))` (`canonical::rev`). Canonical serialization
is JCS-style: recursively sorted keys, fixed escaping, integers only (no `f64`).
Derived ids: `snapshot_revision` (whole-vault / per-node), `sub_rev` (per cell),
`SegmentId::of_bytes` (`seg_…`), `BlobId::of_bytes` (`blob_…`), and the
content-addressed journal id `blake3("journal:" ‖ vault_id ‖ calendar_date)` —
same vault + same day is always the same Note, by construction.

## Op-segment codec [stable]

`codec::encode_segment(&[Op])` / `codec::decode_segment(&[u8])` are the
round-trippable **op-log file format**: one canonical JSON array of full D24
envelopes. Decoding is strict — segments are content-addressed, so the only
admissible byte form is the canonical one; after decoding, the segment is
re-encoded and compared byte-for-byte (whitespace, key order, duplicate or
unknown fields, and non-shortest numbers are all rejected as `NonCanonical`).
The parser is in-crate (`no_std` + `alloc`, zero deps), admits integers only,
bounds nesting depth, and refuses an `op_envelope_version` it does not
understand. `encode → decode → re-encode` is byte-identical, so `SegmentId`
is stable through the codec.

## Sync boundary [stable trait, reference adapter]

`sync_port::OpSyncPort` is the transport-agnostic boundary: `list/pull/push`
segments + blobs, keyed only by `SegmentId` / `BlobId` + bytes, with an associated
`Error` so adapters surface their own typed failures without leaking any type into
the core. `sync_port::MemoryOpSyncPort` is the reference in-memory adapter (the
shape a real cloud-file / object-store adapter mirrors): immutable, idempotent
re-delivery, content-addressed. `ingest::IngestState` accepts remote ops with
`op_id` dedup + per-actor monotonic high-water-marks (re-delivery is a no-op;
ingestion converges).

## Mirrors, import & search [stable]

`mirror::export_md` / `export_json` are lossy, post-commit, derived exports — never
synced; a write failure only affects freshness. `mirror::structured_search` over
materialized state matches `mirror::ripgrep_md` over the exported `.md`
(parity-tested). Open body conflicts render as git-style fences in `.md`.

`importer::plan_import` is the markdown **importer** plan: paragraph-granular,
content-preserving (raw markdown text; blank lines split blocks, single
newlines stay soft newlines, a fenced code block — CommonMark ``` / ~~~,
closing fence at least as long as the opener — is one block even across blank
lines). `Session::dispatch_import_markdown` commits a plan as one atomic
macro. Parity proof: import → export → re-plan is identity on the block plan,
and a second cycle is a byte-identical fixed point (`tests/import_export.rs`;
`tests/import_corpus.rs` soaks the same invariants over an operator-local
corpus — last run: 330 files / 10,100 blocks, zero loss).

## Cross-platform guarantee

Determinism vectors execute byte-identical across native, wasm32 (Node
WebAssembly), iOS Simulator, and Android (`tests/run-cross-target-vectors.sh`,
`tests/determinism_vectors.rs`). Frozen golden values are reused, never
re-derived (fixture `snapshot_revision 3ef88671…`, journal `jnl_f99080…`, BLAKE3
vectors).

## Build & test

```sh
cargo test   --manifest-path suites/anchor/Cargo.toml                  # workspace: core + cli
cargo clippy --manifest-path suites/anchor/Cargo.toml --all-targets -- -D warnings
# The cross-target guarantee belongs to the core alone (the CLI is a std host
# binary), so the cross builds are scoped:
cargo build  --manifest-path suites/anchor/Cargo.toml -p anchor-core --target wasm32-unknown-unknown
cargo build  --manifest-path suites/anchor/Cargo.toml -p anchor-core --target aarch64-linux-android
```

The public CLI contract (commands, `apiVersion` envelope, exit codes, vault
layout) lives in [`../cli/README.md`](../cli/README.md).

## Not yet ground-floor [planned]

- Intent-rebase beyond the conservative rules: hunks straddling the split
  point, chained concurrent edits, and mark-only concurrent edits still take
  the surface+pin floor by design (a product decision, not a gap).
- Rich inline structures beyond typed range marks (links/embeds as first-class
  inline runs).
- Compaction execution (snapshot + truncate against the causal-stability
  watermark); the retention model and segment budget are in place.
