# Anchor Stage 1 — TextKit Runtime Floor Report

任务：CP-1 TextKit product-runtime gate，补足 macOS `NSTextView` 的 IME marked-text、hit-testing、direct-buffer undo suppression 机制证据，并验证 iOS Simulator compile surface。
日期：2026-06-10
状态：**workbench artifact** —— 非公开接口契约；本轮关闭 TextKit runtime 的机制下限，不关闭完整产品 editor runtime。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**任何 package / workspace / 产品 app / 生成 lockfile / public CLI schema 改动；本轮没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；没有改 `suites/anchor/core/src/**` production source；没有创建 Apple product app shell；没有把 TextKit / Swift 变成文档真理层。新增 probe 行为限于 `suites/anchor/apple/AnchorAppleSpike/Sources/AnchorTextKitProbe/**` 与 `AnchorTextKitSmoke`。

---

## 1. 结论

**Strongest conclusion：TextKit runtime 的机制下限可以从 selection/layout/semantic-undo 扩展到 IME marked-text commit、hit-testing insertion index、controlled direct-buffer undo suppression；但它仍不是产品 editor runtime 完成。**

本轮新增的 macOS `NSTextView` probe 观察到：

- `setMarkedText` 后 `hasMarkedText=true`，`markedRange.location=1`；
- commit 后文本为 `A拼`，并可被映射成 `EditorIntent.insertText(blockID:"blk_a", atUTF16:1, text:"拼")`；
- layout 后 hit-test insertion index 返回 `1`，不是 `NSNotFound`；
- 在 controlled `NSTextView` probe 中设置 `allowsUndo=false` 后，直接 buffer mutation 未被 `textView.undoManager?.undo()` 回滚，输出 `textkit:direct_buffer_undo_suppressed=true`；
- `AnchorTextKitProbe` iOS Simulator library target 在 iOS 17 simulator SDK 下构建成功。

这关闭的是机制下限：TextKit 可以作为输入、layout、IME、hit-testing、view-buffer surface。仍未关闭的是完整产品运行时：真实 app view hierarchy / responder chain、keyboard event capture、accessibility range mapping、patch replay over splitting/moving views、`UITextView` runtime 行为，以及所有写入必须经 `anchor-core::dispatch` 的产品路径。

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| root workspace / package / lockfile | not changed |
| `suites/anchor/core/src/**` | not changed |
| public CLI schema | not changed |
| product app shell | not created |
| TextKit truth ownership | not introduced; buffer remains mechanism-only |
| Swift deterministic semantics | not introduced; no diff3 / order-key / merge / normalization / op-creation |
| checkpoint exit | not reached |

---

## 3. Observed evidence

### 3.1 macOS TextKit smoke

Command:

```sh
ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-darwin/release \
  swift run \
  --package-path suites/anchor/apple/AnchorAppleSpike \
  --scratch-path /tmp/anchor-apple-stage1/swift-build-textkit-20260610 \
  AnchorTextKitSmoke
```

Observed build excerpt:

```text
Build of product 'AnchorTextKitSmoke' complete! (33.16s)
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
```

Interpretation:

- UTF-16 fixture counts for emoji / ZWJ / combining / CRLF / mixed text are still observable in the Swift adapter harness.
- IME marked-text commit maps to a UTF-16 insertion offset without creating a Swift-owned document mutation rule.
- Hit-testing is a TextKit geometry surface, not a persistent selection source of truth.
- Direct TextKit buffer undo suppression is observed only in a controlled macOS `NSTextView` probe; a product app must still prove responder-chain and menu-key undo cannot mutate the buffer outside core dispatch.

### 3.2 iOS Simulator compile surface

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-ios-sim/release \
  xcodebuild \
  -scheme AnchorTextKitProbe \
  -destination 'generic/platform=iOS Simulator' \
  -configuration Debug \
  -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/AnchorTextKitProbe-iossim-20260610 \
  build
```

Observed excerpt:

```text
Resolve Package Graph
Resolved source packages:
  AnchorAppleSpike: /Users/plimeor/Documents/labs/suites/anchor/apple/AnchorAppleSpike
note: Target dependency graph (2 targets)
    Target 'AnchorTextKitProbe' in project 'AnchorAppleSpike'
        ➜ Explicit dependency on target 'AnchorTextKitProbe' in project 'AnchorAppleSpike'
    Target 'AnchorTextKitProbe' in project 'AnchorAppleSpike' (no dependencies)
** BUILD SUCCEEDED **
```

Interpretation:

- The shared `AnchorTextKitProbe` target still builds for iOS Simulator after the macOS-only `NSTextView` runtime probe additions.
- This is compile evidence only; it does not prove `UITextView` IME / accessibility / responder-chain runtime behavior.

### 3.3 Boundary audits

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
rg -n "Swift/TextKit|diff3|order-key|merge|normaliz|op-creation|tree-invariant|canonical_serialize|blake3" suites/anchor/apple
```

Observed:

```text
0 matches, exit 1
```

---

## 4. Gate evaluation

| Gate | Result |
|---|---|
| macOS UTF-16 fixture smoke | closed / observed |
| macOS IME marked-text commit mapping | closed as mechanism floor |
| macOS hit-testing insertion index | closed as mechanism floor |
| macOS direct buffer undo suppression | closed as controlled probe floor |
| iOS Simulator TextKit compile surface | closed / observed |
| real app responder-chain undo suppression | open / not run |
| keyboard event capture → `EditorIntent` | open / not run |
| accessibility range mapping | open / not run |
| `EditorPatch` replay over splitting/moving views | open / not run |
| `UITextView` runtime IME/accessibility behavior | open / not run |
| CP-1 whole-exit | **not exited** |

Gate evaluation: **CONTINUE**.
