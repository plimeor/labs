# Anchor Stage 1 — iCloud Placeholder Download Report

任务：CP-1 iCloud delivery gate，在 signed macOS verifier 中刻画 loose iCloud file 与 package-internal segment 的 placeholder / download 行为。
日期：2026-06-10
状态：**workbench artifact** —— 非公开接口契约；本轮关闭 macOS verifier 的 placeholder 失败形态证据，不关闭 remote `.icloud` placeholder delivery gate。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**package / workspace / 产品 app / 生成 lockfile / public CLI schema 改动；本轮没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；没有改 `suites/anchor/core/src/**` production source；没有创建 repo 内 Apple product app shell。代码变更限于 repo-local verifier `suites/anchor/apple/AnchorMacICloudProbe/AnchorMacICloudProbe/ICloudRuntimeProbe.swift` 的 `--icloud-placeholder-probe` 命令，构建产物位于 `/tmp/anchor-apple-stage1`。

---

## 1. 结论

**Strongest conclusion：macOS signed verifier 证明 loose file 与 package-internal segment 的 ubiquitous/download 状态不同；当前 package-internal segment 不是 `isUbiquitousItem`，`evictUbiquitousItem` 与 `startDownloadingUbiquitousItem` 都返回 `NSCocoaErrorDomain:4`，因此 remote `.icloud` placeholder download gate 仍未通过。**

Observed:

- explicit / implicit ubiquity container lookup 均非 nil；
- app container `Documents/AnchorPlaceholderProbe/external.anchorseg` 是 ubiquitous item，download status 为 `Current`；
- 对该 loose file 执行 evict 返回 `NSCocoaErrorDomain:512`，没有形成可观察的 non-current placeholder；
- package 内 `Vault.anchorvault/segments/000001.anchorseg` 不是 ubiquitous item，download status 为 nil；
- 对 package-internal segment 执行 evict 与 start download 分别返回 `NSCocoaErrorDomain:4`；
- package-internal segment 仍可经 coordinated read 读到 bytes。

Interpretation: 当前可批准 adapter 形状仍是 package-level metadata discovery + file-coordinated direct package-internal enumeration/read。不能把 package-internal segment delivery 建在 `isUbiquitousItem` / `startDownloadingUbiquitousItem` 对内部文件成功这一前提上。真实远端 `.icloud` placeholder 的跨设备下载仍需要后续用非本机已-current 文件或物理 iOS runtime 复验。

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
| checkpoint exit | not reached |

---

## 3. Observed evidence

### 3.1 Verifier command surface

Changed file:

```text
suites/anchor/apple/AnchorMacICloudProbe/AnchorMacICloudProbe/ICloudRuntimeProbe.swift
```

Probe command:

```text
--icloud-placeholder-probe
```

The probe creates only:

```text
/Users/plimeor/Library/Mobile Documents/iCloud~dev~plimeor~AnchorProvisionProbe/Documents/AnchorPlaceholderProbe
```

It removes that probe root before exit.

### 3.2 Signed macOS verifier build

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild \
  -project suites/anchor/apple/AnchorMacICloudProbe/AnchorMacICloudProbe.xcodeproj \
  -scheme AnchorMacICloudProbe \
  -destination 'platform=macOS,arch=arm64' \
  -configuration Debug \
  -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/AnchorMacICloudProbe-placeholder-20260610 \
  -allowProvisioningUpdates \
  -allowProvisioningDeviceRegistration \
  CODE_SIGN_ENTITLEMENTS=AnchorMacProbe.entitlements \
  INFOPLIST_FILE=AnchorMacProbeInfo.plist \
  GENERATE_INFOPLIST_FILE=NO \
  build
```

Observed excerpt:

```text
Entitlements:
{
    "com.apple.developer.icloud-container-identifiers" = ("<ICLOUD_CONTAINER>");
    "com.apple.developer.icloud-services" = (CloudDocuments);
    "com.apple.developer.ubiquity-container-identifiers" = ("<ICLOUD_CONTAINER>");
}
Signing Identity: "Apple Development: <DEVELOPER_NAME> (<TEAM_ID_ALT>)"
Provisioning Profile: "Mac Team Provisioning Profile: dev.plimeor.AnchorMacICloudProbe"
** BUILD SUCCEEDED **
```

### 3.3 Placeholder runtime probe

Command:

```sh
/tmp/anchor-apple-stage1/DerivedData/AnchorMacICloudProbe-placeholder-20260610/Build/Products/Debug/AnchorMacICloudProbe.app/Contents/MacOS/AnchorMacICloudProbe \
  --icloud-placeholder-probe
```

Observed:

```text
icloud_probe explicit_nil=false
icloud_probe implicit_nil=false
icloud_placeholder external_path=/Users/plimeor/Library/Mobile Documents/iCloud~dev~plimeor~AnchorProvisionProbe/Documents/AnchorPlaceholderProbe/external.anchorseg
icloud_placeholder external_before_exists=true
icloud_placeholder external_before_is_ubiquitous=true
icloud_placeholder external_before_download_status=NSURLUbiquitousItemDownloadingStatusCurrent
icloud_placeholder external_evict_error=NSCocoaErrorDomain:512
icloud_placeholder external_after_evict_exists=true
icloud_placeholder external_after_evict_is_ubiquitous=true
icloud_placeholder external_after_evict_download_status=NSURLUbiquitousItemDownloadingStatusCurrent
icloud_placeholder external_start_download_error=nil
icloud_placeholder external_after_start_exists=true
icloud_placeholder external_after_start_is_ubiquitous=true
icloud_placeholder external_after_start_download_status=NSURLUbiquitousItemDownloadingStatusCurrent
icloud_placeholder external_read_after_start_bytes=29
icloud_placeholder package_segment_path=/Users/plimeor/Library/Mobile Documents/iCloud~dev~plimeor~AnchorProvisionProbe/Documents/AnchorPlaceholderProbe/Vault.anchorvault/segments/000001.anchorseg
icloud_placeholder package_before_exists=true
icloud_placeholder package_before_is_ubiquitous=false
icloud_placeholder package_before_download_status=nil
icloud_placeholder package_evict_error=NSCocoaErrorDomain:4
icloud_placeholder package_after_evict_exists=true
icloud_placeholder package_after_evict_is_ubiquitous=false
icloud_placeholder package_after_evict_download_status=nil
icloud_placeholder package_start_download_error=NSCocoaErrorDomain:4
icloud_placeholder package_after_start_exists=true
icloud_placeholder package_after_start_is_ubiquitous=false
icloud_placeholder package_after_start_download_status=nil
icloud_placeholder package_read_after_start_bytes=28
icloud_placeholder cleanup_removed=true
```

### 3.4 Result table

| Path | `isUbiquitousItem` | download status before | evict | start download | coordinated read |
|---|---:|---|---|---|---|
| loose `external.anchorseg` | true | `Current` | `NSCocoaErrorDomain:512` | nil | 29 bytes |
| package-internal `Vault.anchorvault/segments/000001.anchorseg` | false | nil | `NSCocoaErrorDomain:4` | `NSCocoaErrorDomain:4` | 28 bytes |

---

## 4. Gate evaluation

| Gate | Result |
|---|---|
| signed macOS verifier placeholder command | closed / observed |
| loose iCloud file current-state download cycle | observed, no remote placeholder formed |
| package-internal segment placeholder/download | failed with `NSCocoaErrorDomain:4` |
| remote `.icloud` placeholder delivery | open / not proved |
| iOS/non-macOS placeholder delivery | open / not run |
| CP-1 whole-exit | **not exited** |

Gate evaluation: **CONTINUE**. The next iCloud placeholder action should use a genuinely remote/non-current file state, a second device, or physical iOS runtime after unlock; this macOS-local-current probe must not be counted as a successful remote placeholder download.
