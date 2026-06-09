# Anchor Stage 1 — Binding Binary Target Report

任务：CP-1 binding release gate，在 repo 外 SwiftPM consumer 中以 `.binaryTarget` 导入 C ABI XCFramework 并调用 raw FFI。
日期：2026-06-10
状态：**workbench artifact** —— 非公开接口契约；本轮关闭 raw C ABI binary target import 的机制下限，不关闭完整 product wrapper binary package、fresh-machine/hosted CI 或最终 DTO/error vocabulary gate。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**任何 package / workspace / 产品 app / 生成 lockfile / public CLI schema 改动；本轮没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；没有改 `suites/anchor/core/src/**` production source；没有改变 `anchor-core` crate type；没有创建 Apple product app shell。binary target、headers、consumer artifact 均位于 `/tmp/anchor-apple-stage1`，repo 外。

---

## 1. 结论

**Strongest conclusion：C ABI fast path 可以被打成 SwiftPM `.binaryTarget` 可消费的 XCFramework，并由 repo-external consumer 在 Release strict-concurrency 下导入运行；完整 product wrapper binary package 仍未关闭。**

Observed result:

```text
binary:fixture bytes=216 module=AnchorCoreFFI
```

这证明 binary-target 的底层导入链路成立：staticlib slices + headers/module map + SwiftPM `.binaryTarget` + external executable consumer。它不是完整产品 packaging，因为当前 consumer 直接调用 raw C ABI；最终产品仍需要把 generated Swift/Swift wrapper surface、UniFFI DTO surface、C ABI bytes fast path、binary artifact checksum/signing/distribution、fresh-machine CI 组合成一个稳定 packaging story。

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| repo files for binary target / consumer | not added; all under `/tmp/anchor-apple-stage1` |
| root workspace / package / lockfile | not changed; generated `suites/anchor/apple/ffi/Cargo.lock` removed as build byproduct |
| `suites/anchor/core/src/**` | not changed |
| `anchor-core` crate type | not changed |
| product app shell | not created |
| public CLI schema | not changed |
| checkpoint exit | not reached |

---

## 3. Observed evidence

### 3.1 C ABI slices

Commands:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
CARGO_TARGET_DIR=/tmp/anchor-apple-stage1/ffi-target \
  cargo build --manifest-path suites/anchor/apple/ffi/Cargo.toml --release --target aarch64-apple-darwin

DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
CARGO_TARGET_DIR=/tmp/anchor-apple-stage1/ffi-target \
  cargo build --manifest-path suites/anchor/apple/ffi/Cargo.toml --release --target aarch64-apple-ios

DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
CARGO_TARGET_DIR=/tmp/anchor-apple-stage1/ffi-target \
  cargo build --manifest-path suites/anchor/apple/ffi/Cargo.toml --release --target aarch64-apple-ios-sim
```

Observed:

```text
Finished `release` profile [optimized]
```

### 3.2 Binary XCFramework

Temporary module map:

```text
module AnchorCoreFFI {
    header "AnchorCoreFFI.h"
    export *
}
```

Command:

```sh
rm -rf /tmp/anchor-apple-stage1/AnchorCoreFFIBinary.xcframework
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -create-xcframework \
  -library /tmp/anchor-apple-stage1/ffi-target/aarch64-apple-darwin/release/libanchor_core_ffi.a \
  -headers /tmp/anchor-apple-stage1/ffi-binary-headers \
  -library /tmp/anchor-apple-stage1/ffi-target/aarch64-apple-ios/release/libanchor_core_ffi.a \
  -headers /tmp/anchor-apple-stage1/ffi-binary-headers \
  -library /tmp/anchor-apple-stage1/ffi-target/aarch64-apple-ios-sim/release/libanchor_core_ffi.a \
  -headers /tmp/anchor-apple-stage1/ffi-binary-headers \
  -output /tmp/anchor-apple-stage1/AnchorCoreFFIBinary.xcframework
```

Observed:

```text
xcframework successfully written out to: /tmp/anchor-apple-stage1/AnchorCoreFFIBinary.xcframework
```

### 3.3 Repo-external binary consumer

Files created outside the repo:

```text
/tmp/anchor-apple-stage1/binary-consumer/Package.swift
/tmp/anchor-apple-stage1/binary-consumer/Sources/BinaryConsumer/main.swift
```

Consumer target shape:

```swift
.binaryTarget(
    name: "AnchorCoreFFI",
    path: "../AnchorCoreFFIBinary.xcframework"
)
```

Runtime call shape:

```swift
let buffer = anchor_core_fixture_summary_json()
defer { anchor_buffer_free(buffer) }
```

### 3.4 Release strict-concurrency consumer run

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  swift run \
  --package-path /tmp/anchor-apple-stage1/binary-consumer \
  -c release \
  -Xswiftc -strict-concurrency=complete \
  -Xswiftc -warnings-as-errors \
  BinaryConsumer
```

Observed:

```text
Building for production...
[1/5] Copying libanchor_core_ffi.a
[4/6] Compiling BinaryConsumer main.swift
[5/6] Linking BinaryConsumer
Build of product 'BinaryConsumer' complete! (1.89s)
binary:fixture bytes=216 module=AnchorCoreFFI
```

### 3.5 Boundary audits

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
| raw C ABI binary target import | closed as mechanism floor |
| external binary consumer release strict run | closed / observed |
| complete product wrapper binary package | open / not run |
| generated Swift / UniFFI packaging through binary artifact | open / not run |
| fresh-machine/hosted CI reproduction | open / not run |
| final production DTO/error vocabulary | open / not frozen |
| CP-1 whole-exit | **not exited** |

Gate evaluation: **CONTINUE**.
