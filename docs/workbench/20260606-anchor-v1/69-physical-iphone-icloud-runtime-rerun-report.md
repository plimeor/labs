# Anchor Stage 1 — Physical iPhone iCloud Runtime Rerun Report

任务：CP-1 iCloud delivery / signed-device runtime gate，在 physical iPhone 变为可 launch 后，重跑 Xcode-managed signed iOS CloudDocuments verifier。
日期：2026-06-10
状态：**workbench evidence** —— 非公开接口契约。本文件不关闭 true remote `.icloud` placeholder delivery、metadata propagation、product sync context、Developer ID / App Store distribution 或 CP-1 whole-exit gate。

> 边界声明（AGENTS 工作台规则）：本轮没有改 root workspace / package / lockfile / public CLI schema；没有改 repo 内 Apple project、bundle id、entitlement、iCloud container 或产品 app；没有改 `suites/anchor/core/src/**` production source；使用的 Xcode-created probe project 位于 repo 外 `/Users/plimeor/Documents/AnchorProvisionProbe`，构建产物位于 `/tmp/anchor-apple-stage1`。本轮安装并启动了 development-signed iPhone probe，并在 iCloud ubiquity container 内写入、读取、清理 probe vault/package 文件。

---

## 1. Strongest conclusion

**Physical iPhone runtime is no longer locked-blocked: the development-signed verifier launched on the iPhone, and iCloud container lookup + file-coordinated segment write/read succeeded on device.**

Observed on `Plimeor's iPhone` (`iPhone 15 Pro Max`, iOS `26.5`):

```text
icloud-runtime:explicit_nil=false
icloud-runtime:implicit_nil=false
icloud-runtime:explicit_path=/private/var/mobile/Library/Mobile Documents/iCloud~dev~plimeor~AnchorProvisionProbe
icloud-runtime:implicit_path=/private/var/mobile/Library/Mobile Documents/iCloud~dev~plimeor~AnchorProvisionProbe
icloud-runtime:vault_package=AnchorStage1Probe.anchorvault
icloud-runtime:vault_type_identifier=dev.plimeor.anchor.vault
icloud-runtime:vault_is_ubiquitous=true
icloud-runtime:coordinated_segment_bytes=28
icloud-runtime:coordinated_segment_equal=true
```

This closes the old `60-ios-device-locked-rerun-report.md` blocker for physical iPhone app launch, and it gives CP-1 a real iPhone CloudDocuments mechanism floor.

**It does not close remote delivery or product sync gates.** The same device run still reported:

```text
icloud-runtime:segment_is_ubiquitous=false
icloud-runtime:segment_download_status=nil
icloud-runtime:start_download_error=NSCocoaErrorDomain:4
icloud-runtime:metadata_initial_gathered=false
icloud-runtime:metadata_seg_count=0
icloud-runtime:scale_metadata_gathered=false
icloud-runtime:scale_metadata_seg_count=0
```

The physical device therefore proves local iPhone ubiquity-container availability and file coordination, not true remote `.icloud` placeholder delivery, metadata propagation, package-level discovery, conflict policy, product compaction, or CP-1 whole-exit.

The app did not self-terminate after printing the probe output. I terminated the process manually; the final `App terminated due to signal 15` is a process-management artifact, not an iCloud probe verdict.

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| root workspace / package / lockfile | not changed |
| `suites/anchor/core/src/**` | not changed |
| public CLI schema | not changed |
| repo Apple project / product app shell | not changed / not created |
| Xcode project / bundle id / entitlement | not changed |
| iCloud account mutation | not performed |
| physical iPhone install / launch | performed with existing development signing |
| iCloud container writes | performed only by the probe; `cleanup_removed=true` observed |
| checkpoint exit | not reached |

---

## 3. Observed evidence

### 3.1 Device availability and lock state

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun devicectl list devices
```

Observed excerpt:

```text
Plimeor's iPhone        Plimeors-iPhone.coredevice.local        C51610FF-15B1-5989-A8A3-DE2EDFACEB5B   available (paired)   iPhone 15 Pro Max (iPhone16,2)
```

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun devicectl device info details \
  --device C51610FF-15B1-5989-A8A3-DE2EDFACEB5B
```

Observed excerpt:

```text
deviceProperties:
    bootState: booted
    developerModeStatus: enabled
    osVersionNumber: 26.5
connectionProperties:
    pairingState: paired
    transportType: localNetwork
    tunnelState: connected
```

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun devicectl device info lockState \
  --device C51610FF-15B1-5989-A8A3-DE2EDFACEB5B
```

Observed:

```text
Current device lock state:
• deviceIdentifier: C51610FF-15B1-5989-A8A3-DE2EDFACEB5B
• passcodeRequired: false
• unlockedSinceBoot: true
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
Available destinations for the "AnchorProvisionProbe" scheme:
    { platform:iOS, arch:arm64, id:00008130-0002093A01D3803A, name:Plimeor's iPhone }
```

Interpretation:

- CoreDevice id is `C51610FF-15B1-5989-A8A3-DE2EDFACEB5B`.
- Xcode destination / device UDID is `00008130-0002093A01D3803A`.
- Unlike doc 60, this run had a direct lock-state precondition that allowed launch.

### 3.2 Xcode-managed device build

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild \
  -project /Users/plimeor/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj \
  -scheme AnchorProvisionProbe \
  -destination 'platform=iOS,id=00008130-0002093A01D3803A' \
  -configuration Debug \
  -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/AnchorProvisionProbe-device-unlocked-rerun2-20260610 \
  -allowProvisioningUpdates \
  -allowProvisioningDeviceRegistration \
  build
```

Observed excerpts:

```text
Entitlements:

{
    "application-identifier" = "<TEAM_ID>.dev.plimeor.AnchorProvisionProbe";
    "com.apple.developer.icloud-container-development-container-identifiers" =     (
        "<ICLOUD_CONTAINER>"
    );
    "com.apple.developer.icloud-container-environment" = Development;
    "com.apple.developer.icloud-container-identifiers" =     (
        "<ICLOUD_CONTAINER>"
    );
    "com.apple.developer.icloud-services" =     (
        CloudDocuments
    );
    "com.apple.developer.team-identifier" = <TEAM_ID>;
    "com.apple.developer.ubiquity-container-identifiers" =     (
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

### 3.3 Entitlement readback and install

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  codesign -d --entitlements :- \
  /tmp/anchor-apple-stage1/DerivedData/AnchorProvisionProbe-device-unlocked-rerun2-20260610/Build/Products/Debug-iphoneos/AnchorProvisionProbe.app
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

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun devicectl device install app \
  --device C51610FF-15B1-5989-A8A3-DE2EDFACEB5B \
  /tmp/anchor-apple-stage1/DerivedData/AnchorProvisionProbe-device-unlocked-rerun2-20260610/Build/Products/Debug-iphoneos/AnchorProvisionProbe.app
```

Observed:

```text
App installed:
• bundleID: dev.plimeor.AnchorProvisionProbe
• installationURL: file:///private/var/containers/Bundle/Application/2F222C8D-8132-47E8-ADB6-1EB9806532A8/AnchorProvisionProbe.app/
• launchServicesIdentifier: unknown
• databaseUUID: 0689B5EA-844D-4A09-9326-4A7D918720C1
• databaseSequenceNumber: 2540
```

### 3.4 Physical iPhone launch and iCloud runtime

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

Observed launch and iCloud container output:

```text
Launched application with dev.plimeor.AnchorProvisionProbe bundle identifier.
icloud-runtime:explicit_nil=false
icloud-runtime:implicit_nil=false
icloud-runtime:explicit_path=/private/var/mobile/Library/Mobile Documents/iCloud~dev~plimeor~AnchorProvisionProbe
icloud-runtime:implicit_path=/private/var/mobile/Library/Mobile Documents/iCloud~dev~plimeor~AnchorProvisionProbe
icloud-runtime:vault_package=AnchorStage1Probe.anchorvault
icloud-runtime:vault_type_identifier=dev.plimeor.anchor.vault
icloud-runtime:vault_is_ubiquitous=true
icloud-runtime:coordinated_segment_bytes=28
icloud-runtime:coordinated_segment_equal=true
```

Observed delivery / metadata limits:

```text
icloud-runtime:segment_is_ubiquitous=false
icloud-runtime:segment_download_status=nil
icloud-runtime:start_download_error=NSCocoaErrorDomain:4
icloud-runtime:manifest_conflict_versions=0
icloud-runtime:metadata_initial_gathered=false
icloud-runtime:metadata_seg_count=0
icloud-runtime:metadata_seg_names=
icloud-runtime:scale_subset_files=1024
icloud-runtime:scale_subset_write_ms=3786.20
icloud-runtime:scale_metadata_gathered=false
icloud-runtime:scale_metadata_seg_count=0
icloud-runtime:cleanup_removed=true
```

Interpretation:

- The physical iPhone app launched and reached the iCloud runtime probe.
- Explicit and implicit ubiquity container URLs were non-nil.
- The probe created an Anchor vault package in the iCloud container and observed the vault as ubiquitous.
- File-coordinated segment write/read equality passed.
- The segment file itself was not reported as ubiquitous; `startDownloadingUbiquitousItem` still returned `NSCocoaErrorDomain:4`.
- `NSMetadataQuery` did not gather package-internal segment results in this device run.
- The 1024-file subset is a physical-device write subset, not evidence of remote delivery or package-level metadata discovery.

### 3.5 Process termination

The launched app did not self-terminate after printing the probe output. I queried the process and terminated it manually.

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun devicectl device info processes \
  --device C51610FF-15B1-5989-A8A3-DE2EDFACEB5B |
  rg "AnchorProvisionProbe|pid|processIdentifier"
```

Observed:

```text
22378   /private/var/containers/Bundle/Application/2F222C8D-8132-47E8-ADB6-1EB9806532A8/AnchorProvisionProbe.app/AnchorProvisionProbe
```

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun devicectl device process terminate \
  --device C51610FF-15B1-5989-A8A3-DE2EDFACEB5B \
  --pid 22378
```

Observed:

```text
Sent signal to terminate process sent to pid 22378
```

The waiting launch command then returned:

```text
App terminated due to signal 15.
```

Interpretation:

- The final command exit was caused by manual termination after collecting the runtime output.
- It is not evidence that the iCloud probe failed.

---

## 4. Gate result

Closed this iteration:

- Physical iPhone lock / launch precondition for the verifier.
- Xcode-managed development-signed iPhoneOS build, entitlement readback, install, and launch.
- Physical iPhone CloudDocuments container availability for the probe bundle.
- Physical iPhone file-coordinated segment write/read mechanism floor.

Still open:

- True remote `.icloud` placeholder delivery and download.
- iOS package-internal metadata propagation / `NSMetadataQuery` gather.
- iOS/non-macOS end-to-end CloudDocuments delivery beyond local container availability.
- Actual signed-out and over-quota account runtimes.
- Product compaction integration and million-op iCloud product context.
- Product conflict-resolution UX/core integration.
- Product TextKit/UI integration.
- Developer ID / App Store distribution.
- CP-1 whole-exit.

---

## 5. Ledger entry

### Ledger entry — 2026-06-10 — iteration 48 — doc 69-physical-iphone-icloud-runtime-rerun-report.md

- **Checkpoint / cursor:** CP-1 Apple half, physical iPhone iCloud delivery / signed-device runtime gate.
- **Action selected:** rerun the Xcode-managed development-signed physical iPhone CloudDocuments verifier after `devicectl` reported the device available and `lockState` reported unlocked since boot.
- **Owner classification:** Apple/iCloud verifier → executed with repo-external Xcode-created probe project; no repo Apple project, product app, root workspace, public CLI schema, or core production source mutation.
- **Scope-fence check:** passed — no root workspace / package / lockfile changes; no public CLI schema; no repo product app shell; no CloudKit/CKSyncEngine path; no core cloud-symbol exposure.
- **Evidence (Observed = command + output):**
  - `devicectl device info lockState` → `passcodeRequired=false`, `unlockedSinceBoot=true`.
  - `xcodebuild -showdestinations ... AnchorProvisionProbe` → physical iPhone destination `00008130-0002093A01D3803A` visible.
  - `xcodebuild ... -destination 'platform=iOS,id=00008130-0002093A01D3803A' ... build` → CloudDocuments / ubiquity entitlements and `** BUILD SUCCEEDED **`.
  - `codesign -d --entitlements :- AnchorProvisionProbe.app` → `<ICLOUD_CONTAINER>` and `CloudDocuments` entitlement readback.
  - `devicectl device install app ... AnchorProvisionProbe.app` → app installed with bundle id `dev.plimeor.AnchorProvisionProbe`.
  - `devicectl device process launch ... --icloud-runtime-probe` → app launched; explicit/implicit ubiquity containers non-nil; vault package observed ubiquitous; coordinated segment bytes `28`; segment equality `true`; `segment_is_ubiquitous=false`; `start_download_error=NSCocoaErrorDomain:4`; metadata gathered `false`; scale subset 1024 files wrote in `3786.20ms`; `cleanup_removed=true`.
  - Manual termination after output → `App terminated due to signal 15`; not counted as an iCloud probe failure.
- **Gates closed this iteration:** physical iPhone verifier app launch; physical iPhone CloudDocuments container availability; physical iPhone file-coordinated segment write/read mechanism floor.
- **Gates still open:** true remote placeholder/download, iOS metadata propagation, end-to-end iOS CloudDocuments delivery, account-state runtimes, product compaction/iCloud context, product conflict resolver integration, product TextKit/UI integration, Developer ID/App Store distribution, CP-1 whole-exit.
- **Backfill to 04/05/06:** none; this is runtime evidence against existing B14 / CP-1 delivery gates.
- **Axis matrix delta:** iCloud remains `approved default transport WITH compromise constraints`; physical iPhone launch and local iCloud container mechanism move from blocked/open to closed/observed; remote delivery remains open.
- **Gate evaluation:** CONTINUE for remaining non-device-local delivery gates. Do not claim true remote `.icloud` placeholder, package metadata delivery, product sync, or CP-1 exit from this local physical-device runtime floor.
- **New doc:** `docs/workbench/20260606-anchor-v1/69-physical-iphone-icloud-runtime-rerun-report.md`
