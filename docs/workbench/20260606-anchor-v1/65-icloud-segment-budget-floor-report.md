# Anchor Stage 1 — iCloud Segment Budget Floor Report

任务：CP-1 iCloud delivery gate，验证 core steady-state segment budget 与 signed macOS iCloud package 内 segment-file 写入 / 枚举机制可以对齐。
日期：2026-06-10
状态：**workbench evidence** —— 非公开接口契约。本文件只关闭 budget-to-iCloud-file-count 的机制下限；不表示完整 million-op iCloud compaction/product integration、remote placeholder、account-state、physical iOS runtime 或 CP-1 退出。

> 边界声明（AGENTS 工作台规则）：本轮没有改 root workspace / package / lockfile / public CLI schema；没有改 `suites/anchor/core/src/**` production source；没有创建产品 app shell；没有改变 Xcode project、bundle id、entitlement 或 iCloud account 状态。运行产物位于 `/tmp/anchor-apple-stage1/**`，iCloud probe 使用已存在的 repo-local signed verifier `suites/anchor/apple/AnchorMacICloudProbe/AnchorMacICloudProbe.xcodeproj`。

---

## 1. Strongest conclusion

**Steady-state segment budget 的 iCloud file-count 机制下限已关闭；完整 million-op iCloud context 仍未关闭。**

Core 侧现有 `segment_budget` gate 继续通过：默认参数为 `ops_per_segment = 512`、`compaction_fold = 16`，1,000,000 logical ops 的 steady-state file budget 为 124 个 synced segment files（1,954 sealed segments compacted by 16 plus 1 active segment）。Signed macOS verifier 随后在真实 iCloud Drive container 的 `.anchorvault/segments` 内写入并 direct-enumerate 124 个 `.anchorseg` files，观察到：

```text
icloud_scale files=124
icloud_scale direct_count=124
icloud_scale enum_ms=0.61
icloud_scale metadata_count=0
```

这证明：Anchor 当前默认 budget 对应的 iCloud package-internal file count 可以被 signed app 写入、清点、清理，并且仍不依赖 package-internal `NSMetadataQuery` discovery。

它**不**证明：真实 product compaction 已接入、million-op op-log 已在 iCloud package 中端到端落盘、remote `.icloud` placeholder 下载成功、signed-out / over-quota behavior、physical iOS runtime、product conflict resolver UX/core integration，或 CP-1 whole-exit。

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| root workspace / package / lockfile | not changed |
| `suites/anchor/core/src/**` | not changed |
| public CLI schema | not changed |
| product app shell | not created |
| Xcode project / bundle id / entitlement | not changed |
| iCloud account mutation | not performed |
| iCloud operation | temporary signed-app scale vault `AnchorStage1MacScale-124.anchorvault`, removed before exit |
| checkpoint exit | not reached |

---

## 3. Observed evidence

### 3.1 Core segment budget tests

Command:

```sh
cargo test --manifest-path suites/anchor/Cargo.toml -p anchor-core --test segment_budget -- --nocapture
```

Observed:

```text
running 3 tests
test budget_scales_sublinearly ... ok
test million_ops_stay_within_a_tiny_segment_budget ... ok
test per_op_segments_is_recognized_as_failure ... ok

test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

Observed source for the default budget:

```text
ops_per_segment: 512
compaction_fold: 16
steady_state_segments = compacted + 1
```

Inferred arithmetic from the observed source:

```text
logical_ops=1_000_000
sealed_segments=ceil(1_000_000 / 512)=1954
steady_state_segments=ceil(1954 / 16)+1=124
```

### 3.2 Core release million-op replay bench

Command:

```sh
cargo test --release --manifest-path suites/anchor/Cargo.toml -p anchor-core --test scale_bench -- --ignored --nocapture
```

Observed:

```text
running 1 test
ops=   12500  nodes=   2500  replay=    66.3ms  snapshot=19cfe1462bb0
ops=  125000  nodes=  25000  replay=   422.3ms  snapshot=d6c029182d15
ops=  625000  nodes= 125000  replay=  2556.0ms  snapshot=91f4cf5dc466
ops= 1250000  nodes= 250000  replay=  4486.1ms  snapshot=cd10e7610a95
test replay_cost_curve ... ok

test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 12.69s
```

This is a local single-run benchmark result, not a replacement for hosted performance history.

### 3.3 Signed macOS verifier build

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -project suites/anchor/apple/AnchorMacICloudProbe/AnchorMacICloudProbe.xcodeproj \
  -scheme AnchorMacICloudProbe \
  -destination 'platform=macOS,arch=arm64' \
  -configuration Debug \
  -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/AnchorMacICloudProbe-budget-20260610 \
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
codesign -d --entitlements :- /tmp/anchor-apple-stage1/DerivedData/AnchorMacICloudProbe-budget-20260610/Build/Products/Debug/AnchorMacICloudProbe.app
```

Observed entitlement keys:

```text
com.apple.developer.icloud-container-identifiers = <ICLOUD_CONTAINER>
com.apple.developer.icloud-services = CloudDocuments
com.apple.developer.ubiquity-container-identifiers = <ICLOUD_CONTAINER>
com.apple.security.app-sandbox = true
```

### 3.4 iCloud package-internal 124-file probe

Command:

```sh
/tmp/anchor-apple-stage1/DerivedData/AnchorMacICloudProbe-budget-20260610/Build/Products/Debug/AnchorMacICloudProbe.app/Contents/MacOS/AnchorMacICloudProbe \
  --icloud-scale-probe 124
```

Observed:

```text
icloud_probe explicit_nil=false
icloud_probe implicit_nil=false
icloud_scale files=124
icloud_scale write_ms=72.58
icloud_scale direct_count=124
icloud_scale enum_ms=0.61
icloud_scale metadata_gathered=true
icloud_scale metadata_count=0
icloud_scale cleanup_ms=7.24
```

Interpretation:

- The signed app reached the explicit and implicit ubiquity containers.
- The exact steady-state budget count derived from core defaults was written and direct-enumerated inside an iCloud `.anchorvault` package.
- Package-internal `NSMetadataQuery` still returned 0 for `.anchorseg`, preserving the approved direct-enumeration constraint.
- Cleanup completed for the temporary scale vault.

### 3.5 Boundary audits

Command:

```sh
rg "CloudKit|CKRecord|CKAsset|CKContainer|CKSyncEngine|NSFileCoordinator|NSMetadataQuery|ubiquit|iCloud|NSURLIsExcludedFromBackupKey" suites/anchor/core
```

Observed: no output, exit `1`.

Command:

```sh
rg "diff3|order[_-]?key|fractional|merge|canonical|BLAKE3|HLC|OR-Set|dominates_frontier|life lattice|tree invariant|normalize" suites/anchor/apple/AnchorMacICloudProbe suites/anchor/apple/AnchorAppleSpike/Sources/AnchorICloudDriveProbe suites/anchor/apple/AnchorAppleSpike/Sources/AnchorAppleSmoke
```

Observed: no output, exit `1`.

Command:

```sh
git diff --check
```

Observed: no output, exit `0`.

---

## 4. Gate result

Closed this iteration:

- Core `segment_budget` regression gate remains green.
- Core release million-op replay bench remains green in this local run.
- iCloud package-internal write/direct-enumeration floor for the default 1M-op steady-state segment count (124 files) is observed under signed macOS verifier.
- Package-internal `NSMetadataQuery` remains unsuitable for `.anchorseg` discovery, so the direct-enumeration adapter constraint remains intact.

Still open:

- Full product compaction integration from real op-log to actual sealed / compacted segment files.
- Million-op replay / merge / compaction inside a real iCloud-sync product context.
- True remote `.icloud` placeholder delivery.
- Actual signed-out runtime and over-quota runtime/write-failure handling.
- Physical iPhone launch / iCloud runtime and iOS/non-macOS CloudDocuments delivery.
- Product conflict-resolution UX/core integration.
- Product-level TextKit/UI dispatch integration gates.

---

## 5. Ledger entry

### Ledger entry — 2026-06-10 — iteration 44 — doc 65-icloud-segment-budget-floor-report.md

- **Checkpoint / cursor:** CP-1 Apple half, iCloud scale / segment-budget delivery gate.
- **Action selected:** combine existing core segment-budget and million-op release bench with a signed macOS iCloud package-internal 124-file scale probe.
- **Owner classification:** core deterministic budget + Apple/iCloud verifier → executed with existing tests and existing signed macOS verifier; no production app or core source change.
- **Scope-fence check:** passed — no root workspace / package / generated lockfile retained; no public CLI schema; no product app shell; no iCloud account mutation; core cloud-symbol audit remains 0-match.
- **Evidence (Observed = command + output):**
  - `cargo test --manifest-path suites/anchor/Cargo.toml -p anchor-core --test segment_budget -- --nocapture` → 3 passed, 0 failed.
  - `cargo test --release --manifest-path suites/anchor/Cargo.toml -p anchor-core --test scale_bench -- --ignored --nocapture` → 1 passed, 0 failed; 1,250,000 ops replay observed at `4486.1ms` in this local run.
  - `xcodebuild ... AnchorMacICloudProbe ... build` → CloudDocuments-entitled signed app; `** BUILD SUCCEEDED **`.
  - `AnchorMacICloudProbe --icloud-scale-probe 124` → explicit/implicit ubiquity containers non-nil; `direct_count=124`; `enum_ms=0.61`; `metadata_count=0`; `cleanup_ms=7.24`.
  - core cloud-symbol audit → no output, exit `1`.
  - Apple deterministic-semantics audit → no output, exit `1`.
- **Gates closed this iteration:** steady-state segment-budget file-count mechanism floor for 1M logical ops under the default budget.
- **Gates still open:** product compaction integration, million-op iCloud product context, true remote placeholder, account-state runtimes, physical iPhone/iOS delivery, product conflict UX/core integration, product TextKit/UI runtime integration.
- **Backfill to 04/21:** Sync baseline and integration ledger updated to distinguish the closed file-count floor from full iCloud/product compaction gates.
- **Axis matrix delta:** iCloud remains `approved default transport WITH compromise constraints`; layout/retention remains `compromise`; steady-state budget moves from fully open to file-count mechanism floor closed.
- **Gate evaluation:** CONTINUE — remaining gates require product integration, real remote/account/device states, or physical-device runtime.
- **New doc:** `docs/workbench/20260606-anchor-v1/65-icloud-segment-budget-floor-report.md`
