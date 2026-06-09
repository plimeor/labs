# Anchor Stage 1 - TextKit AppKit View Lifecycle Report

任务：CP-1 TextKit product-runtime gate，补足真实 AppKit `NSView` / `NSTextView` view hierarchy 对 text surface insert / move / remove patch replay 的机制证据，并验证 iOS Simulator compile surface。
日期：2026-06-10
状态：**workbench artifact** —— 非公开接口契约；本轮只关闭 macOS AppKit text-surface view lifecycle 机制下限，不关闭产品 view hierarchy 集成、responder-chain / menu / focus、UIKit view lifecycle、iOS `UITextView` runtime 或完整 editor runtime。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**package / workspace / 产品 app / 生成 lockfile / public CLI schema 改动；本轮没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；没有改 `suites/anchor/core/src/**` production source；没有创建 Apple product app shell；没有把 AppKit view identity 变成文档真理层。代码变更限于 `suites/anchor/apple/AnchorAppleSpike/Sources/AnchorTextKitProbe/AnchorTextKitProbe.swift` 与 `suites/anchor/apple/AnchorAppleSpike/Sources/AnchorTextKitSmoke/main.swift`；构建产物位于 `/tmp/anchor-apple-stage1`。

---

## 1. 结论

**Strongest conclusion：macOS AppKit text-surface view lifecycle 的机制下限成立；adapter 可以把 insert / move / remove patch replay 到真实 `NSView` / `NSTextView` 层级。**

本轮新增 `AppKitTextSurfaceHost`，用真实 `NSView.subviews` 与 `NSTextView` 实例验证：

```text
initial:      ["blk_a", "code_1"]
after insert: ["blk_a", "blk_b", "code_1"]
after move:   ["code_1", "blk_a", "blk_b"]
after remove: ["code_1", "blk_a"]
```

新增 smoke 输出：

```text
textkit:appkit_view_lifecycle=insert_move_remove
```

这证明的是 AppKit view hierarchy replay 的机制面：新增 view 可插入、现有 view 可移动、被移除 view 会 detach，且插入 view 保留 UTF-16 selection。它 **不**证明：

- 产品 AppKit view hierarchy 与真实 window / scroll / focus / animation 的集成；
- responder-chain、menu command routing、跨多 view focus；
- UIKit / `UITextView` view lifecycle runtime；
- patch replay 与真实 `anchor-core::dispatch` / product transaction pipeline 的端到端集成。

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| root workspace / package / lockfile | not changed |
| `suites/anchor/core/src/**` | not changed |
| public CLI schema | not changed |
| product app shell | not created |
| AppKit view identity truth ownership | not introduced; view identity stays adapter-local |
| Swift deterministic semantics | not introduced; no diff3 / order-key / merge / normalization / op-creation |
| persistent writes | none |
| checkpoint exit | not reached |

---

## 3. Implementation shape

Changed files:

```text
suites/anchor/apple/AnchorAppleSpike/Sources/AnchorTextKitProbe/AnchorTextKitProbe.swift
suites/anchor/apple/AnchorAppleSpike/Sources/AnchorTextKitSmoke/main.swift
```

New macOS-only probe shapes:

```text
AppKitTextSurfaceLifecycleResult
AppKitTextSurfaceHost
MacTextKitRuntimeProbe.appKitViewLifecycleProbe()
```

The host keeps `blockID` in `NSTextView.identifier`, rebuilds the `NSView.subviews` order after insert / move / remove patches, and records whether the removed text view is detached from its superview. This keeps view identity adapter-local and avoids treating TextKit / AppKit state as persistent truth.

---

## 4. Observed evidence

### 4.1 macOS TextKit smoke

Command:

```sh
ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-darwin/release \
  swift run \
  --package-path suites/anchor/apple/AnchorAppleSpike \
  --scratch-path /tmp/anchor-apple-stage1/swift-build-textkit-appkit-lifecycle-20260610 \
  AnchorTextKitSmoke
```

Observed build excerpt:

```text
Build of product 'AnchorTextKitSmoke' complete! (32.48s)
```

Observed runtime output:

```text
textkit:patch_replay_split_move_remove=true
utf16:emoji=4 scalars=3 crlf=0
utf16:zwj=11 scalars=7 crlf=0
utf16:combining=7 scalars=7 crlf=0
utf16:crlf=6 scalars=6 crlf=1
utf16:mixed=11 scalars=9 crlf=1
textkit:mac:selected=1:2 layout=true undo=semantic-inverse-intent
textkit:ime_marked=true commit=A拼 intent_insert_at=1
textkit:hittest_index=1
textkit:direct_buffer_undo_suppressed=true
textkit:accessibility_selected_range=1:2
textkit:keyboard_intents=split@1,merge_backward
textkit:appkit_view_lifecycle=insert_move_remove
```

Interpretation:

- The new evidence is `textkit:appkit_view_lifecycle=insert_move_remove`.
- It validates real AppKit `NSView` / `NSTextView` insert / move / remove lifecycle in a controlled adapter harness.
- Existing UTF-16 / IME / hit-testing / direct-buffer undo / accessibility / keyboard / adapter-projection outputs remain unchanged.

### 4.2 iOS Simulator compile surface

Working directory:

```text
/Users/plimeor/Documents/labs/suites/anchor/apple/AnchorAppleSpike
```

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-ios-sim/release \
  xcodebuild \
  -scheme AnchorTextKitProbe \
  -destination 'generic/platform=iOS Simulator' \
  -configuration Debug \
  -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/AnchorTextKitProbe-appkit-lifecycle-iossim-20260610 \
  build
```

Observed excerpt:

```text
isysroot .../Platforms/iPhoneSimulator.platform/Developer/SDKs/iPhoneSimulator26.5.sdk
target arm64-apple-ios17.0-simulator
target x86_64-apple-ios17.0-simulator
Extracted no relevant App Intents symbols, skipping writing output
** BUILD SUCCEEDED **
```

Interpretation:

- The shared `AnchorTextKitProbe` target still builds for iOS Simulator after macOS-only AppKit lifecycle additions.
- This is compile evidence only; it does not prove UIKit / `UITextView` runtime view lifecycle behavior.

### 4.3 Boundary audits

Command:

```sh
git diff --check
```

Observed:

```text
clean, exit 0
```

Command:

```sh
rg -n "CloudKit|CKRecord|CKAsset|CKContainer|CKSyncEngine|NSFileCoordinator|NSMetadataQuery|ubiquit|iCloud|NSURLIsExcludedFromBackupKey" suites/anchor/core
```

Observed:

```text
0 matches, exit 1
```

Command:

```sh
rg -n "diff3|order[-_ ]?key|fractional|merge.*semantic|canonical" suites/anchor/apple
```

Observed:

```text
0 matches, exit 1
```

Command:

```sh
find suites/anchor/apple -name Cargo.lock -print
```

Observed:

```text
0 paths
```

---

## 5. Gate evaluation

| Gate | Result |
|---|---|
| real AppKit `NSView` / `NSTextView` insert / move / remove lifecycle | closed as mechanism floor |
| adapter projection patch replay for insert / move / remove text surfaces | closed / unchanged |
| macOS AppKit keyDown capture for Enter / Delete | closed / unchanged |
| macOS accessibility selected-range readback | closed / unchanged |
| macOS UTF-16 / IME / hit-testing / direct-buffer undo floors | closed / unchanged |
| iOS Simulator TextKit compile surface | closed / observed |
| product AppKit view hierarchy integration | open / not run |
| UIKit / `UITextView` view lifecycle runtime | open / not run |
| product responder-chain / menu / focus routing | open / not run |
| real `anchor-core::dispatch` integration for patches | open / not run |
| CP-1 whole-exit | **not exited** |

Gate evaluation: **CONTINUE**.

---

## 6. Ledger entry

### Ledger entry — 2026-06-10 — iteration 29 — doc 50-textkit-appkit-view-lifecycle-report.md

- **Checkpoint / cursor:** CP-1 Apple half, TextKit product-runtime view lifecycle gate.
- **Action selected:** add a macOS AppKit harness that replays insert / move / remove text-surface patches into a real `NSView` / `NSTextView` hierarchy.
- **Owner classification:** Apple/TextKit view lifecycle verifier → implemented in repo-local spike probe/smoke; no product app shell or core code touched.
- **Scope-fence check:** passed — no root workspace / lockfile / repo product app shell / public CLI schema changes; no `suites/anchor/core/src/**` production source changes; no deterministic core semantics duplicated in Swift; no persistent writes.
- **Evidence (Observed = command + output):**
  - `swift run --package-path suites/anchor/apple/AnchorAppleSpike --scratch-path /tmp/anchor-apple-stage1/swift-build-textkit-appkit-lifecycle-20260610 AnchorTextKitSmoke` → `textkit:appkit_view_lifecycle=insert_move_remove` with existing UTF-16 / IME / hit-testing / direct-buffer undo / accessibility / keyboard / projection-patch outputs.
  - `xcodebuild -scheme AnchorTextKitProbe -destination 'generic/platform=iOS Simulator' ... build` → `** BUILD SUCCEEDED **`.
  - `git diff --check` → clean, exit 0.
  - core cloud-symbol audit → 0 matches, exit 1.
  - Apple deterministic-semantics audit for `diff3|order-key|fractional|merge.*semantic|canonical` → 0 matches, exit 1.
  - Apple `Cargo.lock` audit → 0 paths.
- **Gates closed this iteration:** real AppKit `NSView` / `NSTextView` text-surface insert / move / remove lifecycle mechanism floor.
- **Gates still open:** product AppKit view hierarchy integration, UIKit / `UITextView` view lifecycle runtime, product responder-chain routing, menu command routing, keyboard shortcuts beyond probed events, multi-view focus, real `anchor-core::dispatch` integration for patches/intents, product accessibility mapping, VoiceOver/UI runtime, cross-view accessibility expression, remaining local-only path edge cases, physical iPhone runtime after unlock, iOS/non-macOS CloudDocuments delivery, true remote placeholder, signed-out/over-quota, steady-state segment budget/million-op iCloud context, product conflict-resolution UX/core integration, Android execution, signed app-bundle/device runtime integration, physical-device generated async runtime, Developer ID signing availability.
- **Backfill to 04/06:** `04-contract-baseline.md` TextKit baseline; `06-fixture-set.md` Apple TextKit fixture evidence.
- **Axis matrix delta:** TextKit remains `partial mechanism floor closed`; real AppKit view lifecycle moved from open mechanism evidence to closed, while product integration and UIKit runtime remain open.
- **Gate evaluation:** CONTINUE — next action should target remaining TextKit product-runtime gates, another iCloud edge case, Android execution feasibility, signed app/device runtime integration, or physical-device generated async runtime.
- **New doc:** `docs/workbench/20260606-anchor-v1/50-textkit-appkit-view-lifecycle-report.md`
