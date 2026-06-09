# Anchor Stage 1 — Local-Only Path Classifier Report

任务：CP-1 iCloud/local-only delivery gate，在 signed macOS verifier 中验证 `sync = "none"` vault 的 path-in-ubiquity conservative classifier。
日期：2026-06-10
状态：**workbench artifact** —— 非公开接口契约；本轮部分关闭 D21/D21a/F41 的 Apple path-classification mechanism floor，不关闭 external volume、security-scoped bookmark、`.icloud` placeholder、signed-out/unavailable account 或产品 UI/CLI 实现。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**package / workspace / 产品 app / 生成 lockfile / public CLI schema 改动；本轮没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；没有改 `suites/anchor/core/src/**` production source；没有创建 repo 内 Apple product app shell；没有改变 iCloud account 状态。代码变更限于 repo-local signed verifier `suites/anchor/apple/AnchorMacICloudProbe/AnchorMacICloudProbe/ICloudRuntimeProbe.swift` 的 `--icloud-local-only-path-probe` 命令，构建产物位于 `/tmp/anchor-apple-stage1`。

---

## 1. 结论

**Strongest conclusion：D21/D21a 的 conservative path classifier 机制下限成立，但 local-only path edge-case gate 只部分关闭。**

本轮新增 `--icloud-local-only-path-probe`，在 signed macOS app 的真实 iCloud container 和 app sandbox local temp 下验证四类路径：

| Case | Result |
|---|---|
| sandbox local vault | `blocked_local_only_open=false`，`excluded_from_backup=true` |
| direct iCloud Documents vault | `blocked_local_only_open=true` |
| local symlink resolving into iCloud | `blocked_local_only_open=true` |
| iCloud path symlink resolving to local vault | `blocked_local_only_open=true` |

The classifier is intentionally conservative:

```text
blocked_local_only_open =
  raw path is inside ubiquity container
  OR resolved symlink target is inside ubiquity container
  OR raw path isUbiquitousItem
  OR resolved target isUbiquitousItem
```

This supports the D21/D21a product boundary: a `sync = "none"` vault is allowed only when both the user-provided path and the resolved target are outside the ubiquity container. A symlink whose visible path lives in iCloud is blocked even if it resolves to a local target; this avoids presenting an iCloud-managed entry point as local-only.

What remains open: external volume behavior, security-scoped bookmark restoration, actual Finder-moved package UI surface, `.icloud` placeholder state, and signed-out/unavailable account states.

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| root workspace / package / lockfile | not changed |
| `suites/anchor/core/src/**` | not changed |
| public CLI schema | not changed |
| product app shell | not created |
| iCloud account mutation | not performed |
| repo-local Apple verifier | one probe command added |
| iCloud operation | temporary probe root under `Documents/AnchorLocalOnlyPathProbe`, removed before exit |
| local operation | temporary app-sandbox root under `.../Containers/dev.plimeor.AnchorMacICloudProbe/Data/tmp/anchor-local-only-path-probe`, removed before exit |
| checkpoint exit | not reached |

---

## 3. Implementation shape

Changed file:

```text
suites/anchor/apple/AnchorMacICloudProbe/AnchorMacICloudProbe/ICloudRuntimeProbe.swift
```

New command:

```text
--icloud-local-only-path-probe
```

The probe:

1. resolves the signed app's explicit ubiquity container;
2. creates a temporary iCloud probe root under `Documents/AnchorLocalOnlyPathProbe`;
3. creates a temporary local root under `FileManager.default.temporaryDirectory`;
4. creates a local `.anchorvault`, an iCloud `.anchorvault`, a local symlink to iCloud, and an iCloud symlink to local;
5. sets `isExcludedFromBackup = true` on the local vault and reads it back;
6. classifies each path using raw path, resolved symlink path, and `isUbiquitousItem` resource keys;
7. removes both temporary roots.

An initial local-root attempt under `/tmp/anchor-apple-stage1/local-only-path-probe` failed with:

```text
NSCocoaErrorDomain Code=513
Operation not permitted
```

Interpretation: signed sandboxed macOS verifier apps cannot assume arbitrary `/tmp` write permission. The final probe uses the app sandbox temp directory; that sandbox correction is not a product behavior result.

---

## 4. Observed evidence

### 4.1 Signed macOS verifier build

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -project suites/anchor/apple/AnchorMacICloudProbe/AnchorMacICloudProbe.xcodeproj \
  -scheme AnchorMacICloudProbe \
  -destination 'platform=macOS,arch=arm64' \
  -configuration Debug \
  -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/AnchorMacICloudProbe-localpath-20260610 \
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
** BUILD SUCCEEDED **
```

Command:

```sh
codesign -d --entitlements :- \
  /tmp/anchor-apple-stage1/DerivedData/AnchorMacICloudProbe-localpath-20260610/Build/Products/Debug/AnchorMacICloudProbe.app
```

Observed:

```text
com.apple.developer.icloud-container-identifiers = <ICLOUD_CONTAINER>
com.apple.developer.icloud-services = CloudDocuments
com.apple.developer.ubiquity-container-identifiers = <ICLOUD_CONTAINER>
com.apple.security.app-sandbox = true
```

### 4.2 Local-only path probe

Command:

```sh
/tmp/anchor-apple-stage1/DerivedData/AnchorMacICloudProbe-localpath-20260610/Build/Products/Debug/AnchorMacICloudProbe.app/Contents/MacOS/AnchorMacICloudProbe \
  --icloud-local-only-path-probe
```

Observed:

```text
icloud_probe explicit_nil=false
icloud_probe implicit_nil=false
icloud_local_only_path container_path=/Users/plimeor/Library/Mobile Documents/iCloud~dev~plimeor~AnchorProvisionProbe
icloud_local_only_path local_root=/Users/plimeor/Library/Containers/dev.plimeor.AnchorMacICloudProbe/Data/tmp/anchor-local-only-path-probe

icloud_local_only_path local_temp_vault_raw_in_container=false
icloud_local_only_path local_temp_vault_resolved_in_container=false
icloud_local_only_path local_temp_vault_raw_is_ubiquitous=false
icloud_local_only_path local_temp_vault_resolved_is_ubiquitous=false
icloud_local_only_path local_temp_vault_excluded_from_backup=true
icloud_local_only_path local_temp_vault_blocked_local_only_open=false

icloud_local_only_path icloud_documents_vault_raw_in_container=true
icloud_local_only_path icloud_documents_vault_resolved_in_container=true
icloud_local_only_path icloud_documents_vault_raw_is_ubiquitous=true
icloud_local_only_path icloud_documents_vault_resolved_is_ubiquitous=true
icloud_local_only_path icloud_documents_vault_blocked_local_only_open=true

icloud_local_only_path local_symlink_to_icloud_raw_in_container=false
icloud_local_only_path local_symlink_to_icloud_resolved_in_container=true
icloud_local_only_path local_symlink_to_icloud_raw_is_ubiquitous=false
icloud_local_only_path local_symlink_to_icloud_resolved_is_ubiquitous=true
icloud_local_only_path local_symlink_to_icloud_blocked_local_only_open=true

icloud_local_only_path icloud_symlink_to_local_raw_in_container=true
icloud_local_only_path icloud_symlink_to_local_resolved_in_container=false
icloud_local_only_path icloud_symlink_to_local_raw_is_ubiquitous=true
icloud_local_only_path icloud_symlink_to_local_resolved_is_ubiquitous=false
icloud_local_only_path icloud_symlink_to_local_blocked_local_only_open=true

icloud_local_only_path cleanup_icloud_removed=true
icloud_local_only_path cleanup_local_removed=true
```

### 4.3 Result table

| Case | raw in container | resolved in container | raw ubiquitous | resolved ubiquitous | backup excluded | blocked |
|---|---:|---:|---:|---:|---:|---:|
| local temp vault | false | false | false | false | true | false |
| iCloud Documents vault | true | true | true | true | true | true |
| local symlink to iCloud | false | true | false | true | true | true |
| iCloud symlink to local | true | false | true | false | true | true |

---

## 5. Product policy floor after this run

For `sync = "none"` vault-open, the minimum Apple-side classifier is:

1. Resolve the user-provided URL through symlinks/bookmarks before allowing open.
2. Check both raw user-visible path and resolved path against all known ubiquity container roots.
3. Check `isUbiquitousItem` on both raw path and resolved path.
4. Block local-only open if any of those four checks indicates iCloud/ubiquity.
5. For an allowed local-only vault, set and verify `isExcludedFromBackup`.
6. Return typed blocked `local_only_vault_in_ubiquity` without mounting `OpSyncPort`, uploading, pulling, merging, converting, or modifying the op-log.

The conservative part is deliberate: an iCloud-visible symlink to a local target is still a blocked iCloud-managed entry point for local-only semantics.

---

## 6. Gate evaluation

| Gate | Result |
|---|---|
| signed macOS local-only path command | closed / observed |
| direct local non-ubiquity vault allowed | closed / observed |
| `NSURLIsExcludedFromBackupKey` set/read on allowed local vault | closed / observed |
| direct iCloud Documents vault blocked | closed / observed |
| local symlink resolving into iCloud blocked | closed / observed |
| iCloud symlink resolving to local target blocked by raw-path policy | closed / observed |
| external volume path behavior | open / not run |
| security-scoped bookmark restoration | open / not run |
| Finder-moved package UI surface | open / not run |
| `.icloud` placeholder path classification | open / not run |
| signed-out / unavailable account path classification | open / not run |
| product UI/CLI implementation of typed blocked state | open / not implemented |
| CP-1 whole-exit | **not exited** |

Gate evaluation: **CONTINUE**. This closes a path-classification mechanism floor for normal local, direct iCloud, and symlink edge cases; it does not finish the full local-only path-in-ubiquity gate.
