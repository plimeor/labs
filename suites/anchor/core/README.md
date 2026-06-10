# anchor-core

The platform-agnostic deterministic **truth layer** for Anchor — a local-first,
Apple-native-first knowledge *Note* workbench. `anchor-core` owns the model,
validation, the append-only op-log, replay/materialization, every merge rule,
content-addressed identity, and the DTO/schema vocabulary. Clients (Swift/TextKit,
a future CLI, `OpSyncPort` transport adapters) are dispatch shells that own **zero
business truth**.

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
  floats).
- **`content.body`** — deterministic 3-way **diff3** merge; disjoint hunks
  auto-merge, overlap or unrecoverable base ⇒ **keep-both** (`BodyState::MultiValue`,
  winner = higher `T`, losers pinned) — **never a silent LWW**. UTF-16 mark
  offsets are re-clamped over merged text.
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
and `split_merge_structural`.

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

- `dto::EditorIntent` — `InsertText`, `SetType`, `SetProp`, `AddTag`, `RemoveTag`,
  `ApplyMark`, `Move`, `SetLife`, and the structural macros `SplitBlock` /
  `MergeBackward`. Structural macros emit ops sharing a `macro_op_id` and replay
  **all-or-nothing** (`macro_size`); a partially delivered macro never
  materializes a half-applied edit.
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

## Sync boundary [stable trait, reference adapter]

`sync_port::OpSyncPort` is the transport-agnostic boundary: `list/pull/push`
segments + blobs, keyed only by `SegmentId` / `BlobId` + bytes, with an associated
`Error` so adapters surface their own typed failures without leaking any type into
the core. `sync_port::MemoryOpSyncPort` is the reference in-memory adapter (the
shape a real cloud-file / object-store adapter mirrors): immutable, idempotent
re-delivery, content-addressed. `ingest::IngestState` accepts remote ops with
`op_id` dedup + per-actor monotonic high-water-marks (re-delivery is a no-op;
ingestion converges).

## Mirrors & search [stable]

`mirror::export_md` / `export_json` are lossy, post-commit, derived exports — never
synced; a write failure only affects freshness. `mirror::structured_search` over
materialized state matches `mirror::ripgrep_md` over the exported `.md`
(parity-tested). Open body conflicts render as git-style fences in `.md`.

## Cross-platform guarantee

Determinism vectors execute byte-identical across native, wasm32 (Node
WebAssembly), iOS Simulator, and Android (`tests/run-cross-target-vectors.sh`,
`tests/determinism_vectors.rs`). Frozen golden values are reused, never
re-derived (fixture `snapshot_revision 3ef88671…`, journal `jnl_f99080…`, BLAKE3
vectors).

## Build & test

```sh
cargo test   --manifest-path suites/anchor/Cargo.toml
cargo clippy --manifest-path suites/anchor/Cargo.toml --all-targets -- -D warnings
cargo build  --manifest-path suites/anchor/Cargo.toml --target wasm32-unknown-unknown
cargo build  --manifest-path suites/anchor/Cargo.toml --target aarch64-linux-android
```

## Not yet ground-floor [planned]

- A round-trippable op-segment **codec** (today `segment_bytes` is a one-way
  canonical encoding; deserialization back to `Op` is not implemented).
- A Markdown **importer** (only lossy export exists today).
- The full `anchor-editor-core` intent surface (the dispatch subset above is a
  lower bound) and deterministic split/merge **intent-rebase** against concurrent
  edits (the conflict is currently surfaced, not auto-rebased).
- The `Renormalize` op producer + stale-base collapse (F26c — the envelope field
  is reserved; no producer yet).
- The public CLI schema (`cli` crate) — gated to Phase 2 (D31).
