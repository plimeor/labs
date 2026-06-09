# Anchor Stage 1 — iOS Simulator iCloud Rerun Report

任务：CP-1 iCloud delivery gate，在用户确认 iOS Simulator 已登录 iCloud 后，重跑 Xcode-managed iOS Simulator CloudDocuments verifier。
日期：2026-06-10
状态：**workbench artifact** —— 非公开接口契约；本轮不关闭 iOS Simulator / iOS CloudDocuments delivery gate，确认当前 iOS 26.5 Simulator runtime 仍不支持 CloudDocuments container lookup。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**package / workspace / 产品 app / 生成 lockfile / public CLI schema 改动；本轮没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；没有改 `suites/anchor/core/src/**` production source；没有创建 repo 内 product app shell；没有改 Xcode project / bundle id / entitlement；没有执行 iCloud account mutation。运行产物位于 `/tmp/anchor-apple-stage1/**`；iOS verifier project 使用 repo-external Xcode-created project `/Users/plimeor/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj`。

---

## 1. 结论

**Strongest conclusion：即使接受“iOS Simulator 已登录 iCloud”作为本轮前提，当前 iOS 26.5 Simulator 仍不能关闭 Anchor 的 CloudDocuments / iCloud Drive delivery gate。**

Xcode-managed verifier build、install、launch 均成功；simulated xcent 里也存在 CloudDocuments / ubiquity entitlements。但 app-side runtime lookup 仍返回：

```text
icloud-runtime:explicit_nil=true
icloud-runtime:implicit_nil=true
icloud-runtime:blocked=no_ubiquity_container
```

CloudDocs daemon 日志继续给出同一 runtime blocker：

```text
BRCloudDocsErrorDomain:153
Returning error because iCloud Drive not supported
```

所以本轮结论不是“用户没有登录 iCloud”，也不是“Xcode project/build/install/entitlement 链失败”。更精确的结论是：**这个 iOS 26.5 Simulator runtime 对 app-side CloudDocuments / ubiquity container lookup 仍不可用。** Anchor 不能用该 Simulator 作为 iOS/non-macOS CloudDocuments delivery proof；physical iPhone unlock 后的真实设备 runtime 仍是该 gate 的下一条有效路径。

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| root workspace / package / lockfile | not changed |
| `suites/anchor/core/src/**` | not changed |
| public CLI schema | not changed |
| repo product app shell | not created |
| Xcode project / bundle id / entitlement | not changed |
| iCloud account mutation | not performed |
| Xcode project used | repo-external existing project: `/Users/plimeor/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj` |
| build output | `/tmp/anchor-apple-stage1/DerivedData/AnchorProvisionProbe-iossim-rerun-20260610` |
| iOS Simulator | `A1D90DAB-1FAC-413A-BCB4-F92B9F798F75` (`iPhone 17`, booted, iOS 26.5) |
| checkpoint exit | not reached |

---

## 3. Observed evidence

### 3.1 XcodeBuildMCP tool environment

Tool call:

```text
mcp__xcodebuildmcp.session_show_defaults
```

Observed defaults:

```text
projectPath=/Users/plimeor/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj
scheme=AnchorProvisionProbe
simulatorId=A1D90DAB-1FAC-413A-BCB4-F92B9F798F75
simulatorPlatform=iOS Simulator
derivedDataPath=/tmp/anchor-apple-stage1/DerivedData/AnchorProvisionProbe-iossim-20260610
bundleId=dev.plimeor.AnchorProvisionProbe
env DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
```

Tool call:

```text
mcp__xcodebuildmcp.build_run_sim({"launchArgs":["--icloud-runtime-probe"]})
```

Observed:

```text
xcrun: error: unable to find utility "simctl", not a developer tool or in PATH
```

Interpretation: this is XcodeBuildMCP tool-environment friction already seen in doc 23, not a verifier project failure. The rerun therefore used explicit shell commands with `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`.

### 3.2 Simulator and Xcode destination

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun simctl list devices available | rg -n "A1D90DAB|Booted|iPhone"
```

Observed:

```text
iPhone 17 (A1D90DAB-1FAC-413A-BCB4-F92B9F798F75) (Booted)
```

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -showdestinations \
  -project /Users/plimeor/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj \
  -scheme AnchorProvisionProbe
```

Observed excerpt:

```text
{ platform:iOS Simulator, arch:arm64, id:A1D90DAB-1FAC-413A-BCB4-F92B9F798F75, OS:26.5, name:iPhone 17 }
```

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -list \
  -project /Users/plimeor/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj
```

Observed:

```text
Targets: AnchorProvisionProbe
Schemes: AnchorProvisionProbe
```

### 3.3 Simulator build and entitlement surface

Command:

```sh
rm -rf /tmp/anchor-apple-stage1/DerivedData/AnchorProvisionProbe-iossim-rerun-20260610
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -project /Users/plimeor/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj \
  -scheme AnchorProvisionProbe \
  -destination 'platform=iOS Simulator,id=A1D90DAB-1FAC-413A-BCB4-F92B9F798F75' \
  -configuration Debug \
  -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/AnchorProvisionProbe-iossim-rerun-20260610 \
  build
```

Observed:

```text
** BUILD SUCCEEDED **
```

Observed simulated xcent values:

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
  /tmp/anchor-apple-stage1/DerivedData/AnchorProvisionProbe-iossim-rerun-20260610/Build/Products/Debug-iphonesimulator/AnchorProvisionProbe.app
```

Observed:

```text
<dict></dict>
```

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun llvm-objdump --macho --section-headers \
  /tmp/anchor-apple-stage1/DerivedData/AnchorProvisionProbe-iossim-rerun-20260610/Build/Products/Debug-iphonesimulator/AnchorProvisionProbe.app/AnchorProvisionProbe
```

Observed:

```text
__TEXT __entitlements size 00000396
__TEXT __ents_der     size 00000201
```

Interpretation: the simulator build carries a simulated entitlement surface even though outer `codesign` prints an empty entitlement dictionary. The failure below must be evaluated as runtime support failure, not as “no entitlement evidence”.

### 3.4 Install and runtime launch

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun simctl install \
  A1D90DAB-1FAC-413A-BCB4-F92B9F798F75 \
  /tmp/anchor-apple-stage1/DerivedData/AnchorProvisionProbe-iossim-rerun-20260610/Build/Products/Debug-iphonesimulator/AnchorProvisionProbe.app
```

Observed: exit 0, no error output.

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
dev.plimeor.AnchorProvisionProbe: 97672
icloud-runtime:explicit_nil=true
icloud-runtime:implicit_nil=true
icloud-runtime:blocked=no_ubiquity_container
```

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

### 3.6 Boundary audits

Command:

```sh
rg -n "CloudKit|CKRecord|CKSyncEngine|NSFileCoordinator|NSMetadataQuery|ubiquity|iCloud" suites/anchor/core
```

Observed: 0 matches, exit 1.

Command:

```sh
rg -n "diff3|order[-_ ]?key|fractional|merge.*semantic|canonical" suites/anchor/apple
```

Observed: 0 matches, exit 1.

Note: `snapshot_revision` exists in Apple binding DTO/JSON surfaces as a transported core field name; it is not counted as Swift-side deterministic semantics implementation.

---

## 4. Gate evaluation

| Gate | Result |
|---|---|
| Xcode-managed iOS target/scheme visibility | closed for verifier use |
| iOS Simulator destination exists and is booted | closed |
| iOS Simulator build/install/launch | closed |
| simulated CloudDocuments entitlement surface | observed |
| app-side ubiquity container lookup | failed: explicit and implicit nil |
| CloudDocuments / iCloud Drive support in this Simulator runtime | failed: `BRCloudDocsErrorDomain:153`, `iCloud Drive not supported` |
| iOS Simulator as substitute for physical iOS CloudDocuments runtime | rejected for current runtime |
| iOS/non-macOS CloudDocuments delivery | open |
| CP-1 whole-exit | **not exited** |

Gate evaluation: **CONTINUE** for non-simulator gates. Do not use this iOS 26.5 Simulator to close CloudDocuments delivery unless a future Xcode/iOS runtime produces a non-nil ubiquity container and no `BRCloudDocsErrorDomain:153` support failure. The next valid proof path for iOS/non-macOS CloudDocuments remains physical-device runtime after unlock.
