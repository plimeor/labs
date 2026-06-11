# Anchor — Xcode product app scaffold evidence

任务：D40 授权后通过 Xcode.app 创建正式 macOS/iOS product app 项目，并建立 macOS-first shell
日期：2026-06-11
状态：**evidence doc（iteration 10）** —— 非公开接口契约；消费方为 `21` ledger、`05` D40、`00` cursor

> **边界声明（AGENTS 工作台规则，强制）：** 本文件记录 D40 授权范围内的 product app scaffold 证据；不授权 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置 / generated lockfile 改动，不授权 Developer ID / App Store distribution / notarization / entitlement / iCloud container / CloudKit / 持久应用写入。Swift product shell 不拥有 deterministic core semantics；后续产品写入必须经 `anchor-core::dispatch`。

---

## 1. Verdict

**Observed：** Xcode.app 已使用 Multiplatform App 模板创建正式 product app project：`suites/anchor/apple/Anchor/Anchor.xcodeproj`。同一 target/scheme `Anchor` 通过 macOS Debug build、iOS Simulator Debug compile-only，并能启动 macOS shell。当前 shell 只展示 in-memory preview projection：sidebar / detail / inspector；`New Note` 与 `Sync` toolbar actions disabled。它关闭的是 product shell scaffold gate，不关闭 binding integration、TextKit product editor、iCloud、signing/distribution 或持久写入。

**Scope result：** root workspace / lockfile / root package config 未改；Xcode user-local `xcuserdata` 已移除；构建产物落 `/tmp/anchor-product-app-derived` 与 `/tmp/anchor-product-app-iossim-derived`；Bun dry-run workspace gate passed.

---

## 2. Authorization

**Observed（user quote home = `05` D40）：**

- `/goal 反复执行 [00-agent-loop.md](docs/workbench/20260606-anchor-v1/00-agent-loop.md) ，先使用 @Xcode 建立正式的 macos/ios app 项目，然后专注于 macos app 的开发工作。`
- `用 xcode app 创建项目`

**Observed（Xcode.app UI）：** Xcode 26.5 Welcome window → `Create New Project...` → `Multiplatform` / `App` template → Product Name `Anchor` → Organization Identifier `dev.plimeor` → Storage `None` → CloudKit off → saved under `suites/anchor/apple/`. Team / signing identifiers are treated as local PII and are not repeated here.

---

## 3. Files Created

```console
$ find suites/anchor/apple/Anchor -maxdepth 5 -type f | sort
suites/anchor/apple/Anchor/Anchor.xcodeproj/project.pbxproj
suites/anchor/apple/Anchor/Anchor.xcodeproj/project.xcworkspace/contents.xcworkspacedata
suites/anchor/apple/Anchor/Anchor/AnchorApp.swift
suites/anchor/apple/Anchor/Anchor/Assets.xcassets/AccentColor.colorset/Contents.json
suites/anchor/apple/Anchor/Anchor/Assets.xcassets/AppIcon.appiconset/Contents.json
suites/anchor/apple/Anchor/Anchor/Assets.xcassets/Contents.json
suites/anchor/apple/Anchor/Anchor/ContentView.swift
suites/anchor/apple/Anchor/Anchor/Models/NotePreview.swift
suites/anchor/apple/Anchor/Anchor/Stores/WorkspacePreviewStore.swift
suites/anchor/apple/Anchor/Anchor/Views/EditorView.swift
suites/anchor/apple/Anchor/Anchor/Views/InspectorView.swift
suites/anchor/apple/Anchor/Anchor/Views/SidebarView.swift
```

---

## 4. Xcode Discovery

```console
$ mcp__xcodebuildmcp.discover_projs(workspaceRoot=/Users/plimeor/Documents/labs, scanPath=/Users/plimeor/Documents/labs/suites/anchor/apple/Anchor, maxDepth=4)
status=SUCCEEDED
projectCount=1
workspaceCount=0
projects[0]=/Users/plimeor/Documents/labs/suites/anchor/apple/Anchor/Anchor.xcodeproj
```

```console
$ mcp__xcodebuildmcp.list_schemes(projectPath=/Users/plimeor/Documents/labs/suites/anchor/apple/Anchor/Anchor.xcodeproj)
didError=true
error=Failed to list schemes.
diagnostic=xcrun: error: unable to find utility "xcodebuild", not a developer tool or in PATH
```

```console
$ DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -list -project suites/anchor/apple/Anchor/Anchor.xcodeproj
Information about project "Anchor":
    Targets:
        Anchor

    Build Configurations:
        Debug
        Release

    Schemes:
        Anchor
```

**Verdict：** XcodeBuildMCP can discover the project but its scheme-list path does not inherit the required `DEVELOPER_DIR`; explicit Xcode toolchain selection succeeds. Global `xcode-select` was not changed.

---

## 5. Build Evidence

```console
$ DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project suites/anchor/apple/Anchor/Anchor.xcodeproj -scheme Anchor -configuration Debug -destination 'generic/platform=macOS' -derivedDataPath /tmp/anchor-product-app-derived CODE_SIGNING_ALLOWED=NO build
...
** BUILD SUCCEEDED **
```

```console
$ DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project suites/anchor/apple/Anchor/Anchor.xcodeproj -scheme Anchor -configuration Debug -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/anchor-product-app-iossim-derived CODE_SIGNING_ALLOWED=NO build
...
** BUILD SUCCEEDED **
```

**Not run：** signed device install, archive, notarization, App Store/TestFlight upload, iCloud entitlement/container runtime.

---

## 6. Boundary Audits

```console
$ bun install --dry-run --frozen-lockfile --ignore-scripts
[31.00ms] done
```

```console
$ rg "diff3|order-key|merge|normaliz|op-creation|tree-invariant|blake3" suites/anchor/apple/Anchor
# 0 matches, exit 1
```

```console
$ rg "CloudKit|CKRecord|CKAsset|CKContainer|CKSyncEngine|NSFileCoordinator|NSMetadataQuery|ubiquit|iCloud|NSURLIsExcludedFromBackupKey" suites/anchor/core suites/anchor/cli
# 0 matches, exit 1
```

**Verdict：** new product shell does not trip the Apple client deterministic-semantics red line; core/cli cloud-symbol boundary remains clean.

---

## 7. Runtime UI Evidence

```console
$ /usr/bin/open -n /tmp/anchor-product-app-derived/Build/Products/Debug/Anchor.app
$ mcp__computer_use.get_app_state(app=/tmp/anchor-product-app-derived/Build/Products/Debug/Anchor.app)
bundleID=dev.plimeor.Anchor
window=Anchor
sidebar rows=Product loop / Binding integration / Sync boundary
detail title=Product loop
inspector=Today / 3ef88671 / 8 / stage-3 / macOS
toolbar=New Note disabled; Sync disabled
```

**Verdict：** macOS runtime shell is visible and matches the intended scaffold state: navigation, projection display, inspector metadata, and disabled write/sync actions.

---

## 8. Gate Effects

**Gates closed this iteration:**

- Product app project shell exists under approved Option A location, created by Xcode.app: `suites/anchor/apple/Anchor/Anchor.xcodeproj`.
- macOS product shell debug build passes.
- iOS Simulator compile-only for the same Xcode-created target passes.
- macOS product shell runtime is observed.
- Product shell keeps write/sync actions disabled and preserves client/core red lines.

**Gates still open:**

- product app binding integration（generated Swift binding import + core-sourced projection）— **Not run**
- product TextKit editor runtime (`NSUndoManager`, VoiceOver, moving-view replay, inverse-op contract) — **Not run**
- product conflict-resolution UX / core integration — **Not run**
- Developer ID / App Store distribution / notarization — **Not run**
- iCloud runtime gates: remote placeholder, signed-out/over-quota, real iOS delivery, iCloud-context compaction/budget — **Not run**

---

## 9. Ledger Entry

### Ledger entry — 2026-06-11 — iteration 10 — doc 26-xcode-product-app-scaffold.md

- **Checkpoint / cursor:** Stage-3 macOS product app scaffold（D40）；CP-1 Apple delivery gates remain open
- **Action selected:** create formal macOS/iOS product app project using Xcode.app, then establish macOS-first shell
- **Owner classification:** Apple product owner / Codex via Xcode.app UI + local Xcode build verification
- **Scope-fence check:** passed under D40 — no root workspace / lockfile / package config changes; no entitlement/container/CloudKit/persistent writes; Swift deterministic-semantics grep clean
- **Evidence (Observed = command + output):**
  - `find suites/anchor/apple/Anchor -maxdepth 5 -type f | sort` → Xcode project + SwiftUI source files listed in §3
  - `mcp__xcodebuildmcp.discover_projs(...)` → `status=SUCCEEDED`, `projectCount=1`
  - `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -list -project suites/anchor/apple/Anchor/Anchor.xcodeproj` → target/scheme `Anchor`
  - macOS build command in §5 → `** BUILD SUCCEEDED **`
  - iOS Simulator build command in §5 → `** BUILD SUCCEEDED **`
  - `bun install --dry-run --frozen-lockfile --ignore-scripts` → `[31.00ms] done`
  - Apple client deterministic-semantics audit in §6 → 0 matches, exit 1
  - core/cli cloud-symbol audit in §6 → 0 matches, exit 1
  - runtime app-state snapshot in §7 → sidebar/detail/inspector visible; write/sync disabled
- **Gates closed this iteration:** product shell scaffold + macOS debug build/runtime + iOS Simulator compile-only
- **Gates still open:** binding integration / TextKit product runtime / conflict UX / release distribution / iCloud delivery gates tagged Not run
- **Backfill to 04/05/06:** `05` D40 added; `21` state block updated; `00` cursor updated
- **Axis matrix delta:** new Stage-3 macOS product shell axis = scaffold-go / in progress
- **Gate evaluation:** CONTINUE — next action: macOS product app binding lower bound（read-only projection surface）
- **Decision requested:** none
- **New doc:** `docs/workbench/20260606-anchor-v1/26-xcode-product-app-scaffold.md`
