# Anchor Stage 1 — iOS Simulator iCloud Report

任务：CP-1 Apple half verifier round，使用 Xcode-managed iOS app target 在已 booted iOS Simulator 上验证 CloudDocuments / iCloud Drive runtime。
日期：2026-06-10
状态：**workbench artifact** —— 非公开接口契约；本轮没有关闭 CP-1，继续停留在 CP-1 Apple half。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**任何 package / workspace / 产品 app / 生成 lockfile / core 改动；本轮没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；没有创建 repo 内产品 app shell；没有向 `suites/anchor/core` 引入 Apple / iCloud / file-coordination 类型。运行产物位于 `/tmp/anchor-apple-stage1/**`；iOS verifier project 使用 repo-external Xcode-created project `/Users/plimeor/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj`。

---

## 1. 结论

**Strongest conclusion：当前 iOS 26.5 Simulator 不能关闭 Anchor 的 CloudDocuments / iCloud Drive gate，即使用户侧已登录 iCloud。**

本轮构建层证据显示 Xcode iOS target、scheme、iOS Simulator destination、iCloud entitlement file、simulator embedded entitlement section 都存在；运行层证据仍然返回：

```text
icloud-runtime:explicit_nil=true
icloud-runtime:implicit_nil=true
icloud-runtime:blocked=no_ubiquity_container
```

同时 `bird` / CloudDocs 日志给出更直接归因：

```text
BRCloudDocsErrorDomain:153
Returning error because iCloud Drive not supported
```

所以本轮不是“没有登录 iCloud 账号”的证明，也不是“工程完全没有 entitlement”的证明。更精确的结论是：在这个 iOS 26.5 Simulator runtime 中，CloudDocuments / iCloud Drive support 对 app-side ubiquitous container lookup 不可用。Anchor 的 B14 transport gate 仍必须依赖 macOS signed verifier 与后续真实 iOS device / product-runtime evidence；不能用本 simulator 关闭 iOS/non-macOS iCloud Drive runtime gate。

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| root workspace / package / lockfile | not changed |
| `suites/anchor/core` | not changed |
| product app shell in repo | not created |
| Xcode project used | repo-external existing project: `/Users/plimeor/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj` |
| build output | `/tmp/anchor-apple-stage1/DerivedData/AnchorProvisionProbe-iossim-20260610` |
| iOS Simulator | `A1D90DAB-1FAC-413A-BCB4-F92B9F798F75` (`iPhone 17`, booted, iOS 26.5) |
| CloudKit / CKSyncEngine | not introduced |
| checkpoint exit | not reached |

---

## 3. Observed evidence

### 3.1 XcodeBuildMCP availability

Command/tool:

```text
mcp__xcodebuildmcp.session_show_defaults
```

Observed defaults:

```text
projectPath=/Users/plimeor/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj
scheme=AnchorProvisionProbe
configuration=Debug
simulatorId=A1D90DAB-1FAC-413A-BCB4-F92B9F798F75
simulatorPlatform=iOS Simulator
derivedDataPath=/tmp/anchor-apple-stage1/DerivedData/AnchorProvisionProbe-iossim-20260610
bundleId=dev.plimeor.AnchorProvisionProbe
```

Command/tool:

```text
mcp__xcodebuildmcp.list_sims(enabled=true)
```

Observed:

```text
Failed to list simulators: xcrun: error: unable to find utility "simctl", not a developer tool or in PATH
```

Interpretation: XcodeBuildMCP session state was configured correctly, but that tool environment still cannot resolve `simctl`. The verifier therefore used the same Xcode project and simulator through shell commands with explicit `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`. This is tool-environment friction, not a repo or Xcode project failure.

### 3.2 Xcode project and destination

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
  xcrun simctl list devices available | rg -n "A1D90DAB|Booted|iPhone 17"
```

Observed:

```text
iPhone 17 (A1D90DAB-1FAC-413A-BCB4-F92B9F798F75) (Booted)
```

### 3.3 iOS Simulator build

Command:

```sh
rm -rf /tmp/anchor-apple-stage1/DerivedData/AnchorProvisionProbe-iossim-20260610
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -project /Users/plimeor/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj \
  -scheme AnchorProvisionProbe \
  -destination 'platform=iOS Simulator,id=A1D90DAB-1FAC-413A-BCB4-F92B9F798F75' \
  -configuration Debug \
  -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/AnchorProvisionProbe-iossim-20260610 \
  build
```

Observed:

```text
** BUILD SUCCEEDED **
SDKROOT = iphonesimulator26.5
PRODUCT_BUNDLE_IDENTIFIER = dev.plimeor.AnchorProvisionProbe
```

Observed simulator xcent values:

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
  /tmp/anchor-apple-stage1/DerivedData/AnchorProvisionProbe-iossim-20260610/Build/Products/Debug-iphonesimulator/AnchorProvisionProbe.app
```

Observed:

```text
<dict></dict>
```

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun llvm-objdump --macho --section=__TEXT,__entitlements \
  /tmp/anchor-apple-stage1/DerivedData/AnchorProvisionProbe-iossim-20260610/Build/Products/Debug-iphonesimulator/AnchorProvisionProbe.app/AnchorProvisionProbe
```

Observed: the Mach-O `__TEXT,__entitlements` section contains the iCloud / ubiquity entitlement keys listed above. Therefore the empty `codesign` entitlement output is not enough to classify the app as entitlement-free.

### 3.4 Install and launch on Simulator

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun simctl install \
  A1D90DAB-1FAC-413A-BCB4-F92B9F798F75 \
  /tmp/anchor-apple-stage1/DerivedData/AnchorProvisionProbe-iossim-20260610/Build/Products/Debug-iphonesimulator/AnchorProvisionProbe.app
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
icloud-runtime:explicit_nil=true
icloud-runtime:implicit_nil=true
icloud-runtime:blocked=no_ubiquity_container
dev.plimeor.AnchorProvisionProbe: 74492
```

Interpretation: app launch succeeded. The app-side runtime probe did not obtain an explicit or implicit ubiquity container.

### 3.5 CloudDocs runtime logs

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun simctl spawn A1D90DAB-1FAC-413A-BCB4-F92B9F798F75 \
  log show --last 10m --style compact \
  --predicate 'process == "bird" AND eventMessage CONTAINS[c] "BRCloudDocsErrorDomain"'
```

Observed:

```text
bird ... [com.apple.clouddocs:default personal] [ERROR] +[BRCSystemSupportAnalyzer isCloudDocsSupportedWithError:]: (passed to caller) error: <NSError:... (BRCloudDocsErrorDomain:153) - {
}>
bird ... [com.apple.clouddocs:default personal] [WARNING] Returning error because iCloud Drive not supported: <NSError:... (BRCloudDocsErrorDomain:153) - {
}>
```

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun simctl spawn A1D90DAB-1FAC-413A-BCB4-F92B9F798F75 \
  log show --last 10m --style compact \
  --predicate 'process == "bird" AND eventMessage CONTAINS[c] "iCloud Drive not supported"'
```

Observed:

```text
Returning error because iCloud Drive not supported: <NSError:... (BRCloudDocsErrorDomain:153) - {
}>
```

Interpretation: the decisive blocker is CloudDocuments / iCloud Drive support in the simulator runtime, not app process launch failure.

---

## 4. Gate evaluation

| Gate | Result |
|---|---|
| Xcode-managed iOS target exists | closed for verifier use |
| iOS Simulator destination exists and is booted | closed |
| iOS app builds for simulator | closed |
| simulator app installs and launches | closed |
| iCloud / ubiquity entitlement appears in simulator Mach-O section | observed |
| app-side ubiquity container lookup | **failed** (`explicit_nil=true`, `implicit_nil=true`) |
| CloudDocuments / iCloud Drive supported by this simulator runtime | **failed** (`BRCloudDocsErrorDomain:153`, `iCloud Drive not supported`) |
| iOS/non-macOS iCloud Drive runtime gate | **open** |
| CP-1 whole-exit | **not exited** |

---

## 5. Next action

Do not spend the next iteration trying to make this iOS Simulator close the CloudDocuments gate unless new evidence shows iCloud Drive support can be enabled for this runtime. The next highest-value actions are:

1. Keep macOS signed verifier as the active B14 transport evidence path and move to another open gate: remote placeholder, account-state behavior, product conflict policy, or cross-target execution CI.
2. Use a real signed iOS device for CloudDocuments runtime proof if iOS/non-macOS transport evidence is required before CP-1 exit.

Gate evaluation: **CONTINUE**.
