# Anchor — Stage-3 macOS binding read-only projection evidence

任务：macOS product app binding lower bound：让 Xcode-created product shell 通过 Apple C ABI module 消费 `anchor-core` read-only projection
日期：2026-06-11
状态：**evidence doc（iteration 11）** —— 非公开接口契约；消费方为 `21` ledger 与 `00` cursor

> **边界声明（AGENTS 工作台规则，强制）：** 本文件记录 Stage-3 macOS product app 的 read-only binding projection 证据；不授权 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置 / generated lockfile 改动，不授权 entitlement / iCloud container / CloudKit / 持久应用写入 / release signing / notarization。Swift product app 只消费 core 输出，不实现 merge / diff3 / order-key / normalization / op-creation / tree invariant / BLAKE3 等 deterministic core semantics。产品写入和同步入口保持 disabled。

---

## 1. Verdict

**Observed：** product app 已有一个 read-only projection lower bound：`AnchorCoreProjectionClient` 在可导入 `AnchorCoreC` 时调用 `anchor_session_open_fixture`、`anchor_session_summary_json`、`anchor_session_read_segment`，把 core fixture 投影为 `WorkspacePreviewStore`；macOS binding build 显式通过 `SWIFT_INCLUDE_PATHS` + `OTHER_LDFLAGS` 导入 C module 并链接 `anchor_core_ffi`；runtime UI 显示 core fixture truth：vault `vault_demo_0001`、note id `jnl_f99080f823e0815a8e1440955eb896d1c82d4ec371e19b2e0df89ad581f96b89`、snapshot `3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63`、segment bytes `3148`。Toolbar `New Note` / `Sync` 仍 disabled。

**Not closed：** Xcode-managed SwiftPM/package dependency 仍未持久化到 `project.pbxproj`；generated Swift wrapper import 尚未作为 product target 的项目级依赖闭合；TextKit product runtime、editor intent dispatch、persistence、iCloud、release distribution 均未关闭。

---

## 2. Files Changed

```text
suites/anchor/apple/ffi/include/module.modulemap
suites/anchor/apple/Anchor/Anchor/Services/AnchorCoreProjectionClient.swift
suites/anchor/apple/Anchor/Anchor/Stores/WorkspacePreviewStore.swift
suites/anchor/apple/Anchor/Anchor/ContentView.swift
suites/anchor/apple/Anchor/Anchor/Models/NotePreview.swift
suites/anchor/apple/Anchor/Anchor/Views/InspectorView.swift
```

`module.modulemap` exposes the existing C header as module `AnchorCoreC`; the product app falls back to `.preview` when the C module is not available, so the default Xcode build remains valid while the explicit binding build proves the core-sourced path.

---

## 3. Binding Precheck

```console
$ DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer CARGO_TARGET_DIR=/tmp/anchor-product-ffi-target cargo build --manifest-path suites/anchor/apple/ffi/Cargo.toml --release --target aarch64-apple-darwin
Finished release profile
```

```console
$ DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-product-ffi-target/aarch64-apple-darwin/release swift run --package-path suites/anchor/apple/AnchorAppleSpike --scratch-path /tmp/anchor-product-spike-swiftpm -c release AnchorAppleSmoke
fixture:vault=vault_demo_0001 notes=1 snapshot=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63
dispatch:insert changed=blk_a selection=3:3 patches=1 undo=replace_block_text
dispatch:error validation=direct_active_to_deleted
segment:bytes=3852
textkit:core_dispatch_bridge=insert ...
async:sendable summary=3ef88671... segment=3852
```

**Observed：** existing Apple spike binding wrapper still consumes the same fixture and dispatch surface. The SwiftPM smoke reports `segment:bytes=3852` after it executes an insert dispatch; the product app runtime below reports `3148` because it opens the fixture read-only and does not dispatch a write.

---

## 4. Implementation Evidence

```console
$ rg -n "canImport\\(AnchorCoreC\\)|anchor_session_open_fixture|anchor_session_summary_json|anchor_session_read_segment|WorkspacePreviewStore\\.current|metricLabel|module AnchorCoreC" suites/anchor/apple/Anchor/Anchor suites/anchor/apple/ffi/include/module.modulemap
suites/anchor/apple/ffi/include/module.modulemap:1:module AnchorCoreC {
suites/anchor/apple/Anchor/Anchor/Services/AnchorCoreProjectionClient.swift:10:#if canImport(AnchorCoreC)
suites/anchor/apple/Anchor/Anchor/Services/AnchorCoreProjectionClient.swift:21:        #if canImport(AnchorCoreC)
suites/anchor/apple/Anchor/Anchor/Services/AnchorCoreProjectionClient.swift:22:        guard let session = anchor_session_open_fixture() else {
suites/anchor/apple/Anchor/Anchor/Services/AnchorCoreProjectionClient.swift:29:        let summary = try decode(FixtureSummaryDTO.self, from: anchor_session_summary_json(session))
suites/anchor/apple/Anchor/Anchor/Services/AnchorCoreProjectionClient.swift:30:        let segmentBytes = data(from: anchor_session_read_segment(session)).count
suites/anchor/apple/Anchor/Anchor/Services/AnchorCoreProjectionClient.swift:51:            metricLabel: "Segment bytes",
suites/anchor/apple/Anchor/Anchor/Services/AnchorCoreProjectionClient.swift:76:#if canImport(AnchorCoreC)
suites/anchor/apple/Anchor/Anchor/Views/InspectorView.swift:21:                LabeledContent(note.metricLabel, value: note.metricValue)
suites/anchor/apple/Anchor/Anchor/Models/NotePreview.swift:18:    let metricLabel: String
suites/anchor/apple/Anchor/Anchor/Models/NotePreview.swift:36:            metricLabel: "Blocks",
suites/anchor/apple/Anchor/Anchor/Models/NotePreview.swift:51:            metricLabel: "Blocks",
suites/anchor/apple/Anchor/Anchor/Models/NotePreview.swift:66:            metricLabel: "Blocks",
```

**Observed：** product source owns presentation only: read-only fixture projection, metadata display, and disabled toolbar actions. It does not introduce Swift-side deterministic algorithms.

---

## 5. Xcode Package Attempt

**Observed：** Xcode.app `File > Add Package Dependencies... > Add Local...` reached `suites/anchor/apple/AnchorAppleSpike`, but no package dependency was persisted into the project file.

```console
$ git diff -- suites/anchor/apple/Anchor/Anchor.xcodeproj/project.pbxproj | wc -l
       0
```

**Verdict：** this iteration does not close Xcode-managed local package dependency or generated Swift wrapper import. The current closed gate is lower: explicit C module + staticlib link settings prove the macOS product shell can consume core-sourced read-only projection.

---

## 6. Build Evidence

```console
$ DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project suites/anchor/apple/Anchor/Anchor.xcodeproj -scheme Anchor -configuration Debug -destination 'generic/platform=macOS' -derivedDataPath /tmp/anchor-product-app-default-derived CODE_SIGNING_ALLOWED=NO build
...
** BUILD SUCCEEDED **
```

```console
$ DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project suites/anchor/apple/Anchor/Anchor.xcodeproj -scheme Anchor -configuration Debug -destination 'platform=macOS,arch=arm64' -derivedDataPath /tmp/anchor-product-app-binding-derived CODE_SIGNING_ALLOWED=NO ARCHS=arm64 ONLY_ACTIVE_ARCH=YES SWIFT_INCLUDE_PATHS=/Users/plimeor/Documents/labs/suites/anchor/apple/ffi/include HEADER_SEARCH_PATHS=/Users/plimeor/Documents/labs/suites/anchor/apple/ffi/include OTHER_LDFLAGS='$(inherited) -L/tmp/anchor-product-ffi-target/aarch64-apple-darwin/release -lanchor_core_ffi' build
...
SwiftExplicitDependencyGeneratePcm ... AnchorCoreC-...pcm
Swift compile includes -I /Users/plimeor/Documents/labs/suites/anchor/apple/ffi/include
Link includes -L/tmp/anchor-product-ffi-target/aarch64-apple-darwin/release -lanchor_core_ffi
** BUILD SUCCEEDED **
```

```console
$ DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project suites/anchor/apple/Anchor/Anchor.xcodeproj -scheme Anchor -configuration Debug -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/anchor-product-app-iossim-final-derived CODE_SIGNING_ALLOWED=NO build
...
** BUILD SUCCEEDED **
```

**Observed：** default build, explicit macOS binding build, and iOS Simulator compile-only all pass after the read-only projection code is present.

---

## 7. Runtime Evidence

```console
$ /usr/bin/open -n -F /tmp/anchor-product-app-binding-derived/Build/Products/Debug/Anchor.app
$ pgrep -fl '/tmp/anchor-product-app-binding-derived/Build/Products/Debug/Anchor.app/Contents/MacOS/Anchor'
/private/tmp/anchor-product-app-binding-derived/Build/Products/Debug/Anchor.app/Contents/MacOS/Anchor
```

```console
$ mcp__computer_use.get_app_state(app=/tmp/anchor-product-app-binding-derived/Build/Products/Debug/Anchor.app)
bundleID=dev.plimeor.Anchor
window=Anchor
sidebar row=jnl_f99080f823e0815a8e1440955eb896d1c82d4ec371e19b2e0df89ad581f96b89 / Core binding
detail=Vault: vault_demo_0001; Notes: 1; Snapshot: 3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63; Segment bytes: 3148
inspector=Core fixture / revision 3ef88671 / Segment bytes 3148 / tags core binding read-only
toolbar=New Note disabled; Sync disabled
```

**Verdict：** the runtime UI no longer displays only handcrafted preview rows when launched from the explicit binding build; it displays core fixture values from the C ABI read-only path.

---

## 8. Boundary Audits

```console
$ rg "diff3|order-key|merge|normaliz|op-creation|tree-invariant|blake3" suites/anchor/apple/Anchor
# 0 matches, exit 1
```

```console
$ rg "CloudKit|CKRecord|CKAsset|CKContainer|CKSyncEngine|NSFileCoordinator|NSMetadataQuery|ubiquit|iCloud|NSURLIsExcludedFromBackupKey" suites/anchor/core suites/anchor/cli
# 0 matches, exit 1
```

```console
$ bun install --dry-run --frozen-lockfile --ignore-scripts
[35.00ms] done
```

```console
$ git diff --check
# clean
```

**Verdict：** no product deterministic-semantics redline match; no core/cli cloud-symbol leak; Bun workspace dry-run remains clean; diff whitespace check passes.

---

## 9. Gate Effects

**Gates closed this iteration:**

- macOS product app read-only core projection lower bound via `AnchorCoreC` module + `anchor_core_ffi` staticlib.
- default macOS build remains green without explicit binding import settings.
- explicit macOS arm64 binding build links and imports the C module.
- binding runtime UI shows core fixture truth and keeps write/sync disabled.
- iOS Simulator compile-only remains green.
- client/core redline audits remain clean.

**Gates still open:**

- Xcode-managed local package dependency / generated Swift wrapper import for the product target — **Partially run**
- product editor write dispatch / TextKit runtime integration — **Not run**
- `NSUndoManager` grouping/redo, VoiceOver, moving-view replay, conflict UX — **Not run**
- product persistence / iCloud / CloudKit / entitlement / signed distribution / notarization — **Not run**

---

## 10. Ledger Entry

### Ledger entry — 2026-06-11 — iteration 11 — doc 27-stage-3-macos-binding-projection.md

- **Checkpoint / cursor:** Stage-3 macOS product app integration；CP-1 Apple delivery gates remain open
- **Action selected:** macOS product app binding lower bound：read-only core projection through C ABI module
- **Owner classification:** Apple product owner / Codex with local Xcode + command-line link evidence
- **Scope-fence check:** passed — no root workspace / lockfile / package config changes; no entitlement/container/CloudKit/persistent writes; no Swift deterministic semantics
- **Evidence (Observed = command + output):**
  - `cargo build --manifest-path suites/anchor/apple/ffi/Cargo.toml --release --target aarch64-apple-darwin` → `Finished release profile`
  - `swift run --package-path suites/anchor/apple/AnchorAppleSpike ... AnchorAppleSmoke` → fixture `vault_demo_0001`, snapshot `3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63`, `segment:bytes=3852`
  - implementation `rg` in §4 → `AnchorCoreC` module and `anchor_session_*` calls present
  - `git diff -- suites/anchor/apple/Anchor/Anchor.xcodeproj/project.pbxproj | wc -l` → `0`
  - default macOS build in §6 → `** BUILD SUCCEEDED **`
  - explicit macOS binding build in §6 → PCM generated, C module include path present, staticlib link flags present, `** BUILD SUCCEEDED **`
  - runtime app-state snapshot in §7 → core fixture note id, vault, snapshot, `Segment bytes 3148`; write/sync disabled
  - iOS Simulator compile-only in §6 → `** BUILD SUCCEEDED **`
  - Apple client deterministic-semantics audit in §8 → 0 matches, exit 1
  - core/cli cloud-symbol audit in §8 → 0 matches, exit 1
  - `bun install --dry-run --frozen-lockfile --ignore-scripts` → `[35.00ms] done`
  - `git diff --check` → clean
- **Gates closed this iteration:** product app C ABI read-only projection runtime floor
- **Gates still open:** Xcode-managed package dependency / generated Swift wrapper import, TextKit product runtime, write dispatch, persistence, iCloud, release distribution
- **Backfill to 04/05/06:** none；`21` state block and `00` cursor updated
- **Axis matrix delta:** Stage-3 macOS product shell `scaffold-go` → `binding-read-floor`
- **Gate evaluation:** CONTINUE — next action: Xcode-managed binding package dependency hardening（persist local binding package dependency or equivalent project-backed route for generated Swift wrapper import; keep read-only）
- **Decision requested:** none
- **New doc:** `docs/workbench/20260606-anchor-v1/27-stage-3-macos-binding-projection.md`
