# Anchor Stage 1 — Core Structural Dispatch Report

任务：按 2026-06-10 当前目标优先推进 Anchor 开发进度，在不继续消耗 iCloud 边界验证的前提下，把 TextKit structural split / merge-backward 从 core typed deferral 推进到真实 `anchor-core` dispatch 机制下限。
日期：2026-06-10
状态：**workbench evidence** —— 非公开接口契约。本文件记录 core structural dispatch lower bound；不退出 CP-1，不创建产品 app shell，不声明完整 CP-2 dispatch / product editor integration 已完成。

> 边界声明（AGENTS 工作台规则）：本轮没有改 root workspace / package / lockfile / public CLI schema；没有创建产品 app / entitlement / bundle id / iCloud container；没有把 Swift/TextKit 变成结构语义 owner；没有引入 Apple / iCloud / file-coordination type 到 `anchor-core`。代码变更限于 `suites/anchor/core/src/dto.rs`、`suites/anchor/core/tests/structural_dispatch.rs`、`suites/anchor/apple/AnchorAppleSpike/Sources/AnchorAppleSmoke/main.swift`。

---

## 1. Strongest conclusion

**Core structural split / merge-backward now has a real dispatch lower bound.** `SplitBlock` no longer returns `structural_dispatch_deferred` on the normal path: it splits the current block body, creates a right sibling block, assigns a deterministic order key, emits a shared `macro_op_id`, and returns the caret at the new block start. `MergeBackward` now appends the current block body to the previous living sibling and sets the current block `life=trashed`.

This is still not full CP-2 exit. The work does not yet prove intent rebase under concurrent split-vs-edit / merge-vs-edit, `split_merge_structural` conflict materialization, product undo grouping, product app-hosted keyboard/menu/focus integration, or core-sourced `EditorPatch` application.

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| root workspace / package / lockfile | not changed |
| public CLI schema | not changed |
| product app shell / Xcode project | not created |
| Swift/TextKit deterministic semantics | not added; Swift smoke only calls core |
| iCloud / CloudKit / file-coordination in core | not added; audit returned 0 matches / exit 1 |
| persistent app writes | not added |
| checkpoint exit | not reached |

---

## 3. Implementation result

### 3.1 Core dispatch

Changed `Session::dispatch(...)` in `suites/anchor/core/src/dto.rs`:

- `SplitBlock { target_id, at }` dispatches a three-op macro group:
  - update left block body;
  - create right sibling block;
  - set right block body.
- `MergeBackward { target_id }` dispatches a two-op macro group:
  - update previous sibling body;
  - set current block `life=trashed`.
- All generated primitive ops share a `macro_op_id`.
- `MergeBackward` on a first sibling still returns `structural_dispatch_deferred`; the error code remains valid for unsupported structural cases.

### 3.2 Swift bridge

Updated `AnchorAppleSmoke` to assert Swift/TextKit-side structural intents call through `AnchorSession.dispatchSplitBlock(...)` / `dispatchMergeBackward(...)` and receive successful core dispatch results:

```text
textkit:core_dispatch_bridge=structural split=changed:blk_a,blk_op_split_block_10003 merge=changed:blk_a,blk_b
```

---

## 4. Observed evidence

### 4.1 Rust tests

Command:

```sh
rustfmt suites/anchor/core/src/dto.rs suites/anchor/core/tests/structural_dispatch.rs
cargo test --manifest-path suites/anchor/Cargo.toml
```

Observed:

```text
tests/structural_dispatch.rs:
test split_block_creates_right_sibling_and_moves_caret ... ok
test merge_backward_appends_current_body_to_previous_sibling_and_trashes_current ... ok
test merge_backward_on_first_sibling_returns_structural_error ... ok

test result: ok. 77 passed; 0 failed; 1 ignored
```

### 4.2 Swift bridge smoke

Command:

```sh
cargo build --manifest-path suites/anchor/apple/ffi/Cargo.toml --release
ANCHOR_CORE_FFI_LIB_DIR=$PWD/suites/anchor/apple/ffi/target/release \
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
swift run --package-path suites/anchor/apple/AnchorAppleSpike \
  --scratch-path /tmp/anchor-apple-spike-swift-build \
  AnchorAppleSmoke
```

Observed:

```text
Compiling anchor-core v0.0.0
Compiling anchor-core-ffi v0.0.0
Finished `release` profile [optimized]
Build of product 'AnchorAppleSmoke' complete!
fixture:vault=vault_demo_0001 notes=1 snapshot=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63
textkit:core_dispatch_bridge=insert changed=blk_a selection=2:2 segment=979
textkit:core_dispatch_bridge=structural split=changed:blk_a,blk_op_split_block_10003 merge=changed:blk_a,blk_b
async:sendable summary=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63 changed=blk_a segment=979
```

### 4.3 Clippy and cross-target compile

Command:

```sh
cargo clippy --manifest-path suites/anchor/Cargo.toml --all-targets -- -D warnings
cargo build --manifest-path suites/anchor/Cargo.toml --target wasm32-unknown-unknown
cargo build --manifest-path suites/anchor/Cargo.toml --target aarch64-linux-android
```

Observed:

```text
Checking anchor-core v0.0.0
Finished `dev` profile
Compiling anchor-core v0.0.0
Finished `dev` profile
Compiling anchor-core v0.0.0
Finished `dev` profile
```

### 4.4 Core cloud / Apple-type audit

Command:

```sh
rg "CloudKit|CKRecord|CKAsset|CKContainer|CKSyncEngine|NSFileCoordinator|NSMetadataQuery|ubiquit|iCloud|NSURLIsExcludedFromBackupKey" suites/anchor/core; printf 'exit=%s\n' $?
```

Observed:

```text
exit=1
```

Interpretation: 0 matches; core remains free of Apple cloud / file-coordination / ubiquity symbols.

### 4.5 Diff hygiene

Command:

```sh
git diff --check
```

Observed: no output.

---

## 5. Gate result

| Gate | Status |
|---|---|
| core split / merge-backward normal-path dispatch lower bound | **closed / observed** |
| Swift/TextKit structural intent → real core split / merge dispatch bridge | **closed / observed** |
| first-sibling mergeBackward unsupported case | **closed / typed error observed in Rust test** |
| split/merge concurrent intent rebase | open / not implemented |
| `split_merge_structural` conflict materialization | open / not implemented |
| product app-hosted keyboard/menu/undo/focus dispatch integration | open / not implemented |
| inverse-op undo grouping | open / not implemented |
| core-sourced `EditorPatch` application | open / not implemented |
| CP-1 whole-exit | open |

---

## 6. Ledger entry

### Ledger entry — 2026-06-10 — iteration 51 — doc 72-core-structural-dispatch-report.md

- **Checkpoint / cursor:** CP-1 current-period product development, TextKit/core dispatch bridge.
- **Action selected:** implement the core lower bound for structural split / merge-backward dispatch and update the Swift smoke to consume real core results.
- **Owner classification:** core-deterministic + Apple bridge smoke → executed here; no product app shell or iCloud runtime gate touched.
- **Scope-fence check:** passed — no root workspace / package / lockfile changes; no public CLI schema; no Swift-side deterministic semantics; no Apple/iCloud symbols in core.
- **Evidence (Observed = command + output):**
  - `cargo test --manifest-path suites/anchor/Cargo.toml` → `77 passed; 0 failed; 1 ignored`, including 3 new `structural_dispatch` tests.
  - `swift run --package-path suites/anchor/apple/AnchorAppleSpike --scratch-path /tmp/anchor-apple-spike-swift-build AnchorAppleSmoke` → `textkit:core_dispatch_bridge=structural split=changed:blk_a,blk_op_split_block_10003 merge=changed:blk_a,blk_b`.
  - `cargo clippy --manifest-path suites/anchor/Cargo.toml --all-targets -- -D warnings` → `Finished`.
  - `cargo build --manifest-path suites/anchor/Cargo.toml --target wasm32-unknown-unknown` and `--target aarch64-linux-android` → both `Finished`.
  - core cloud-symbol audit → 0 matches, exit 1.
  - `git diff --check` → no output.
- **Gates closed this iteration:** core split / merge-backward dispatch lower bound; Swift structural intent bridge to successful core split / merge results.
- **Gates still open:** concurrent split/merge intent rebase, split/merge conflict materialization, product app-hosted dispatch integration, inverse-op undo grouping, core-sourced `EditorPatch` application, product TextKit/UI integration, Developer ID/App Store distribution, iCloud remote/account/product-context gates, CP-1 whole-exit.
- **Backfill to 04/05/06/21:** TextKit dispatch bridge and D29 / F30 wording updated to reflect doc 72 as core lower bound while preserving product/concurrency gates.
- **Axis matrix delta:** TextKit/core bridge moves from `structural typed-deferral bridge closed; real split/merge semantics open` to `core structural dispatch lower bound closed; product/concurrency split/merge gates open`.
- **Gate evaluation:** CONTINUE — next action should target product app-hosted dispatch integration or core-sourced `EditorPatch` projection before returning to iCloud edge gates.
- **New doc:** `docs/workbench/20260606-anchor-v1/72-core-structural-dispatch-report.md`
