# Anchor Stage 1 — iCloud Conflict Resolution Report

任务：CP-1 iCloud delivery gate，验证已 materialized 的 mutable manifest conflict 可以经显式 user-resolution 路径保留审计证据后清理。
日期：2026-06-10
状态：**workbench artifact** —— 非公开接口契约；本轮关闭 destructive/user-resolution execution 的机制下限，不关闭产品 UX、core resolve/restore 语义、scale context、account-state、remote placeholder 或 physical iOS runtime。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**任何 package / workspace / 产品 app / 生成 lockfile / public CLI schema 改动；本轮没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；没有改 `suites/anchor/core/src/**` production source；没有创建 Apple product app shell；没有向 `suites/anchor/core` 引入 Apple / iCloud / file-coordination 类型。新增 Apple verifier 行为限于 `suites/anchor/apple/AnchorMacICloudProbe/AnchorMacICloudProbe/ICloudRuntimeProbe.swift` 的 explicit conflict-resolution probe。

---

## 1. 结论

**Strongest conclusion：for the existing offline-fork manifest conflict, explicit current-winner resolution can preserve current/conflict/duplicate branches into an archive and clear the adapter-visible conflict on the next policy read.**

本轮新增 `--icloud-conflict-resolve-probe <runID>`，对历史 run：

```text
offline-conflict-20260607T113449Z
```

执行显式 resolution choice：

```text
resolution_choice=current
```

Observed result:

- current `manifest.json` writer `ios-offline` preserved as `current-manifest.json`;
- unresolved `NSFileVersion` conflict writer `mac-online` preserved as `conflict-version-0.json`;
- duplicate `manifest 2.json` writer `ios-base` moved into archive as `duplicate-0-manifest 2.json`;
- `NSFileVersion.removeOtherVersionsOfItem(at:)` returned `nil`;
- immediate same-run post-check still reported `after_conflict_versions=1`, so the resolver must not assume same-process metadata has fully refreshed;
- a subsequent policy probe reported `conflict_versions=0`, `duplicate_manifest_files=0`, and `adapter_status=ok_no_conflict`.

This closes the destructive/user-resolution execution mechanism floor. It does not close product UI, core `resolve` / `restore` semantics, conflict resolution at scale, stale-peer/watermark policy, true remote `.icloud` placeholder, signed-out / over-quota account states, or physical iOS runtime.

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| root workspace / package / lockfile | not changed |
| `suites/anchor/core/src/**` | not changed |
| public CLI schema | not changed |
| product app shell | not created |
| Apple verifier | explicit conflict-resolution command added |
| iCloud operation | resolved the historical probe manifest conflict in the signed app's iCloud container |
| checkpoint exit | not reached |

---

## 3. Observed evidence

### 3.1 Signed macOS verifier build

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -project suites/anchor/apple/AnchorMacICloudProbe/AnchorMacICloudProbe.xcodeproj \
  -scheme AnchorMacICloudProbe \
  -destination 'platform=macOS,arch=arm64' \
  -configuration Debug \
  -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/AnchorMacICloudProbe-resolve-20260610 \
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

### 3.2 Explicit resolution probe

Command:

```sh
/tmp/anchor-apple-stage1/DerivedData/AnchorMacICloudProbe-resolve-20260610/Build/Products/Debug/AnchorMacICloudProbe.app/Contents/MacOS/AnchorMacICloudProbe \
  --icloud-conflict-resolve-probe offline-conflict-20260607T113449Z
```

Observed key output:

```text
icloud_probe explicit_nil=false
icloud_probe implicit_nil=false
icloud_conflict_resolve run_id=offline-conflict-20260607T113449Z
icloud_conflict_resolve manifest_exists=true
icloud_conflict_resolve resolution_choice=current
icloud_conflict_resolve archive_path=/Users/plimeor/Library/Mobile Documents/iCloud~dev~plimeor~AnchorProvisionProbe/Documents/AnchorConflictProbe/offline-conflict-20260607T113449Z/resolved-archive-1781027263
icloud_conflict_resolve archived_current_bytes=847
icloud_conflict_resolve archived_current_text={"run_id":"offline-conflict-20260607T113449Z","writer":"ios-offline",...}
icloud_conflict_resolve before_conflict_versions=1
icloud_conflict_resolve before_duplicate_manifest_files=1
icloud_conflict_resolve archived_conflict_0_bytes=782
icloud_conflict_resolve archived_conflict_0_text={"run_id":"offline-conflict-20260607T113449Z","writer":"mac-online",...}
icloud_conflict_resolve remove_other_versions_error=nil
icloud_conflict_resolve archived_duplicate_0_name=manifest 2.json
icloud_conflict_resolve archived_duplicate_0_bytes=652
icloud_conflict_resolve archived_duplicate_0_text={"run_id":"offline-conflict-20260607T113449Z","writer":"ios-base",...}
icloud_conflict_resolve after_conflict_versions=1
icloud_conflict_resolve after_duplicate_manifest_files=0
icloud_conflict_resolve after_current_bytes=847
icloud_conflict_resolve after_current_text={"run_id":"offline-conflict-20260607T113449Z","writer":"ios-offline",...}
icloud_conflict_resolve archive_preserved=true
icloud_conflict_resolve resolution_executed=true
icloud_conflict_resolve adapter_status=blocked_manifest_conflict
```

Interpretation:

- The explicit resolver preserved all three observed branches before destructive cleanup.
- Duplicate materialization was removed from the live manifest directory.
- `removeOtherVersionsOfItem(at:)` did not fail.
- Same-run metadata still reported one unresolved version, so the product adapter must re-check after a coordination/metadata refresh before treating the manifest as clean.

### 3.3 Post-resolution policy re-check

Command:

```sh
/tmp/anchor-apple-stage1/DerivedData/AnchorMacICloudProbe-resolve-20260610/Build/Products/Debug/AnchorMacICloudProbe.app/Contents/MacOS/AnchorMacICloudProbe \
  --icloud-conflict-policy-probe offline-conflict-20260607T113449Z
```

Observed:

```text
icloud_probe explicit_nil=false
icloud_probe implicit_nil=false
icloud_conflict_policy run_id=offline-conflict-20260607T113449Z
icloud_conflict_policy manifest_exists=true
icloud_conflict_policy current_bytes=847
icloud_conflict_policy current_text={"run_id":"offline-conflict-20260607T113449Z","writer":"ios-offline","mode":"coordinated","seq":0,"timestamp":"1780832258.013568",...}
icloud_conflict_policy conflict_versions=0
icloud_conflict_policy duplicate_manifest_files=0
icloud_conflict_policy adapter_status=ok_no_conflict
icloud_conflict_policy policy_surface_conflicts=true
icloud_conflict_policy policy_preserve_versions=true
icloud_conflict_policy policy_auto_resolve=false
icloud_conflict_policy resolution_executed=false
```

### 3.4 Archive preservation

Command:

```sh
find "$HOME/Library/Mobile Documents/iCloud~dev~plimeor~AnchorProvisionProbe/Documents/AnchorConflictProbe/offline-conflict-20260607T113449Z" \
  -maxdepth 2 \
  -type f |
  sort
```

Observed excerpt:

```text
.../AnchorConflictProbe/offline-conflict-20260607T113449Z/manifest.json
.../AnchorConflictProbe/offline-conflict-20260607T113449Z/resolved-archive-1781027263/conflict-version-0.json
.../AnchorConflictProbe/offline-conflict-20260607T113449Z/resolved-archive-1781027263/current-manifest.json
.../AnchorConflictProbe/offline-conflict-20260607T113449Z/resolved-archive-1781027263/duplicate-0-manifest 2.json
```

---

## 4. Product policy floor after this run

The current minimum product policy for mutable iCloud manifest resolution is:

1. Block on either unresolved `NSFileVersion` conflicts or duplicate `manifest *.json` files.
2. Present current + conflict-version + duplicate-manifest branches before resolution.
3. Require an explicit resolution choice; the probe only tested `current` as winner.
4. Archive all observed branches before deleting versions or moving duplicate materializations.
5. Re-read policy state after coordination/metadata refresh; same-process `NSFileVersion` state may lag destructive calls.
6. Do not derive frontier / GC / cursor from the manifest until the re-check returns no unresolved versions and no duplicate manifests.

This remains an adapter/product policy. It does not expose public `ConflictRecord` / `resolve` CLI schema; D31 still defers that public surface to Phase 2.

---

## 5. Gate evaluation

| Gate | Result |
|---|---|
| destructive/user-resolution execution mechanism | closed / observed |
| branch archival before cleanup | closed / observed |
| duplicate manifest live cleanup | closed / observed |
| post-refresh adapter-visible clean state | closed / observed |
| product conflict-resolution UX | open / not implemented |
| core `resolve` / `restore` product semantics | open / Phase 2 public surface deferred |
| conflict resolution under scale / stale-peer contexts | open / not run |
| CP-1 whole-exit | **not exited** |

Gate evaluation: **CONTINUE**. This closes the explicit resolution mechanism floor only; CP-1 remains gated by remaining iCloud, binding, TextKit, hosted CI, physical-device, and scale gates.
