# Anchor Stage 1 — iOS Device iCloud Launch Report

任务：CP-1 iCloud delivery gate，用真实 iPhone 重新尝试 Xcode-managed iOS CloudDocuments runtime probe。
日期：2026-06-10
状态：**workbench artifact** —— 非公开接口契约；本轮关闭 physical-device build/install/entitlement 链路，不关闭 iOS device runtime probe，因为 launch 被锁屏状态阻止。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**package / workspace / 产品 app / 生成 lockfile / public CLI schema 改动；本轮没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；没有改 `suites/anchor/core/src/**` production source；没有创建 repo 内 Apple product app shell。使用的 Xcode-created probe project 位于 repo 外 `/Users/plimeor/Documents/AnchorProvisionProbe`，构建产物位于 `/tmp/anchor-apple-stage1`。

---

## 1. 结论

**Strongest conclusion：真实 iPhone 的 build / signing / install 链路已通过，CloudDocuments entitlement 在 app bundle 中可见；runtime probe 未执行，因为设备锁定导致 SpringBoard 拒绝 launch。**

Observed closed:

- `devicectl` sees `Plimeor's iPhone` as `available (paired)`;
- `xcodebuild` to `platform=iOS,id=C51610FF-15B1-5989-A8A3-DE2EDFACEB5B` succeeded;
- generated entitlements include `CloudDocuments` and `<ICLOUD_CONTAINER>`;
- `devicectl device install app` succeeded.

Observed not closed:

```text
Unable to launch dev.plimeor.AnchorProvisionProbe because the device was not, or could not be, unlocked.
```

This is an operator-state block, not an iCloud transport result. It does not contradict the earlier simulator finding (`BRCloudDocsErrorDomain:153`, iCloud Drive not supported) and does not prove iOS CloudDocuments delivery.

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| repo root workspace / package / lockfile | not changed |
| `suites/anchor/core/src/**` | not changed |
| repo product app shell | not created |
| repo-external Xcode probe | built, installed, launch attempted |
| iCloud account mutation | not performed |
| checkpoint exit | not reached |

---

## 3. Observed evidence

### 3.1 Device availability

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun devicectl list devices
```

Observed excerpt:

```text
Name               Identifier                             State                Model
Plimeor's iPhone   C51610FF-15B1-5989-A8A3-DE2EDFACEB5B   available (paired)   iPhone 15 Pro Max (iPhone16,2)
```

### 3.2 Xcode-managed device build

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild \
  -project /Users/plimeor/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj \
  -scheme AnchorProvisionProbe \
  -destination 'platform=iOS,id=C51610FF-15B1-5989-A8A3-DE2EDFACEB5B' \
  -configuration Debug \
  -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/AnchorProvisionProbe-device-20260610 \
  -allowProvisioningUpdates \
  -allowProvisioningDeviceRegistration \
  build
```

Observed excerpts:

```text
Entitlements:
{
    "application-identifier" = "<TEAM_ID>.dev.plimeor.AnchorProvisionProbe";
    "com.apple.developer.icloud-container-identifiers" = ("<ICLOUD_CONTAINER>");
    "com.apple.developer.icloud-services" = (CloudDocuments);
    "com.apple.developer.ubiquity-container-identifiers" = ("<ICLOUD_CONTAINER>");
}
Signing Identity: "Apple Development: <DEVELOPER_NAME> (<TEAM_ID_ALT>)"
Provisioning Profile: "iOS Team Provisioning Profile: dev.plimeor.AnchorProvisionProbe"
** BUILD SUCCEEDED **
```

### 3.3 Entitlement readback

Command:

```sh
codesign -d --entitlements :- \
  /tmp/anchor-apple-stage1/DerivedData/AnchorProvisionProbe-device-20260610/Build/Products/Debug-iphoneos/AnchorProvisionProbe.app
```

Observed excerpt:

```xml
<key>com.apple.developer.icloud-container-identifiers</key>
<array><string><ICLOUD_CONTAINER></string></array>
<key>com.apple.developer.icloud-services</key>
<array><string>CloudDocuments</string></array>
<key>com.apple.developer.ubiquity-container-identifiers</key>
<array><string><ICLOUD_CONTAINER></string></array>
```

### 3.4 Install

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun devicectl device install app \
  --device C51610FF-15B1-5989-A8A3-DE2EDFACEB5B \
  /tmp/anchor-apple-stage1/DerivedData/AnchorProvisionProbe-device-20260610/Build/Products/Debug-iphoneos/AnchorProvisionProbe.app
```

Observed:

```text
App installed:
• bundleID: dev.plimeor.AnchorProvisionProbe
• installationURL: file:///private/var/containers/Bundle/Application/583DA4BF-652B-4554-BCA1-2122AB24D37E/AnchorProvisionProbe.app/
```

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
ERROR: The application failed to launch. (com.apple.dt.CoreDeviceError error 10002)
FBSOpenApplicationServiceErrorDomain error 1
BSErrorCodeDescription = RequestDenied
NSLocalizedFailureReason = The request was denied by service delegate (SBMainWorkspace) for reason: Locked ("Unable to launch dev.plimeor.AnchorProvisionProbe because the device was not, or could not be, unlocked").
FBSOpenApplicationErrorDomain error 7
BSErrorCodeDescription = Locked
```

### 3.6 Boundary audits

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
rg -n "Swift/TextKit|diff3|order-key|merge|normaliz|op-creation|tree-invariant|canonical_serialize|blake3" suites/anchor/apple
```

Observed:

```text
0 matches, exit 1
```

---

## 4. Gate evaluation

| Gate | Result |
|---|---|
| physical iPhone availability via `devicectl` | closed / observed |
| physical iPhone Xcode build | closed / observed |
| CloudDocuments entitlement in signed app | closed / observed |
| physical iPhone install | closed / observed |
| physical iPhone iCloud runtime probe | open / launch blocked by locked device |
| iOS/non-macOS CloudDocuments delivery | open / runtime not observed |
| CP-1 whole-exit | **not exited** |

Gate evaluation: **CONTINUE** if other non-device gates are available; rerun this probe after the device is unlocked.
