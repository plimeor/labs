# Anchor Stage 1 — TextKit Structural Dispatch Deferral Report

任务：CP-1 TextKit / binding gate，验证 split / merge-backward 结构化 editor intent 可经 Apple binding 到达真实 `anchor-core` dispatch 并返回 core-owned typed deferral。
日期：2026-06-10
状态：**workbench evidence** —— 非公开接口契约。本文件只关闭结构化 TextKit intent 到 core typed deferral 的机制下限；不表示 split / merge 语义、产品编辑器集成、或 CP-1 退出。

> 边界声明（AGENTS 工作台规则）：本轮代码改动只触及已批准的 Stage 1 Apple spike / FFI surface：`suites/anchor/apple/ffi/**` 与 `suites/anchor/apple/AnchorAppleSpike/**`。本轮没有改 root workspace / package / generated lockfile / public CLI schema；没有改 `suites/anchor/core/src/**` production source；没有创建产品 app shell、entitlement、bundle id、iCloud container；没有在 Swift / TextKit 侧实现 merge / diff3 / order-key / normalization / tree invariant / op creation。权威 CLI/API/schema/file-format 契约仍归未来 `anchor-core` README。

---

## 1. Strongest conclusion

**Non-insert structural TextKit intent 到真实 core dispatch 的 typed deferral 桥接下限已关闭；split / merge 产品语义仍未关闭。**

本轮在 Apple FFI / Swift wrapper 中新增两个窄入口：

- `anchor_session_dispatch_split_block_json(...)`
- `anchor_session_dispatch_merge_backward_json(...)`

`AnchorAppleSmoke` 从现有 `EditorIntentProbe.splitBlock` / `mergeBackward` 构造 structural intent，传入真实 `AnchorSession.dispatchSplitBlock(...)` / `dispatchMergeBackward(...)`。两个调用均由 Rust `anchor-core` 返回 typed `ValidationErrorCode.structuralDispatchDeferred`，且 `changedIDs` 为空。

Observed load-bearing line:

```text
textkit:core_dispatch_bridge=structural split=structural_dispatch_deferred merge=structural_dispatch_deferred
```

这证明：split / merge-backward 这类 non-insert editor intent 不再只停留在 Swift-side probe；它们能穿过 C ABI / Swift wrapper 到达真实 core dispatch，并以 core-owned typed error vocabulary 表达“结构化语义延期”。它**不**证明 core 已实现 split / merge macro-op、intent rebase、derived block conflict accounting、product undo grouping、core-sourced `EditorPatch` application、或产品 AppKit/UIKit runtime integration。

---

## 2. Implementation boundary

Touched files:

- `suites/anchor/apple/ffi/include/AnchorCoreFFI.h`
- `suites/anchor/apple/ffi/src/lib.rs`
- `suites/anchor/apple/AnchorAppleSpike/Sources/AnchorCoreBindings/AnchorCoreBindings.swift`
- `suites/anchor/apple/AnchorAppleSpike/Sources/AnchorAppleSmoke/main.swift`

Observed implementation shape:

- FFI forwards `SplitBlock { target_id, at }` and `MergeBackward { target_id }` into `session.inner.dispatch(...)`.
- Swift `AnchorSession` exposes `dispatchSplitBlock(targetID:at:)` and `dispatchMergeBackward(targetID:)`.
- Swift `AnchorCoreClient` actor forwards both calls.
- `AnchorAppleSmoke` asserts both calls return no changed IDs and `structuralDispatchDeferred`.

No `suites/anchor/core/src/**` production source was changed.

---

## 3. Observed evidence

### 3.1 FFI formatting and macOS release build

Command:

```sh
cargo fmt --manifest-path suites/anchor/apple/ffi/Cargo.toml
```

Observed: no output, exit `0`.

Command:

```sh
CARGO_TARGET_DIR=/tmp/anchor-apple-stage1/ffi-target cargo build \
  --manifest-path suites/anchor/apple/ffi/Cargo.toml \
  --release \
  --target aarch64-apple-darwin
```

Observed excerpt:

```text
Finished `release` profile [optimized] target(s)
```

`cargo build` generated `suites/anchor/apple/ffi/Cargo.lock`; it was removed because this iteration does not authorize generated lockfile changes.

### 3.2 SwiftPM debug smoke

Command:

```sh
ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-darwin/release \
  swift run \
  --package-path suites/anchor/apple/AnchorAppleSpike \
  --scratch-path /tmp/anchor-apple-stage1/swift-build-textkit-structural-dispatch-20260610 \
  AnchorAppleSmoke
```

Observed output excerpt:

```text
fixture:vault=vault_demo_0001 notes=1 snapshot=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63
dispatch:insert changed=blk_a selection=3:3
dispatch:error validation=direct_active_to_deleted
segment:bytes=979
textkit:core_dispatch_bridge=insert changed=blk_a selection=2:2 segment=979
textkit:core_dispatch_bridge=structural split=structural_dispatch_deferred merge=structural_dispatch_deferred
icloud:account_state_classifier=blocked_no_ubiquity_container explicit=false implicit=false
async:sendable summary=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63 changed=blk_a segment=979
```

### 3.3 Xcode Release strict build

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-darwin/release \
  xcodebuild \
  -scheme AnchorAppleSmoke \
  -destination 'platform=macOS' \
  -configuration Release \
  -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/AnchorAppleSmoke-textkit-structural-dispatch-20260610 \
  OTHER_SWIFT_FLAGS='-strict-concurrency=complete -warnings-as-errors' \
  build
```

Observed output excerpt:

```text
Target dependency graph (5 targets)
    Target 'AnchorAppleSmoke' in project 'AnchorAppleSpike'
        Explicit dependency on target 'AnchorCoreC' in project 'AnchorAppleSpike'
        Explicit dependency on target 'AnchorCoreBindings' in project 'AnchorAppleSpike'
        Explicit dependency on target 'AnchorICloudDriveProbe' in project 'AnchorAppleSpike'
        Explicit dependency on target 'AnchorTextKitProbe' in project 'AnchorAppleSpike'
...
** BUILD SUCCEEDED **
```

### 3.4 Xcode Release product smoke

Command:

```sh
/tmp/anchor-apple-stage1/DerivedData/AnchorAppleSmoke-textkit-structural-dispatch-20260610/Build/Products/Release/AnchorAppleSmoke
```

Observed output excerpt:

```text
fixture:vault=vault_demo_0001 notes=1 snapshot=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63
dispatch:insert changed=blk_a selection=3:3
dispatch:error validation=direct_active_to_deleted
segment:bytes=979
textkit:core_dispatch_bridge=insert changed=blk_a selection=2:2 segment=979
textkit:core_dispatch_bridge=structural split=structural_dispatch_deferred merge=structural_dispatch_deferred
icloud:account_state_classifier=blocked_no_ubiquity_container explicit=false implicit=false
async:sendable summary=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63 changed=blk_a segment=979
```

### 3.5 iOS Simulator and iPhoneOS compile surfaces

Command:

```sh
CARGO_TARGET_DIR=/tmp/anchor-apple-stage1/ffi-target cargo build \
  --manifest-path suites/anchor/apple/ffi/Cargo.toml \
  --release \
  --target aarch64-apple-ios-sim
```

Observed excerpt:

```text
Finished `release` profile [optimized] target(s)
```

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-ios-sim/release \
  xcodebuild \
  -scheme AnchorCoreBindings \
  -destination 'generic/platform=iOS Simulator' \
  -configuration Debug \
  -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/AnchorCoreBindings-structural-iossim-20260610 \
  OTHER_SWIFT_FLAGS='-strict-concurrency=complete -warnings-as-errors' \
  build
```

Observed:

```text
** BUILD SUCCEEDED **
```

Command:

```sh
CARGO_TARGET_DIR=/tmp/anchor-apple-stage1/ffi-target cargo build \
  --manifest-path suites/anchor/apple/ffi/Cargo.toml \
  --release \
  --target aarch64-apple-ios
```

Observed excerpt:

```text
Finished `release` profile [optimized] target(s)
```

This command also generated `suites/anchor/apple/ffi/Cargo.lock`; it was removed.

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-ios/release \
  xcodebuild \
  -scheme AnchorCoreBindings \
  -destination 'generic/platform=iOS' \
  -configuration Debug \
  -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/AnchorCoreBindings-structural-iphoneos-20260610 \
  OTHER_SWIFT_FLAGS='-strict-concurrency=complete -warnings-as-errors' \
  build
```

Observed:

```text
** BUILD SUCCEEDED **
```

### 3.6 Boundary audits

Command:

```sh
rg "CloudKit|CKRecord|CKAsset|CKContainer|CKSyncEngine|NSFileCoordinator|NSMetadataQuery|ubiquit|iCloud|NSURLIsExcludedFromBackupKey" suites/anchor/core
```

Observed: no output, exit `1`.

Command:

```sh
rg "diff3|order[_-]?key|fractional|merge.*semantic|canonical|BLAKE3|HLC|OR-Set|dominates_frontier|life lattice|tree invariant|normalize" \
  suites/anchor/apple/AnchorAppleSpike/Sources/AnchorCoreBindings \
  suites/anchor/apple/AnchorAppleSpike/Sources/AnchorAppleSmoke \
  suites/anchor/apple/ffi
```

Observed: no output, exit `1`.

Command:

```sh
find suites/anchor/apple -name Cargo.lock -print
```

Observed: no output.

Command:

```sh
git diff --check
```

Observed: no output, exit `0`.

---

## 4. Gate result

Closed this iteration:

- Probe-level split block intent reaches real `anchor-core` dispatch through Apple FFI / Swift wrapper.
- Probe-level merge-backward intent reaches real `anchor-core` dispatch through Apple FFI / Swift wrapper.
- Both structural intents return core-owned typed `structural_dispatch_deferred`, preserving the boundary that structural edit semantics remain core-owned.
- macOS Release strict-concurrency build and release executable smoke observe the same structural deferral line.
- iOS Simulator and iPhoneOS binding compile surfaces remain green after the new entrypoints.

Still open:

- Core implementation of split / merge macro-op semantics, intent rebase, derived block accounting, and split/merge conflict materialization.
- Product app keyboard/menu/undo/focus dispatch integration with real core dispatch.
- Product undo grouping / inverse-op dispatch.
- Core-sourced `EditorPatch` application over real product AppKit/UIKit views.
- Product accessibility mapping, VoiceOver/UI runtime, cross-window focus, and signed-device integration.
- CP-1 iCloud delivery gates: physical iPhone app launch / runtime, iOS/non-macOS CloudDocuments delivery, true remote `.icloud` placeholder, signed-out / over-quota states, product compaction integration, million-op iCloud product context, and product conflict resolver UX/core integration.
- Binding release gates: signed app-bundle/device runtime integration, physical-device generated async runtime, Developer ID / distribution.

---

## 5. Ledger entry

### Ledger entry — 2026-06-10 — iteration 45 — doc 66-textkit-structural-dispatch-deferral-report.md

- **Checkpoint / cursor:** CP-1 Apple half, TextKit/core dispatch integration gate.
- **Action selected:** extend the probe-level TextKit/core dispatch bridge from insert-only to structural split / merge-backward intents, while preserving core-owned structural deferral.
- **Owner classification:** Apple/TextKit + binding verifier → implemented in repo-local spike FFI/wrapper/smoke; no product app shell or core production source touched.
- **Scope-fence check:** passed — no root workspace / package / generated lockfile retained; no public CLI schema; no product app shell; no Swift-side merge/diff3/order-key/normalization/tree-invariant/op-creation implementation; core cloud-symbol audit remains 0-match.
- **Evidence (Observed = command + output):**
  - `cargo fmt --manifest-path suites/anchor/apple/ffi/Cargo.toml` → exit `0`.
  - `cargo build --manifest-path suites/anchor/apple/ffi/Cargo.toml --release --target aarch64-apple-darwin` → `Finished 'release' profile`.
  - `swift run --package-path suites/anchor/apple/AnchorAppleSpike --scratch-path /tmp/anchor-apple-stage1/swift-build-textkit-structural-dispatch-20260610 AnchorAppleSmoke` → `textkit:core_dispatch_bridge=structural split=structural_dispatch_deferred merge=structural_dispatch_deferred`.
  - `xcodebuild -scheme AnchorAppleSmoke ... OTHER_SWIFT_FLAGS='-strict-concurrency=complete -warnings-as-errors' build` → `** BUILD SUCCEEDED **`.
  - Release executable run → `textkit:core_dispatch_bridge=structural split=structural_dispatch_deferred merge=structural_dispatch_deferred`.
  - `cargo build --target aarch64-apple-ios-sim` + `xcodebuild -scheme AnchorCoreBindings -destination 'generic/platform=iOS Simulator' ... build` → `** BUILD SUCCEEDED **`.
  - `cargo build --target aarch64-apple-ios` + `xcodebuild -scheme AnchorCoreBindings -destination 'generic/platform=iOS' ... build` → `** BUILD SUCCEEDED **`.
  - core cloud-symbol audit → no output, exit `1`.
  - Apple deterministic-semantics audit → no output, exit `1`.
  - `find suites/anchor/apple -name Cargo.lock -print` → no output.
  - `git diff --check` → no output, exit `0`.
- **Gates closed this iteration:** probe-level TextKit structural split / merge-backward intents → real `anchor-core` dispatch typed deferral bridge.
- **Gates still open:** product app-hosted dispatch integration for keyboard/menu/undo/focus flows, real split/merge semantics, inverse-op undo grouping, core-sourced patch application, product AppKit/UIKit accessibility/VoiceOver/UI runtime, physical iPhone / iCloud runtime, true remote placeholder, account-state runtimes, product iCloud compaction/context, product conflict resolver UX/core integration, signed-device generated async runtime, Developer ID distribution.
- **Backfill to 04/06/21:** TextKit baseline, fixture evidence, and integration ledger updated to distinguish structural deferral bridge from product/core split-merge semantics.
- **Axis matrix delta:** TextKit remains `partial mechanism floor closed`; non-insert structural intent bridge moves from open/not run to closed for typed deferral only.
- **Gate evaluation:** CONTINUE — remaining gates require product integration, real structural edit implementation, real remote/account/device states, or physical-device runtime.
- **New doc:** `docs/workbench/20260606-anchor-v1/66-textkit-structural-dispatch-deferral-report.md`
