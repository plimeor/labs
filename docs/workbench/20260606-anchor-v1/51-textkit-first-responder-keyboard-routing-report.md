# Anchor Stage 1 - TextKit First-Responder Keyboard Routing Report

任务：CP-1 TextKit product-runtime gate，补足 macOS AppKit `NSWindow` first-responder keyboard routing 到当前 text surface adapter 的机制证据，并验证 iOS Simulator compile surface。
日期：2026-06-10
状态：**workbench artifact** —— 非公开接口契约；本轮只关闭 macOS AppKit first-responder keyboard routing 机制下限，不关闭产品 menu command routing、真实 window focus 生命周期、UIKit / `UITextView` runtime 或完整 editor runtime。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**package / workspace / 产品 app / 生成 lockfile / public CLI schema 改动；本轮没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；没有改 `suites/anchor/core/src/**` production source；没有创建 Apple product app shell；没有把 AppKit responder / view identity 变成文档真理层。代码变更限于 `suites/anchor/apple/AnchorAppleSpike/Sources/AnchorTextKitProbe/AnchorTextKitProbe.swift` 与 `suites/anchor/apple/AnchorAppleSpike/Sources/AnchorTextKitSmoke/main.swift`；构建产物位于 `/tmp/anchor-apple-stage1`。

---

## 1. 结论

**Strongest conclusion：macOS AppKit first-responder keyboard routing 的机制下限成立；`NSWindow.makeFirstResponder` + `NSWindow.sendEvent` 可把键盘事件送到当前 focused `NSTextView` adapter。**

本轮新增 `appKitFirstResponderKeyboardProbe()`，用真实 `NSWindow` 和两个 `IntentCapturingTextView` 验证：

```text
first responder blk_a + Enter  -> splitBlock(blockID: "blk_a", atUTF16: 1)
first responder code_1 + Delete -> mergeBackward(blockID: "code_1")
```

新增 smoke 输出：

```text
textkit:appkit_first_responder_keyboard=blk_a:split@1,code_1:merge_backward
```

This closes a controlled AppKit first-responder routing floor. It **does not** prove:

- product menu command routing or app command validation;
- focus changes across a real product window lifecycle, scroll views, split views, or restored windows;
- keyboard shortcuts beyond Enter/Delete;
- UIKit / `UITextView` runtime keyboard routing;
- end-to-end dispatch through real `anchor-core::dispatch`.

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| root workspace / package / lockfile | not changed |
| `suites/anchor/core/src/**` | not changed |
| public CLI schema | not changed |
| product app shell | not created |
| AppKit responder truth ownership | not introduced; responder state stays adapter-local |
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

New macOS-only probe shape:

```text
AppKitFirstResponderKeyboardResult
MacTextKitRuntimeProbe.appKitFirstResponderKeyboardProbe()
```

The probe creates one `NSWindow`, adds two `IntentCapturingTextView` instances, switches first responder from `blk_a` to `code_1`, and sends keyDown events through `NSWindow.sendEvent`. The adapter captures only portable editor intents; no AppKit responder or view identity enters the persistent model.

---

## 4. Observed evidence

### 4.1 macOS TextKit smoke

Command:

```sh
ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-darwin/release \
  swift run \
  --package-path suites/anchor/apple/AnchorAppleSpike \
  --scratch-path /tmp/anchor-apple-stage1/swift-build-textkit-first-responder-20260610 \
  AnchorTextKitSmoke
```

Observed build excerpt:

```text
Build of product 'AnchorTextKitSmoke' complete! (31.82s)
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
textkit:appkit_first_responder_keyboard=blk_a:split@1,code_1:merge_backward
```

Interpretation:

- The new evidence is `textkit:appkit_first_responder_keyboard=blk_a:split@1,code_1:merge_backward`.
- It validates AppKit first-responder keyboard routing in a controlled two-view `NSWindow` harness.
- Existing UTF-16 / IME / hit-testing / direct-buffer undo / accessibility / keyboard direct-capture / AppKit view lifecycle outputs remain unchanged.

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
  -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/AnchorTextKitProbe-first-responder-iossim-20260610 \
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

- The shared `AnchorTextKitProbe` target still builds for iOS Simulator after macOS-only first-responder additions.
- This is compile evidence only; it does not prove UIKit / `UITextView` runtime routing.

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
| macOS AppKit first-responder keyboard routing across two `NSTextView` surfaces | closed as mechanism floor |
| macOS AppKit keyDown capture for Enter/Delete | closed / unchanged |
| real AppKit `NSView` / `NSTextView` insert / move / remove lifecycle | closed / unchanged |
| adapter projection patch replay for insert / move / remove text surfaces | closed / unchanged |
| macOS accessibility selected-range readback | closed / unchanged |
| iOS Simulator TextKit compile surface | closed / observed |
| product menu command routing | open / not run |
| product focus lifecycle across real windows / scroll views / split views | open / not run |
| UIKit / `UITextView` keyboard routing runtime | open / not run |
| real `anchor-core::dispatch` integration for keyboard intents | open / not run |
| CP-1 whole-exit | **not exited** |

Gate evaluation: **CONTINUE**.

---

## 6. Ledger entry

### Ledger entry — 2026-06-10 — iteration 30 — doc 51-textkit-first-responder-keyboard-routing-report.md

- **Checkpoint / cursor:** CP-1 Apple half, TextKit product-runtime first-responder keyboard routing gate.
- **Action selected:** add a macOS AppKit `NSWindow` harness that routes keyDown events through first responder selection to two different `NSTextView` adapter surfaces.
- **Owner classification:** Apple/TextKit responder verifier → implemented in repo-local spike probe/smoke; no product app shell or core code touched.
- **Scope-fence check:** passed — no root workspace / lockfile / repo product app shell / public CLI schema changes; no `suites/anchor/core/src/**` production source changes; no deterministic core semantics duplicated in Swift; no persistent writes.
- **Evidence (Observed = command + output):**
  - `swift run --package-path suites/anchor/apple/AnchorAppleSpike --scratch-path /tmp/anchor-apple-stage1/swift-build-textkit-first-responder-20260610 AnchorTextKitSmoke` → `textkit:appkit_first_responder_keyboard=blk_a:split@1,code_1:merge_backward` with existing UTF-16 / IME / hit-testing / direct-buffer undo / accessibility / direct key capture / AppKit view lifecycle outputs.
  - `xcodebuild -scheme AnchorTextKitProbe -destination 'generic/platform=iOS Simulator' ... build` → `** BUILD SUCCEEDED **`.
  - `git diff --check` → clean, exit 0.
  - core cloud-symbol audit → 0 matches, exit 1.
  - Apple deterministic-semantics audit for `diff3|order-key|fractional|merge.*semantic|canonical` → 0 matches, exit 1.
  - Apple `Cargo.lock` audit → 0 paths.
- **Gates closed this iteration:** macOS AppKit first-responder keyboard routing across two text surfaces.
- **Gates still open:** product menu command routing, product focus lifecycle across real windows / scroll views / split views, UIKit / `UITextView` keyboard routing runtime, real `anchor-core::dispatch` integration for keyboard intents and patches, product accessibility mapping, VoiceOver/UI runtime, cross-view accessibility expression, remaining local-only path edge cases, physical iPhone runtime after unlock, iOS/non-macOS CloudDocuments delivery, true remote placeholder, signed-out/over-quota, steady-state segment budget/million-op iCloud context, product conflict-resolution UX/core integration, Android execution, signed app-bundle/device runtime integration, physical-device generated async runtime, Developer ID signing availability.
- **Backfill to 04/06:** `04-contract-baseline.md` TextKit baseline; `06-fixture-set.md` Apple TextKit fixture evidence.
- **Axis matrix delta:** TextKit remains `partial mechanism floor closed`; macOS AppKit first-responder routing moved from open mechanism evidence to closed, while product menu/focus lifecycle and UIKit runtime remain open.
- **Gate evaluation:** CONTINUE — next action should target remaining TextKit product-runtime gates, another iCloud edge case, Android execution feasibility, signed app/device runtime integration, or physical-device generated async runtime.
- **New doc:** `docs/workbench/20260606-anchor-v1/51-textkit-first-responder-keyboard-routing-report.md`
