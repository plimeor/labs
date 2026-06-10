# Anchor Stage 1 — Core Undo Group Report

任务：按 2026-06-10 当前目标继续优先推进 Anchor 开发进度，在不回到 iCloud 边界验证的前提下，关闭 core-owned undo projection group lower bound。
日期：2026-06-10
状态：**workbench evidence** —— 非公开接口契约。本文件记录 `TransactionResult.undo_group` 的 core-owned lower bound；不退出 CP-1，不声明完整 inverse-op dispatch / product undo grouping 已完成。

> 边界声明（AGENTS 工作台规则）：本轮没有改 root workspace / package / lockfile / public CLI schema；没有创建产品 app / Xcode project / entitlement / bundle id / iCloud container；没有把 Swift/TextKit 变成 undo 或结构语义 owner；没有引入 Apple / iCloud / file-coordination type 到 `anchor-core`。代码变更限于 core DTO / tests、C ABI JSON bridge、Swift binding decode、Swift smoke 应用 core-sourced undo inverse patches。

---

## 1. Strongest conclusion

**Core now returns a grouped undo lower bound for the implemented insert / split / merge-backward dispatch paths.** `TransactionResult.undo_group` carries a core-owned group id, label, and inverse `EditorPatch` list. Swift decodes it and applies the inverse patches to the TextKit projection probe.

This is still not full product undo. The current group contains inverse projection patches, not durable inverse ops appended through dispatch. Full inverse-op dispatch, product `NSUndoManager` grouping, cross-window undo ownership, and redo semantics remain open gates.

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| root workspace / package / lockfile | not changed |
| public CLI schema | not changed |
| product app shell / Xcode project | not created |
| Swift/TextKit deterministic semantics | not added; Swift applies core-provided inverse patches only |
| iCloud / CloudKit / file-coordination in core | not added; audit returned 0 matches / exit 1 |
| persistent app writes | not added |
| checkpoint exit | not reached |

---

## 3. Implementation result

### 3.1 Core DTO

`suites/anchor/core/src/dto.rs` now adds `TransactionResult.undo_group: Option<UndoGroup>`.

The lower-bound `UndoGroup` contains:

- `group_id`
- `label`
- `inverse_patches`

Observed grouping behavior:

- insert returns one inverse `replace_block_text` patch that restores the previous block body;
- split returns inverse `replace_block_text` for the left block plus `remove_text_surface` for the generated right block;
- merge-backward returns inverse `replace_block_text` for the previous block plus `insert_text_surface` for the restored current block;
- validation errors return no undo group.

### 3.2 Apple bridge

`suites/anchor/apple/ffi/src/lib.rs` serializes `undo_group` in the C ABI JSON transaction result. `AnchorCoreBindings.swift` decodes it as `UndoGroup`. `AnchorAppleSmoke` applies both forward `editor_patches` and inverse `undo_group.inverse_patches` to `NativeEditorAdapterProbe`.

Swift/TextKit still does not derive inverse semantics. It consumes the core undo group.

---

## 4. Observed evidence

### 4.1 Rust tests

Command:

```sh
rustfmt suites/anchor/core/src/dto.rs suites/anchor/core/tests/dto_surface.rs suites/anchor/core/tests/structural_dispatch.rs suites/anchor/apple/ffi/src/lib.rs
cargo test --manifest-path suites/anchor/Cargo.toml
```

Observed:

```text
tests/dto_surface.rs:
test dispatch_insert_text_updates_body ... ok

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
dispatch:insert changed=blk_a selection=3:3 patches=1 undo=replace_block_text
textkit:core_dispatch_bridge=structural split=changed:blk_a,blk_op_split_block_10003 merge=changed:blk_a,blk_b patches=split:2,merge:2 undo=split:2,merge:2
async:sendable summary=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63 changed=blk_a segment=979
```

`AnchorAppleSmoke` also asserts the inverse projection behavior:

- split forward patches create `blk_a` + generated right block; inverse patches restore a single `blk_a = "Morning note."`;
- merge forward patches collapse `blk_b` into `blk_a`; inverse patches restore `blk_a = "Morning note."` and `blk_b = "Evening note."`;
- direct-delete validation error returns no undo group.

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
| `TransactionResult.undo_group` DTO lower bound | **closed / observed** |
| grouped inverse projection patches for insert / split / merge-backward | **closed / observed** |
| C ABI JSON serialization of undo group | **closed / observed** |
| Swift binding decode of undo group | **closed / observed** |
| TextKit-side inverse projection application from core undo group | **closed / observed as probe lower bound** |
| full inverse-op dispatch through core | open / not implemented |
| product `NSUndoManager` grouping / redo | open / not implemented |
| product app-hosted AppKit/UIKit view hierarchy integration | open / not implemented |
| product accessibility / VoiceOver runtime | open / not implemented |
| concurrent split/merge intent rebase | open / not implemented |
| `split_merge_structural` conflict materialization | open / not implemented |
| CP-1 whole-exit | open |

---

## 6. Ledger entry

### Ledger entry — 2026-06-10 — iteration 53 — doc 74-core-undo-group-report.md

- **Checkpoint / cursor:** CP-1 current-period product development, core-owned undo grouping.
- **Action selected:** add core-owned `UndoGroup` DTO to `TransactionResult`, bridge it through C ABI JSON / Swift decoding, and apply inverse patches in the TextKit projection probe.
- **Owner classification:** core-deterministic + Apple bridge smoke → executed here; no product app shell or iCloud runtime gate touched.
- **Scope-fence check:** passed — no root workspace / package / lockfile changes; no public CLI schema; no Swift-side deterministic semantics; no Apple/iCloud symbols in core.
- **Evidence (Observed = command + output):**
  - `cargo test --manifest-path suites/anchor/Cargo.toml` → `77 passed; 0 failed; 1 ignored`, including undo-group assertions in `dto_surface` and `structural_dispatch`.
  - `swift run --package-path suites/anchor/apple/AnchorAppleSpike --scratch-path /tmp/anchor-apple-spike-swift-build AnchorAppleSmoke` → `dispatch:insert ... undo=replace_block_text` and `textkit:core_dispatch_bridge=structural ... undo=split:2,merge:2`.
  - `cargo clippy --manifest-path suites/anchor/Cargo.toml --all-targets -- -D warnings` → `Finished`.
  - `cargo build --manifest-path suites/anchor/Cargo.toml --target wasm32-unknown-unknown` and `--target aarch64-linux-android` → both `Finished`.
  - core cloud-symbol audit → 0 matches, exit 1.
  - `git diff --check` → no output.
- **Gates closed this iteration:** core-owned undo-group DTO lower bound; C ABI JSON / Swift decode; TextKit-side inverse projection probe application from core undo group.
- **Gates still open:** full inverse-op dispatch through core, product `NSUndoManager` grouping/redo, product app-hosted AppKit/UIKit view hierarchy integration, product app-hosted keyboard/menu/focus dispatch integration, product accessibility/VoiceOver runtime, concurrent split/merge intent rebase, `split_merge_structural` conflict materialization, Developer ID/App Store distribution, iCloud remote/account/product-context gates, CP-1 whole-exit.
- **Backfill to 04/06/21:** TextKit dispatch bridge and fixture wording updated to reflect doc 74 as undo projection grouping lower bound while preserving full inverse-op/product undo gates.
- **Axis matrix delta:** TextKit/core bridge moves from `core structural dispatch + core-sourced EditorPatch projection lower bounds closed; inverse-op undo grouping open` to `core structural dispatch + projection patch + undo projection grouping lower bounds closed; full inverse-op/product undo gates open`.
- **Gate evaluation:** CONTINUE — next action should target product app-hosted dispatch integration or full inverse-op dispatch before returning to iCloud edge gates.
- **New doc:** `docs/workbench/20260606-anchor-v1/74-core-undo-group-report.md`
