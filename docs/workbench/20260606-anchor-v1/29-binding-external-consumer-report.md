# Anchor Stage 1 — Binding External Consumer Report

任务：CP-1 binding release gate，在 repo 外 SwiftPM consumer 中导入 `AnchorCoreBindings` 并调用 async wrapper surface。
日期：2026-06-10
状态：**workbench artifact** —— 非公开接口契约；本轮关闭 repo-external SwiftPM path dependency import 的机制下限，不关闭 binary-target import、fresh-machine/hosted CI 或最终产品 packaging gate。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**任何 package / workspace / 产品 app / 生成 lockfile / public CLI schema 改动；本轮没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；没有改 `suites/anchor/core/src/**` production source；没有改变 `anchor-core` crate type；没有创建 Apple product app shell。consumer artifact 位于 `/tmp/anchor-apple-stage1/binding-consumer`，repo 外。

---

## 1. 结论

**Strongest conclusion：`AnchorCoreBindings` 可以被 repo 外 SwiftPM package 作为 path dependency 导入，并在 Release strict-concurrency 下调用 `AnchorCoreClient` async actor surface；但最终 binary target / fresh-machine / hosted CI 仍未关闭。**

Observed result:

```text
consumer:async summary=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63 changed=blk_a segment=979
```

这个结果证明 product-like consumer 不必在 repo 内 target 中才能消费 Swift wrapper surface。它仍依赖本机已有 Rust target、repo-local source package path、以及 `/tmp/anchor-apple-stage1/ffi-target/...` 下的 C ABI staticlib；因此不能替代 final binary-target packaging 或 fresh-machine CI reproduction。

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| repo files for consumer | not added; consumer is under `/tmp/anchor-apple-stage1` |
| root workspace / package / lockfile | not changed |
| `suites/anchor/core/src/**` | not changed |
| `anchor-core` crate type | not changed |
| product app shell | not created |
| binary target | not created |
| checkpoint exit | not reached |

---

## 3. Observed evidence

### 3.1 Repo-external consumer package

Files created outside the repo:

```text
/tmp/anchor-apple-stage1/binding-consumer/Package.swift
/tmp/anchor-apple-stage1/binding-consumer/Sources/BindingConsumer/main.swift
```

Consumer dependency shape:

```swift
.package(path: "/Users/plimeor/Documents/labs/suites/anchor/apple/AnchorAppleSpike")
```

Consumer target dependency:

```swift
.product(name: "AnchorCoreBindings", package: "AnchorAppleSpike")
```

Runtime call shape:

```swift
let client = try AnchorCoreClient()
let summary = try await client.summary()
let insert = try await client.dispatchInsertText(targetID: "blk_a", at: 0, text: "🍎 ")
let segment = try await client.readSegment()
```

### 3.2 Release strict-concurrency consumer run

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-darwin/release \
  swift run \
  --package-path /tmp/anchor-apple-stage1/binding-consumer \
  -c release \
  -Xswiftc -strict-concurrency=complete \
  -Xswiftc -warnings-as-errors \
  BindingConsumer
```

Observed output:

```text
Building for production...
[5/7] Compiling AnchorCoreBindings AnchorCoreBindings.swift
[6/8] Compiling BindingConsumer main.swift
[7/8] Linking BindingConsumer
Build of product 'BindingConsumer' complete! (2.51s)
consumer:async summary=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63 changed=blk_a segment=979
```

### 3.3 Boundary audits

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
| repo-external SwiftPM path dependency import | closed as mechanism floor |
| external consumer release strict-concurrency run | closed / observed |
| binary-target import surface | open / not run |
| fresh-machine/hosted CI reproduction | open / not run |
| final production DTO/error vocabulary | open / not frozen |
| UniFFI generated async surface | open / not run |
| CP-1 whole-exit | **not exited** |

Gate evaluation: **CONTINUE**.
