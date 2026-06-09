# Anchor Stage 1 - TextKit Responder Undo Suppression Report

任务：CP-1 TextKit product-runtime gate，补足 macOS AppKit responder-chain `undo:` selector 不直接回滚 TextKit buffer、而是路由到 adapter-owned semantic undo 的机制证据，并验证 iOS Simulator compile surface。
日期：2026-06-10
状态：**workbench artifact** —— 非公开接口契约；本轮只关闭 macOS AppKit responder-chain undo suppression 机制下限，不关闭产品菜单系统、产品焦点生命周期、UIKit / `UITextView` runtime、真实 `anchor-core::dispatch` 集成或完整 editor runtime。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**package / workspace / 产品 app / 生成 lockfile / public CLI schema 改动；本轮没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；没有改 `suites/anchor/core/src/**` production source；没有创建 Apple product app shell；没有把 AppKit undo stack / responder chain / first responder 状态变成文档真理层。代码变更限于 `suites/anchor/apple/AnchorAppleSpike/Sources/AnchorTextKitProbe/AnchorTextKitProbe.swift` 与 `suites/anchor/apple/AnchorAppleSpike/Sources/AnchorTextKitSmoke/main.swift`；构建产物位于 `/tmp/anchor-apple-stage1`。

---

## 1. 结论

**Strongest conclusion：受控 macOS AppKit responder-chain `undo:` selector 可以被 adapter 明确路由到 semantic undo manager；本 probe 观察到 semantic inverse intent 触发，同时 TextKit buffer 保持不变且 `NSTextView.allowsUndo == false`。**

新增 `appKitResponderUndoSuppressionProbe()`，用真实 `NSWindow` + `NSTextView` subclass surface 验证：

```text
textkit:appkit_responder_undo=semantic-inverse-intent buffer_unchanged=true
```

The probe:

- sets the text view buffer to `edited text`;
- disables TextKit direct undo with `textView.allowsUndo = false`;
- routes the AppKit `undo:` selector through first responder to an adapter-owned `UndoManager`;
- asserts semantic undo recorded `semantic-inverse-intent`;
- asserts the TextKit buffer remains `edited text`.

This proves the controlled AppKit responder-chain undo suppression mechanism floor. It **does not** prove:

- product menu validation / shortcut conflict behavior;
- product focus lifecycle across real document windows, scroll views, split views, or sheets;
- UIKit / `UITextView` responder-chain undo runtime;
- end-to-end core inverse-op dispatch;
- product-level undo grouping across multiple blocks or embedded editors.

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| root workspace / package / lockfile | not changed |
| `suites/anchor/core/src/**` | not changed |
| public CLI schema | not changed |
| product app shell | not created |
| AppKit undo truth ownership | not introduced; undo routing stays adapter-local |
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
AppKitResponderUndoSuppressionResult
MacTextKitRuntimeProbe.appKitResponderUndoSuppressionProbe()
```

`IntentCapturingTextView` now has an explicit `undo(_:)` responder method that calls an adapter-provided semantic undo handler. The probe leaves the TextKit view with `allowsUndo = false`, invokes the first responder action using a typed selector, and verifies semantic undo event emission without direct buffer rollback.

---

## 4. Observed evidence

### 4.1 macOS TextKit smoke

Command:

```sh
ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-darwin/release \
  swift run \
  --package-path suites/anchor/apple/AnchorAppleSpike \
  --scratch-path /tmp/anchor-apple-stage1/swift-build-textkit-responder-undo-20260610b \
  AnchorTextKitSmoke
```

Observed build excerpt:

```text
Build of product 'AnchorTextKitSmoke' complete! (32.07s)
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
textkit:appkit_accessibility_children=2 ranges=1:2,0:3
textkit:appkit_menu_commands=blk_a:split@1,code_1:merge_backward
textkit:appkit_responder_undo=semantic-inverse-intent buffer_unchanged=true
```

Interpretation:

- The new evidence is `textkit:appkit_responder_undo=semantic-inverse-intent buffer_unchanged=true`.
- The smoke preconditions assert `undoActionHandled == true`, `semanticUndoEvents == ["semantic-inverse-intent"]`, `textAfterUndoAction == "edited text"`, and `textViewAllowsUndo == false`.
- Existing UTF-16 / IME / hit-testing / direct-buffer undo / direct key capture / AppKit view lifecycle / first-responder / accessibility / menu-command outputs remain unchanged.

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
  -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/AnchorTextKitProbe-responder-undo-iossim-20260610 \
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

- The shared `AnchorTextKitProbe` target still builds for iOS Simulator after macOS-only responder undo additions.
- This is compile evidence only; it does not prove UIKit / `UITextView` responder-chain undo runtime behavior.

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
| macOS AppKit responder-chain `undo:` suppression into semantic undo | closed as mechanism floor |
| macOS AppKit selector / menu item sender routing for split / merge-backward | closed / unchanged |
| macOS AppKit first-responder keyboard routing | closed / unchanged |
| macOS AppKit accessibility hierarchy across two text surfaces | closed / unchanged |
| real AppKit `NSView` / `NSTextView` insert / move / remove lifecycle | closed / unchanged |
| iOS Simulator TextKit compile surface | closed / observed |
| product menu command system | open / not run |
| product focus lifecycle across real windows / scroll views / split views | open / not run |
| product undo grouping / inverse-op dispatch | open / not run |
| UIKit / `UITextView` menu / keyboard / view lifecycle / IME / accessibility / undo runtime | open / not run |
| real `anchor-core::dispatch` integration | open / not run |
| CP-1 whole-exit | **not exited** |

Gate evaluation: **CONTINUE**. This closes one additional AppKit responder-chain undo suppression mechanism floor only; CP-1 remains gated by product runtime integration, UIKit runtime, iCloud delivery, physical-device runtime, Android execution, signed app/device runtime, Developer ID / notarization / release, and human sign-off.

---

## 6. Ledger entry

### Ledger entry - 2026-06-10 - iteration 33 - doc 54-textkit-responder-undo-suppression-report.md

- **Checkpoint / cursor:** CP-1 Apple half, TextKit product-runtime responder-chain undo gate.
- **Action selected:** add a macOS AppKit first-responder `undo:` selector harness that routes undo to adapter-owned semantic undo while keeping TextKit direct undo disabled.
- **Owner classification:** Apple/TextKit responder undo verifier -> implemented in repo-local spike probe/smoke; no product app shell or core code touched.
- **Scope-fence check:** passed — no root workspace / lockfile / repo product app shell / public CLI schema changes; no `suites/anchor/core/src/**` production source changes; no deterministic core semantics duplicated in Swift; no persistent writes.
- **Evidence (Observed = command + output):**
  - `swift run --package-path suites/anchor/apple/AnchorAppleSpike --scratch-path /tmp/anchor-apple-stage1/swift-build-textkit-responder-undo-20260610b AnchorTextKitSmoke` -> `textkit:appkit_responder_undo=semantic-inverse-intent buffer_unchanged=true` with existing UTF-16 / IME / hit-testing / direct-buffer undo / direct key capture / AppKit view lifecycle / first-responder / accessibility / menu-command outputs.
  - `xcodebuild -scheme AnchorTextKitProbe -destination 'generic/platform=iOS Simulator' ... build` -> `** BUILD SUCCEEDED **`.
  - `git diff --check` -> clean, exit 0.
  - core cloud-symbol audit -> 0 matches, exit 1.
  - Apple deterministic-semantics audit for `diff3|order-key|fractional|merge.*semantic|canonical` -> 0 matches, exit 1.
  - Apple `Cargo.lock` audit -> 0 paths.
- **Gates closed this iteration:** macOS AppKit responder-chain `undo:` suppression into adapter-owned semantic undo, as mechanism floor.
- **Gates still open:** product menu command system, product focus lifecycle across real windows / scroll views / split views, product undo grouping / inverse-op dispatch, UIKit keyboard/menu/view lifecycle/IME/accessibility/undo runtime, real `anchor-core::dispatch` integration, product accessibility mapping, VoiceOver/UI runtime, polished cross-block continuous native selection, remaining local-only path edge cases, physical iPhone runtime after unlock, iOS/non-macOS CloudDocuments delivery, true remote placeholder, signed-out/over-quota, steady-state segment budget/million-op iCloud context, product conflict-resolution UX/core integration, Android execution, signed app-bundle/device runtime integration, physical-device generated async runtime, Developer ID signing availability.
- **Backfill to 04/06:** `04-contract-baseline.md` TextKit baseline; `06-fixture-set.md` Apple TextKit fixture evidence.
- **Axis matrix delta:** TextKit remains `partial mechanism floor closed`; macOS AppKit responder-chain undo suppression moved from open mechanism evidence to closed, while product undo grouping / inverse-op dispatch, product menu/focus lifecycle, UIKit runtime, and dispatch integration remain open.
- **Gate evaluation:** CONTINUE — next action should target remaining TextKit product-runtime gates, another iCloud edge case, Android execution feasibility, signed app/device runtime integration, or physical-device generated async runtime.
- **New doc:** `docs/workbench/20260606-anchor-v1/54-textkit-responder-undo-suppression-report.md`
