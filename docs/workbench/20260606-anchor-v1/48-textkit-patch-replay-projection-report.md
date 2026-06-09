# Anchor Stage 1 - TextKit Patch Replay Projection Report

任务：CP-1 TextKit product-runtime gate，补足 adapter view-model projection 对 split/move/remove 形状 `EditorPatch` 的回放机制证据，并验证 iOS Simulator compile surface。
日期：2026-06-10
状态：**workbench artifact** —— 非公开接口契约；本轮只关闭 `NativeEditorAdapterProbe` projection patch replay 机制下限，不关闭真实 AppKit/UIKit view hierarchy、disappearing/splitting/moving real views、产品 responder chain、keyboard、accessibility 或 iOS `UITextView` runtime。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**package / workspace / 产品 app / 生成 lockfile / public CLI schema 改动；本轮没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；没有改 `suites/anchor/core/src/**` production source；没有创建 Apple product app shell；没有把 TextKit / Swift / projection state 变成文档真理层。代码变更限于 `suites/anchor/apple/AnchorAppleSpike/Sources/AnchorTextKitProbe/AnchorTextKitProbe.swift` 与 `suites/anchor/apple/AnchorAppleSpike/Sources/AnchorTextKitSmoke/main.swift`；构建产物位于 `/tmp/anchor-apple-stage1`。

---

## 1. 结论

**Strongest conclusion：adapter view-model projection 可以回放 insert/move/remove text surface 形状的 patch；这只关闭 projection patch replay 的机制下限，不关闭真实产品 view 生命周期。**

本轮在 `NativeEditorAdapterProbe` 中新增三类 projection patch：

```text
insertTextSurface(afterBlockID, blockID, text, selectionStartUTF16, selectionEndUTF16)
moveTextSurface(blockID, toIndex)
removeTextSurface(blockID)
```

`AnchorTextKitSmoke` 观察到：

```text
textkit:patch_replay_split_move_remove=true
```

这说明 adapter 可以消费 core/editor-core 返回的 patch shape，更新平台侧 view-model projection 的 block 顺序、插入 surface、删除 surface 与 selection。它**不**证明以下产品 gate：

- AppKit/UIKit 真实 view hierarchy 中 view 创建、移除、复用、焦点转移和滚动状态；
- 跨正在消失或移动的真实 `NSTextView` / `UITextView` 的 selection restoration；
- product responder-chain undo / menu-key undo；
- keyboard event capture 到 `EditorIntent`；
- product accessibility mapping / VoiceOver/UI runtime；
- iOS `UITextView` runtime patch replay。

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| root workspace / package / lockfile | not changed |
| `suites/anchor/core/src/**` | not changed |
| public CLI schema | not changed |
| product app shell | not created |
| TextKit truth ownership | not introduced; projection state remains adapter-local |
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

The probe extends only the existing adapter-local `EditorPatchProbe` and `NativeEditorAdapterProbe.apply(_:)` switch. The new cases mutate the local `[TextSurfaceState]` projection:

- insert a new text surface after an existing surface and set its UTF-16 selection;
- move an existing text surface to a bounded index;
- remove a text surface by id.

`AnchorTextKitSmoke` validates this sequence:

```text
["blk_a", "code_1"]
-> insert "blk_b" after "blk_a"
-> ["blk_a", "blk_b", "code_1"]
-> move "code_1" to index 0
-> ["code_1", "blk_a", "blk_b"]
-> remove "blk_b"
-> ["code_1", "blk_a"]
```

No core source, product app target, bundle id, entitlement, public CLI schema, or persistent write path is introduced.

---

## 4. Observed evidence

### 4.1 macOS TextKit smoke

Command:

```sh
ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-darwin/release \
  swift run \
  --package-path suites/anchor/apple/AnchorAppleSpike \
  --scratch-path /tmp/anchor-apple-stage1/swift-build-textkit-patch-replay-20260610 \
  AnchorTextKitSmoke
```

Observed build excerpt:

```text
Build of product 'AnchorTextKitSmoke' complete! (31.77s)
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
```

Interpretation:

- The new evidence is `textkit:patch_replay_split_move_remove=true`.
- It validates adapter-local projection mutation only.
- Existing UTF-16 / IME / hit-testing / direct-buffer undo / accessibility smoke outputs remain unchanged.

### 4.2 iOS Simulator compile surface

Working directory:

```text
/Users/plimeor/Documents/labs/suites/anchor/apple/AnchorAppleSpike
```

Command:

```sh
rm -rf /tmp/anchor-apple-stage1/DerivedData/AnchorTextKitProbe-patch-replay-iossim-20260610
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-ios-sim/release \
  xcodebuild \
  -scheme AnchorTextKitProbe \
  -destination 'generic/platform=iOS Simulator' \
  -configuration Debug \
  -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/AnchorTextKitProbe-patch-replay-iossim-20260610 \
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

- The shared `AnchorTextKitProbe` target still builds for iOS Simulator after projection patch replay additions.
- This is compile evidence only; it does not prove `UITextView` patch replay runtime behavior.

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
| adapter projection patch replay for insert/move/remove text surfaces | closed as mechanism floor |
| macOS UTF-16 fixture smoke | closed / unchanged |
| macOS IME marked-text commit mapping | closed as mechanism floor / unchanged |
| macOS hit-testing insertion index | closed as mechanism floor / unchanged |
| macOS direct buffer undo suppression | closed as controlled probe floor / unchanged |
| macOS accessibility selected-range readback | closed as mechanism floor / unchanged |
| iOS Simulator TextKit compile surface | closed / observed |
| real AppKit/UIKit disappearing/splitting/moving views | open / not run |
| product responder-chain undo suppression | open / not run |
| keyboard event capture -> `EditorIntent` | open / not run |
| product accessibility mapping / VoiceOver runtime | open / not run |
| `UITextView` runtime patch replay / accessibility / IME | open / not run |
| CP-1 whole-exit | **not exited** |

Gate evaluation: **CONTINUE**.
