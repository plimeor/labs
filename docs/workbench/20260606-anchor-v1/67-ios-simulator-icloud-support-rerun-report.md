# Anchor Stage 1 — iOS Simulator iCloud Support Rerun Report

任务：CP-1 iCloud delivery gate，在用户明确说明 iOS Simulator 已登录 iCloud 后，重新验证 Xcode-managed iOS Simulator CloudDocuments runtime。
日期：2026-06-10
状态：**workbench evidence** —— 非公开接口契约。本文件不关闭 iOS Simulator / iOS CloudDocuments delivery gate；它确认当前 iOS 26.5 Simulator runtime 仍不能作为 Anchor iCloud Drive delivery proof。

> 边界声明（AGENTS 工作台规则）：本轮没有改 root workspace / package / lockfile / public CLI schema；没有改 repo 内 Apple project、bundle id、entitlement、iCloud container 或产品 app；没有创建产品 app shell。Xcode-managed verifier 使用既有外部 project `/Users/plimeor/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj`，构建产物位于 `/tmp/anchor-apple-stage1/**`。

---

## 1. Strongest conclusion

**即使按用户本轮前提接受“iOS Simulator 已登录 iCloud”，当前 iOS 26.5 Simulator 仍不能关闭 Anchor 的 CloudDocuments / iCloud Drive delivery gate。**

Observed runtime output remains:

```text
icloud-runtime:explicit_nil=true
icloud-runtime:implicit_nil=true
icloud-runtime:blocked=no_ubiquity_container
```

`bird` logs still show:

```text
BRCloudDocsErrorDomain:153
Returning error because iCloud Drive not supported
```

This is not evidence that the user did not log into iCloud. It is evidence that this simulator runtime still does not expose CloudDocuments / ubiquitous container lookup to the app, despite a successful Xcode-managed build/install/launch and simulated entitlement surface. The valid proof path for iOS/non-macOS CloudDocuments delivery remains physical-device runtime, or a future simulator/runtime that returns a non-nil ubiquitous container and no `BRCloudDocsErrorDomain:153` support failure.

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| root workspace / package / lockfile | not changed |
| repo code / Apple project config | not changed |
| public CLI schema | not changed |
| product app shell | not created |
| entitlement / bundle id / iCloud container | not changed |
| iCloud account state | not changed |
| generated artifacts | `/tmp/anchor-apple-stage1/DerivedData/AnchorProvisionProbe-iossim-rerun3-20260610` only |

---

## 3. Observed evidence

### 3.1 XcodeBuildMCP attempt

Command/tool:

```text
mcp__xcodebuildmcp.session_show_defaults()
```

Observed defaults:

```text
projectPath=/Users/plimeor/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj
scheme=AnchorProvisionProbe
simulatorId=A1D90DAB-1FAC-413A-BCB4-F92B9F798F75
simulatorPlatform=iOS Simulator
bundleId=dev.plimeor.AnchorProvisionProbe
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
```

Command/tool:

```text
mcp__xcodebuildmcp.list_sims(enabled=true)
```

Observed:

```text
didError=true
Failed to list simulators: xcrun: error: unable to find utility "simctl", not a developer tool or in PATH
```

Command/tool:

```text
mcp__xcodebuildmcp.build_run_sim({"launchArgs":["--icloud-runtime-probe"]})
```

Observed:

```text
didError=true
Build failed
rawOutput: Failed to list simulators: xcrun: error: unable to find utility "simctl", not a developer tool or in PATH
```

Interpretation: XcodeBuildMCP was attempted first, but its tool environment could not locate `simctl`. This is a tool-environment failure, not a CloudDocuments runtime result.

### 3.2 Simulator and project discovery via explicit Xcode developer dir

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun simctl list devices booted
```

Observed:

```text
== Devices ==
-- iOS 26.2 --
-- iOS 26.4 --
-- iOS 26.5 --
    iPhone 17 (A1D90DAB-1FAC-413A-BCB4-F92B9F798F75) (Booted)
```

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -list \
  -project /Users/plimeor/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj
```

Observed:

```text
Targets:
    AnchorProvisionProbe
Schemes:
    AnchorProvisionProbe
```

### 3.3 iOS Simulator build

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -project /Users/plimeor/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj \
  -scheme AnchorProvisionProbe \
  -destination 'platform=iOS Simulator,id=A1D90DAB-1FAC-413A-BCB4-F92B9F798F75' \
  -configuration Debug \
  -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/AnchorProvisionProbe-iossim-rerun3-20260610 \
  build
```

Observed:

```text
** BUILD SUCCEEDED **
```

Observed simulated xcent values in the build log:

```text
application-identifier = <TEAM_ID>.dev.plimeor.AnchorProvisionProbe
com.apple.developer.icloud-container-development-container-identifiers = <ICLOUD_CONTAINER>
com.apple.developer.icloud-container-environment = Development
com.apple.developer.icloud-container-identifiers = <ICLOUD_CONTAINER>
com.apple.developer.icloud-services = CloudDocuments
com.apple.developer.ubiquity-container-identifiers = <ICLOUD_CONTAINER>
```

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  codesign -d --entitlements :- \
  /tmp/anchor-apple-stage1/DerivedData/AnchorProvisionProbe-iossim-rerun3-20260610/Build/Products/Debug-iphonesimulator/AnchorProvisionProbe.app
```

Observed:

```text
<dict></dict>
```

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun llvm-objdump --macho --section-headers \
  /tmp/anchor-apple-stage1/DerivedData/AnchorProvisionProbe-iossim-rerun3-20260610/Build/Products/Debug-iphonesimulator/AnchorProvisionProbe.app/AnchorProvisionProbe |
  rg "__entitlements|__ents_der"
```

Observed:

```text
8 __entitlements  00000396 ...
9 __ents_der      00000201 ...
```

Interpretation: same as doc 45: the simulator build carries simulated entitlements in the Mach-O sections even though outer `codesign` reports an empty entitlement dictionary.

### 3.4 Install and runtime launch

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun simctl install \
  A1D90DAB-1FAC-413A-BCB4-F92B9F798F75 \
  /tmp/anchor-apple-stage1/DerivedData/AnchorProvisionProbe-iossim-rerun3-20260610/Build/Products/Debug-iphonesimulator/AnchorProvisionProbe.app
```

Observed: no output, exit `0`.

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun simctl launch --console --terminate-running-process \
  A1D90DAB-1FAC-413A-BCB4-F92B9F798F75 \
  dev.plimeor.AnchorProvisionProbe \
  --icloud-runtime-probe
```

Observed:

```text
dev.plimeor.AnchorProvisionProbe: 22748
icloud-runtime:explicit_nil=true
icloud-runtime:implicit_nil=true
icloud-runtime:blocked=no_ubiquity_container
```

The console output duplicates some lines through OS logging, but the decisive app result is unchanged: both explicit and implicit ubiquity container URLs are nil.

### 3.5 CloudDocs and app logs

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun simctl spawn A1D90DAB-1FAC-413A-BCB4-F92B9F798F75 \
  log show --last 5m --style compact \
  --predicate 'process == "bird" AND (eventMessage CONTAINS[c] "CloudDocs" OR eventMessage CONTAINS[c] "iCloud Drive" OR eventMessage CONTAINS[c] "BRCloudDocsErrorDomain")'
```

Observed excerpts:

```text
BRCloudDocsErrorDomain:153
Returning error because iCloud Drive not supported
```

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun simctl spawn A1D90DAB-1FAC-413A-BCB4-F92B9F798F75 \
  log show --last 5m --style compact \
  --predicate 'process == "AnchorProvisionProbe"'
```

Observed excerpts:

```text
icloud-runtime:explicit_nil=true
icloud-runtime:implicit_nil=true
icloud-runtime:blocked=no_ubiquity_container
```

---

## 4. Gate result

Closed this iteration:

- XcodeBuildMCP defaults were verified; its simulator action is currently blocked by tool environment `simctl` lookup, not by project configuration.
- Explicit `DEVELOPER_DIR` Xcode CLI confirms the iPhone 17 simulator is booted.
- Xcode-managed iOS Simulator verifier build succeeds.
- Install and launch succeed.
- Simulated CloudDocuments entitlement surface remains present.

Still open:

- CloudDocuments / iCloud Drive support in this iOS Simulator runtime remains failed: `BRCloudDocsErrorDomain:153`, `iCloud Drive not supported`.
- iOS Simulator remains rejected as substitute proof for physical iOS CloudDocuments delivery in this runtime.
- Physical iPhone runtime after unlock remains the next valid iOS/non-macOS proof path.
- CP-1 whole-exit remains open.

---

## 5. Ledger entry

### Ledger entry — 2026-06-10 — iteration 46 — doc 67-ios-simulator-icloud-support-rerun-report.md

- **Checkpoint / cursor:** CP-1 Apple half, iOS/non-macOS CloudDocuments delivery gate.
- **Action selected:** rerun the Xcode-managed iOS Simulator CloudDocuments verifier after the user explicitly stated that Simulator is logged into iCloud.
- **Owner classification:** Apple/iCloud verifier → runtime probe; no repo code, Xcode project config, entitlement, bundle id, or iCloud account mutation.
- **Scope-fence check:** passed — no root workspace / package / lockfile changes; no product app shell; no CloudKit/CKSyncEngine path; no core cloud-symbol exposure.
- **Evidence (Observed = command + output):**
  - XcodeBuildMCP defaults point to `AnchorProvisionProbe`, but `list_sims` / `build_run_sim` fail because MCP cannot locate `simctl`.
  - Explicit `DEVELOPER_DIR` `xcrun simctl list devices booted` → iPhone 17 `A1D90DAB-1FAC-413A-BCB4-F92B9F798F75` booted on iOS 26.5.
  - `xcodebuild -project /Users/plimeor/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj ... build` → `** BUILD SUCCEEDED **`.
  - Build log simulated xcent contains CloudDocuments / ubiquity entitlement keys.
  - `simctl install` → exit `0`.
  - `simctl launch --console ... --icloud-runtime-probe` → `explicit_nil=true`, `implicit_nil=true`, `blocked=no_ubiquity_container`.
  - `bird` log → `BRCloudDocsErrorDomain:153` and `Returning error because iCloud Drive not supported`.
- **Gates closed this iteration:** none for CP-1 delivery; build/install/launch reproducibility only.
- **Gates still open:** iOS/non-macOS CloudDocuments runtime delivery, physical iPhone runtime after unlock, true remote placeholder, signed-out/over-quota, product compaction/iCloud context, product conflict resolver integration, product TextKit/UI integration.
- **Backfill to 04/05/06:** none; existing baseline already records the same simulator runtime limitation.
- **Axis matrix delta:** none; iCloud remains `approved default transport WITH compromise constraints`; iOS Simulator remains not valid delivery proof for this runtime.
- **Gate evaluation:** CONTINUE for non-simulator gates. Do not use this iOS 26.5 Simulator to close CloudDocuments delivery unless a future simulator/runtime returns non-nil ubiquitous container URLs and no `BRCloudDocsErrorDomain:153`.
- **New doc:** `docs/workbench/20260606-anchor-v1/67-ios-simulator-icloud-support-rerun-report.md`
