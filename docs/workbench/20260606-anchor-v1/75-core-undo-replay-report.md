# Anchor Stage 1 — Core Undo Replay Report

任务：按 2026-06-10 当前目标继续优先推进 Anchor 开发进度，在不回到 iCloud 边界验证的前提下，关闭 core-only undo replay lower bound。
日期：2026-06-10
状态：**workbench evidence** —— 非公开接口契约。本文件记录 core-issued `UndoGroup` 经 core op-log replay 生效的下限；不退出 CP-1，不声明产品 `NSUndoManager` / redo / Swift FFI undo replay 入参已完成。

> 边界声明（AGENTS 工作台规则）：本轮没有改 root workspace / package / lockfile / public CLI schema；没有创建产品 app / Xcode project / entitlement / bundle id / iCloud container；没有把 Swift/TextKit 变成 undo 或结构语义 owner；没有引入 Apple / iCloud / file-coordination type 到 `anchor-core`。代码变更限于 `anchor-core` DTO/session implementation 与 Rust tests。

---

## 1. Strongest conclusion

**Core can now replay a core-issued undo group back into the op-log as committed core ops.** `Session::dispatch_undo_group` consumes `UndoGroup.inverse_patches`, lowers them to `SetBody` / `LifeSet(Trashed)` / `Restore(Active)` / create-surface lower-bound ops, appends them to the log, replays the vault, and returns a normal `TransactionResult`.

This is still not full product undo. The current path is core-only and patch-shaped. It does not add a Swift/FFI JSON input contract for undo groups, does not prove product `NSUndoManager` grouping, does not implement redo, and does not make inverse op semantics richer than the current projection-patch lower bound.

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| root workspace / package / lockfile | not changed |
| public CLI schema | not changed |
| product app shell / Xcode project | not created |
| Swift/TextKit deterministic semantics | not added |
| Swift/FFI undo-group input parser | not added |
| iCloud / CloudKit / file-coordination in core | not added; audit returned 0 matches / exit 1 |
| persistent app writes | not added |
| checkpoint exit | not reached |

---

## 3. Implementation result

### 3.1 Core replay path

`suites/anchor/core/src/dto.rs` now adds `Session::dispatch_undo_group(group, stamp)`.

The replay lower bound maps core-issued inverse patches as follows:

| Undo patch | Core op-log lowering |
|---|---|
| `replace_block_text` | `SetBody` with current `base_sub_rev` and new body sub-rev |
| `remove_text_surface` | `LifeSet(Trashed)` for the target block |
| `insert_text_surface` for existing block | `Restore(Active)` plus `SetBody` |
| `insert_text_surface` for missing block | create-surface lower bound plus `SetBody` |

The undo replay result returns the inverse patches as its `editor_patches`, computes changed ids and selection hint from those patches, and intentionally returns no redo `undo_group`.

### 3.2 Test coverage

`suites/anchor/core/tests/dto_surface.rs` now proves insert undo replay:

- insert changes `blk_a` to `PREFIX Morning note.`;
- `dispatch_undo_group` restores `blk_a` to `Morning note.`;
- the undo transaction has no nested undo/redo group.

`suites/anchor/core/tests/structural_dispatch.rs` now proves structural undo replay:

- split undo restores `blk_a = "Morning note."` and trashes the generated right block;
- merge-backward undo restores `blk_a = "Morning note."`, restores `blk_b = "Evening note."`, and returns `blk_b` to `Life::Active` / visible.

---

## 4. Observed evidence

### 4.1 Rust tests

Command:

```sh
rustfmt suites/anchor/core/src/dto.rs suites/anchor/core/tests/dto_surface.rs suites/anchor/core/tests/structural_dispatch.rs
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

### 4.2 Clippy and cross-target compile

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

### 4.3 Core cloud / Apple-type audit

Command:

```sh
rg "CloudKit|CKRecord|CKAsset|CKContainer|CKSyncEngine|NSFileCoordinator|NSMetadataQuery|ubiquit|iCloud|NSURLIsExcludedFromBackupKey" suites/anchor/core; printf 'exit=%s\n' $?
```

Observed:

```text
exit=1
```

Interpretation: 0 matches; core remains free of Apple cloud / file-coordination / ubiquity symbols.

---

## 5. Gate result

| Gate | Status |
|---|---|
| core-only `dispatch_undo_group` replay lower bound | **closed / observed** |
| insert undo replay into op-log | **closed / observed** |
| split undo replay into op-log | **closed / observed** |
| merge-backward undo replay into op-log | **closed / observed** |
| Swift/FFI undo-group input contract | open / not implemented |
| product `NSUndoManager` grouping / redo | open / not implemented |
| product app-hosted AppKit/UIKit view hierarchy integration | open / not implemented |
| product keyboard/menu/focus undo routing to core replay | open / not implemented |
| mark-preserving full inverse-op contract beyond patch lower bound | open / not implemented |
| concurrent split/merge intent rebase | open / not implemented |
| `split_merge_structural` conflict materialization | open / not implemented |
| CP-1 whole-exit | open |

---

## 6. Ledger entry

### Ledger entry — 2026-06-10 — iteration 54 — doc 75-core-undo-replay-report.md

- **Checkpoint / cursor:** CP-1 current-period product development, core-only undo replay.
- **Action selected:** add `Session::dispatch_undo_group` so core-issued undo groups can replay through core op-log append + replay instead of existing only as Swift-applied inverse projection patches.
- **Owner classification:** core-deterministic → executed here; no product app shell, Swift FFI input parser, or iCloud runtime gate touched.
- **Scope-fence check:** passed — no root workspace / package / lockfile changes; no public CLI schema; no Swift-side deterministic semantics; no Apple/iCloud symbols in core.
- **Evidence (Observed = command + output):**
  - `cargo test --manifest-path suites/anchor/Cargo.toml` → `77 passed; 0 failed; 1 ignored`, including insert/split/merge undo replay assertions.
  - `cargo clippy --manifest-path suites/anchor/Cargo.toml --all-targets -- -D warnings` → `Finished`.
  - `cargo build --manifest-path suites/anchor/Cargo.toml --target wasm32-unknown-unknown` and `--target aarch64-linux-android` → both `Finished`.
  - core cloud-symbol audit → 0 matches, exit 1.
- **Gates closed this iteration:** core-only undo replay lower bound; insert / split / merge-backward undo groups lower to committed core ops and materialized replay state.
- **Gates still open:** Swift/FFI undo-group input contract, product `NSUndoManager` grouping/redo, product app-hosted AppKit/UIKit view hierarchy integration, product keyboard/menu/focus undo routing to core replay, mark-preserving full inverse-op contract beyond patch lower bound, concurrent split/merge intent rebase, `split_merge_structural` conflict materialization, Developer ID/App Store distribution, iCloud remote/account/product-context gates, CP-1 whole-exit.
- **Backfill to 04/06/21:** TextKit/core undo wording updated to reflect doc 75 as core-only undo replay lower bound while preserving product undo / FFI / redo gates.
- **Axis matrix delta:** TextKit/core bridge moves from `core structural dispatch + projection patch + undo projection grouping lower bounds closed; full inverse-op/product undo gates open` to `core structural dispatch + projection patch + undo projection grouping + core-only undo replay lower bounds closed; product/FFI undo gates open`.
- **Gate evaluation:** CONTINUE — next action should target product app-hosted dispatch integration or Swift/FFI undo replay input before returning to iCloud edge gates.
- **New doc:** `docs/workbench/20260606-anchor-v1/75-core-undo-replay-report.md`
