# Anchor Stage 1 - iOS Device Locked Rerun Report

任务：CP-1 iCloud delivery gate，在 `devicectl` 显示 physical iPhone `available (paired)` 后，重跑 Xcode-managed signed iOS CloudDocuments verifier。
日期：2026-06-10
状态：**workbench artifact** —— 非公开接口契约；本轮刷新 physical-device build / entitlement / install 证据，但不关闭 physical iPhone runtime、iOS CloudDocuments delivery、iOS/non-macOS package delivery 或 CP-1 whole-exit gate。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**package / workspace / 产品 app / 生成 lockfile / public CLI schema 改动；本轮没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；没有改 `suites/anchor/core/src/**` production source；没有创建 repo 内 Apple product app shell、entitlement、bundle id 或 iCloud container；没有改 Xcode project。使用的 Xcode-created probe project 位于 repo 外 `/Users/plimeor/Documents/AnchorProvisionProbe`，构建产物位于 `/tmp/anchor-apple-stage1`。

---

## 1. 结论

**Strongest conclusion：`devicectl` 的 `available (paired)` 不能等同于 unlocked；真实 iPhone 仍被 SpringBoard locked-state 阻止启动，因此 physical iPhone iCloud runtime 仍未执行。**

本轮重新观察到：

- Xcode destination 可见 physical iPhone；
- `xcodebuild` 真机构建成功；
- signed app bundle 内含 CloudDocuments / ubiquity entitlement；
- `devicectl device install app` 成功；
- `devicectl device process launch` 和 `--no-activate` launch 均被同一个 locked reason 拒绝。

关键 runtime 失败输出：

```text
Unable to launch dev.plimeor.AnchorProvisionProbe because the device was not, or could not be, unlocked.
BSErrorCodeDescription = Locked
```

这不是 iCloud runtime result；不证明 `url(forUbiquityContainerIdentifier:)` 成功或失败，也不证明 CloudDocuments delivery。它只说明物理设备 operator state 仍未满足 app launch 前提。下一次该 gate 的有效动作仍是：在 iPhone 已解锁且保持可用时重跑同一 launch。

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
| repo-external Xcode-created probe | built and installed only |
| checkpoint exit | not reached |

---

## 3. Observed evidence

### 3.1 Xcode destination and CoreDevice availability

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -showdestinations \
  -project /Users/plimeor/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj \
  -scheme AnchorProvisionProbe
```

Observed excerpt:

```text
{ platform:iOS, arch:arm64, id:00008130-0002093A01D3803A, name:Plimeor's iPhone }
```

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun devicectl list devices
```

Observed excerpt:

```text
Plimeor's iPhone  C51610FF-15B1-5989-A8A3-DE2EDFACEB5B  available (paired)  iPhone 15 Pro Max (iPhone16,2)
```

Interpretation:

- Xcode build destination id is `00008130-0002093A01D3803A`.
- `devicectl` CoreDevice id is `C51610FF-15B1-5989-A8A3-DE2EDFACEB5B`.
- `available (paired)` is not sufficient evidence that SpringBoard will allow app launch.

### 3.2 Xcode-managed device build

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild \
  -project /Users/plimeor/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj \
  -scheme AnchorProvisionProbe \
  -destination 'platform=iOS,id=00008130-0002093A01D3803A' \
  -configuration Debug \
  -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/AnchorProvisionProbe-device-unlocked-rerun-20260610 \
  -allowProvisioningUpdates \
  -allowProvisioningDeviceRegistration \
  build
```

Observed excerpts:

```text
Entitlements:

{
    "application-identifier" = "<TEAM_ID>.dev.plimeor.AnchorProvisionProbe";
    "com.apple.developer.icloud-container-development-container-identifiers" = (
        "<ICLOUD_CONTAINER>"
    );
    "com.apple.developer.icloud-container-environment" = Development;
    "com.apple.developer.icloud-container-identifiers" = (
        "<ICLOUD_CONTAINER>"
    );
    "com.apple.developer.icloud-services" = (
        CloudDocuments
    );
    "com.apple.developer.team-identifier" = <TEAM_ID>;
    "com.apple.developer.ubiquity-container-identifiers" = (
        "<ICLOUD_CONTAINER>"
    );
    "get-task-allow" = 1;
}
```

```text
Signing Identity:     "Apple Development: <DEVELOPER_NAME> (<TEAM_ID_ALT>)"
Provisioning Profile: "iOS Team Provisioning Profile: dev.plimeor.AnchorProvisionProbe"
                      (3b6e4dcd-0537-4357-8589-662074237ad7)
** BUILD SUCCEEDED **
```

Interpretation:

- The Xcode-managed signed iPhoneOS build remains green.
- The generated app entitlement surface includes CloudDocuments and the approved probe ubiquity container.

### 3.3 Entitlement readback

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  codesign -d --entitlements :- \
  /tmp/anchor-apple-stage1/DerivedData/AnchorProvisionProbe-device-unlocked-rerun-20260610/Build/Products/Debug-iphoneos/AnchorProvisionProbe.app
```

Observed excerpt:

```xml
<key>application-identifier</key>
<string><TEAM_ID>.dev.plimeor.AnchorProvisionProbe</string>
<key>com.apple.developer.icloud-container-identifiers</key>
<array><string><ICLOUD_CONTAINER></string></array>
<key>com.apple.developer.icloud-services</key>
<array><string>CloudDocuments</string></array>
<key>com.apple.developer.ubiquity-container-identifiers</key>
<array><string><ICLOUD_CONTAINER></string></array>
```

Interpretation:

- The signed app bundle readback matches the expected iCloud entitlement surface.

### 3.4 Install

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun devicectl device install app \
  --device C51610FF-15B1-5989-A8A3-DE2EDFACEB5B \
  /tmp/anchor-apple-stage1/DerivedData/AnchorProvisionProbe-device-unlocked-rerun-20260610/Build/Products/Debug-iphoneos/AnchorProvisionProbe.app
```

Observed:

```text
App installed:
* bundleID: dev.plimeor.AnchorProvisionProbe
* installationURL: file:///private/var/containers/Bundle/Application/04AE3789-8858-4885-ADF5-109316BF3406/AnchorProvisionProbe.app/
* launchServicesIdentifier: unknown
* databaseUUID: 0689B5EA-844D-4A09-9326-4A7D918720C1
* databaseSequenceNumber: 2532
```

Interpretation:

- The build/sign/install chain is green in this rerun.

### 3.5 Launch attempt

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun devicectl device process launch \
  --device C51610FF-15B1-5989-A8A3-DE2EDFACEB5B \
  --console \
  --terminate-existing \
  dev.plimeor.AnchorProvisionProbe \
  --icloud-runtime-probe
```

Observed:

```text
ERROR: The application failed to launch. (com.apple.dt.CoreDeviceError error 10002 (0x2712))
       BundleIdentifier = dev.plimeor.AnchorProvisionProbe
       ----------------------------------------
           The request to open "dev.plimeor.AnchorProvisionProbe" failed. (FBSOpenApplicationServiceErrorDomain error 1 (0x01))
           NSLocalizedFailureReason = The request was denied by service delegate (SBMainWorkspace) for reason: Locked ("Unable to launch dev.plimeor.AnchorProvisionProbe because the device was not, or could not be, unlocked").
           BSErrorCodeDescription = RequestDenied
           FBSOpenApplicationRequestID = 0x1779
       ----------------------------------------
               The operation couldn’t be completed. Unable to launch dev.plimeor.AnchorProvisionProbe because the device was not, or could not be, unlocked. (FBSOpenApplicationErrorDomain error 7 (0x07))
               NSLocalizedFailureReason = Unable to launch dev.plimeor.AnchorProvisionProbe because the device was not, or could not be, unlocked.
               BSErrorCodeDescription = Locked
```

### 3.6 No-activate launch attempt

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun devicectl device process launch \
  --device C51610FF-15B1-5989-A8A3-DE2EDFACEB5B \
  --console \
  --terminate-existing \
  --no-activate \
  dev.plimeor.AnchorProvisionProbe \
  --icloud-runtime-probe
```

Observed:

```text
ERROR: The application failed to launch. (com.apple.dt.CoreDeviceError error 10002 (0x2712))
       BundleIdentifier = dev.plimeor.AnchorProvisionProbe
       ----------------------------------------
           The request to open "dev.plimeor.AnchorProvisionProbe" failed. (FBSOpenApplicationServiceErrorDomain error 1 (0x01))
           NSLocalizedFailureReason = The request was denied by service delegate (SBMainWorkspace) for reason: Locked ("Unable to launch dev.plimeor.AnchorProvisionProbe because the device was not, or could not be, unlocked").
           FBSOpenApplicationRequestID = 0x41f4
           BSErrorCodeDescription = RequestDenied
       ----------------------------------------
               The operation couldn’t be completed. Unable to launch dev.plimeor.AnchorProvisionProbe because the device was not, or could not be, unlocked. (FBSOpenApplicationErrorDomain error 7 (0x07))
               NSLocalizedFailureReason = Unable to launch dev.plimeor.AnchorProvisionProbe because the device was not, or could not be, unlocked.
               BSErrorCodeDescription = Locked
```

Interpretation:

- The blocker is not only foreground activation; `--no-activate` hits the same SpringBoard locked-state denial.
- The app process never reaches `ICloudRuntimeProbe().run()`.

### 3.7 Boundary audits

Command:

```sh
rg -n "CloudKit|CKRecord|CKAsset|CKContainer|CKSyncEngine|NSFileCoordinator|NSMetadataQuery|ubiquit|iCloud|NSURLIsExcludedFromBackupKey" suites/anchor/core
```

Observed:

```text
0 matches, exit 1
```

Command:

```sh
rg -n "diff3|order-key|fractional|merge.*semantic|canonical" suites/anchor/apple
```

Observed:

```text
0 matches, exit 1
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

## 4. Gate evaluation

| Gate | Result |
|---|---|
| physical iPhone Xcode destination visible | closed / observed |
| physical iPhone CoreDevice availability | observed as `available (paired)`, not sufficient for unlocked launch |
| physical iPhone build / signing | closed / rerun passed |
| CloudDocuments entitlement in signed app | closed / rerun passed |
| physical iPhone install | closed / rerun passed |
| physical iPhone app launch | open / blocked by locked device |
| physical iPhone iCloud runtime probe | open / not observed |
| iOS/non-macOS CloudDocuments delivery | open / not observed |
| CP-1 whole-exit | **not exited** |

Gate evaluation: **CONTINUE** for non-device gates. Do not spend another physical-device runtime iteration until the iPhone is actually unlocked at launch time; `available (paired)` alone is insufficient.

