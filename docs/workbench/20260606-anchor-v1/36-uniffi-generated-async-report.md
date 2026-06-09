# Anchor Stage 1 — UniFFI Generated Async Report

任务：CP-1 binding release gate，验证 UniFFI generated Swift async surface 在 Swift 6 strict-concurrency 下的可行性。
日期：2026-06-10
状态：**workbench artifact** —— 非公开接口契约；本轮关闭 macOS runtime + iOS Simulator compile/link 的 UniFFI generated async 机制下限，不关闭 physical-device/iPhoneOS packaging、fresh-machine/hosted CI 或 artifact distribution policy。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**package / workspace / 产品 app / 生成 lockfile / public CLI schema 改动；本轮没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；没有改 `suites/anchor/core/src/**` production source；没有创建 repo 内 product app shell。代码变更限于 `suites/anchor/apple/uniffi/**` 的 verifier wrapper / UDL / smoke；生成的 Swift、headers、binaries 均位于 `/tmp/anchor-apple-stage1`；`suites/anchor/apple/uniffi/Cargo.lock` 与 `suites/anchor/apple/ffi/Cargo.lock` 均未保留。

---

## 1. 结论

**Strongest conclusion：UniFFI 0.31.1 的 generated Swift async surface 在 macOS runtime 和 iOS Simulator compile/link 面通过 Swift 6 strict-concurrency + warnings-as-errors；physical iPhoneOS standalone link 仍未关闭，因为这台 Xcode 26.5 的 iPhoneOS Swift SDK exposes `arm64e` while the Rust `aarch64-apple-ios` slice is `arm64`.**

Closed as mechanism floor:

- UDL `[Async]` generates Swift `asyncFixtureSummary() async -> FixtureSummary`;
- generated Swift includes UniFFI RustFuture async helpers;
- macOS generated async smoke runs and returns the frozen fixture snapshot;
- iOS Simulator generated async smoke compiles/links as `platform IOSSIMULATOR`, minOS 26.0, SDK 26.5.

Still open:

- physical-device/iPhoneOS generated async packaging;
- hosted CI / fresh-machine reproduction;
- product artifact signing/checksum/distribution policy.

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| root workspace / package / lockfile | not changed |
| `suites/anchor/core/src/**` | not changed |
| public CLI schema | not changed |
| repo product app shell | not created |
| UniFFI verifier wrapper | async function added |
| generated Swift / build products | under `/tmp/anchor-apple-stage1` |
| generated lockfiles | removed / not retained |
| checkpoint exit | not reached |

---

## 3. Observed evidence

### 3.1 Source changes

Changed files:

```text
suites/anchor/apple/uniffi/src/anchor_core_uniffi.udl
suites/anchor/apple/uniffi/src/lib.rs
suites/anchor/apple/uniffi/SwiftSmoke/smoke.swift
```

UDL addition:

```webidl
[Async] FixtureSummary async_fixture_summary();
```

Rust wrapper:

```rust
pub async fn async_fixture_summary() -> FixtureSummary {
    fixture_summary(anchor_core::dto::open_fixture_vault())
}
```

Swift smoke:

```swift
let asyncSummary = await asyncFixtureSummary()
precondition(asyncSummary.snapshotRevision == expectedSnapshot)
```

### 3.2 macOS UniFFI release build

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
CARGO_TARGET_DIR=/tmp/anchor-apple-stage1/uniffi-async-target \
  cargo build \
  --manifest-path suites/anchor/apple/uniffi/Cargo.toml \
  --release \
  --target aarch64-apple-darwin
```

Observed:

```text
Finished `release` profile [optimized] target(s) in 35.94s
```

### 3.3 Swift binding generation

Command:

```sh
cargo run \
  --manifest-path /Users/plimeor/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/uniffi-0.31.1/Cargo.toml \
  --features cli \
  --bin uniffi-bindgen-swift -- \
  --swift-sources \
  --headers \
  --modulemap \
  --module-name anchor_core_uniffiFFI \
  --modulemap-filename module.modulemap \
  src/anchor_core_uniffi.udl \
  /tmp/anchor-apple-stage1/uniffi-async-generated
```

Observed: command exited 0 from `suites/anchor/apple/uniffi`.

Generated source audit:

```sh
rg -n "asyncFixtureSummary|uniffiRustCallAsync|async throws|RustFuture" \
  /tmp/anchor-apple-stage1/uniffi-async-generated/anchor_core_uniffi.swift \
  /tmp/anchor-apple-stage1/uniffi-async-generated/anchor_core_uniffiFFI.h \
  /tmp/anchor-apple-stage1/uniffi-async-generated/module.modulemap
```

Observed excerpts:

```text
anchor_core_uniffi.swift:932:fileprivate func uniffiRustCallAsync<F, T>(
anchor_core_uniffi.swift:939:) async throws -> T {
anchor_core_uniffi.swift:975:public func asyncFixtureSummary()async  -> FixtureSummary  {
anchor_core_uniffiFFI.h:49:typedef void (*UniffiRustFutureContinuationCallback)(uint64_t, int8_t
```

### 3.4 macOS generated async smoke

Command:

```sh
swiftc \
  -swift-version 6 \
  -strict-concurrency=complete \
  -warnings-as-errors \
  -I /tmp/anchor-apple-stage1/uniffi-async-generated \
  -L /tmp/anchor-apple-stage1/uniffi-async-target/aarch64-apple-darwin/release \
  -lanchor_core_uniffi \
  /tmp/anchor-apple-stage1/uniffi-async-generated/anchor_core_uniffi.swift \
  suites/anchor/apple/uniffi/SwiftSmoke/smoke.swift \
  -o /tmp/anchor-apple-stage1/uniffi-async-smoke \
  && /tmp/anchor-apple-stage1/uniffi-async-smoke
```

Observed excerpt:

```text
uniffi:fixture vault=vault_demo_0001 notes=1 snapshot=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63
uniffi:async fixture snapshot=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63
uniffi:dispatch error=directActiveToDeleted message=direct active→deleted rejected; trash first (D10/D20)
uniffi:bench size=67108864 bytes=67108864 ms=129.41 maxrss=270090240 checksum=1479290224479992690
```

### 3.5 iOS / iOS Simulator Rust slices

Commands:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
CARGO_TARGET_DIR=/tmp/anchor-apple-stage1/uniffi-async-target \
  cargo build --manifest-path suites/anchor/apple/uniffi/Cargo.toml --release --target aarch64-apple-ios

DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
CARGO_TARGET_DIR=/tmp/anchor-apple-stage1/uniffi-async-target \
  cargo build --manifest-path suites/anchor/apple/uniffi/Cargo.toml --release --target aarch64-apple-ios-sim
```

Observed:

```text
Finished `release` profile [optimized]
```

### 3.6 iOS Simulator generated async compile/link

Command:

```sh
SDKROOT="$(DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun --sdk iphonesimulator --show-sdk-path)"
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  swiftc \
  -swift-version 6 \
  -strict-concurrency=complete \
  -warnings-as-errors \
  -target arm64-apple-ios26.0-simulator \
  -sdk "$SDKROOT" \
  -I /tmp/anchor-apple-stage1/uniffi-async-generated \
  -L /tmp/anchor-apple-stage1/uniffi-async-target/aarch64-apple-ios-sim/release \
  -lanchor_core_uniffi \
  /tmp/anchor-apple-stage1/uniffi-async-generated/anchor_core_uniffi.swift \
  suites/anchor/apple/uniffi/SwiftSmoke/smoke.swift \
  -o /tmp/anchor-apple-stage1/uniffi-async-smoke-iossim
```

Observed:

```text
clang: warning: using sysroot for 'MacOSX' but targeting 'iPhone' [-Wincompatible-sysroot]
```

Exit code was 0. Platform readback:

```sh
vtool -show-build /tmp/anchor-apple-stage1/uniffi-async-smoke-iossim
```

Observed:

```text
platform IOSSIMULATOR
minos 26.0
sdk 26.5
```

### 3.7 iPhoneOS generated async compile/link attempt

Command:

```sh
SDKROOT="$(DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun --sdk iphoneos --show-sdk-path)"
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  swiftc \
  -swift-version 6 \
  -strict-concurrency=complete \
  -warnings-as-errors \
  -target arm64e-apple-ios26.0 \
  -sdk "$SDKROOT" \
  -I /tmp/anchor-apple-stage1/uniffi-async-generated \
  -L /tmp/anchor-apple-stage1/uniffi-async-target/aarch64-apple-ios/release \
  -lanchor_core_uniffi \
  /tmp/anchor-apple-stage1/uniffi-async-generated/anchor_core_uniffi.swift \
  suites/anchor/apple/uniffi/SwiftSmoke/smoke.swift \
  -o /tmp/anchor-apple-stage1/uniffi-async-smoke-ios
```

Observed:

```text
ld: warning: ignoring file '/tmp/anchor-apple-stage1/uniffi-async-target/aarch64-apple-ios/release/libanchor_core_uniffi.dylib': found architecture 'arm64', required architecture 'arm64e'
Undefined symbols for architecture arm64e:
  "_uniffi_anchor_core_uniffi_fn_func_async_fixture_summary"
  ...
clang: error: linker command failed with exit code 1
```

Interpretation: this is an iPhoneOS artifact architecture/package issue in the standalone `swiftc` route, not evidence that generated async Swift fails. Physical-device packaging remains open.

### 3.8 Lockfile cleanup

Command:

```sh
test ! -e suites/anchor/apple/uniffi/Cargo.lock && echo no_uniffi_cargo_lock
test ! -e suites/anchor/apple/ffi/Cargo.lock && echo no_ffi_cargo_lock
```

Observed:

```text
no_uniffi_cargo_lock
no_ffi_cargo_lock
```

---

## 4. Gate evaluation

| Gate | Result |
|---|---|
| UniFFI UDL async function generation | closed / observed |
| generated Swift async wrapper | closed / observed |
| macOS Swift 6 strict-concurrency async runtime | closed / observed |
| iOS Simulator Swift 6 strict-concurrency compile/link | closed with clang sysroot warning caveat |
| iPhoneOS / physical-device generated async packaging | open / arm64e vs arm64 standalone link mismatch |
| fresh-machine / hosted CI reproduction | open / not observed |
| artifact signing/checksum/distribution policy | open / not productized |
| CP-1 whole-exit | **not exited** |

Gate evaluation: **CONTINUE**. The generated async mechanism is now proven for macOS runtime and iOS Simulator compile/link; product/device packaging and fresh-machine CI remain open.
