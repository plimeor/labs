# Anchor Stage 1 — iCloud Conflict Policy Floor Report

任务：CP-1 iCloud delivery gate，给 manifest conflict 建立非破坏性 product policy floor：surface / preserve / block，禁止自动解决。
日期：2026-06-10
状态：**workbench artifact** —— 非公开接口契约；本轮关闭 conflict policy 的下限，不关闭 destructive/user-resolution 执行 gate。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**任何 package / workspace / 产品 app / 生成 lockfile / public CLI schema 改动；本轮没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；没有改 `suites/anchor/core/src/**` production source；没有创建 Apple product app shell；没有向 `suites/anchor/core` 引入 Apple / iCloud / file-coordination 类型。新增 Apple verifier 行为限于 `suites/anchor/apple/AnchorMacICloudProbe/AnchorMacICloudProbe/ICloudRuntimeProbe.swift` 的只读 conflict-policy probe。

---

## 1. 结论

**Strongest conclusion：iCloud manifest conflict 的最低产品策略可以关闭为 surface / preserve / block / no-auto-resolve；真正执行用户选择后的 destructive resolution 仍未关闭。**

本轮 verifier 新增 `--icloud-conflict-policy-probe <runID>`。它只读检查：

- current `manifest.json`;
- `NSFileVersion.unresolvedConflictVersionsOfItem(at:)`;
- 同目录 `manifest *.json` duplicate materialization。

如果 unresolved versions 或 duplicate manifest 任一存在，adapter 状态为：

```text
icloud_conflict_policy adapter_status=blocked_manifest_conflict
icloud_conflict_policy policy_surface_conflicts=true
icloud_conflict_policy policy_preserve_versions=true
icloud_conflict_policy policy_auto_resolve=false
icloud_conflict_policy resolution_executed=false
```

Observed result for the historical offline-fork run:

- current file = `writer=ios-offline`;
- unresolved conflict version = `writer=mac-online`;
- duplicate manifest file = `manifest 2.json`, `writer=ios-base`;
- no conflict version or duplicate file was deleted or replaced.

This closes the policy floor: an adapter must not keep advancing from a mutable manifest as if it were conflict-free when `NSFileVersion` conflicts or materialized duplicate manifests exist. It must surface all branches, preserve them, and block automatic manifest-derived sync decisions until an explicit resolution flow exists.

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| root workspace / package / lockfile | not changed |
| `suites/anchor/core/src/**` | not changed |
| public CLI schema | not changed |
| product app shell | not created |
| Apple verifier | read-only conflict-policy command added |
| destructive conflict resolution | not executed |
| checkpoint exit | not reached |

---

## 3. Observed evidence

### 3.1 Existing conflict files

Command:

```sh
find "$HOME/Library/Mobile Documents/iCloud~dev~plimeor~AnchorProvisionProbe" \
  -maxdepth 6 -path '*AnchorConflictProbe*' -print
```

Observed excerpt:

```text
.../Documents/AnchorConflictProbe/offline-conflict-20260607T113449Z/manifest.json
.../Documents/AnchorConflictProbe/offline-conflict-20260607T113449Z/manifest 2.json
```

Command:

```sh
for path in "$HOME/Library/Mobile Documents/iCloud~dev~plimeor~AnchorProvisionProbe/Documents/AnchorConflictProbe/offline-conflict-20260607T113449Z"/manifest*.json; do
  /usr/bin/basename "$path"
  /usr/bin/python3 - <<'PY' "$path"
import json, sys
with open(sys.argv[1], 'r') as f:
    data=json.load(f)
print({k:data.get(k) for k in ['run_id','writer','mode','seq','timestamp']})
PY
done
```

Observed:

```text
manifest 2.json
{'run_id': 'offline-conflict-20260607T113449Z', 'writer': 'ios-base', 'mode': 'coordinated', 'seq': 0, 'timestamp': '1780832114.018151'}
manifest.json
{'run_id': 'offline-conflict-20260607T113449Z', 'writer': 'ios-offline', 'mode': 'coordinated', 'seq': 0, 'timestamp': '1780832258.013568'}
```

### 3.2 Signed macOS verifier build

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -project suites/anchor/apple/AnchorMacICloudProbe/AnchorMacICloudProbe.xcodeproj \
  -scheme AnchorMacICloudProbe \
  -destination 'platform=macOS,arch=arm64' \
  -configuration Debug \
  -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/AnchorMacICloudProbe-conflict-policy-20260610b \
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

### 3.3 Conflict-policy probe

Command:

```sh
/tmp/anchor-apple-stage1/DerivedData/AnchorMacICloudProbe-conflict-policy-20260610b/Build/Products/Debug/AnchorMacICloudProbe.app/Contents/MacOS/AnchorMacICloudProbe \
  --icloud-conflict-policy-probe offline-conflict-20260607T113449Z
```

Observed key output:

```text
icloud_probe explicit_nil=false
icloud_probe implicit_nil=false
icloud_conflict_policy run_id=offline-conflict-20260607T113449Z
icloud_conflict_policy manifest_exists=true
icloud_conflict_policy current_bytes=847
icloud_conflict_policy current_text={"run_id":"offline-conflict-20260607T113449Z","writer":"ios-offline",...}
icloud_conflict_policy conflict_versions=1
icloud_conflict_policy conflict_0_is_conflict=true
icloud_conflict_policy conflict_0_modified_epoch=1780832258
icloud_conflict_policy conflict_0_bytes=782
icloud_conflict_policy conflict_0_text={"run_id":"offline-conflict-20260607T113449Z","writer":"mac-online",...}
icloud_conflict_policy duplicate_manifest_files=1
icloud_conflict_policy duplicate_0_name=manifest 2.json
icloud_conflict_policy duplicate_0_bytes=652
icloud_conflict_policy duplicate_0_text={"run_id":"offline-conflict-20260607T113449Z","writer":"ios-base",...}
icloud_conflict_policy adapter_status=blocked_manifest_conflict
icloud_conflict_policy policy_surface_conflicts=true
icloud_conflict_policy policy_preserve_versions=true
icloud_conflict_policy policy_auto_resolve=false
icloud_conflict_policy resolution_executed=false
```

Interpretation:

- `NSFileVersion` conflict surfacing is live and returns the retained `mac-online` branch.
- Duplicate manifest materialization is also present and must be treated as a blocking conflict surface.
- The verifier did not call replacement, deletion, `removeOtherVersionsOfItem`, or any resolving API.

---

## 4. Policy floor

The minimum product policy for any mutable iCloud manifest is:

1. Treat either unresolved `NSFileVersion` conflicts or duplicate `manifest *.json` files as `blocked_manifest_conflict`.
2. Surface current + conflict-version + duplicate-manifest branches to the adapter/UI layer.
3. Preserve all branches until an explicit user/product resolution flow exists.
4. Do not advance manifest-derived frontier / GC / cursor decisions from a blocked manifest.
5. Do not auto-resolve or delete conflict versions in the adapter.

This policy does not expose public `ConflictRecord` / `resolve` CLI schema. D31 still keeps public conflict/resolve schema deferred to Phase 2.

---

## 5. Gate evaluation

| Gate | Result |
|---|---|
| conflict surfacing | closed / observed |
| conflict preservation floor | closed / no destructive resolution |
| duplicate manifest detection | closed / observed |
| adapter blocking policy | closed as floor |
| user-driven/destructive resolution execution | open / not run |
| public conflict/resolve CLI schema | still deferred to Phase 2 |
| CP-1 whole-exit | **not exited** |

Gate evaluation: **CONTINUE**.
