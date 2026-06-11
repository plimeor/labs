# Anchor — Stage-3 XcodeGen product config evidence

任务：D41 授权后把 product app project config 迁移到 XcodeGen；`.xcodeproj` 作为 ignored 生成物重新生成
日期：2026-06-11
状态：**evidence doc（iteration 12）** —— 非公开接口契约；消费方为 `21` ledger、`05` D41 与 `00` cursor

> **边界声明（AGENTS 工作台规则，强制）：** 本文件记录 D41 授权范围内的 XcodeGen project config 迁移证据；不授权 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置 / generated lockfile 改动，不授权 entitlement / iCloud container / CloudKit / 持久应用写入 / release signing / notarization。Swift product app 只消费 core 输出，不实现 merge / diff3 / order-key / normalization / op-creation / tree invariant / BLAKE3 等 deterministic core semantics。产品写入和同步入口保持 disabled。

---

## 1. Verdict

**Observed：** `suites/anchor/apple/Anchor/project.yml` 已成为 product app Xcode project config 源头。`suites/anchor/apple/Anchor/Anchor.xcodeproj/` 未被 git 跟踪，已加入 `.gitignore`，删除后可由 `xcodegen generate` 重新生成。生成后的 project 持久化 `../AnchorCoreBindings` local package dependency 与 `Build anchor-core FFI` pre-build script；没有 `AnchorAppleSpike` product dependency。生成 project 的 macOS Debug 与 iOS Simulator Debug compile-only 均 exit 0。

**Not closed：** TextKit product runtime、editor write dispatch、persistence、iCloud、release distribution、notarization 均未关闭。Runtime UI snapshot 未在本 iteration 重新读取；`27` 已记录 read-only core projection UI proof，本轮只关闭 config source-of-truth + build gate。

---

## 2. Authorization

**Observed（user quote home = `05` D41）：**

- `修改边界：引入 XcodeGen 作为配置生成器，避免每次改个配置操作 xcode 经常失败，把配置都迁移到 XcodeGen 配置中`
- `既然 .xcodeproj 是生成的， 是否有必要先从 git 中移除（删掉），然后再添加到 gitignore 里，然后再重新生成？`
- `做`

---

## 3. XcodeGen Source

```console
$ xcodegen --version
Version: 2.45.4
```

```console
$ xcodegen dump --spec suites/anchor/apple/Anchor/project.yml --type parsed-yaml | rg -n "AnchorCoreBindings|basedOnDependencyAnalysis|Build anchor-core FFI|path: ../AnchorCoreBindings"
36:  AnchorCoreBindings:
38:    path: ../AnchorCoreBindings
55:      package: AnchorCoreBindings
66:    - basedOnDependencyAnalysis: false
69:      name: Build anchor-core FFI
```

**Observed：** XcodeGen spec owns the local package dependency, the FFI build script phase, and the explicit decision that the script runs every build without emitting Xcode's missing-output warning.

---

## 4. Generated Project Handling

```console
$ git ls-files suites/anchor/apple/Anchor/Anchor.xcodeproj
# no output
```

```console
$ rm -rf suites/anchor/apple/Anchor/Anchor.xcodeproj
$ xcodegen generate --spec suites/anchor/apple/Anchor/project.yml --project suites/anchor/apple/Anchor
⚙️  Generating plists...
⚙️  Generating project...
⚙️  Writing project...
Created project at /Users/plimeor/Documents/labs/suites/anchor/apple/Anchor/Anchor.xcodeproj
```

```console
$ git check-ignore -v suites/anchor/apple/Anchor/Anchor.xcodeproj/project.pbxproj suites/anchor/apple/Anchor/Anchor.xcodeproj/project.xcworkspace/contents.xcworkspacedata
.gitignore:151:suites/anchor/apple/Anchor/Anchor.xcodeproj/  suites/anchor/apple/Anchor/Anchor.xcodeproj/project.pbxproj
.gitignore:151:suites/anchor/apple/Anchor/Anchor.xcodeproj/  suites/anchor/apple/Anchor/Anchor.xcodeproj/project.xcworkspace/contents.xcworkspacedata
```

```console
$ git status --short --untracked-files=all suites/anchor/apple/Anchor/Anchor.xcodeproj .gitignore suites/anchor/apple/Anchor/project.yml
 M .gitignore
?? suites/anchor/apple/Anchor/project.yml
```

**Verdict：** `.xcodeproj` is a local generated output, not a git-tracked config contract.

---

## 5. Generated Project Contents

```console
$ rg -n "AnchorCoreBindings|Build anchor-core FFI|XCLocalSwiftPackageReference|PBXShellScriptBuildPhase|AnchorAppleSpike" suites/anchor/apple/Anchor/Anchor.xcodeproj/project.pbxproj
17:        EA62517D798671B94AA459AE /* AnchorCoreBindings in Frameworks */ = {isa = PBXBuildFile; productRef = BA903B5164B8C7A35BDEF61B /* AnchorCoreBindings */; };
27:        43EE1507D35A444199535721 /* AnchorCoreBindings */ = {isa = PBXFileReference; lastKnownFileType = folder; name = AnchorCoreBindings; path = ../AnchorCoreBindings; sourceTree = SOURCE_ROOT; };
128:        DFDE82B1D39A066F7A4676D0 /* Build anchor-core FFI */,
170:        121540CA371A2449C1D1E10D /* XCLocalSwiftPackageReference "../AnchorCoreBindings" */,
193:/* Begin PBXShellScriptBuildPhase section */
204:            name = "Build anchor-core FFI";
461:/* Begin XCLocalSwiftPackageReference section */
464:            relativePath = ../AnchorCoreBindings;
469:        BA903B5164B8C7A35BDEF61B /* AnchorCoreBindings */ = {
471:            productName = AnchorCoreBindings;
```

```console
$ rg "AnchorAppleSpike" suites/anchor/apple/Anchor/project.yml suites/anchor/apple/Anchor/Anchor.xcodeproj/project.pbxproj; printf 'exit=%s\n' "$?"
exit=1
```

**Verdict：** product target consumes formal `AnchorCoreBindings`; the old spike package is not a product dependency.

---

## 6. FFI Build Script

```console
$ DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer suites/anchor/apple/Anchor/Scripts/build-anchor-core-ffi.sh
     Locking 1 package to latest compatible version
   Compiling anchor-core v0.0.0 (/Users/plimeor/Documents/labs/suites/anchor/core)
   Compiling anchor-core-ffi v0.0.0 (/Users/plimeor/Documents/labs/suites/anchor/apple/ffi)
    Finished `release` profile [optimized] target(s) in 2.34s
   Compiling anchor-core v0.0.0 (/Users/plimeor/Documents/labs/suites/anchor/core)
   Compiling anchor-core-ffi v0.0.0 (/Users/plimeor/Documents/labs/suites/anchor/apple/ffi)
    Finished `release` profile [optimized] target(s) in 3.98s
Architectures in the fat file: /Users/plimeor/Documents/labs/suites/anchor/apple/ffi/target/release/libanchor_core_ffi.a are: x86_64 arm64
```

**Observed：** the script creates the universal macOS staticlib needed by generic macOS builds. The generated Cargo lock and target output are ignored by `.gitignore`.

---

## 7. Build Evidence

```console
$ DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -quiet -project suites/anchor/apple/Anchor/Anchor.xcodeproj -scheme Anchor -configuration Debug -destination 'generic/platform=macOS' -derivedDataPath /tmp/anchor-product-app-xcodegen-macos-derived CODE_SIGNING_ALLOWED=NO build
2026-06-11 02:34:56.101 xcodebuild[93879:3917418] [MT] IDERunDestination: Supported platforms for the buildables in the current scheme is empty.
# exit 0
```

```console
$ DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -quiet -project suites/anchor/apple/Anchor/Anchor.xcodeproj -scheme Anchor -configuration Debug -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/anchor-product-app-xcodegen-iossim-derived CODE_SIGNING_ALLOWED=NO build
2026-06-11 02:35:02.110 xcodebuild[94206:3918227] [MT] IDERunDestination: Supported platforms for the buildables in the current scheme is empty.
# exit 0
```

**Observed：** generated project builds for macOS and iOS Simulator. The `IDERunDestination` line is Xcode informational output; the commands exited 0.

---

## 8. Boundary Audits

```console
$ rg "diff3|order-key|merge|normaliz|op-creation|tree-invariant|blake3" suites/anchor/apple/Anchor/Anchor suites/anchor/apple/Anchor/project.yml suites/anchor/apple/Anchor/Scripts; printf 'exit=%s\n' "$?"
exit=1
```

```console
$ rg "CloudKit|CKRecord|CKAsset|CKContainer|CKSyncEngine|NSFileCoordinator|NSMetadataQuery|ubiquit|iCloud|NSURLIsExcludedFromBackupKey" suites/anchor/core suites/anchor/cli; printf 'exit=%s\n' "$?"
exit=1
```

```console
$ bun install --dry-run --frozen-lockfile --ignore-scripts
[33.00ms] done
```

```console
$ git diff --check
# clean
```

**Verdict：** no product deterministic-semantics redline match; no core/cli cloud-symbol leak; Bun workspace dry-run remains clean; diff whitespace check passes.

---

## 9. Gate Effects

**Gates closed this iteration:**

- D41 config boundary recorded: XcodeGen is the product project config source.
- `.xcodeproj` is ignored, deleted locally, regenerated, and no longer appears in `git status`.
- Generated project persists formal `AnchorCoreBindings` local package dependency and `Build anchor-core FFI` script.
- FFI build script produces universal macOS `libanchor_core_ffi.a`.
- Generated project macOS and iOS Simulator builds exit 0.
- Product/client redline, core/cli cloud-symbol audit, Bun dry-run, and diff check remain clean.

**Gates still open:**

- product TextKit editor runtime — **Not run**
- product editor write dispatch / persistence — **Not run**
- `NSUndoManager` grouping/redo, VoiceOver, moving-view replay, conflict UX — **Not run**
- iCloud runtime / entitlement / signed distribution / notarization — **Not run**

---

## 10. Ledger Entry

### Ledger entry — 2026-06-11 — iteration 12 — doc 28-stage-3-xcodegen-product-config.md

- **Checkpoint / cursor:** Stage-3 macOS product app integration；CP-1 Apple delivery gates remain open
- **Action selected:** D41 XcodeGen product config source：migrate project config into `project.yml`, ignore generated `.xcodeproj`, regenerate and build
- **Owner classification:** Apple product owner / Codex with local XcodeGen + Xcode build verification
- **Scope-fence check:** passed — no root workspace / lockfile / package config changes; no entitlement/container/CloudKit/persistent writes; no Swift deterministic semantics
- **Evidence (Observed = command + output):**
  - `xcodegen --version` → `Version: 2.45.4`
  - `xcodegen dump ... | rg ...` → `AnchorCoreBindings`, `path: ../AnchorCoreBindings`, `basedOnDependencyAnalysis: false`, `Build anchor-core FFI`
  - `git ls-files suites/anchor/apple/Anchor/Anchor.xcodeproj` → no output
  - `rm -rf .../Anchor.xcodeproj && xcodegen generate ...` → project generated
  - `git check-ignore -v .../project.pbxproj .../contents.xcworkspacedata` → both ignored by `.gitignore:151`
  - `rg ... project.pbxproj` → `AnchorCoreBindings`, `XCLocalSwiftPackageReference "../AnchorCoreBindings"`, `PBXShellScriptBuildPhase`, `Build anchor-core FFI`
  - `rg "AnchorAppleSpike" ...; printf 'exit=%s\n' "$?"` → `exit=1`
  - `build-anchor-core-ffi.sh` → universal `x86_64 arm64` `libanchor_core_ffi.a`
  - generated-project macOS build in §7 → exit 0
  - generated-project iOS Simulator build in §7 → exit 0
  - Apple client deterministic-semantics audit in §8 → exit 1
  - core/cli cloud-symbol audit in §8 → exit 1
  - `bun install --dry-run --frozen-lockfile --ignore-scripts` → `[33.00ms] done`
  - `git diff --check` → clean
- **Gates closed this iteration:** XcodeGen config source-of-truth + ignored/regenerated `.xcodeproj` + formal `AnchorCoreBindings` local package dependency + FFI universal pre-build script
- **Gates still open:** product TextKit runtime, write dispatch, persistence, iCloud, release distribution
- **Backfill to 04/05/06:** `05` D41 added；`21` state block and `00` cursor updated
- **Axis matrix delta:** Stage-3 macOS product shell `binding-read-floor` → `xcodegen-config-go`
- **Gate evaluation:** CONTINUE — next action: macOS product TextKit runtime lower bound（product-hosted AppKit text surface consuming core-sourced projection / DTO output; keep read-only or disabled-write）
- **Decision requested:** none
- **New doc:** `docs/workbench/20260606-anchor-v1/28-stage-3-xcodegen-product-config.md`
