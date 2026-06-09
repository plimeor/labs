# Anchor Stage 1 — UniFFI iPhoneOS Packaging Report

任务：CP-1 binding release gate，复核 UniFFI generated async Swift 在 iPhoneOS `arm64` target 下的 standalone compile/link 机制。
日期：2026-06-10
状态：**workbench artifact** —— 非公开接口契约；本轮关闭 iPhoneOS `arm64` standalone compile/link 机制下限，不关闭 signed app bundle、physical device install/runtime、fresh-machine/hosted CI 或 artifact signing/notarization/provenance policy。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**package / workspace / 产品 app / 生成 lockfile / public CLI schema 改动；本轮没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；没有改 `suites/anchor/core/src/**` production source；没有创建 repo 内 product app shell；没有改 Xcode project / bundle id / entitlement。所有 build artifacts 位于 `/tmp/anchor-apple-stage1`。

---

## 1. 结论

**Strongest conclusion：the prior iPhoneOS generated async failure was caused by targeting `arm64e`; the same UniFFI generated async surface links as an iPhoneOS `arm64` Mach-O when the Swift target matches the Rust `aarch64-apple-ios` slice.**

本轮用相同 generated Swift / Rust iOS slice，改用：

```text
-target arm64-apple-ios26.0
```

Observed result:

- `swiftc` exited 0 under Swift 6 strict concurrency + warnings-as-errors;
- output is `Mach-O 64-bit executable arm64`;
- `vtool` reports `platform IOS`, `minos 26.0`, `sdk 26.5`;
- Rust staticlib, Rust dylib, and the produced Swift smoke executable all report `arm64`.

This closes the iPhoneOS standalone compile/link mechanism floor for the generated async binding. It does **not** prove a signed iOS app bundle, physical device installation, physical device runtime, hosted CI reproduction, or release distribution policy.

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| root workspace / package / lockfile | not changed |
| `suites/anchor/core/src/**` | not changed |
| public CLI schema | not changed |
| Xcode project / bundle id / entitlement | not changed |
| product app shell | not created |
| build output | `/tmp/anchor-apple-stage1/uniffi-async-smoke-ios-arm64` |
| checkpoint exit | not reached |

---

## 3. Observed evidence

### 3.1 iPhoneOS Swift compile/link

Command:

```sh
SDKROOT="$(DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun --sdk iphoneos --show-sdk-path)"
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  swiftc \
  -swift-version 6 \
  -strict-concurrency=complete \
  -warnings-as-errors \
  -target arm64-apple-ios26.0 \
  -sdk "$SDKROOT" \
  -I /tmp/anchor-apple-stage1/uniffi-async-generated \
  -L /tmp/anchor-apple-stage1/uniffi-async-target/aarch64-apple-ios/release \
  -lanchor_core_uniffi \
  /tmp/anchor-apple-stage1/uniffi-async-generated/anchor_core_uniffi.swift \
  suites/anchor/apple/uniffi/SwiftSmoke/smoke.swift \
  -o /tmp/anchor-apple-stage1/uniffi-async-smoke-ios-arm64
```

Observed:

```text
clang: warning: using sysroot for 'MacOSX' but targeting 'iPhone' [-Wincompatible-sysroot]
```

Exit code: `0`.

Interpretation: the warning matches the earlier standalone `swiftc` route caveat, but `-warnings-as-errors` did not promote it to a Swift diagnostic and the link succeeded.

### 3.2 Output platform and architecture

Command:

```sh
file /tmp/anchor-apple-stage1/uniffi-async-smoke-ios-arm64
```

Observed:

```text
/tmp/anchor-apple-stage1/uniffi-async-smoke-ios-arm64: Mach-O 64-bit executable arm64
```

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  vtool -show-build /tmp/anchor-apple-stage1/uniffi-async-smoke-ios-arm64
```

Observed:

```text
/tmp/anchor-apple-stage1/uniffi-async-smoke-ios-arm64:
Load command 11
      cmd LC_BUILD_VERSION
  cmdsize 32
 platform IOS
    minos 26.0
      sdk 26.5
   ntools 1
     tool LD
  version 1267.0
```

Command:

```sh
lipo -archs /tmp/anchor-apple-stage1/uniffi-async-target/aarch64-apple-ios/release/libanchor_core_uniffi.a
lipo -archs /tmp/anchor-apple-stage1/uniffi-async-target/aarch64-apple-ios/release/libanchor_core_uniffi.dylib
lipo -archs /tmp/anchor-apple-stage1/uniffi-async-smoke-ios-arm64
```

Observed:

```text
arm64
arm64
arm64
```

### 3.3 Dynamic link shape

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  otool -L /tmp/anchor-apple-stage1/uniffi-async-smoke-ios-arm64
```

Observed excerpt:

```text
/tmp/anchor-apple-stage1/uniffi-async-target/aarch64-apple-ios/release/deps/libanchor_core_uniffi.dylib
/usr/lib/libSystem.B.dylib
/System/Library/Frameworks/Foundation.framework/Foundation
/usr/lib/libobjc.A.dylib
/usr/lib/swift/libswiftCore.dylib
/usr/lib/swift/libswift_Concurrency.dylib
```

Interpretation: this standalone route links against the Rust UniFFI dylib path under `/tmp`. Product packaging still needs a signed app-bundle integration path and release artifact policy.

---

## 4. Gate evaluation

| Gate | Result |
|---|---|
| iPhoneOS generated async standalone `arm64` compile/link | closed / observed |
| prior `arm64e` mismatch interpretation | narrowed: wrong target for current Rust slice |
| signed iOS app bundle with generated async binding | open / not run |
| physical device install/runtime for generated async binding | open / not run |
| fresh-machine / hosted CI reproduction | open / not observed |
| artifact signing/notarization/provenance policy | open / not run |
| CP-1 whole-exit | **not exited** |

Gate evaluation: **CONTINUE**. The generated async iPhoneOS mechanism floor is now closed for standalone `arm64`; product packaging, CI, and physical-device runtime remain gates.
