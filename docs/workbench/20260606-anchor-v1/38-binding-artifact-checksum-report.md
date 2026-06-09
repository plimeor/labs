# Anchor Stage 1 — Binding Artifact Checksum Report

任务：CP-1 binding release gate，验证 wrapper binary XCFramework 可以形成 SwiftPM binary target checksum artifact。
日期：2026-06-10
状态：**workbench artifact** —— 非公开接口契约；本轮关闭 binary artifact checksum/distribution mechanism floor，不关闭 artifact signing/notarization policy、fresh-machine/hosted CI 或 physical-device packaging。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**package / workspace / 产品 app / 生成 lockfile / public CLI schema 改动；本轮没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；没有改 `suites/anchor/core/src/**` production source；没有创建 repo 内 product app shell。zip/checksum artifact 位于 `/tmp/anchor-apple-stage1`；没有发布、上传、签名或 notarize。

---

## 1. 结论

**Strongest conclusion：wrapper-compatible `AnchorCoreCBinary.xcframework` can be zipped and checksummed in the exact form SwiftPM binary targets require; signing/notarization/distribution policy remains open.**

Observed checksum:

```text
6dab5c671ae33737a19462fc5452dff390bc0a6afa7c80b91b505bb6e063c890
```

Both `swift package compute-checksum` and `shasum -a 256` returned the same value for:

```text
/tmp/anchor-apple-stage1/AnchorCoreCBinary.xcframework.zip
```

This proves the local checksum mechanism for binary target distribution. It does not prove a real release channel, signature, notarization, provenance attestation, hosted CI upload, or fresh-machine installation.

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| root workspace / package / lockfile | not changed |
| `suites/anchor/core/src/**` | not changed |
| public CLI schema | not changed |
| repo product app shell | not created |
| artifact publishing/upload | not performed |
| signing / notarization | not performed |
| temporary zip/checksum | under `/tmp/anchor-apple-stage1` |
| checkpoint exit | not reached |

---

## 3. Observed evidence

### 3.1 Zip + checksum

Command:

```sh
rm -f /tmp/anchor-apple-stage1/AnchorCoreCBinary.xcframework.zip
cd /tmp/anchor-apple-stage1
ditto -c -k --sequesterRsrc --keepParent \
  AnchorCoreCBinary.xcframework \
  AnchorCoreCBinary.xcframework.zip
swift package compute-checksum /tmp/anchor-apple-stage1/AnchorCoreCBinary.xcframework.zip
shasum -a 256 /tmp/anchor-apple-stage1/AnchorCoreCBinary.xcframework.zip
ls -lh /tmp/anchor-apple-stage1/AnchorCoreCBinary.xcframework.zip
```

Observed:

```text
6dab5c671ae33737a19462fc5452dff390bc0a6afa7c80b91b505bb6e063c890
6dab5c671ae33737a19462fc5452dff390bc0a6afa7c80b91b505bb6e063c890  /tmp/anchor-apple-stage1/AnchorCoreCBinary.xcframework.zip
-rw-r--r--@ 1 plimeor  wheel    17M Jun 10 01:44 /tmp/anchor-apple-stage1/AnchorCoreCBinary.xcframework.zip
```

### 3.2 Artifact contents

Command:

```sh
find /tmp/anchor-apple-stage1/AnchorCoreCBinary.xcframework -maxdepth 3 -type f | sort
```

Observed:

```text
/tmp/anchor-apple-stage1/AnchorCoreCBinary.xcframework/Info.plist
/tmp/anchor-apple-stage1/AnchorCoreCBinary.xcframework/ios-arm64-simulator/Headers/AnchorCoreFFI.h
/tmp/anchor-apple-stage1/AnchorCoreCBinary.xcframework/ios-arm64-simulator/Headers/module.modulemap
/tmp/anchor-apple-stage1/AnchorCoreCBinary.xcframework/ios-arm64-simulator/libanchor_core_ffi.a
/tmp/anchor-apple-stage1/AnchorCoreCBinary.xcframework/ios-arm64/Headers/AnchorCoreFFI.h
/tmp/anchor-apple-stage1/AnchorCoreCBinary.xcframework/ios-arm64/Headers/module.modulemap
/tmp/anchor-apple-stage1/AnchorCoreCBinary.xcframework/ios-arm64/libanchor_core_ffi.a
/tmp/anchor-apple-stage1/AnchorCoreCBinary.xcframework/macos-arm64/Headers/AnchorCoreFFI.h
/tmp/anchor-apple-stage1/AnchorCoreCBinary.xcframework/macos-arm64/Headers/module.modulemap
/tmp/anchor-apple-stage1/AnchorCoreCBinary.xcframework/macos-arm64/libanchor_core_ffi.a
```

### 3.3 Zip contents

Command:

```sh
zipinfo -1 /tmp/anchor-apple-stage1/AnchorCoreCBinary.xcframework.zip | sed -n '1,80p'
```

Observed: the archive contains `AnchorCoreCBinary.xcframework/`, all three slice directories, `Info.plist`, each `libanchor_core_ffi.a`, and each slice's `Headers/AnchorCoreFFI.h` + `Headers/module.modulemap`. The archive also contains `__MACOSX/` resource metadata entries from `ditto --sequesterRsrc`.

---

## 4. Gate evaluation

| Gate | Result |
|---|---|
| SwiftPM binary artifact checksum mechanism | closed / observed |
| wrapper-compatible XCFramework zip shape | closed / observed |
| artifact signing/notarization policy | open / not run |
| hosted CI artifact creation/upload | open / not observed |
| fresh-machine installation | open / not observed |
| physical-device packaging | open / not closed |
| CP-1 whole-exit | **not exited** |

Gate evaluation: **CONTINUE**. This closes checksum/distribution mechanics only; release provenance and hosted/fresh-machine gates remain.
