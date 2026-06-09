# Anchor Stage 1 — Cross-target Runner Report

任务：CP-1 machine gate，把 native / wasm / iOS Simulator golden-vector execution 从 `/tmp` 临时 harness 固化为 repo-local 可复跑 runner。
日期：2026-06-10
状态：**workbench artifact** —— 非公开接口契约；本轮新增 core test utility，不触碰 root workspace / lockfile / product app。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**任何 package / workspace / 产品 app / 生成 lockfile / public CLI schema 改动；本轮没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；没有新增 workspace member；没有改 `suites/anchor/core/src/**` production source；没有创建 Apple product app shell；没有向 `suites/anchor/core` 引入 Apple / iCloud / file-coordination 类型。新增内容限于 `suites/anchor/core/tests/cross_target_vector_harness.rs` 与 `suites/anchor/core/tests/run-cross-target-vectors.sh`。

---

## 1. 结论

**Strongest conclusion：cross-target golden execution 现在有 repo-local runner，可在一条命令里复跑 native、`wasm32-unknown-unknown`、`aarch64-apple-ios-sim` 三条执行路径。**

本轮新增：

- `suites/anchor/core/tests/cross_target_vector_harness.rs`
  - 复用 `anchor-core` public API 构造与 `determinism_vectors.rs` 同一组 golden checks。
  - 返回 `anchor_cross_target_vector_status() -> u32`，`0` 表示全部 vector matched。
- `suites/anchor/core/tests/run-cross-target-vectors.sh`
  - 先跑 native `cargo test -p anchor-core --test determinism_vectors`。
  - 临时生成 wasm `cdylib` harness，编到 `wasm32-unknown-unknown`，用 Node WebAssembly runtime 执行。
  - 临时生成 iOS Simulator binary harness，编到 `aarch64-apple-ios-sim`，用 `simctl spawn` 在 booted simulator 执行。

本轮没有关闭 android execution，也没有新增 GitHub Actions / external CI workflow。更精确的 gate 状态是：**repo-local cross-target runner closed for native + wasm + iOS Simulator; android execution and hosted CI integration remain open.**

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| root workspace / package / lockfile | not changed |
| workspace members | not changed |
| `suites/anchor/core/src/**` production source | not changed |
| new repo files | only `suites/anchor/core/tests/cross_target_vector_harness.rs`, `suites/anchor/core/tests/run-cross-target-vectors.sh` |
| public CLI schema | not changed |
| Apple product app shell | not created |
| Swift/TextKit deterministic semantics | not introduced |
| checkpoint exit | not reached |

---

## 3. Observed evidence

### 3.1 Repo-local runner command

Command:

```sh
ANCHOR_IOS_SIMULATOR_ID=A1D90DAB-1FAC-413A-BCB4-F92B9F798F75 \
  bash suites/anchor/core/tests/run-cross-target-vectors.sh
```

Observed:

```text
Running tests/determinism_vectors.rs

running 6 tests
test diff3_merge_vector ... ok
test hash_and_identity_vectors ... ok
test order_key_vector ... ok
test fixture_vault_snapshot_vector ... ok
test conflict_vault_snapshot_vector ... ok
test merged_vault_snapshot_vector ... ok

test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out

Compiling anchor-core v0.0.0 (/Users/plimeor/Documents/labs/suites/anchor/core)
Compiling anchor-cross-target-wasm v0.0.0 (/tmp/anchor-cross-target-vectors/wasm)
Finished `release` profile [optimized] target(s) in 1.72s
anchor_wasm_vector_status=0

Compiling anchor-core v0.0.0 (/Users/plimeor/Documents/labs/suites/anchor/core)
Compiling anchor-cross-target-ios v0.0.0 (/tmp/anchor-cross-target-vectors/ios)
Finished `release` profile [optimized] target(s) in 2.91s
anchor_ios_vector_status=0
```

Interpretation:

- native golden vectors passed through Rust test harness;
- wasm artifact executed through Node WebAssembly and returned status `0`;
- iOS Simulator slice executed inside simulator through `simctl spawn` and returned status `0`.

### 3.2 Script syntax check

Command:

```sh
bash -n suites/anchor/core/tests/run-cross-target-vectors.sh
```

Observed: exit 0, no output.

### 3.3 Boundary audits

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

Interpretation:

- `anchor-core` still has zero Apple/cloud/file-coordination symbols.
- Apple-side files still do not contain deterministic merge/order/hash implementation terms.

### 3.4 Whitespace check

Command:

```sh
git diff --check
```

Observed: exit 0, no output.

---

## 4. Gate evaluation

| Gate | Result |
|---|---|
| native golden execution | closed / repo-local runner |
| wasm golden execution | closed / repo-local runner using Node WebAssembly |
| iOS Simulator slice golden execution | closed / repo-local runner using `simctl spawn` |
| repo-local runner persistence | closed |
| android execution | open / not run |
| hosted CI workflow integration | open / not added |
| core cloud-symbol boundary | clean |
| Apple deterministic-semantics boundary | clean |
| CP-1 whole-exit | **not exited** |

The runner intentionally uses a temp work directory (`/tmp/anchor-cross-target-vectors`) and does not add new Cargo workspace members. `ANCHOR_IOS_SIMULATOR_ID` can pin a simulator; otherwise the script tries the first booted available simulator.

---

## 5. Next action

Gate evaluation: **CONTINUE**.

Next lowest-risk choices:

- close android execution if an Android runner/emulator/toolchain is available without root workspace or lockfile changes;
- move back to Apple delivery gates: remote placeholder, account-state behavior, or product conflict policy;
- keep hosted CI workflow integration open until the project has a CI surface to attach this runner to.
