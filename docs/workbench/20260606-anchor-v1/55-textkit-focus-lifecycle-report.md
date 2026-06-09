# Anchor Stage 1 - TextKit Focus Lifecycle Report

任务：CP-1 TextKit product-runtime gate，补足 macOS AppKit `NSWindow` + `NSSplitView` + `NSScrollView` 容器内 text surface first-responder 切换与 selection 保持的机制证据，并验证 iOS Simulator compile surface。
日期：2026-06-10
状态：**workbench artifact** —— 非公开接口契约；本轮只关闭 macOS AppKit split/scroll hierarchy focus lifecycle 机制下限，不关闭产品焦点系统、产品窗口/文档生命周期、UIKit / `UITextView` runtime、真实 `anchor-core::dispatch` 集成或完整 editor runtime。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**package / workspace / 产品 app / 生成 lockfile / public CLI schema 改动；本轮没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；没有改 `suites/anchor/core/src/**` production source；没有创建 Apple product app shell；没有把 AppKit window / split view / scroll view / first responder 状态变成文档真理层。代码变更限于 `suites/anchor/apple/AnchorAppleSpike/Sources/AnchorTextKitProbe/AnchorTextKitProbe.swift` 与 `suites/anchor/apple/AnchorAppleSpike/Sources/AnchorTextKitSmoke/main.swift`；构建产物位于 `/tmp/anchor-apple-stage1`。

---

## 1. 结论

**Strongest conclusion：受控 macOS AppKit `NSWindow` + `NSSplitView` + `NSScrollView` hierarchy 可以承载两个 TextKit surface，并通过 first-responder 切换保持各自 block identity 与 UTF-16 selection。**

新增 `appKitFocusLifecycleProbe()`，用真实 AppKit window hierarchy 验证：

```text
textkit:appkit_focus_lifecycle=split_scroll blk_a->code_1 selections=1:0,0:0
```

The probe:

- creates one `NSWindow`;
- installs one vertical `NSSplitView`;
- places two `NSScrollView` containers inside the split view;
- places two `IntentCapturingTextView` document views inside the scroll views;
- switches first responder from `blk_a` to `code_1`;
- verifies both text surface identities and selections survive the focus switch.

This proves the controlled AppKit focus lifecycle mechanism floor for split/scroll-hosted text surfaces. It **does not** prove:

- product focus restoration across document reopen, tabs, sheets, sidebars, or real scroll state;
- product window controller / SwiftUI scene integration;
- UIKit / `UITextView` focus runtime;
- end-to-end `anchor-core::dispatch` integration;
- product keyboard shortcut routing across all focus regions.

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| root workspace / package / lockfile | not changed |
| `suites/anchor/core/src/**` | not changed |
| public CLI schema | not changed |
| product app shell | not created |
| AppKit focus truth ownership | not introduced; focus state stays adapter-local |
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
AppKitFocusLifecycleResult
MacTextKitRuntimeProbe.appKitFocusLifecycleProbe()
```

The probe constructs a split/scroll hierarchy rather than a flat view container. It then switches the window first responder across two text surfaces and reads back both first responder identity and per-surface selection.

---

## 4. Observed evidence

### 4.1 macOS TextKit smoke

Command:

```sh
ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-darwin/release \
  swift run \
  --package-path suites/anchor/apple/AnchorAppleSpike \
  --scratch-path /tmp/anchor-apple-stage1/swift-build-textkit-focus-lifecycle-20260610 \
  AnchorTextKitSmoke
```

Observed build excerpt:

```text
Build of product 'AnchorTextKitSmoke' complete! (32.24s)
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
textkit:appkit_focus_lifecycle=split_scroll blk_a->code_1 selections=1:0,0:0
```

Interpretation:

- The new evidence is `textkit:appkit_focus_lifecycle=split_scroll blk_a->code_1 selections=1:0,0:0`.
- The smoke preconditions assert two split subviews, document view ids `["blk_a", "code_1"]`, first responder acceptance for both surfaces, first responder identity readback after each switch, and preserved selections `1:0` / `0:0`.
- Existing UTF-16 / IME / hit-testing / direct-buffer undo / direct key capture / AppKit view lifecycle / first-responder / accessibility / menu-command / responder-undo outputs remain unchanged.

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
  -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/AnchorTextKitProbe-focus-lifecycle-iossim-20260610 \
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

- The shared `AnchorTextKitProbe` target still builds for iOS Simulator after macOS-only focus lifecycle additions.
- This is compile evidence only; it does not prove UIKit / `UITextView` focus lifecycle runtime behavior.

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
| macOS AppKit split/scroll focus lifecycle across two text surfaces | closed as mechanism floor |
| macOS AppKit responder-chain `undo:` suppression into semantic undo | closed / unchanged |
| macOS AppKit selector / menu item sender routing for split / merge-backward | closed / unchanged |
| macOS AppKit first-responder keyboard routing | closed / unchanged |
| macOS AppKit accessibility hierarchy across two text surfaces | closed / unchanged |
| real AppKit `NSView` / `NSTextView` insert / move / remove lifecycle | closed / unchanged |
| iOS Simulator TextKit compile surface | closed / observed |
| product focus lifecycle across real windows / tabs / sheets / sidebars / restored scroll state | open / not run |
| product menu command system | open / not run |
| product undo grouping / inverse-op dispatch | open / not run |
| UIKit / `UITextView` menu / keyboard / view lifecycle / IME / accessibility / undo / focus runtime | open / not run |
| real `anchor-core::dispatch` integration | open / not run |
| CP-1 whole-exit | **not exited** |

Gate evaluation: **CONTINUE**. This closes one additional AppKit split/scroll focus lifecycle mechanism floor only; CP-1 remains gated by product runtime integration, UIKit runtime, iCloud delivery, physical-device runtime, Android execution, signed app/device runtime, Developer ID / notarization / release, and human sign-off.

---

## 6. Ledger entry

### Ledger entry - 2026-06-10 - iteration 34 - doc 55-textkit-focus-lifecycle-report.md

- **Checkpoint / cursor:** CP-1 Apple half, TextKit product-runtime focus lifecycle gate.
- **Action selected:** add a macOS AppKit `NSWindow` + `NSSplitView` + `NSScrollView` harness that switches first responder between two text surfaces and verifies identity/selection preservation.
- **Owner classification:** Apple/TextKit focus lifecycle verifier -> implemented in repo-local spike probe/smoke; no product app shell or core code touched.
- **Scope-fence check:** passed — no root workspace / lockfile / repo product app shell / public CLI schema changes; no `suites/anchor/core/src/**` production source changes; no deterministic core semantics duplicated in Swift; no persistent writes.
- **Evidence (Observed = command + output):**
  - `swift run --package-path suites/anchor/apple/AnchorAppleSpike --scratch-path /tmp/anchor-apple-stage1/swift-build-textkit-focus-lifecycle-20260610 AnchorTextKitSmoke` -> `textkit:appkit_focus_lifecycle=split_scroll blk_a->code_1 selections=1:0,0:0` with existing UTF-16 / IME / hit-testing / direct-buffer undo / direct key capture / AppKit view lifecycle / first-responder / accessibility / menu-command / responder-undo outputs.
  - `xcodebuild -scheme AnchorTextKitProbe -destination 'generic/platform=iOS Simulator' ... build` -> `** BUILD SUCCEEDED **`.
  - `git diff --check` -> clean, exit 0.
  - core cloud-symbol audit -> 0 matches, exit 1.
  - Apple deterministic-semantics audit for `diff3|order-key|fractional|merge.*semantic|canonical` -> 0 matches, exit 1.
  - Apple `Cargo.lock` audit -> 0 paths.
- **Gates closed this iteration:** macOS AppKit split/scroll focus lifecycle across two text surfaces, as mechanism floor.
- **Gates still open:** product focus lifecycle across real windows / tabs / sheets / sidebars / restored scroll state, product menu command system, product undo grouping / inverse-op dispatch, UIKit keyboard/menu/view lifecycle/IME/accessibility/undo/focus runtime, real `anchor-core::dispatch` integration, product accessibility mapping, VoiceOver/UI runtime, polished cross-block continuous native selection, remaining local-only path edge cases, physical iPhone runtime after unlock, iOS/non-macOS CloudDocuments delivery, true remote placeholder, signed-out/over-quota, steady-state segment budget/million-op iCloud context, product conflict-resolution UX/core integration, Android execution, signed app-bundle/device runtime integration, physical-device generated async runtime, Developer ID signing availability.
- **Backfill to 04/06:** `04-contract-baseline.md` TextKit baseline; `06-fixture-set.md` Apple TextKit fixture evidence.
- **Axis matrix delta:** TextKit remains `partial mechanism floor closed`; macOS AppKit split/scroll focus lifecycle moved from open mechanism evidence to closed, while full product focus lifecycle, UIKit runtime, and dispatch integration remain open.
- **Gate evaluation:** CONTINUE — next action should target remaining TextKit product-runtime gates, another iCloud edge case, Android execution feasibility, signed app/device runtime integration, or physical-device generated async runtime.
- **New doc:** `docs/workbench/20260606-anchor-v1/55-textkit-focus-lifecycle-report.md`
