# Anchor Stage 1 — Apple Verifier Rerun Report

任务：CP-1 Apple half verifier round，复跑 repo-local signed macOS iCloud verifier，并尝试最小 iOS Simulator iCloud runtime feasibility probe。
日期：2026-06-10
状态：**workbench artifact** —— 非公开接口契约；本轮没有关闭 CP-1，继续停留在 CP-1 Apple half。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**任何 package / workspace / 产品 app / 生成 lockfile / core 改动；本轮没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；没有创建产品 app shell；没有向 `suites/anchor/core` 引入 Apple / iCloud / file-coordination 类型。运行产物位于 `/tmp/anchor-apple-stage1/**`，repo-local probe 仍限于 verifier-only Apple artifact。

---

## 1. 结论

**本轮 strongest conclusion：repo-local signed macOS verifier 仍可复现，iCloud Drive compromise 形状不变；iOS Simulator iCloud runtime gate 没有关闭。**

Observed macOS evidence 继续支持 B14 的当前形状：`.anchorvault` package 级别可发现、`NSFileCoordinator` read/write 可用、package-internal segment discovery 不能依赖 `NSMetadataQuery`，必须走 direct enumeration；package-internal placeholder/download 仍返回 `NSCocoaErrorDomain Code=4`，不能当 true remote `.icloud` placeholder proof。

本轮新增的 iOS Simulator 尝试只证明两件事：

- 无 entitlement 的 simulator executable 运行成功，但 explicit / implicit ubiquity container 都是 nil。
- 临时 ad-hoc signed simulator app bundle 能安装，codesign 可读出 iCloud entitlements，但 launch 被 SpringBoard 拒绝；安装日志记录 executable entitlement 识别不可靠。因此它不能作为 iOS iCloud runtime evidence。

所以 CP-1 仍未退出。下一轮最低风险 action 是用 Xcode-managed iOS app target / project 跑 simulator iCloud runtime，而不是继续使用手工 bundle。

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| root workspace / package / lockfile | not changed |
| `suites/anchor/core` | not changed |
| product app shell | not created |
| Apple probe scope | macOS verifier reused; temporary iOS simulator artifacts only under `/tmp/anchor-apple-stage1` |
| CloudKit / CKSyncEngine | not introduced |
| Swift/TextKit core deterministic semantics | not introduced |
| checkpoint exit | not reached |

---

## 3. Observed evidence

### 3.1 Toolchain and schemes

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -version
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun swift --version
rustc --version
cargo --version
```

Observed:

```text
Xcode 26.5
Build version 17F42
Apple Swift version 6.3.2
rustc 1.95.0
cargo 1.95.0
```

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -list \
  -project suites/anchor/apple/AnchorMacICloudProbe/AnchorMacICloudProbe.xcodeproj
```

Observed:

```text
Targets: AnchorMacICloudProbe
Schemes: AnchorMacICloudProbe
```

XcodeBuildMCP note: `mcp__xcodebuildmcp.list_schemes` failed because that tool environment could not find `xcodebuild` in PATH. The same project lists successfully with explicit `DEVELOPER_DIR`. This is tool-environment friction, not an Xcode/project failure.

### 3.2 Repo-local signed macOS verifier build

Command:

```sh
rm -rf /tmp/anchor-apple-stage1/DerivedData/AnchorMacICloudProbe-20260610
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -project suites/anchor/apple/AnchorMacICloudProbe/AnchorMacICloudProbe.xcodeproj \
  -scheme AnchorMacICloudProbe \
  -destination 'platform=macOS,arch=arm64' \
  -configuration Debug \
  -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/AnchorMacICloudProbe-20260610 \
  -allowProvisioningUpdates \
  -allowProvisioningDeviceRegistration \
  CODE_SIGN_ENTITLEMENTS=AnchorMacProbe.entitlements \
  INFOPLIST_FILE=AnchorMacProbeInfo.plist \
  GENERATE_INFOPLIST_FILE=NO \
  build
```

Observed excerpt:

```text
Signing Identity: "Apple Development: <DEVELOPER_NAME> (<TEAM_ID_ALT>)"
Provisioning Profile: "Mac Team Provisioning Profile: dev.plimeor.AnchorMacICloudProbe"
(3f0476f1-ba42-404e-be20-945e7cec4a7f)
** BUILD SUCCEEDED **
```

Command:

```sh
codesign -d --entitlements :- \
  /tmp/anchor-apple-stage1/DerivedData/AnchorMacICloudProbe-20260610/Build/Products/Debug/AnchorMacICloudProbe.app
```

Observed key entitlements:

```text
com.apple.application-identifier = <TEAM_ID>.dev.plimeor.AnchorMacICloudProbe
com.apple.developer.icloud-container-identifiers = <ICLOUD_CONTAINER>
com.apple.developer.icloud-services = CloudDocuments
com.apple.developer.team-identifier = <TEAM_ID>
com.apple.developer.ubiquity-container-identifiers = <ICLOUD_CONTAINER>
com.apple.security.app-sandbox = true
```

Command:

```sh
plutil -p \
  /tmp/anchor-apple-stage1/DerivedData/AnchorMacICloudProbe-20260610/Build/Products/Debug/AnchorMacICloudProbe.app/Contents/Info.plist
```

Observed key Info.plist values:

```text
CFBundleIdentifier = dev.plimeor.AnchorMacICloudProbe
NSUbiquitousContainers.<ICLOUD_CONTAINER>
UTExportedTypeDeclarations[0].UTTypeIdentifier = dev.plimeor.anchor.vault
UTExportedTypeDeclarations[0].UTTypeConformsTo = com.apple.package
public.filename-extension = anchorvault
```

Command:

```sh
security cms -D -i \
  /tmp/anchor-apple-stage1/DerivedData/AnchorMacICloudProbe-20260610/Build/Products/Debug/AnchorMacICloudProbe.app/Contents/embedded.provisionprofile
```

Observed excerpt:

```text
Name = Mac Team Provisioning Profile: dev.plimeor.AnchorMacICloudProbe
UUID = 3f0476f1-ba42-404e-be20-945e7cec4a7f
TeamName = <DEVELOPER_NAME>
IsXcodeManaged = true
Entitlements include iCloud.dev.plimeor.AnchorMacICloudProbe and <ICLOUD_CONTAINER>
```

### 3.3 macOS iCloud runtime

Command:

```sh
/tmp/anchor-apple-stage1/DerivedData/AnchorMacICloudProbe-20260610/Build/Products/Debug/AnchorMacICloudProbe.app/Contents/MacOS/AnchorMacICloudProbe \
  --icloud-runtime-probe
```

Observed:

```text
icloud_probe explicit_nil=false
icloud_probe implicit_nil=false
icloud_probe container_path=/Users/plimeor/Library/Mobile Documents/iCloud~dev~plimeor~AnchorProvisionProbe
icloud_probe vault_package=AnchorStage1MacProbe.anchorvault
icloud_probe vault_type_identifier=dev.plimeor.anchor.vault
icloud_probe vault_is_ubiquitous=true
icloud_probe coordinated_segment_bytes=30
icloud_probe coordinated_segment_equal=true
icloud_probe segment_is_ubiquitous=false
icloud_probe segment_download_status=nil
icloud_probe evict_segment_error=Error Domain=NSCocoaErrorDomain Code=4
icloud_probe start_download_error=Error Domain=NSCocoaErrorDomain Code=4
icloud_probe manifest_conflict_versions=0
icloud_probe metadata_initial_gathered=true
icloud_probe metadata_seg_count=0
icloud_probe scale_subset_files=1024
icloud_probe scale_subset_direct_count=1024
icloud_probe cleanup_removed=true
```

Interpretation:

- signed macOS container lookup and package UTType are still good;
- coordinated read/write is still good;
- package-internal metadata query remains 0;
- package-internal placeholder/download is still not a true remote `.icloud` placeholder proof.

### 3.4 macOS 10K scale rerun

Command:

```sh
/tmp/anchor-apple-stage1/DerivedData/AnchorMacICloudProbe-20260610/Build/Products/Debug/AnchorMacICloudProbe.app/Contents/MacOS/AnchorMacICloudProbe \
  --icloud-scale-probe 10000
```

Observed:

```text
icloud_probe explicit_nil=false
icloud_probe implicit_nil=false
icloud_scale files=10000
icloud_scale write_ms=3341.31
icloud_scale direct_count=10000
icloud_scale enum_ms=24.46
icloud_scale metadata_gathered=true
icloud_scale metadata_count=0
icloud_scale cleanup_ms=1225.44
```

Interpretation: 10K direct package-internal enumeration remains fast enough in the verifier shape. This is a reproducibility check for the existing macOS gate, not new proof for non-macOS scale or steady-state segment budget.

### 3.5 iOS Simulator feasibility probe

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun simctl list devices booted
```

Observed:

```text
iPhone 17 (A1D90DAB-1FAC-413A-BCB4-F92B9F798F75) (Booted)
```

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun swiftc -target arm64-apple-ios26.5-simulator \
  -sdk /Applications/Xcode.app/Contents/Developer/Platforms/iPhoneSimulator.platform/Developer/SDKs/iPhoneSimulator26.5.sdk \
  /tmp/anchor-apple-stage1/ios-sim-icloud-probe.swift \
  -o /tmp/anchor-apple-stage1/ios-sim-icloud-probe

DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun simctl spawn A1D90DAB-1FAC-413A-BCB4-F92B9F798F75 \
  /tmp/anchor-apple-stage1/ios-sim-icloud-probe
```

Observed:

```text
ios_sim_probe explicit_nil=true
ios_sim_probe implicit_nil=true
```

Interpretation: this is not an iCloud account failure proof because the executable has no app entitlement.

Command:

```sh
codesign --force --sign - \
  --entitlements /tmp/anchor-apple-stage1/ios-sim-app/AnchorIOSSimICloudProbe.entitlements \
  /tmp/anchor-apple-stage1/ios-sim-app/AnchorIOSSimICloudProbe.app

DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun simctl install A1D90DAB-1FAC-413A-BCB4-F92B9F798F75 \
  /tmp/anchor-apple-stage1/ios-sim-app/AnchorIOSSimICloudProbe.app

DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun simctl launch --console --terminate-running-process \
  A1D90DAB-1FAC-413A-BCB4-F92B9F798F75 \
  dev.plimeor.AnchorIOSSimICloudProbe
```

Observed:

```text
Simulator device failed to launch dev.plimeor.AnchorIOSSimICloudProbe.
The request was denied by service delegate (SBMainWorkspace).
Underlying error: launch-failed; Launchd job spawn failed.
```

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun simctl spawn A1D90DAB-1FAC-413A-BCB4-F92B9F798F75 \
  log show --last 2m \
  --predicate 'eventMessage CONTAINS "dev.plimeor.AnchorIOSSimICloudProbe" OR eventMessage CONTAINS "entitlement" OR eventMessage CONTAINS "launch"' \
  --style compact
```

Observed excerpt:

```text
Executable for dev.plimeor.AnchorIOSSimICloudProbe ... had no entitlements
The request to open "dev.plimeor.AnchorIOSSimICloudProbe" failed.
NSPOSIXErrorDomain Code=163
```

Interpretation: a hand-built/ad-hoc simulator app bundle is not acceptable evidence for iCloud runtime. The next verifier must be an Xcode-managed iOS app target / project with recognized entitlements.

### 3.6 Boundary audits

Command:

```sh
rg "CloudKit|CKRecord|CKAsset|CKContainer|CKSyncEngine|NSFileCoordinator|NSMetadataQuery|ubiquit|iCloud|NSURLIsExcludedFromBackupKey" suites/anchor/core
printf 'rg_exit=%s\n' $?
```

Observed:

```text
rg_exit=1
```

Command:

```sh
rg "diff3|order-key|order_key|key_between|merge|normaliz|op-creation|tree-invariant|canonical_serialize|blake3" suites/anchor/apple
printf 'rg_exit=%s\n' $?
```

Observed:

```text
rg_exit=1
```

Command:

```sh
find suites/anchor -name package.json -print | wc -l | tr -d ' '
git status --short
```

Observed:

```text
0
<empty>
```

---

## 4. Gates closed / still open

| Gate | Result |
|---|---|
| macOS signed verifier reproducibility | passed again |
| macOS 10K direct enumeration | passed again |
| remote `.icloud` placeholder | still open; Code=4 local package-internal path only |
| non-macOS / iOS Simulator iCloud runtime | still open; hand-built simulator probe not valid evidence |
| signed-out / over-quota | not run |
| product conflict-resolution policy | not run |
| TextKit product-runtime gates | not run |
| binding async `Sendable` / wrapper / CI gates | not run |
| cross-target execution CI wiring | not run |
| CP-1 whole-exit | not exited |

No model adjustment was learned, so no backfill to `04` / `05` / `06`.

---

## 5. Axis matrix delta

| Axis | Previous verdict | Current verdict |
|---|---|---|
| core deterministic | go | unchanged |
| multi-target compile | go | unchanged |
| zero-cloud-symbol boundary | go | unchanged; live audit exit 1 |
| binding (B4) | approved boundary / release-gated | unchanged |
| TextKit | compromise / mechanism-only | unchanged |
| iCloud Drive (B14) | approved default transport with compromise constraints | unchanged |
| layout / retention | compromise | unchanged |
| cross-target execution CI | not run | unchanged |
| CP-1 whole-exit | 未退出 | unchanged |

---

## 6. Ledger entry

### Ledger entry — 2026-06-10 — iteration 1 — doc 22-apple-verifier-rerun-report.md

- **Checkpoint / cursor:** CP-1 Apple half.
- **Action selected:** rerun repo-local signed macOS iCloud verifier; test minimal iOS Simulator iCloud feasibility.
- **Owner classification:** Apple-runtime → executed here with explicit `DEVELOPER_DIR`; iOS Simulator proof remains pending Xcode-managed app target.
- **Scope-fence check:** passed — trips none of `11 §5` or `21 §11`; no root workspace / lockfile / core changes.
- **Evidence (Observed = command + output):**
  - `xcodebuild ... AnchorMacICloudProbe ... build` → `** BUILD SUCCEEDED **`, Xcode-managed profile `3f0476f1-ba42-404e-be20-945e7cec4a7f`.
  - `codesign -d --entitlements :- ... AnchorMacICloudProbe.app` → CloudDocuments + `<ICLOUD_CONTAINER>`.
  - `... AnchorMacICloudProbe --icloud-runtime-probe` → explicit/implicit non-nil, coordinated equality true, metadata segment count 0, placeholder Code=4.
  - `... AnchorMacICloudProbe --icloud-scale-probe 10000` → direct count 10000, enum `24.46ms`, metadata count 0.
  - `simctl spawn ... ios-sim-icloud-probe` → explicit/implicit nil because no app entitlement.
  - `simctl launch ... dev.plimeor.AnchorIOSSimICloudProbe` → denied by SpringBoard; log reported launch failed / entitlement recognition not valid.
  - core cloud-symbol audit → 0 matches, exit 1.
- **Gates closed this iteration:** none new; macOS verifier reproducibility strengthened only.
- **Gates still open:** iOS/non-macOS iCloud runtime, remote placeholder, signed-out/over-quota, product conflict policy, TextKit product runtime, binding release gates, cross-target execution CI.
- **Backfill to 04/05/06:** none.
- **Axis matrix delta:** unchanged.
- **Gate evaluation:** CONTINUE — next action: use Xcode-managed iOS app target / project for simulator iCloud runtime, or wire cross-target execution CI if iOS project creation is deferred.
- **New doc:** `docs/workbench/20260606-anchor-v1/22-apple-verifier-rerun-report.md`
