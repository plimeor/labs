# Anchor Stage 1 - UIKit View Lifecycle Report

任务：CP-1 TextKit / UIKit product-runtime gate，补足 iOS Simulator 上 `UIScrollView` + `UITextView` text surface hierarchy 对 `EditorPatchProbe` insert / move / remove 的 view lifecycle replay 机制证据。
日期：2026-06-10
状态：**workbench artifact** —— 非公开接口契约；本轮只关闭 iOS Simulator SwiftPM executable 下的 UIKit text surface view lifecycle 机制下限，不关闭产品 app-hosted UIKit patch replay、完整 focus/window lifecycle、UIKit menu command system、UIKit responder-chain undo、VoiceOver/UI runtime、真实 `anchor-core::dispatch` 集成或完整 editor runtime。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**package / workspace / 产品 app / 生成 lockfile / public CLI schema 改动；本轮没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；没有改 `suites/anchor/core/src/**` production source；没有创建 Apple product app shell、entitlement、bundle id 或 iCloud container；没有把 UIKit / `UITextView` / `UIScrollView` / view identity / selection 变成文档真理层。代码变更限于 `suites/anchor/apple/AnchorAppleSpike/Sources/AnchorTextKitProbe/AnchorTextKitProbe.swift` 与 `suites/anchor/apple/AnchorAppleSpike/Sources/AnchorTextKitSmoke/main.swift`；构建产物位于 `/tmp/anchor-apple-stage1`。

---

## 1. 结论

**Strongest conclusion：iOS Simulator 中的 `UIScrollView` + multiple `UITextView` hierarchy 可以承载 text surface insert / move / remove patch replay；新增 surface 的 UTF-16 selection 可保留，移动后 view order 可观察，删除后的 view 会从 superview detached。**

Observed runtime output:

```text
textkit:ui_view_lifecycle=insert_move_remove
```

这证明的是受控 UIKit view lifecycle 机制下限，不证明：

- 产品 app-hosted UIKit view hierarchy / scene / window integration；
- 产品 `EditorPatch` over real document windows, tabs, sheets, sidebars, or restored scroll state；
- UIKit menu command routing；
- UIKit responder-chain undo grouping / inverse-op dispatch；
- VoiceOver / Accessibility Inspector runtime；
- end-to-end `anchor-core::dispatch` integration。

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| root workspace / package / lockfile | not changed |
| `suites/anchor/core/src/**` | not changed |
| public CLI schema | not changed |
| product app shell | not created |
| Apple project / entitlement / bundle id | not created or changed |
| UIKit view truth ownership | not introduced; view state stays adapter-local |
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
UIKitTextViewRuntimeProbe.textViewLifecycleProbe()
```

The probe:

- starts with two `UITextView` surfaces in a `UIScrollView`: `blk_a`, `code_1`;
- applies `.insertTextSurface(afterBlockID: "blk_a", blockID: "blk_b", selection: 0:5)`;
- applies `.moveTextSurface(blockID: "code_1", toIndex: 0)`;
- applies `.removeTextSurface(blockID: "blk_b")`;
- asserts final order `["code_1", "blk_a"]`, removed-view detachment, and remaining view count 2.

---

## 4. Observed evidence

### 4.1 macOS TextKit smoke

Command:

```sh
swift run \
  --package-path suites/anchor/apple/AnchorAppleSpike \
  --scratch-path /tmp/anchor-apple-stage1/swift-build-textkit-ui-view-lifecycle-20260610 \
  AnchorTextKitSmoke
```

Observed output:

```text
Build of product 'AnchorTextKitSmoke' complete! (36.36s)
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

- Existing macOS AppKit / TextKit smoke outputs remain green after adding the iOS-only lifecycle probe.

### 4.2 iOS Simulator executable build

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild \
  -scheme AnchorTextKitSmoke \
  -destination 'generic/platform=iOS Simulator' \
  -configuration Debug \
  -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/AnchorTextKitSmoke-ui-view-lifecycle-iossim-20260610 \
  OTHER_SWIFT_FLAGS=-parse-as-library \
  build
```

Observed output:

```text
Signing Identity:     "Sign to Run Locally"
** BUILD SUCCEEDED **
```

Interpretation:

- The `AnchorTextKitSmoke` SwiftPM executable still builds as an iOS Simulator binary.

### 4.3 iOS Simulator runtime

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun simctl spawn A1D90DAB-1FAC-413A-BCB4-F92B9F798F75 \
  /tmp/anchor-apple-stage1/DerivedData/AnchorTextKitSmoke-ui-view-lifecycle-iossim-20260610/Build/Products/Debug-iphonesimulator/AnchorTextKitSmoke
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
```

Interpretation:

- The new evidence is `textkit:ui_view_lifecycle=insert_move_remove`.
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
  -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/AnchorTextKitProbe-ui-view-lifecycle-iossim-20260610 \
  build | tail -n 40
```

Observed output:

```text
2026-06-10 04:54:31.398 xcodebuild[6362:1803292] [MT] IDERunDestination: Supported platforms for the buildables in the current scheme is empty.
2026-06-10 04:54:36.646 appintentsmetadataprocessor[6914:1804368] Extracted no relevant App Intents symbols, skipping writing output
** BUILD SUCCEEDED **
```

Interpretation:

- The shared `AnchorTextKitProbe` target still builds for iOS Simulator after the iOS-only lifecycle additions.

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
| UIKit `UIScrollView` / `UITextView` insert / move / remove lifecycle replay | closed as mechanism floor |
| inserted UIKit text surface selection preservation | closed as mechanism floor |
| removed UIKit text surface detached from superview | closed as mechanism floor |
| product app-hosted UIKit patch replay across real document windows / tabs / sheets / restored scroll state | open / not run |
| UIKit menu command system | open / not run |
| UIKit responder-chain undo grouping / inverse-op dispatch | open / not run |
| VoiceOver / Accessibility Inspector runtime | open / not run |
| real `anchor-core::dispatch` integration | open / not run |

Gate evaluation: **CONTINUE**. This closes the iOS Simulator UIKit view lifecycle mechanism floor only; CP-1 remains gated by product runtime integration, app-hosted UIKit responder/focus/menu/undo gates, iCloud delivery, physical-device runtime, Android execution, signed app/device runtime, Developer ID / notarization / release, and human sign-off.

---

## 6. Ledger entry

### Ledger entry - 2026-06-10 - iteration 36 - doc 57-uikit-view-lifecycle-report.md

- **Checkpoint / cursor:** CP-1 Apple half, TextKit/UIKit product-runtime gate.
- **Action selected:** add and execute an iOS Simulator `UIScrollView` + `UITextView` lifecycle harness for insert / move / remove text surface patch replay.
- **Owner classification:** Apple/UIKit verifier -> implemented in repo-local spike probe/smoke; no product app shell or core code touched.
- **Scope-fence check:** passed — no root workspace / lockfile / repo product app shell / public CLI schema changes; no `suites/anchor/core/src/**` production source changes; no deterministic core semantics duplicated in Swift; no persistent writes.
- **Evidence (Observed = command + output):**
  - `swift run --package-path suites/anchor/apple/AnchorAppleSpike --scratch-path /tmp/anchor-apple-stage1/swift-build-textkit-ui-view-lifecycle-20260610 AnchorTextKitSmoke` -> existing macOS AppKit / TextKit smoke outputs unchanged, including `textkit:appkit_focus_lifecycle=split_scroll blk_a->code_1 selections=1:0,0:0`.
  - `xcodebuild -scheme AnchorTextKitSmoke -destination 'generic/platform=iOS Simulator' ... OTHER_SWIFT_FLAGS=-parse-as-library build` -> `** BUILD SUCCEEDED **`.
  - `xcrun simctl spawn A1D90DAB-1FAC-413A-BCB4-F92B9F798F75 .../AnchorTextKitSmoke` -> `textkit:ui_view_lifecycle=insert_move_remove` with existing `textkit:ui_textview_runtime=selection=1:2 marked=1:1 commit=A拼 input=split@1,merge_backward hierarchy=blk_a,code_1 labels=2`.
  - `xcodebuild -scheme AnchorTextKitProbe -destination 'generic/platform=iOS Simulator' ... build` -> `** BUILD SUCCEEDED **`.
  - `git diff --check` -> clean, exit 0.
  - core cloud-symbol audit -> 0 matches, exit 1.
  - Apple deterministic-semantics audit for `diff3|order-key|fractional|merge.*semantic|canonical` -> 0 matches, exit 1.
  - Apple `Cargo.lock` audit -> 0 paths.
- **Gates closed this iteration:** iOS Simulator UIKit `UIScrollView` / `UITextView` insert / move / remove lifecycle replay mechanism floor, including inserted-surface selection preservation and removed-view detachment.
- **Gates still open:** product app-hosted UIKit focus/window lifecycle, product app-hosted UIKit patch replay across real document windows/tabs/sheets/restored scroll state, UIKit menu command system, UIKit responder-chain undo grouping / inverse-op dispatch, VoiceOver/UI runtime, product menu command system, full product focus lifecycle, product undo grouping / inverse-op dispatch, real `anchor-core::dispatch` integration, product accessibility mapping, polished cross-block continuous native selection, remaining local-only path edge cases, physical iPhone runtime after unlock, iOS/non-macOS CloudDocuments delivery, true remote placeholder, signed-out/over-quota, steady-state segment budget/million-op iCloud context, product conflict-resolution UX/core integration, Android execution, signed app-bundle/device runtime integration, physical-device generated async runtime, Developer ID signing availability.
- **Backfill to 04/06:** `04-contract-baseline.md` TextKit baseline; `06-fixture-set.md` Apple TextKit fixture evidence.
- **Axis matrix delta:** TextKit remains `partial mechanism floor closed`; UIKit view lifecycle moved from open mechanism evidence to closed, while product app-hosted UIKit lifecycle, VoiceOver/UI runtime, and dispatch integration remain open.
- **Gate evaluation:** CONTINUE — next action should target another remaining UIKit/product-runtime mechanism, another iCloud edge case, Android execution feasibility, signed app/device runtime integration, or physical-device generated async runtime.
- **New doc:** `docs/workbench/20260606-anchor-v1/57-uikit-view-lifecycle-report.md`
