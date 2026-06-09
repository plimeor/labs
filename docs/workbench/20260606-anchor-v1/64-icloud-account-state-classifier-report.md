# Anchor Stage 1 — iCloud Account State Classifier Report

任务：iCloud adapter no-container account-state classifier 机制下限验证
日期：2026-06-10
状态：**workbench evidence** —— 非公开接口契约。本文件记录 CP-1 iCloud delivery gate 的一个窄机制收口；它不表示 signed-out / over-quota runtime gate 或 CP-1 退出。

> 边界声明（AGENTS 工作台规则）：本文件和本轮代码改动只触及已批准的 Stage 1 Apple spike surface：`suites/anchor/apple/AnchorAppleSpike/**`。本轮不授权 root workspace / package / lockfile / 产品 app / entitlement / bundle id / iCloud container 改动；不创建产品 app shell；不改 `suites/anchor/core/src/**`；不改变真实 iCloud account 状态；不声称 over-quota 或真实 signed-out runtime 已验证。

---

## 1. Strongest conclusion

**No-container account-state classifier 机制下限已关闭；真实 signed-out / over-quota account-state delivery gate 仍未关闭。**

本轮在 `AnchorICloudDriveProbe` 中加入纯分类函数：当 explicit 与 implicit ubiquity container URL 同时为 nil 时，adapter status 为 `blocked_no_ubiquity_container`。`AnchorAppleSmoke` 在不改真实 iCloud 账号状态的情况下用 nil/nil 输入跑该分类器，并观察到：

```text
icloud:account_state_classifier=blocked_no_ubiquity_container explicit=false implicit=false
```

这证明 adapter 有一个不会静默继续同步的 no-container blocking branch。它**不**证明 macOS/iOS 真实 signed-out 状态、over-quota 状态、quota 写入失败错误域、用户恢复路径或产品 UI。

---

## 2. Implementation boundary

Touched files:

- `suites/anchor/apple/AnchorAppleSpike/Package.swift`
- `suites/anchor/apple/AnchorAppleSpike/Sources/AnchorICloudDriveProbe/AnchorICloudDriveProbe.swift`
- `suites/anchor/apple/AnchorAppleSpike/Sources/AnchorAppleSmoke/main.swift`

Observed implementation shape:

- `ICloudDriveAccountAdapterStatus` has `ok_available` and `blocked_no_ubiquity_container`.
- `ICloudDriveAccountState` records explicit/implicit container availability and adapter status.
- `ICloudDriveAdapterProbe.classifyAccountState(explicitContainerURL:implicitContainerURL:)` is pure and classifies nil/nil as blocked.
- `ICloudDriveAdapterProbe.accountState(explicitContainerIdentifier:)` reads real explicit/implicit container URLs through `FileManager`, but this report does not use it to mutate account state.
- `AnchorAppleSmoke` asserts the nil/nil branch and prints the classifier output.

No `suites/anchor/core/src/**` production source was changed.

---

## 3. Observed evidence

### 3.1 SwiftPM smoke

Command:

```sh
ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-darwin/release swift run --package-path suites/anchor/apple/AnchorAppleSpike --scratch-path /tmp/anchor-apple-stage1/swift-build-icloud-account-classifier-20260610 AnchorAppleSmoke
```

Observed output:

```text
Build of product 'AnchorAppleSmoke' complete! (32.17s)
fixture:vault=vault_demo_0001 notes=1 snapshot=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63
dispatch:insert changed=blk_a selection=3:3
dispatch:error validation=direct_active_to_deleted
segment:bytes=979
textkit:core_dispatch_bridge=insert changed=blk_a selection=2:2 segment=979
icloud:account_state_classifier=blocked_no_ubiquity_container explicit=false implicit=false
async:sendable summary=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63 changed=blk_a segment=979
```

### 3.2 Xcode Release strict build

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-darwin/release xcodebuild -scheme AnchorAppleSmoke -destination 'platform=macOS' -configuration Release -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/AnchorAppleSmoke-icloud-account-classifier-20260610 OTHER_SWIFT_FLAGS='-strict-concurrency=complete -warnings-as-errors' build
```

Observed output:

```text
Target dependency graph (5 targets)
    Target 'AnchorAppleSmoke' in project 'AnchorAppleSpike'
        Explicit dependency on target 'AnchorCoreC' in project 'AnchorAppleSpike'
        Explicit dependency on target 'AnchorCoreBindings' in project 'AnchorAppleSpike'
        Explicit dependency on target 'AnchorICloudDriveProbe' in project 'AnchorAppleSpike'
        Explicit dependency on target 'AnchorTextKitProbe' in project 'AnchorAppleSpike'
...
** BUILD SUCCEEDED **
```

### 3.3 Xcode Release product smoke

Command:

```sh
/tmp/anchor-apple-stage1/DerivedData/AnchorAppleSmoke-icloud-account-classifier-20260610/Build/Products/Release/AnchorAppleSmoke
```

Observed output:

```text
fixture:vault=vault_demo_0001 notes=1 snapshot=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63
dispatch:insert changed=blk_a selection=3:3
dispatch:error validation=direct_active_to_deleted
segment:bytes=979
textkit:core_dispatch_bridge=insert changed=blk_a selection=2:2 segment=979
icloud:account_state_classifier=blocked_no_ubiquity_container explicit=false implicit=false
async:sendable summary=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63 changed=blk_a segment=979
```

### 3.4 iOS Simulator compile surface

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -scheme AnchorICloudDriveProbe -destination 'generic/platform=iOS Simulator' -configuration Debug -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/AnchorICloudDriveProbe-account-classifier-iossim-20260610 build
```

Observed output:

```text
Target dependency graph (2 targets)
    Target 'AnchorICloudDriveProbe' in project 'AnchorAppleSpike'
        Explicit dependency on target 'AnchorICloudDriveProbe' in project 'AnchorAppleSpike'
...
** BUILD SUCCEEDED **
```

### 3.5 Boundary audits

Command:

```sh
rg "CloudKit|CKRecord|CKAsset|CKContainer|CKSyncEngine|NSFileCoordinator|NSMetadataQuery|ubiquit|iCloud|NSURLIsExcludedFromBackupKey" suites/anchor/core; printf 'exit=%s\n' "$?"
```

Observed output:

```text
exit=1
```

Command:

```sh
rg "diff3|order[_-]?key|fractional|merge|canonical|BLAKE3|HLC|OR-Set|dominates_frontier|life lattice|tree invariant|normalize" suites/anchor/apple/AnchorAppleSpike/Sources/AnchorICloudDriveProbe suites/anchor/apple/AnchorAppleSpike/Sources/AnchorAppleSmoke; printf 'exit=%s\n' "$?"
```

Observed output:

```text
exit=1
```

---

## 4. Gate result

Closed this iteration:

- No-container account-state classifier mechanism floor: explicit nil + implicit nil → `blocked_no_ubiquity_container`.
- `AnchorICloudDriveProbe` iOS Simulator compile surface remains green after classifier addition.

Still open:

- True signed-out account runtime on macOS/iOS.
- Over-quota account runtime and write-failure classification.
- User-visible recovery action / product UI.
- Physical iPhone app launch and physical iPhone iCloud runtime.
- iOS/non-macOS CloudDocuments delivery, true remote `.icloud` placeholder, steady-state segment budget / million-op iCloud context, product conflict-resolution UX/core integration.

---

## 5. Ledger entry

### Ledger entry — 2026-06-10 — iteration 43 — doc 64-icloud-account-state-classifier-report.md

- **Checkpoint / cursor:** CP-1 Apple half, iCloud account-state delivery gate.
- **Action selected:** add and run a pure no-container account-state classifier in the repo-local Apple spike.
- **Owner classification:** Apple/iCloud adapter verifier → implemented in repo-local spike probe/smoke; no product app shell, Xcode project mutation, account mutation, or core production source touched.
- **Scope-fence check:** passed — no root workspace / package / generated lockfile retained; no public CLI schema; no product app shell; no Swift-side deterministic core semantics; core cloud-symbol audit remains 0-match.
- **Evidence (Observed = command + output):**
  - `swift run --package-path suites/anchor/apple/AnchorAppleSpike --scratch-path /tmp/anchor-apple-stage1/swift-build-icloud-account-classifier-20260610 AnchorAppleSmoke` → `icloud:account_state_classifier=blocked_no_ubiquity_container explicit=false implicit=false`.
  - `xcodebuild -scheme AnchorAppleSmoke ... OTHER_SWIFT_FLAGS='-strict-concurrency=complete -warnings-as-errors' build` → target dependency graph includes `AnchorICloudDriveProbe`; `** BUILD SUCCEEDED **`.
  - Release executable run → `icloud:account_state_classifier=blocked_no_ubiquity_container explicit=false implicit=false`.
  - `xcodebuild -scheme AnchorICloudDriveProbe -destination 'generic/platform=iOS Simulator' ... build` → `** BUILD SUCCEEDED **`.
  - core cloud-symbol audit → `exit=1`.
- **Gates closed this iteration:** no-container account-state classifier mechanism floor.
- **Gates still open:** actual signed-out runtime, over-quota runtime/write-failure handling, product UI recovery, physical iPhone launch/iCloud runtime, iOS/non-macOS CloudDocuments delivery, true remote placeholder, iCloud scale/budget gates, product conflict-resolution UX/core integration.
- **Backfill to 04/21:** Sync/iCloud baseline and integration ledger updated to distinguish classifier mechanism floor from real account-state runtime gates.
- **Axis matrix delta:** iCloud remains `approved default transport WITH compromise constraints`; no-container classifier moves from open/not implemented to mechanism floor closed.
- **Gate evaluation:** CONTINUE — remaining iCloud delivery gates require real account/device states or product integration.
- **New doc:** `docs/workbench/20260606-anchor-v1/64-icloud-account-state-classifier-report.md`
