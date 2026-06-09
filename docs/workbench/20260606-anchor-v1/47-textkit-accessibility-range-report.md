# Anchor Stage 1 - TextKit Accessibility Selected Range Report

任务：CP-1 TextKit product-runtime gate，补足 macOS `NSTextView` accessibility selected text range 机制证据，并验证 iOS Simulator compile surface。
日期：2026-06-10
状态：**workbench artifact** —— 非公开接口契约；本轮只关闭 macOS accessibility selected-range readback 机制下限，不关闭产品 accessibility mapping、VoiceOver/UI runtime、iOS `UITextView` runtime 或完整 editor runtime。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**package / workspace / 产品 app / 生成 lockfile / public CLI schema 改动；本轮没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；没有改 `suites/anchor/core/src/**` production source；没有创建 Apple product app shell；没有把 TextKit / accessibility range / Swift 变成文档真理层。代码变更限于 `suites/anchor/apple/AnchorAppleSpike/Sources/AnchorTextKitProbe/AnchorTextKitProbe.swift` 与 `suites/anchor/apple/AnchorAppleSpike/Sources/AnchorTextKitSmoke/main.swift`；构建产物位于 `/tmp/anchor-apple-stage1`。

---

## 1. 结论

**Strongest conclusion：macOS `NSTextView.accessibilitySelectedTextRange()` 可以回读当前 UTF-16 selected range；这只关闭 accessibility selected-range 的机制下限，不关闭产品 accessibility mapping。**

本轮在现有 `AnchorTextKitSmoke` 中新增 macOS probe：

```text
textView.string = "A🍎B"
textView.setSelectedRange(NSRange(location: 1, length: 2))
textView.accessibilitySelectedTextRange() == 1:2
```

Observed output:

```text
textkit:accessibility_selected_range=1:2
```

这证明 AppKit `NSTextView` 的 accessibility selected text range 能与 TextKit/UTF-16 selection readback 对齐，足够作为 adapter 机制证据。它**不**证明以下产品 gate：

- Anchor block model / `EditorSelection` 到 native accessibility tree 的 range mapping；
- VoiceOver / Accessibility Inspector 下的真实 app 行为；
- 多 text view / 跨 block selection 的 accessibility 表达；
- iOS `UITextView` accessibility/runtime 行为；
- responder-chain undo、keyboard event capture、`EditorPatch` replay over splitting/moving views。

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| root workspace / package / lockfile | not changed |
| `suites/anchor/core/src/**` | not changed |
| public CLI schema | not changed |
| product app shell | not created |
| TextKit truth ownership | not introduced; selected range remains adapter mechanism |
| Swift deterministic semantics | not introduced; no diff3 / order-key / merge / normalization / op-creation |
| checkpoint exit | not reached |

---

## 3. Implementation shape

Changed files:

```text
suites/anchor/apple/AnchorAppleSpike/Sources/AnchorTextKitProbe/AnchorTextKitProbe.swift
suites/anchor/apple/AnchorAppleSpike/Sources/AnchorTextKitSmoke/main.swift
```

The probe adds one macOS-only method on `MacTextKitRuntimeProbe`:

```text
accessibilitySelectedTextRangeProbe() -> NSRange
```

The smoke executable preconditions the returned range:

```text
location == 1
length == 2
```

No product app target, bundle id, entitlement, core source, public CLI schema, or persistent write path is introduced.

---

## 4. Observed evidence

### 4.1 macOS TextKit smoke

Command:

```sh
ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-darwin/release \
  swift run \
  --package-path suites/anchor/apple/AnchorAppleSpike \
  --scratch-path /tmp/anchor-apple-stage1/swift-build-textkit-accessibility-20260610 \
  AnchorTextKitSmoke
```

Observed build excerpt from the latest rerun:

```text
Build of product 'AnchorTextKitSmoke' complete! (0.10s)
```

Observed runtime output:

```text
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
```

Interpretation:

- The new evidence is the final `textkit:accessibility_selected_range=1:2` line.
- It is macOS `NSTextView` mechanism evidence only.
- Existing IME / hit-testing / direct-buffer undo smoke outputs remain unchanged.

### 4.2 iOS Simulator compile surface

Working directory:

```text
/Users/plimeor/Documents/labs/suites/anchor/apple/AnchorAppleSpike
```

Command:

```sh
rm -rf /tmp/anchor-apple-stage1/DerivedData/AnchorTextKitProbe-accessibility-iossim-20260610
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-ios-sim/release \
  xcodebuild \
  -scheme AnchorTextKitProbe \
  -destination 'generic/platform=iOS Simulator' \
  -configuration Debug \
  -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/AnchorTextKitProbe-accessibility-iossim-20260610 \
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

- The shared `AnchorTextKitProbe` target still builds for iOS Simulator after the macOS-only accessibility readback probe.
- This is compile evidence only; it does not prove `UITextView` accessibility / IME / responder-chain runtime behavior.

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
| macOS accessibility selected-range readback | closed as mechanism floor |
| macOS UTF-16 fixture smoke | closed / unchanged |
| macOS IME marked-text commit mapping | closed as mechanism floor / unchanged |
| macOS hit-testing insertion index | closed as mechanism floor / unchanged |
| macOS direct buffer undo suppression | closed as controlled probe floor / unchanged |
| iOS Simulator TextKit compile surface | closed / observed |
| product accessibility mapping | open / not run |
| VoiceOver / Accessibility Inspector runtime | open / not run |
| cross-view / cross-block accessibility expression | open / not run |
| `UITextView` runtime accessibility behavior | open / not run |
| real app responder-chain undo suppression | open / not run |
| keyboard event capture -> `EditorIntent` | open / not run |
| `EditorPatch` replay over splitting/moving views | open / not run |
| CP-1 whole-exit | **not exited** |

Gate evaluation: **CONTINUE**.
