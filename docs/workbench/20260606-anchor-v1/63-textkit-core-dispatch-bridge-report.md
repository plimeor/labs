# Anchor Stage 1 — TextKit Core Dispatch Bridge Report

任务：TextKit adapter intent 到真实 `anchor-core` dispatch 的 probe 级桥接验证
日期：2026-06-10
状态：**workbench evidence** —— 非公开接口契约。本文件记录 CP-1 Apple/TextKit 机制门的一次收口；它不表示 CP-1 退出。

> 边界声明（AGENTS 工作台规则）：本文件和本轮代码改动只触及已批准的 Stage 1 Apple spike surface：`suites/anchor/apple/AnchorAppleSpike/**`。本轮不授权 root workspace / package / lockfile / 产品 app / entitlement / bundle id / iCloud container 改动；不创建产品 app shell；不改 `suites/anchor/core/src/**`；不在 Swift/TextKit 侧实现 merge / diff3 / order-key / normalization / tree invariant / op creation。权威 CLI/API/schema/file-format 契约仍归未来 `anchor-core` README。

---

## 1. Strongest conclusion

**Probe 级 TextKit → core dispatch bridge 已关闭；产品级 editor integration 仍未关闭。**

本轮把现有 `AnchorAppleSmoke` 同时连接 `AnchorTextKitProbe` 与 `AnchorCoreBindings`，从 `NativeEditorAdapterProbe.intentForInsert(...)` 生成 `EditorIntentProbe.insertText`，再把该 intent 的 `blockID` / UTF-16 offset / text 传入真实 `AnchorSession.dispatchInsertText(...)`。运行结果观察到 core 返回 `changed=blk_a`、selection hint `2:2`，并产出非空 segment bytes。

这证明了一个窄机制：Apple TextKit adapter 可以把 insert intent 交给真实 Rust core dispatch，而不是改 TextKit buffer 或在 Swift 侧复制 core 语义。它**不**证明产品 app 的完整键盘/menu/undo/focus dispatch integration、inverse-op undo grouping、非 insert patch dispatch、跨窗口焦点、VoiceOver/UI runtime 或 signed app/device runtime。

---

## 2. Implementation boundary

Touched files:

- `suites/anchor/apple/AnchorAppleSpike/Package.swift`
- `suites/anchor/apple/AnchorAppleSpike/Sources/AnchorAppleSmoke/main.swift`

Observed implementation shape:

- `AnchorAppleSmoke` depends on both `AnchorCoreBindings` and `AnchorTextKitProbe`.
- The smoke creates `NativeEditorAdapterProbe(blocks: [TextSurfaceState(blockID: "blk_a", text: "Morning note.")])`.
- The adapter produces `.insertText(blockID: "blk_a", atUTF16: 1, text: "x")`.
- The smoke passes those fields to `AnchorSession.dispatchInsertText(targetID:at:text:)`.
- Preconditions assert no validation error, `changedIDs == ["blk_a"]`, selection hint kind `text`, selection `2:2`, and non-empty segment bytes.

No `suites/anchor/core/src/**` production source was changed.

---

## 3. Observed evidence

### 3.1 Rust FFI library

Command:

```sh
cargo build --release --target aarch64-apple-darwin --manifest-path suites/anchor/apple/ffi/Cargo.toml --target-dir /tmp/anchor-apple-stage1/ffi-target
```

Observed output:

```text
Locking 1 package to latest compatible version
Finished `release` profile [optimized] target(s) in 0.03s
```

`cargo build` generated an untracked `suites/anchor/apple/ffi/Cargo.lock`; it was removed because this iteration does not authorize lockfile changes.

### 3.2 SwiftPM debug smoke

Command:

```sh
ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-darwin/release swift run --package-path suites/anchor/apple/AnchorAppleSpike --scratch-path /tmp/anchor-apple-stage1/swift-build-textkit-core-dispatch-20260610 AnchorAppleSmoke
```

Observed output:

```text
Build of product 'AnchorAppleSmoke' complete! (32.37s)
fixture:vault=vault_demo_0001 notes=1 snapshot=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63
dispatch:insert changed=blk_a selection=3:3
dispatch:error validation=direct_active_to_deleted
segment:bytes=979
textkit:core_dispatch_bridge=insert changed=blk_a selection=2:2 segment=979
async:sendable summary=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63 changed=blk_a segment=979
```

The load-bearing line is:

```text
textkit:core_dispatch_bridge=insert changed=blk_a selection=2:2 segment=979
```

### 3.3 Xcode Release strict build

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-darwin/release xcodebuild -scheme AnchorAppleSmoke -destination 'platform=macOS' -configuration Release -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/AnchorAppleSmoke-textkit-core-dispatch-20260610 OTHER_SWIFT_FLAGS='-strict-concurrency=complete -warnings-as-errors' build
```

Observed output:

```text
Target dependency graph (4 targets)
    Target 'AnchorAppleSmoke' in project 'AnchorAppleSpike'
        Explicit dependency on target 'AnchorCoreC' in project 'AnchorAppleSpike'
        Explicit dependency on target 'AnchorCoreBindings' in project 'AnchorAppleSpike'
        Explicit dependency on target 'AnchorTextKitProbe' in project 'AnchorAppleSpike'
...
** BUILD SUCCEEDED **
```

### 3.4 Xcode Release product smoke

Command:

```sh
/tmp/anchor-apple-stage1/DerivedData/AnchorAppleSmoke-textkit-core-dispatch-20260610/Build/Products/Release/AnchorAppleSmoke
```

Observed output:

```text
fixture:vault=vault_demo_0001 notes=1 snapshot=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63
dispatch:insert changed=blk_a selection=3:3
dispatch:error validation=direct_active_to_deleted
segment:bytes=979
textkit:core_dispatch_bridge=insert changed=blk_a selection=2:2 segment=979
async:sendable summary=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63 changed=blk_a segment=979
```

### 3.5 Boundary audits

Command:

```sh
rg "CloudKit|CKRecord|CKAsset|CKContainer|CKSyncEngine|NSFileCoordinator|NSMetadataQuery|ubiquit|iCloud|NSURLIsExcludedFromBackupKey" suites/anchor/core; printf 'exit=%s\n' "$?"
```

Observed output:

```text
exit=1
```

This is the expected 0-match result.

Command:

```sh
rg "diff3|order[_-]?key|fractional|merge|canonical|BLAKE3|HLC|OR-Set|dominates_frontier|life lattice|tree invariant|normalize" suites/anchor/apple/AnchorAppleSpike/Sources/AnchorTextKitProbe suites/anchor/apple/AnchorAppleSpike/Sources/AnchorAppleSmoke; printf 'exit=%s\n' "$?"
```

Observed output:

```text
suites/anchor/apple/AnchorAppleSpike/Sources/AnchorTextKitProbe/AnchorTextKitProbe.swift:    case mergeBackward(blockID: String)
...
exit=0
```

Interpretation: the hits are existing `mergeBackward` editor-intent / menu-command names in `AnchorTextKitProbe.swift`; this iteration did not add Swift-side deterministic merge, diff3, order-key, canonical serialization, HLC, OR-Set, life-lattice, tree-invariant, or normalization logic.

---

## 4. Gate result

Closed this iteration:

- TextKit adapter insert intent → real `anchor-core` dispatch bridge, probe-level.
- `AnchorAppleSmoke` strict Xcode Release build with both `AnchorCoreBindings` and `AnchorTextKitProbe`.

Still open:

- Product app keyboard/menu/undo/focus intent integration with real core dispatch.
- Product undo grouping / inverse-op dispatch.
- Non-insert editor operations and `EditorPatch` application sourced from core transaction results.
- Product AppKit/UIKit window, focus, accessibility, VoiceOver/UI runtime, and signed-device integration.
- CP-1 iCloud delivery gates: physical iPhone runtime after unlock, iOS/non-macOS CloudDocuments delivery, true remote `.icloud` placeholder, signed-out / over-quota states, steady-state segment budget / million-op iCloud context, and product conflict-resolution UX/core integration.
- Binding release gates: signed app-bundle/device runtime integration, physical-device generated async runtime, Developer ID / distribution.

---

## 5. Ledger entry

### Ledger entry — 2026-06-10 — iteration 42 — doc 63-textkit-core-dispatch-bridge-report.md

- **Checkpoint / cursor:** CP-1 Apple half, TextKit/core dispatch integration gate.
- **Action selected:** connect existing TextKit adapter insert intent to real `AnchorSession.dispatchInsertText` inside the repo-local Apple spike smoke.
- **Owner classification:** Apple/TextKit + binding verifier → implemented in repo-local spike probe/smoke; no product app shell or core production source touched.
- **Scope-fence check:** passed — no root workspace / package / generated lockfile retained; no public CLI schema; no product app shell; no Swift-side merge/diff3/order-key/normalization/tree-invariant/op-creation implementation; core cloud-symbol audit remains 0-match.
- **Evidence (Observed = command + output):**
  - `cargo build --release --target aarch64-apple-darwin --manifest-path suites/anchor/apple/ffi/Cargo.toml --target-dir /tmp/anchor-apple-stage1/ffi-target` → `Finished 'release' profile [optimized] target(s) in 0.03s`.
  - `swift run --package-path suites/anchor/apple/AnchorAppleSpike --scratch-path /tmp/anchor-apple-stage1/swift-build-textkit-core-dispatch-20260610 AnchorAppleSmoke` → `textkit:core_dispatch_bridge=insert changed=blk_a selection=2:2 segment=979`.
  - `xcodebuild -scheme AnchorAppleSmoke ... OTHER_SWIFT_FLAGS='-strict-concurrency=complete -warnings-as-errors' build` → target dependency graph includes `AnchorCoreBindings` + `AnchorTextKitProbe`; `** BUILD SUCCEEDED **`.
  - Release executable run → `textkit:core_dispatch_bridge=insert changed=blk_a selection=2:2 segment=979`.
  - `rg "CloudKit|...|NSURLIsExcludedFromBackupKey" suites/anchor/core; printf 'exit=%s\n' "$?"` → `exit=1`.
- **Gates closed this iteration:** probe-level TextKit adapter insert intent → real `anchor-core` dispatch bridge.
- **Gates still open:** product app-hosted core dispatch integration for keyboard/menu/undo/focus flows, inverse-op undo grouping, non-insert editor operations, product AppKit/UIKit accessibility/VoiceOver/UI runtime, physical iPhone app launch / iCloud runtime, iOS/non-macOS CloudDocuments delivery, true remote placeholder, account-state gates, iCloud scale/budget gates, product conflict-resolution UX/core integration, signed-device generated async runtime, Developer ID distribution.
- **Backfill to 04/06:** TextKit baseline and fixture evidence updated to distinguish probe-level insert bridge from product-level integration.
- **Axis matrix delta:** TextKit remains `partial mechanism floor closed`; probe-level core dispatch bridge moves from open/not run to closed for insert intent only.
- **Gate evaluation:** CONTINUE — next action should target a remaining product integration, iCloud delivery, signed-device, account-state, or distribution gate.
- **New doc:** `docs/workbench/20260606-anchor-v1/63-textkit-core-dispatch-bridge-report.md`
