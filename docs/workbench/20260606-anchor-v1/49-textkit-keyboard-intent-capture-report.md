# Anchor Stage 1 - TextKit Keyboard Intent Capture Report

任务：CP-1 TextKit product-runtime gate，补足 macOS AppKit `keyDown` keyboard event capture 到 adapter-local `EditorIntentProbe` 的机制证据，并验证 iOS Simulator compile surface。
日期：2026-06-10
状态：**workbench artifact** —— 非公开接口契约；本轮只关闭 macOS `NSEvent.keyDown` capture 机制下限，不关闭产品 responder chain、menu command routing、真实 window focus、iOS `UITextView` runtime 或完整 editor runtime。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**package / workspace / 产品 app / 生成 lockfile / public CLI schema 改动；本轮没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；没有改 `suites/anchor/core/src/**` production source；没有创建 Apple product app shell；没有把 TextKit / Swift event handling 变成文档真理层。代码变更限于 `suites/anchor/apple/AnchorAppleSpike/Sources/AnchorTextKitProbe/AnchorTextKitProbe.swift` 与 `suites/anchor/apple/AnchorAppleSpike/Sources/AnchorTextKitSmoke/main.swift`；构建产物位于 `/tmp/anchor-apple-stage1`。

---

## 1. 结论

**Strongest conclusion：macOS AppKit `NSEvent.keyDown` 可以在 adapter harness 内被捕获并映射成 split / merge-backward intent；这只关闭 keyboard capture 机制下限，不关闭产品 responder chain。**

本轮新增 `IntentCapturingTextView`，用真实 `NSEvent.keyEvent` 驱动 `keyDown(with:)`：

```text
Enter at UTF-16 selection 1 -> splitBlock(blockID: "blk_a", atUTF16: 1)
Delete at UTF-16 selection 0 -> mergeBackward(blockID: "blk_a")
```

Observed output:

```text
textkit:keyboard_intents=split@1,merge_backward
```

This proves the adapter can intercept AppKit keyboard events before treating TextKit as truth, and can express them as portable editor intents. It **does not** prove:

- product app responder-chain routing through menu items / first responder / undo manager;
- keyboard shortcuts beyond the two probed events;
- focus changes across multiple real text views;
- iOS `UITextView` keyboard/input runtime behavior;
- dispatch integration with real `anchor-core::dispatch`.

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| root workspace / package / lockfile | not changed |
| `suites/anchor/core/src/**` | not changed |
| public CLI schema | not changed |
| product app shell | not created |
| TextKit truth ownership | not introduced; events become adapter-local intents |
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

New adapter-local intent shapes:

```text
splitBlock(blockID, atUTF16)
mergeBackward(blockID)
```

New macOS-only harness:

```text
IntentCapturingTextView : NSTextView
MacTextKitRuntimeProbe.keyboardIntentCaptureProbe()
```

`IntentCapturingTextView` uses a minimal `NSTextStorage` / `NSLayoutManager` / `NSTextContainer` stack so `setSelectedRange(NSRange(location: 1, length: 0))` is observable during `keyDown`. An intermediate no-text-container harness produced a split at offset 0; that was a harness invalidity, not a product result.

No core source, product app target, bundle id, entitlement, public CLI schema, or persistent write path is introduced.

---

## 4. Observed evidence

### 4.1 macOS TextKit smoke

Command:

```sh
ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-darwin/release \
  swift run \
  --package-path suites/anchor/apple/AnchorAppleSpike \
  --scratch-path /tmp/anchor-apple-stage1/swift-build-textkit-keyboard-20260610 \
  AnchorTextKitSmoke
```

Observed build excerpt:

```text
Build of product 'AnchorTextKitSmoke' complete! (1.10s)
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
```

Interpretation:

- The new evidence is `textkit:keyboard_intents=split@1,merge_backward`.
- It validates AppKit keyboard event capture in a controlled `NSTextView` harness.
- Existing UTF-16 / IME / hit-testing / direct-buffer undo / accessibility / projection patch replay smoke outputs remain unchanged.

### 4.2 iOS Simulator compile surface

Working directory:

```text
/Users/plimeor/Documents/labs/suites/anchor/apple/AnchorAppleSpike
```

Command:

```sh
rm -rf /tmp/anchor-apple-stage1/DerivedData/AnchorTextKitProbe-keyboard-iossim-20260610
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-ios-sim/release \
  xcodebuild \
  -scheme AnchorTextKitProbe \
  -destination 'generic/platform=iOS Simulator' \
  -configuration Debug \
  -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/AnchorTextKitProbe-keyboard-iossim-20260610 \
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

- The shared `AnchorTextKitProbe` target still builds for iOS Simulator after macOS-only keyboard harness additions.
- This is compile evidence only; it does not prove `UITextView` keyboard/input runtime behavior.

### 4.3 Boundary audits

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
| macOS AppKit keyDown capture for Enter/Delete | closed as mechanism floor |
| adapter projection patch replay for insert/move/remove text surfaces | closed / unchanged |
| macOS accessibility selected-range readback | closed / unchanged |
| macOS UTF-16 / IME / hit-testing / direct-buffer undo floors | closed / unchanged |
| iOS Simulator TextKit compile surface | closed / observed |
| product responder-chain routing | open / not run |
| menu command routing and keyboard shortcuts beyond probed events | open / not run |
| multi-view focus and keyboard routing | open / not run |
| `UITextView` keyboard/input runtime behavior | open / not run |
| real `anchor-core::dispatch` integration for keyboard intents | open / not run |
| CP-1 whole-exit | **not exited** |

Gate evaluation: **CONTINUE**.
