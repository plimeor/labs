# Anchor Stage 1 - UIKit Responder Undo Report

任务：CP-1 TextKit / UIKit product-runtime gate，补足 iOS Simulator 上 `UITextView` responder target-action 到 adapter-owned grouped `UndoManager` semantic inverse 的机制证据。
日期：2026-06-10
状态：**workbench artifact** —— 非公开接口契约；本轮只关闭 iOS Simulator SwiftPM executable 下的 UIKit responder undo 机制下限，不关闭产品 app-hosted UIKit responder chain、真实 `UIApplication` command dispatch、跨 document window undo grouping、产品 inverse-op dispatch、VoiceOver/UI runtime 或真实 `anchor-core::dispatch` 集成。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**package / workspace / 产品 app / 生成 lockfile / public CLI schema 改动；本轮没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；没有改 `suites/anchor/core/src/**` production source；没有创建 Apple product app shell、entitlement、bundle id 或 iCloud container；没有把 UIKit / `UITextView` / `UndoManager` / responder identity / selection 变成文档真理层。代码变更限于 `suites/anchor/apple/AnchorAppleSpike/Sources/AnchorTextKitProbe/AnchorTextKitProbe.swift` 与 `suites/anchor/apple/AnchorAppleSpike/Sources/AnchorTextKitSmoke/main.swift`；构建产物位于 `/tmp/anchor-apple-stage1`。

---

## 1. 结论

**Strongest conclusion：iOS Simulator 中的 `UITextView` responder target-action 可以把 `undo(_:)` 路由到 adapter-owned grouped `UndoManager` semantic inverse；执行后 `UITextView.text` buffer 保持不变。**

Observed runtime output:

```text
textkit:ui_responder_undo=semantic-inverse-intent buffer_unchanged=true
```

这证明的是受控 UIKit responder undo 机制下限，不证明：

- 产品 app-hosted UIKit responder chain；
- `UIApplication` / scene / window command dispatch；
- cross-document undo grouping；
- inverse-op dispatch into real `anchor-core::dispatch`；
- VoiceOver / Accessibility Inspector runtime。

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| root workspace / package / lockfile | not changed |
| `suites/anchor/core/src/**` | not changed |
| public CLI schema | not changed |
| product app shell | not created |
| Apple project / entitlement / bundle id | not created or changed |
| UIKit undo truth ownership | not introduced; undo state stays adapter-local |
| deterministic core semantics in Swift | not introduced |
| persistent writes | none |

---

## 3. Implementation shape

Changed files:

```text
suites/anchor/apple/AnchorAppleSpike/Sources/AnchorTextKitProbe/AnchorTextKitProbe.swift
suites/anchor/apple/AnchorAppleSpike/Sources/AnchorTextKitSmoke/main.swift
```

New iOS-only probe:

```text
UIKitTextViewRuntimeProbe.responderUndoSuppressionProbe()
```

The probe:

- creates a `UIKitResponderUndoTextView`;
- overrides its `undoManager` to return an adapter-owned `UndoManager`;
- registers a grouped semantic inverse action named `Anchor semantic inverse`;
- uses `UIKeyCommand(input: "z", modifierFlags: [.command])` as the undo sender;
- resolves `undo(_:)` through `target(forAction:withSender:)`;
- invokes the resolved target and asserts one `semantic-inverse-intent` event;
- asserts the `UITextView.text` buffer remains `edited text`;
- asserts `canUndo` is true before action and false after the grouped undo is consumed.

---

## 4. Observed evidence

### 4.1 macOS TextKit smoke

Command:

```sh
swift run \
  --package-path suites/anchor/apple/AnchorAppleSpike \
  --scratch-path /tmp/anchor-apple-stage1/swift-build-textkit-ui-responder-undo-20260610 \
  AnchorTextKitSmoke
```

Observed output:

```text
Build of product 'AnchorTextKitSmoke' complete! (32.40s)
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

- Existing macOS AppKit / TextKit smoke outputs remain green after adding the iOS-only UIKit responder undo probe.

### 4.2 iOS Simulator executable build

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild \
  -scheme AnchorTextKitSmoke \
  -destination 'generic/platform=iOS Simulator' \
  -configuration Debug \
  -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/AnchorTextKitSmoke-ui-responder-undo-iossim-20260610 \
  OTHER_SWIFT_FLAGS=-parse-as-library \
  build
```

Observed output:

```text
Signing Identity:     "Sign to Run Locally"
** BUILD SUCCEEDED **
```

Interpretation:

- The `AnchorTextKitSmoke` SwiftPM executable still builds as an iOS Simulator binary after adding the responder undo probe.

### 4.3 iOS Simulator runtime

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun simctl spawn A1D90DAB-1FAC-413A-BCB4-F92B9F798F75 \
  /tmp/anchor-apple-stage1/DerivedData/AnchorTextKitSmoke-ui-responder-undo-iossim-20260610/Build/Products/Debug-iphonesimulator/AnchorTextKitSmoke
```

Observed output:

```text
textkit:patch_replay_split_move_remove=true
utf16:emoji=4 scalars=3 crlf=0
utf16:zwj=11 scalars=7 crlf=0
utf16:combining=7 scalars=7 crlf=0
utf16:crlf=6 scalars=6 crlf=1
utf16:mixed=11 scalars=9 crlf=1
textkit:ui_textview_runtime=selection=1:2 marked=1:1 commit=A拼 input=split@1,merge_backward hierarchy=blk_a,code_1 labels=2
textkit:ui_view_lifecycle=insert_move_remove
textkit:ui_menu_commands=blk_a:split@1,code_1:merge_backward
textkit:ui_responder_undo=semantic-inverse-intent buffer_unchanged=true
```

Interpretation:

- The new evidence is `textkit:ui_responder_undo=semantic-inverse-intent buffer_unchanged=true`.
- This is actual iOS Simulator process execution via `simctl spawn`, not compile-only evidence.

### 4.4 iOS Simulator compile surface

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-ios-sim/release \
  xcodebuild \
  -scheme AnchorTextKitProbe \
  -destination 'generic/platform=iOS Simulator' \
  -configuration Debug \
  -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/AnchorTextKitProbe-ui-responder-undo-iossim-20260610 \
  build | tail -n 40
```

Observed output:

```text
2026-06-10 05:17:31.929 xcodebuild[25252:1852929] [MT] IDERunDestination: Supported platforms for the buildables in the current scheme is empty.
2026-06-10 05:17:37.432 appintentsmetadataprocessor[25821:1853954] Extracted no relevant App Intents symbols, skipping writing output
** BUILD SUCCEEDED **
```

Interpretation:

- The shared `AnchorTextKitProbe` target still builds for iOS Simulator after the iOS-only responder undo additions.

### 4.5 Boundary audits

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
printf 'rg_exit=%s\n' "$?"
```

Observed:

```text
rg_exit=1
```

Command:

```sh
rg -n "diff3|order-key|fractional|merge.*semantic|canonical" suites/anchor/apple
printf 'rg_exit=%s\n' "$?"
```

Observed:

```text
rg_exit=1
```

Command:

```sh
find suites/anchor/apple -name Cargo.lock -print
```

Observed:

```text
0 paths
```

Interpretation:

- No root/workspace/lockfile drift was introduced.
- `anchor-core` remains free of Apple cloud / file-coordination / ubiquity symbols.
- Apple probe code still has no Swift/TextKit-side deterministic core semantics matching the audit pattern.

---

## 5. Gate evaluation

| Gate | Result |
|---|---|
| iOS Simulator `UITextView` responder target-action to `undo(_:)` | closed as mechanism floor |
| adapter-owned grouped `UndoManager` semantic inverse | closed as mechanism floor |
| direct UIKit text buffer mutation during undo routing | not observed; buffer stayed `edited text` |
| product app-hosted UIKit responder chain | open / not run |
| cross-window / cross-document undo grouping | open / not run |
| product inverse-op dispatch through `anchor-core::dispatch` | open / not run |
| VoiceOver / Accessibility Inspector runtime | open / not run |

Gate evaluation: **CONTINUE**. This closes the iOS Simulator UIKit responder undo mechanism floor only; CP-1 remains gated by product runtime integration, app-hosted UIKit focus/window/menu/accessibility gates, iCloud delivery, physical-device runtime, Android execution, signed app/device runtime, Developer ID / notarization / release, and human sign-off.

---

## 6. Ledger entry

### Ledger entry - 2026-06-10 - iteration 38 - doc 59-uikit-responder-undo-report.md

- **Checkpoint / cursor:** CP-1 Apple half, TextKit/UIKit product-runtime gate.
- **Action selected:** add and execute an iOS Simulator `UITextView` responder target-action undo harness using adapter-owned grouped `UndoManager`.
- **Owner classification:** Apple/UIKit verifier -> implemented in repo-local spike probe/smoke; no product app shell or core code touched.
- **Scope-fence check:** passed — no root workspace / lockfile / repo product app shell / public CLI schema changes; no `suites/anchor/core/src/**` production source changes; no deterministic core semantics duplicated in Swift; no persistent writes.
- **Evidence (Observed = command + output):**
  - `swift run --package-path suites/anchor/apple/AnchorAppleSpike --scratch-path /tmp/anchor-apple-stage1/swift-build-textkit-ui-responder-undo-20260610 AnchorTextKitSmoke` -> existing macOS AppKit / TextKit smoke outputs unchanged, including `textkit:appkit_responder_undo=semantic-inverse-intent buffer_unchanged=true`.
  - `xcodebuild -scheme AnchorTextKitSmoke -destination 'generic/platform=iOS Simulator' ... OTHER_SWIFT_FLAGS=-parse-as-library build` -> `** BUILD SUCCEEDED **`.
  - `xcrun simctl spawn A1D90DAB-1FAC-413A-BCB4-F92B9F798F75 .../AnchorTextKitSmoke` -> `textkit:ui_responder_undo=semantic-inverse-intent buffer_unchanged=true` with existing `textkit:ui_textview_runtime=selection=1:2 marked=1:1 commit=A拼 input=split@1,merge_backward hierarchy=blk_a,code_1 labels=2`, `textkit:ui_view_lifecycle=insert_move_remove`, and `textkit:ui_menu_commands=blk_a:split@1,code_1:merge_backward`.
  - `xcodebuild -scheme AnchorTextKitProbe -destination 'generic/platform=iOS Simulator' ... build` -> `** BUILD SUCCEEDED **`.
  - `git diff --check` -> clean, exit 0.
  - core cloud-symbol audit -> 0 matches, exit 1.
  - Apple deterministic-semantics audit for `diff3|order-key|fractional|merge.*semantic|canonical` -> 0 matches, exit 1.
  - Apple `Cargo.lock` audit -> 0 paths.
- **Gates closed this iteration:** iOS Simulator UIKit responder target-action undo routing to adapter-owned grouped semantic undo, as mechanism floor.
- **Gates still open:** product app-hosted UIKit focus/window lifecycle, product app-hosted UIKit patch replay across real document windows/tabs/sheets/restored scroll state, product app-hosted UIKit menu command system, product app-hosted UIKit responder chain, cross-window/cross-document undo grouping, VoiceOver/UI runtime, product menu command system, full product focus lifecycle, product undo grouping / inverse-op dispatch, real `anchor-core::dispatch` integration, product accessibility mapping, polished cross-block continuous native selection, remaining local-only path edge cases, physical iPhone runtime after unlock, iOS/non-macOS CloudDocuments delivery, true remote placeholder, signed-out/over-quota, steady-state segment budget/million-op iCloud context, product conflict-resolution UX/core integration, Android execution, signed app-bundle/device runtime integration, physical-device generated async runtime, Developer ID signing availability.
- **Backfill to 04/06:** `04-contract-baseline.md` TextKit baseline; `06-fixture-set.md` Apple TextKit fixture evidence.
- **Axis matrix delta:** TextKit remains `partial mechanism floor closed`; UIKit responder undo moved from open mechanism evidence to closed, while product app-hosted UIKit responder chain, cross-window undo grouping, VoiceOver/UI runtime, and dispatch integration remain open.
- **Gate evaluation:** CONTINUE — next action should target another remaining UIKit/product-runtime mechanism, another iCloud edge case, Android execution feasibility, signed app/device runtime integration, or physical-device generated async runtime.
- **New doc:** `docs/workbench/20260606-anchor-v1/59-uikit-responder-undo-report.md`
