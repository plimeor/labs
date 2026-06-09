# Anchor Stage 1 — Cross-target Execution Report

任务：CP-1 machine gate，执行 core deterministic golden vectors on native / wasm / iOS Simulator slice。
日期：2026-06-10
状态：**workbench artifact** —— 非公开接口契约；本轮推进 cross-target execution evidence，但没有把 CI wiring 固化进 repo。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**任何 package / workspace / 产品 app / 生成 lockfile / public CLI schema 改动；本轮没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；没有改 `suites/anchor/core` source；没有创建 repo 内 Apple product app shell；没有向 `suites/anchor/core` 引入 Apple / iCloud / file-coordination 类型。临时 wasm / iOS execution harness 均位于 `/tmp/anchor-apple-stage1/**`，只依赖 repo 内 `anchor-core` path dependency。

---

## 1. 结论

**Strongest conclusion：core deterministic golden vectors 已在 native、`wasm32-unknown-unknown` WebAssembly runtime、`aarch64-apple-ios-sim` Simulator process 三条执行路径上实际跑通，输出一致。**

本轮关闭的是“跨目标执行 proof”中的两个实跑缺口：

- wasm：临时 `cdylib` harness 编到 `wasm32-unknown-unknown`，Node WebAssembly runtime 调用导出函数，返回 `anchor_wasm_vector_status=0`。
- iOS Simulator slice：临时 Rust binary 编到 `aarch64-apple-ios-sim`，通过 `simctl spawn` 在 booted iPhone 17 simulator 内执行，返回 `anchor_ios_vector_status=0`。

本轮没有关闭“持久 CI wiring”这一交付项：harness 没有进入 repo，也没有新增 CI workflow/script。下一步若要把 gate 从 “execution evidence observed” 提升为 “CI-enforced”，需要在不改 root workspace/lockfile 的前提下把 harness 命令固化到 repo-local script 或 CI job，并重新跑边界审计。

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| root workspace / package / lockfile | not changed |
| `suites/anchor/core` source | not changed |
| repo-local product app shell | not created |
| public CLI schema | not changed |
| harness location | `/tmp/anchor-apple-stage1/wasm-vector-harness`, `/tmp/anchor-apple-stage1/ios-vector-harness` |
| Swift/TextKit deterministic semantics | not introduced |
| Apple cloud symbols in core | not introduced |
| checkpoint exit | not reached |

---

## 3. Observed evidence

### 3.1 Existing native vector test

Command:

```sh
cargo test -p anchor-core --test determinism_vectors
```

Working directory:

```text
/Users/plimeor/Documents/labs/suites/anchor
```

Observed:

```text
running 6 tests
test order_key_vector ... ok
test hash_and_identity_vectors ... ok
test diff3_merge_vector ... ok
test fixture_vault_snapshot_vector ... ok
test conflict_vault_snapshot_vector ... ok
test merged_vault_snapshot_vector ... ok

test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

Native execution confirms the existing golden vector set still passes on host.

### 3.2 wasm runtime choice

Command:

```sh
wasmtime --version
```

Observed:

```text
zsh:1: command not found: wasmtime
```

Because `wasmtime` is not installed, the wasm runtime used for this iteration was Node's built-in WebAssembly engine. This still executes the `wasm32-unknown-unknown` artifact, but it is not the final CI runner selection.

### 3.3 wasm harness build

Temporary harness:

```text
/tmp/anchor-apple-stage1/wasm-vector-harness
```

Harness shape:

```text
[lib]
crate-type = ["cdylib"]

[dependencies]
anchor-core = { path = "/Users/plimeor/Documents/labs/suites/anchor/core" }
```

Export:

```text
anchor_wasm_vector_status() -> u32
```

Status code `0` means all six vectors matched: order-key, diff3 merge, hash/id, fixture snapshot, conflict snapshot, merged snapshot. Non-zero codes identify the failing vector family.

Command:

```sh
cargo build --release \
  --target wasm32-unknown-unknown \
  --manifest-path /tmp/anchor-apple-stage1/wasm-vector-harness/Cargo.toml
```

Observed:

```text
Compiling anchor-core v0.0.0 (/Users/plimeor/Documents/labs/suites/anchor/core)
Compiling anchor-wasm-vector-harness v0.0.0 (/tmp/anchor-apple-stage1/wasm-vector-harness)
Finished `release` profile [optimized] target(s) in 2.74s
```

### 3.4 wasm harness execution

Command:

```sh
node -e 'const fs=require("node:fs"); const wasm=fs.readFileSync("/tmp/anchor-apple-stage1/wasm-vector-harness/target/wasm32-unknown-unknown/release/anchor_wasm_vector_harness.wasm"); WebAssembly.instantiate(wasm, {}).then(({instance}) => { const status = instance.exports.anchor_wasm_vector_status(); console.log(`anchor_wasm_vector_status=${status}`); process.exit(status === 0 ? 0 : 1); }).catch((error) => { console.error(error); process.exit(2); });'
```

Observed:

```text
anchor_wasm_vector_status=0
```

Interpretation: the same `anchor-core` golden vector logic executed inside a `wasm32-unknown-unknown` artifact and returned success.

### 3.5 iOS Simulator harness build

Temporary harness:

```text
/tmp/anchor-apple-stage1/ios-vector-harness
```

Harness shape:

```text
[dependencies]
anchor-core = { path = "/Users/plimeor/Documents/labs/suites/anchor/core" }
```

Runtime target:

```text
aarch64-apple-ios-sim
```

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  cargo build --release \
  --target aarch64-apple-ios-sim \
  --manifest-path /tmp/anchor-apple-stage1/ios-vector-harness/Cargo.toml
```

Observed:

```text
Compiling anchor-core v0.0.0 (/Users/plimeor/Documents/labs/suites/anchor/core)
Compiling anchor-ios-vector-harness v0.0.0 (/tmp/anchor-apple-stage1/ios-vector-harness)
Finished `release` profile [optimized] target(s) in 3.69s
```

### 3.6 iOS Simulator harness execution

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun simctl spawn \
  A1D90DAB-1FAC-413A-BCB4-F92B9F798F75 \
  /tmp/anchor-apple-stage1/ios-vector-harness/target/aarch64-apple-ios-sim/release/anchor-ios-vector-harness
```

Observed:

```text
anchor_ios_vector_status=0
```

Interpretation: the same `anchor-core` golden vector logic executed inside the iOS Simulator runtime and returned success.

### 3.7 Boundary audits

Command:

```sh
rg "CloudKit|CKRecord|CKAsset|CKContainer|CKSyncEngine|NSFileCoordinator|NSMetadataQuery|ubiquit|iCloud|NSURLIsExcludedFromBackupKey" suites/anchor/core
printf 'rg_exit=%s\n' $?
```

Observed:

```text
rg_exit=1
```

Command:

```sh
rg "diff3|order-key|order_key|key_between|merge|normaliz|op-creation|tree-invariant|canonical_serialize|blake3" suites/anchor/apple
printf 'rg_exit=%s\n' $?
```

Observed:

```text
rg_exit=1
```

Interpretation: core still has zero Apple/cloud/file-coordination symbols; Apple-side files still do not contain deterministic merge/order/hash implementation terms.

---

## 4. Gate evaluation

| Gate | Result |
|---|---|
| native golden execution | closed / passed |
| wasm golden execution | closed / passed through Node WebAssembly runtime |
| iOS Simulator slice golden execution | closed / passed through `simctl spawn` |
| android execution | not run |
| persistent CI wiring | **open** |
| core cloud-symbol boundary | clean |
| Apple deterministic-semantics boundary | clean |
| CP-1 whole-exit | **not exited** |

This iteration should update `cross-target execution` from **not run** to **partially closed: native + wasm + iOS Simulator execution observed; persistent CI wiring and android execution remain open**.

---

## 5. Next action

Gate evaluation: **CONTINUE**.

Recommended next machine gate: decide whether to persist this cross-target execution harness as repo-local CI wiring under the approved Anchor suite boundary. If persistence would require a new package/workspace member, root workspace edit, generated lockfile change, or CI config expansion beyond current authorization boundaries, pause and request a specific human decision. If kept as a non-member script/harness with no root lockfile/workspace changes, it can be done as the next CP-1 machine-gate iteration.
