# Anchor Stage 1 — Binding Wrapper Binary Package Report

任务：CP-1 binding release gate，验证完整 Swift wrapper 可以通过 repo-external SwiftPM package 消费 binary XCFramework，而不是只直接调用 raw C ABI。
日期：2026-06-10
状态：**workbench artifact** —— 非公开接口契约；本轮关闭 complete product wrapper binary package 的机制下限，不关闭 fresh-machine / hosted CI reproduction 或 UniFFI generated async surface。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**package / workspace / 产品 app / 生成 lockfile / public CLI schema 改动；本轮没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；没有改 `suites/anchor/core/src/**` production source；没有创建 repo 内 product app shell。临时 SwiftPM package、headers、XCFramework 均位于 `/tmp/anchor-apple-stage1`；`suites/anchor/apple/ffi/Cargo.lock` 作为 wrapper crate build byproduct 已删除。

---

## 1. 结论

**Strongest conclusion：Swift wrapper surface (`AnchorCoreBindings`) 可以通过 repo-external SwiftPM package 依赖 binary XCFramework，在 Release strict-concurrency 下构建并运行。**

Observed result:

```text
wrapper:fixture snapshot=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63
wrapper:insert changed=blk_a selection=3
wrapper:error validation=direct_active_to_deleted
wrapper:segment bytes=979
```

This is stronger than `30-binding-binary-target-report.md`: doc 30 proved raw C ABI binary-target import; this report proves the Swift wrapper layer can sit above a binary XCFramework module and preserve fixture truth, dispatch, structured validation error decode, and segment bytes.

Remaining packaging gates:

- hosted CI / fresh-machine reproduction;
- UniFFI generated async surface;
- artifact checksum/signing/distribution story for a real release package.

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| repo root workspace / package / lockfile | not changed |
| `suites/anchor/core/src/**` | not changed |
| public CLI schema | not changed |
| repo product app shell | not created |
| repo Swift package manifest | not changed |
| repo-external SwiftPM package | created under `/tmp/anchor-apple-stage1/wrapper-binary-consumer` |
| temporary XCFramework | created under `/tmp/anchor-apple-stage1/AnchorCoreCBinary.xcframework` |
| generated `suites/anchor/apple/ffi/Cargo.lock` | removed |
| checkpoint exit | not reached |

---

## 3. Observed evidence

### 3.1 C ABI release slices

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

### 3.2 Binary XCFramework with wrapper-compatible module name

The Swift wrapper source imports `AnchorCoreC`, so this run created a wrapper-compatible module map:

```text
module AnchorCoreC {
    header "AnchorCoreFFI.h"
    export *
}
```

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -create-xcframework \
  -library /tmp/anchor-apple-stage1/ffi-target/aarch64-apple-darwin/release/libanchor_core_ffi.a \
  -headers /tmp/anchor-apple-stage1/wrapper-binary-headers \
  -library /tmp/anchor-apple-stage1/ffi-target/aarch64-apple-ios/release/libanchor_core_ffi.a \
  -headers /tmp/anchor-apple-stage1/wrapper-binary-headers \
  -library /tmp/anchor-apple-stage1/ffi-target/aarch64-apple-ios-sim/release/libanchor_core_ffi.a \
  -headers /tmp/anchor-apple-stage1/wrapper-binary-headers \
  -output /tmp/anchor-apple-stage1/AnchorCoreCBinary.xcframework
```

Observed:

```text
xcframework successfully written out to: /tmp/anchor-apple-stage1/AnchorCoreCBinary.xcframework
```

### 3.3 Repo-external wrapper package

Files created outside the repo:

```text
/tmp/anchor-apple-stage1/wrapper-binary-consumer/Package.swift
/tmp/anchor-apple-stage1/wrapper-binary-consumer/Sources/AnchorCoreBindings/AnchorCoreBindings.swift
/tmp/anchor-apple-stage1/wrapper-binary-consumer/Sources/WrapperConsumer/main.swift
```

Package shape:

```swift
.binaryTarget(
    name: "AnchorCoreC",
    path: "../AnchorCoreCBinary.xcframework"
)
.target(
    name: "AnchorCoreBindings",
    dependencies: ["AnchorCoreC"]
)
.executableTarget(
    name: "WrapperConsumer",
    dependencies: ["AnchorCoreBindings"]
)
```

The `AnchorCoreBindings.swift` source was copied unchanged from the repo-local spike package.

### 3.4 Release strict-concurrency wrapper consumer run

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  swift run \
  --package-path /tmp/anchor-apple-stage1/wrapper-binary-consumer \
  -c release \
  -Xswiftc -strict-concurrency=complete \
  -Xswiftc -warnings-as-errors \
  WrapperConsumer
```

Observed:

```text
Building for production...
[1/6] Copying libanchor_core_ffi.a
[5/7] Compiling AnchorCoreBindings AnchorCoreBindings.swift
[6/8] Compiling WrapperConsumer main.swift
[7/8] Linking WrapperConsumer
Build of product 'WrapperConsumer' complete! (2.60s)
wrapper:fixture snapshot=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63
wrapper:insert changed=blk_a selection=3
wrapper:error validation=direct_active_to_deleted
wrapper:segment bytes=979
```

### 3.5 Lockfile cleanup

Command:

```sh
test ! -e suites/anchor/apple/ffi/Cargo.lock && echo no_ffi_cargo_lock
```

Observed:

```text
no_ffi_cargo_lock
```

---

## 4. Gate evaluation

| Gate | Result |
|---|---|
| raw C ABI binary target import | already closed by doc 30 |
| Swift wrapper over binary target | closed / observed |
| complete product wrapper binary package mechanism floor | closed |
| fresh-machine / hosted CI reproduction | open / not observed |
| UniFFI generated async surface | open / not run |
| artifact signing/checksum/distribution policy | open / not productized |
| CP-1 whole-exit | **not exited** |

Gate evaluation: **CONTINUE**. Binding release surface now has local wrapper packaging evidence, but CP-1 still needs fresh-machine/hosted CI proof and the remaining Apple runtime gates.
