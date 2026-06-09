# Anchor Stage 1 — Binding Async Wrapper Report

任务：CP-1 binding release gate，给 Apple SwiftPM wrapper 增加并验证 async / `Sendable` actor surface；不声称 UniFFI generated async surface 已关闭。
日期：2026-06-10
状态：**workbench artifact** —— 非公开接口契约；本轮关闭 Swift wrapper 层 async/Sendable 机制下限，不关闭最终生产 DTO/error vocabulary、UniFFI generated async surface、binary-target import surface 或 fresh-machine/CI gate。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**任何 package / workspace / 产品 app / 生成 lockfile / public CLI schema 改动；本轮没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；没有改 `suites/anchor/core/src/**` production source；没有改变 `anchor-core` crate type；没有创建 Apple product app shell。新增 binding 行为限于 verifier-only SwiftPM wrapper `suites/anchor/apple/AnchorAppleSpike/Sources/AnchorCoreBindings/**` 与 `AnchorAppleSmoke`。

---

## 1. 结论

**Strongest conclusion：Swift wrapper 层的 async / `Sendable` surface 可行，并通过 macOS release strict-concurrency 与 iOS Simulator release compile；但 UniFFI generated async surface 和最终产品 wrapper/CI 仍未关闭。**

本轮实现的机制：

- DTO / error Swift types 增加 `Sendable` conformance；
- 新增 `AnchorCoreClient` actor，actor 内部持有非 `Sendable` 的 `AnchorSession`，以 actor isolation 串行化 C ABI session 调用；
- `AnchorAppleSmoke` 用 `try await` 调用 `summary()`、`dispatchInsertText(...)`、`readSegment()`；
- macOS Release Xcode build 使用 `-strict-concurrency=complete -warnings-as-errors` 通过；
- iOS Simulator `AnchorCoreBindings` Release build 同样使用 `-strict-concurrency=complete -warnings-as-errors` 通过。

这证明 Apple product wrapper 可以把本地同步 core dispatch 包成 Swift actor async API，而不要求 core 引入 async runtime，也不把 session handle 标成 unchecked `Sendable`。这不等同于 UniFFI 自身生成 async Swift API 已通过；该 gate 仍须在最终 UniFFI surface / DTO vocab 冻结时单独复验。

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| root workspace / package / lockfile | not changed |
| `suites/anchor/core/src/**` | not changed |
| `anchor-core` crate type | not changed |
| public CLI schema | not changed |
| product app shell | not created |
| Swift deterministic semantics | not introduced |
| checkpoint exit | not reached |

---

## 3. Observed evidence

### 3.1 FFI slice rebuild

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
CARGO_TARGET_DIR=/tmp/anchor-apple-stage1/ffi-target \
  cargo build \
  --manifest-path suites/anchor/apple/ffi/Cargo.toml \
  --release \
  --target aarch64-apple-darwin
```

Observed:

```text
Compiling anchor-core v0.0.0 (/Users/plimeor/Documents/labs/suites/anchor/core)
Compiling anchor-core-ffi v0.0.0 (/Users/plimeor/Documents/labs/suites/anchor/apple/ffi)
Finished `release` profile [optimized] target(s) in 2.06s
```

### 3.2 SwiftPM debug smoke

Command:

```sh
ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-darwin/release \
  swift run \
  --package-path suites/anchor/apple/AnchorAppleSpike \
  --scratch-path /tmp/anchor-apple-stage1/swift-build-binding-async-20260610b \
  AnchorAppleSmoke
```

Observed key output:

```text
Build of product 'AnchorAppleSmoke' complete! (21.42s)
fixture:vault=vault_demo_0001 notes=1 snapshot=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63
dispatch:insert changed=blk_a selection=3:3
dispatch:error validation=direct_active_to_deleted
segment:bytes=979
async:sendable summary=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63 changed=blk_a segment=979
bench:size=67108864 bytes=67108864 ms=45.01 maxrss=96796672 checksum=1479290224479992690
```

### 3.3 macOS Release strict-concurrency build

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-darwin/release \
  xcodebuild \
  -scheme AnchorAppleSmoke \
  -destination 'platform=macOS,arch=arm64' \
  -configuration Release \
  -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/AnchorAppleSmoke-async-strict-20260610 \
  OTHER_SWIFT_FLAGS='-strict-concurrency=complete -warnings-as-errors' \
  build
```

Observed excerpts:

```text
OTHER_SWIFT_FLAGS = -strict-concurrency=complete -warnings-as-errors
SwiftDriver Compilation AnchorAppleSmoke ... -strict-concurrency=complete -warnings-as-errors ... -swift-version 6
** BUILD SUCCEEDED **
```

### 3.4 macOS Release strict-concurrency runtime

Command:

```sh
/tmp/anchor-apple-stage1/DerivedData/AnchorAppleSmoke-async-strict-20260610/Build/Products/Release/AnchorAppleSmoke
```

Observed key output:

```text
fixture:vault=vault_demo_0001 notes=1 snapshot=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63
dispatch:insert changed=blk_a selection=3:3
dispatch:error validation=direct_active_to_deleted
segment:bytes=979
async:sendable summary=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63 changed=blk_a segment=979
bench:size=67108864 bytes=67108864 ms=36.79 maxrss=96763904 checksum=1479290224479992690
```

### 3.5 iOS Simulator Release strict-concurrency compile

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
CARGO_TARGET_DIR=/tmp/anchor-apple-stage1/ffi-target \
  cargo build \
  --manifest-path suites/anchor/apple/ffi/Cargo.toml \
  --release \
  --target aarch64-apple-ios-sim
```

Observed:

```text
Finished `release` profile [optimized] target(s) in 1.74s
```

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-ios-sim/release \
  xcodebuild \
  -scheme AnchorCoreBindings \
  -destination 'generic/platform=iOS Simulator' \
  -configuration Release \
  -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/AnchorCoreBindings-iossim-async-strict-20260610 \
  OTHER_SWIFT_FLAGS='-strict-concurrency=complete -warnings-as-errors' \
  build
```

Observed excerpts:

```text
OTHER_SWIFT_FLAGS = -strict-concurrency=complete -warnings-as-errors
SwiftDriver Compilation AnchorCoreBindings ... -strict-concurrency=complete -warnings-as-errors ... -swift-version 6
** BUILD SUCCEEDED **
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
| Swift wrapper DTO/error `Sendable` conformance | closed as mechanism floor |
| Swift wrapper actor async surface | closed as mechanism floor |
| macOS release strict concurrency + warnings-as-errors | closed / observed |
| macOS release runtime through async wrapper | closed / observed |
| iOS Simulator release strict compile | closed / observed |
| UniFFI generated async surface | open / not run |
| final production DTO/error vocabulary | open / not frozen |
| product binary-target/import surface | open / not run |
| fresh-machine/hosted CI reproduction | open / not run |
| CP-1 whole-exit | **not exited** |

Gate evaluation: **CONTINUE**.
