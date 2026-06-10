# Anchor Stage 1 — TextKit/UIKit Adapter + Core-Dispatch Bridge Consolidated Evidence

任务：把 17 份 TextKit / UIKit adapter + core-dispatch-bridge workbench report 合并成单一证据文档，去重多轮 rerun，保留每条 load-bearing 结论、golden 值、Observed-vs-Not-run/Blocked 区分与 open gate。
日期：2026-06-10
状态：**workbench evidence（consolidated）—— 非公开接口契约**

> 边界声明（AGENTS 工作台规则，强制）：本文件**不授权**任何 package / workspace / 产品 app / 生成 lockfile / public CLI schema / 代码改动；它只汇总既有 spike probe 的观测证据。权威 CLI/API/schema/file-format 契约仍归未来 `anchor-core` README，本文件不构成接口契约。

---

## 1. Verdict

**TextKit/UIKit adapter is mechanism-viable for Stage 1, NOT a complete product editor runtime.**

机制下限（mechanism floor）覆盖输入、layout、selection、IME、hit-testing、keyboard→intent capture、view lifecycle、responder/first-responder routing、menu command routing、responder undo suppression、focus lifecycle、accessibility range+hierarchy、patch replay projection、core-dispatch bridge（insert）与 structural-dispatch deferral（split/merge）。这些都是受控 `NSTextView` / `UITextView` probe 与 `AnchorAppleSmoke` 内的观测，不是 app-hosted 产品 editor runtime。

完整产品 editor runtime 仍未关闭：real product editor runtime、full undo/redo、IME commit（产品路径）、hit-testing on real block geometry，以及全部 app-hosted window / focus / menu / accessibility / VoiceOver 集成与真实 `anchor-core::dispatch` 端到端编辑流。

### 1.1 Standing invariant（每轮迭代恒定，D19/D26/D37 red line held）

Apple 侧实现 **ZERO deterministic semantics**：no merge / diff3 / order-key / normalize / op-creation / tree-invariant。所有结构化语义归 Rust `anchor-core`；TextKit/UIKit 的 buffer、selection、view identity 全部是 **transient projection only**，绝不作为文档真理层。每轮的 deterministic-semantics audit（`rg "diff3|order-key|fractional|merge.*semantic|canonical|BLAKE3|HLC|OR-Set|tree invariant|normalize"` over `suites/anchor/apple`）均为 0-match（唯一 hit 是既有 `mergeBackward` editor-intent 名，不是语义实现），core cloud-symbol audit（`CloudKit|CK*|NSFileCoordinator|NSMetadataQuery|ubiquit|iCloud|NSURLIsExcludedFromBackupKey` over `suites/anchor/core`）均为 0-match，`find suites/anchor/apple -name Cargo.lock` 为 0 paths，`git diff --check` clean。

### 1.2 Golden fixtures（每轮恒定，必须保留）

UTF-16 fixture counts，每轮观测不变：

| fixture | utf16 | scalars | crlf |
|---|---|---|---|
| emoji | 4 | 3 | 0 |
| zwj | 11 | 7 | 0 |
| combining | 7 | 7 | 0 |
| crlf | 6 | 6 | 1 |
| mixed | 11 | 9 | 1 |

Core-dispatch golden 值（来自 `AnchorAppleSmoke` + 真实 Rust core）：fixture vault `vault_demo_0001`，notes=1，snapshot_revision `3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63`，insert dispatch `changed=blk_a selection=2:2`，segment bytes `979`。tool versions：Xcode 26.5（iPhoneSimulator26.5.sdk）、Swift 6（strict concurrency），target `arm64-apple-ios17.0-simulator`。

---

## 2. Mechanism floors covered（each once）

下表汇总每个机制下限的 load-bearing smoke 行、平台与状态。所有 macOS 行来自 `AnchorTextKitSmoke`（受控 `NSTextView` / AppKit harness），所有 iOS 行来自 `simctl spawn` 实跑的 `AnchorTextKitSmoke` iOS Simulator 二进制（真实进程执行，非 compile-only），core-dispatch 两行来自 `AnchorAppleSmoke`。

| Mechanism floor | Platform | Load-bearing observed line | Status | Source |
|---|---|---|---|---|
| UTF-16 fixture smoke (emoji/zwj/combining/crlf/mixed) | macOS + iOS | `utf16:emoji=4 scalars=3 crlf=0` … `utf16:mixed=11 scalars=9 crlf=1` | closed / observed | 18, all |
| Selection + layout + semantic undo | macOS | `textkit:mac:selected=1:2 layout=true undo=semantic-inverse-intent` | closed | 18, 27 |
| IME marked-text commit → UTF-16 insert intent | macOS | `textkit:ime_marked=true commit=A拼 intent_insert_at=1` | closed (mechanism floor) | 27 |
| Hit-testing insertion index | macOS | `textkit:hittest_index=1` | closed (mechanism floor) | 27 |
| Direct-buffer undo suppression (controlled, `allowsUndo=false`) | macOS | `textkit:direct_buffer_undo_suppressed=true` | closed (controlled probe floor) | 27 |
| Accessibility selected-range readback | macOS | `textkit:accessibility_selected_range=1:2` | closed (mechanism floor) | 47 |
| Patch replay projection (insert/move/remove text surface) | macOS | `textkit:patch_replay_split_move_remove=true` | closed (mechanism floor) | 48 |
| Keyboard → intent capture (`keyDown` Enter/Delete) | macOS | `textkit:keyboard_intents=split@1,merge_backward` | closed (mechanism floor) | 49 |
| AppKit view lifecycle (real `NSView`/`NSTextView` insert/move/remove) | macOS | `textkit:appkit_view_lifecycle=insert_move_remove` | closed (mechanism floor) | 50 |
| First-responder keyboard routing (two-view `NSWindow`) | macOS | `textkit:appkit_first_responder_keyboard=blk_a:split@1,code_1:merge_backward` | closed (mechanism floor) | 51 |
| Accessibility hierarchy (two text surfaces, per-view label+range) | macOS | `textkit:appkit_accessibility_children=2 ranges=1:2,0:3` | closed (mechanism floor) | 52 |
| Menu command routing (`insertNewline:` / `deleteBackward:` selectors, buffers unchanged `AB`/`CD`) | macOS | `textkit:appkit_menu_commands=blk_a:split@1,code_1:merge_backward` | closed (mechanism floor) | 53 |
| Responder undo suppression (`undo:` → semantic inverse, buffer `edited text` unchanged) | macOS | `textkit:appkit_responder_undo=semantic-inverse-intent buffer_unchanged=true` | closed (mechanism floor) | 54 |
| Focus lifecycle (`NSWindow`+`NSSplitView`+`NSScrollView`, identity+selection preserved) | macOS | `textkit:appkit_focus_lifecycle=split_scroll blk_a->code_1 selections=1:0,0:0` | closed (mechanism floor) | 55 |
| UIKit `UITextView` runtime (selection + marked commit + UIKeyInput intents + scroll hierarchy + a11y labels) | iOS sim runtime | `textkit:ui_textview_runtime=selection=1:2 marked=1:1 commit=A拼 input=split@1,merge_backward hierarchy=blk_a,code_1 labels=2` | closed (mechanism floor) | 56 |
| UIKit view lifecycle (`UIScrollView`+`UITextView` insert/move/remove, selection preserved, removed view detached) | iOS sim runtime | `textkit:ui_view_lifecycle=insert_move_remove` | closed (mechanism floor) | 57 |
| UIKit menu command routing (`UIKeyCommand` target-action, buffers `AB`/`CD` unchanged) | iOS sim runtime | `textkit:ui_menu_commands=blk_a:split@1,code_1:merge_backward` | closed (mechanism floor) | 58 |
| UIKit responder undo (grouped `UndoManager` semantic inverse, buffer `edited text` unchanged) | iOS sim runtime | `textkit:ui_responder_undo=semantic-inverse-intent buffer_unchanged=true` | closed (mechanism floor) | 59 |
| Core-dispatch bridge (insert intent → real `anchor-core::dispatch`) | macOS Release | `textkit:core_dispatch_bridge=insert changed=blk_a selection=2:2 segment=979` | closed (probe-level) | 63 |
| Structural-dispatch deferral (split/merge → core typed `structural_dispatch_deferred`, `changedIDs` empty) | macOS Release | `textkit:core_dispatch_bridge=structural split=structural_dispatch_deferred merge=structural_dispatch_deferred` | closed (probe-level) | 66 |

### 2.1 Boundary check — allowed vs forbidden（observed）

Allowed behavior observed: native selection / view state 是 transient projection；insert/block/embedded/split/merge 动作表达为 intent-shaped 值；patch replay 只改 view-model projection 与真实 view 层级（adapter-local identity）；semantic undo 经 inverse-intent callback；keyboard / menu / responder 路径只产出 portable editor intents，buffer 不被直接改写。

Forbidden behavior NOT introduced: no Swift merge / normalization / op creation / tree-invariant validation / diff3 / order-key generation / persistent application write。

---

## 3. Cross-cutting findings

### 3.1 Swift 6 / MainActor

`NSTextView` 与 `UndoManager` 在 Swift 6 下 `MainActor` isolated。首次 macOS smoke 暴露 strict-concurrency 错误（undo registration + captured mutable state），通过把 AppKit runtime surface 移到 `@MainActor` 并使用 `UndoEventRecorder` 修复。产品 adapter 应继承此结构：TextKit runtime 在 main actor，core dispatch 保持返回 DTO/patch 的 binding call。`AnchorAppleSmoke` 的 Xcode Release build 在 `OTHER_SWIFT_FLAGS='-strict-concurrency=complete -warnings-as-errors'` 下 `** BUILD SUCCEEDED **`。

### 3.2 Harness gotchas（保留为方法学证据）

- Keyboard capture（doc 49）：中间无 text-container 的 harness 把 split 算到 offset 0，是 harness invalidity 不是产品结果；正解需 `NSTextStorage`/`NSLayoutManager`/`NSTextContainer` 完整栈，使 `setSelectedRange(1:0)` 在 `keyDown` 期间可观测。
- iOS executable build（doc 56-59）：Xcode SwiftPM executable scheme 需 `OTHER_SWIFT_FLAGS=-parse-as-library`，否则触发 Swift `@main` / top-level-code diagnostic；签名为 `"Sign to Run Locally"`。
- FFI lockfile（doc 63/66）：`cargo build` 会生成 untracked `suites/anchor/apple/ffi/Cargo.lock`，每次都被删除，因本工作台不授权 lockfile 改动。

### 3.3 Core-dispatch bridge typed vocabulary（doc 63/66）

Insert intent 经 `AnchorSession.dispatchInsertText(targetID:at:text:)` 命中真实 core，返回 `changedIDs == ["blk_a"]`、selection hint kind `text`、selection `2:2`、非空 segment bytes（979）。Structural split/merge 经新增 FFI 窄入口 `anchor_session_dispatch_split_block_json` / `anchor_session_dispatch_merge_backward_json` 抵达真实 core，返回 core-owned typed `ValidationErrorCode.structuralDispatchDeferred`，`changedIDs` 空。同 smoke 还观测既有 `dispatch:error validation=direct_active_to_deleted`、`icloud:account_state_classifier=blocked_no_ubiquity_container explicit=false implicit=false`、`async:sendable` 行（snapshot 同上）。iOS Simulator + iPhoneOS 的 `AnchorCoreBindings` compile surface 在新增入口后仍 `** BUILD SUCCEEDED **`。这关闭的是 typed deferral 桥接下限，**不**表示 core 已实现 split/merge macro-op / intent rebase / derived-block conflict accounting。

### 3.4 Canonical reproduction commands（sanitized）

Probe / smoke 的实跑路径（所有 build 产物在 `<HOME>/tmp/anchor-apple-stage1` 等价的临时目录，绝对 home path 已脱敏为 `<HOME>`；iOS Simulator device id 脱敏为 `<DEVICE_ID>`）：

- macOS adapter smoke（覆盖第 2 节全部 macOS 行）：
  `swift run --package-path suites/anchor/apple/AnchorAppleSpike AnchorTextKitSmoke`
- iOS Simulator executable build（UIKit runtime）：
  `xcodebuild -scheme AnchorTextKitSmoke -destination 'generic/platform=iOS Simulator' -configuration Debug OTHER_SWIFT_FLAGS=-parse-as-library build` → `** BUILD SUCCEEDED **`
- iOS Simulator runtime（真实进程执行 UIKit 四行）：
  `xcrun simctl spawn <DEVICE_ID> <HOME>/.../AnchorTextKitSmoke`
- shared probe compile surface（每轮回归）：
  `xcodebuild -scheme AnchorTextKitProbe -destination 'generic/platform=iOS Simulator' build` → `** BUILD SUCCEEDED **`
- core-dispatch strict build（doc 63/66）：
  `cargo build --release --target aarch64-apple-darwin --manifest-path suites/anchor/apple/ffi/Cargo.toml` 后
  `xcodebuild -scheme AnchorAppleSmoke -destination 'platform=macOS' -configuration Release OTHER_SWIFT_FLAGS='-strict-concurrency=complete -warnings-as-errors' build` → `** BUILD SUCCEEDED **`，Release executable 复现同一对 `textkit:core_dispatch_bridge` 行。

core-dispatch 的 Xcode Release target dependency graph 含 `AnchorCoreC` + `AnchorCoreBindings` + `AnchorTextKitProbe`（doc 66 起增加 `AnchorICloudDriveProbe`），证明 adapter 与真实 binding 在同一严格编译单元内连接。

---

## 4. Observed vs Not-run / Blocked distinction

证据强度分三档，避免把 compile-only 误读为 runtime，或把受控 probe 误读为产品集成：

- **进程实跑（最强）**：macOS AppKit harness 在 `AnchorTextKitSmoke` 进程内执行；iOS UIKit 四行经 `simctl spawn` 在 iOS Simulator 二进制内执行；core-dispatch 两行由真实 Rust core 返回。这些是行为证据，不是签名/链接证据。
- **compile-only（中）**：`AnchorTextKitProbe` / `AnchorCoreBindings` 的 iOS Simulator + iPhoneOS build 仅证明编译面绿，不证明 `UITextView` 的 app-hosted runtime、focus、accessibility 或 IME 行为。
- **未跑（最弱区分）**：见下表。

- **Observed (closed)**：第 2 节全部 mechanism floors。macOS 行为受控 AppKit harness 内进程执行；iOS UIKit 行为 `simctl spawn` 实跑 iOS Simulator 二进制（非 compile-only）；core-dispatch 两行为真实 Rust core 返回值。iOS Simulator compile surface（`AnchorTextKitProbe` / `AnchorCoreBindings`）每轮 `** BUILD SUCCEEDED **`，但仅为 compile evidence，不证明 `UITextView` 的 app-hosted runtime。
- **Not-run (open)**：所有 product app-hosted gate（见第 5 节）；这些没有产品 app shell，因此无法在本 spike surface 内运行。
- **Blocked / Needs-Apple-runtime / Needs-human-approval**：iCloud delivery、physical-device runtime、signed-device、Developer ID / 分发等，跨出 TextKit/UIKit adapter 范围，由其它工作台 doc 拥有；此处仅记为 CP-1 whole-exit 的并列阻塞项，**CP-1 whole-exit 未退出**。

---

## 5. Remaining work / open gates

每条 open gate 去重列出一次（多轮 rerun 已合并），含 owner。CP-1 whole-exit **not exited**；gate evaluation 全程 **CONTINUE**。

| Open gate | Classification | Owner |
|---|---|---|
| Real product editor runtime (app shell hosting TextKit/UIKit) | Not-run | Apple/TextKit verifier |
| Full undo/redo + product undo grouping / inverse-op dispatch | Not-run | Apple/TextKit + core verifier |
| IME marked-text commit on product path | Not-run | Apple/TextKit verifier |
| Hit-testing against rendered real block geometry | Not-run | Apple/TextKit verifier |
| Product menu command system (validation, discoverability, shortcut conflicts) | Not-run | Apple/TextKit verifier |
| Product focus lifecycle (real windows / tabs / sheets / sidebars / restored scroll state) | Not-run | Apple/TextKit verifier |
| Product accessibility mapping + cross-block continuous native selection | Not-run | Apple/TextKit verifier |
| VoiceOver / Accessibility Inspector runtime | Needs-Apple-runtime | Apple/TextKit verifier |
| UIKit app-hosted focus/window lifecycle, menu system, responder chain, patch replay over real document views | Not-run | Apple/UIKit verifier |
| Cross-window / cross-document undo grouping | Not-run | Apple/UIKit verifier |
| Real `anchor-core::dispatch` integration for product keyboard/menu/undo/focus flows | Not-run | Apple + core verifier |
| Core split/merge macro-op semantics, intent rebase, derived-block conflict materialization | Not-run | core verifier |
| Core-sourced `EditorPatch` application over real AppKit/UIKit views | Not-run | Apple + core verifier |
| Physical iPhone runtime after unlock / app launch | Blocked / Needs-Apple-runtime | iCloud/device verifier |
| iOS/non-macOS CloudDocuments delivery + true remote `.icloud` placeholder | Blocked / Needs-Apple-runtime | iCloud verifier |
| Signed-out / over-quota account states, steady-state segment budget / million-op iCloud context, product conflict-resolution UX/core integration | Not-run / Needs-Apple-runtime | iCloud + core verifier |
| Android execution feasibility | Not-run | cross-target verifier |
| Signed app-bundle / device runtime integration, physical-device generated async runtime | Blocked / Needs-Apple-runtime | binding verifier |
| Developer ID signing availability / notarization / distribution | Blocked / Needs-human-approval | human approver |
| CP-1 whole-exit | Not-run / Needs-human-approval | human approver |
