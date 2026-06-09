# Anchor Stage 1 - Android Emulator CI Wiring Report

任务：CP-1 cross-target execution CI gate，给现有 deterministic vector runner 增加 Android emulator 执行分支，并把 GitHub Actions workflow 接到 hosted Android emulator job。
日期：2026-06-10
状态：**workbench artifact** —— 非公开接口契约；本轮关闭 Android execution 的 repo-local wiring / CI configuration 下限，不关闭 hosted Android execution，因为 pull_request workflow 尚未观察通过。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**package / workspace / 产品 app / 生成 lockfile / public CLI schema 改动；本轮没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；没有改 `suites/anchor/core/src/**` production source；没有创建 repo 内 product app shell；没有引入 Android client。代码变更限于 `.github/workflows/anchor-cross-target-vectors.yml` 与 `suites/anchor/core/tests/run-cross-target-vectors.sh`。

---

## 1. 结论

**Strongest conclusion：Android execution 现在已有 runner 分支和 hosted emulator workflow wiring，但 Android gate 仍未关闭，直到 GitHub hosted `android-emulator` job 实际返回 `anchor_android_vector_status=0`。**

本轮新增：

- `run-cross-target-vectors.sh` 的 `ANCHOR_RUN_ANDROID=1` 分支；
- Android target 默认 `x86_64-linux-android`，用于 hosted x86_64 emulator；
- NDK linker 自动发现逻辑；
- `adb push` + `/data/local/tmp/anchor-cross-target-android` 进程执行；
- `.github/workflows/anchor-cross-target-vectors.yml` 的 `android-emulator` job。

本机 observed：

```text
ANCHOR_SKIP_IOS=1 bash suites/anchor/core/tests/run-cross-target-vectors.sh
...
anchor_wasm_vector_status=0
anchor_ios_vector_status=skipped
```

本机 Android branch observed：

```text
ANCHOR_SKIP_IOS=1 ANCHOR_RUN_ANDROID=1 bash suites/anchor/core/tests/run-cross-target-vectors.sh
...
anchor_wasm_vector_status=0
anchor_android_vector_status=not_run_no_ndk
```

Interpretation:

- Existing Linux/native+wasm skip path remains green.
- Local machine still cannot provide Android runtime evidence because Android SDK/NDK/adb are absent.
- The next gate is hosted `pull_request` run after this workflow change.

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| root workspace / package / lockfile | not changed |
| `suites/anchor/core/src/**` | not changed |
| public CLI schema | not changed |
| product app shell | not created |
| Android client | not created |
| workflow config | extended existing Anchor-scoped workflow |
| checkpoint exit | not reached |

---

## 3. Implementation shape

Changed files:

```text
.github/workflows/anchor-cross-target-vectors.yml
suites/anchor/core/tests/run-cross-target-vectors.sh
```

Runner additions:

- `ANCHOR_RUN_ANDROID=1` turns on Android execution after native and wasm vectors;
- `ANCHOR_ANDROID_TARGET` defaults to `x86_64-linux-android`;
- `ANCHOR_ANDROID_API` defaults to `35`;
- NDK discovery checks `ANDROID_NDK_HOME`, `ANDROID_NDK_ROOT`, `ANDROID_NDK_LATEST_HOME`, then `$ANDROID_HOME/ndk/*`;
- linker env is set as `CARGO_TARGET_<TARGET>_LINKER` only when not already provided;
- the Android binary prints `anchor_android_vector_status=<status>` and exits with the harness status;
- `adb` pushes the binary to `/data/local/tmp/anchor-cross-target-android` and runs it on-device.

Workflow additions:

- new `android-emulator` job on `ubuntu-latest`;
- installs `wasm32-unknown-unknown` and `x86_64-linux-android` Rust targets;
- installs Android emulator components and `system-images;android-35;google_apis;x86_64`;
- installs NDK `27.2.12479018` only when the hosted runner does not expose an existing NDK;
- creates and boots an `anchor-vector` AVD;
- runs the existing vector runner with `ANCHOR_SKIP_IOS=1` and `ANCHOR_RUN_ANDROID=1`.

---

## 4. Observed evidence

### 4.1 Script syntax

Command:

```sh
bash -n suites/anchor/core/tests/run-cross-target-vectors.sh
```

Observed:

```text
exit 0
```

### 4.2 Workflow YAML parse

Command:

```sh
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/anchor-cross-target-vectors.yml"); puts "workflow_yaml=ok"'
```

Observed:

```text
workflow_yaml=ok
```

### 4.3 Existing native + wasm skip path

Command:

```sh
ANCHOR_SKIP_IOS=1 bash suites/anchor/core/tests/run-cross-target-vectors.sh
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
anchor_wasm_vector_status=0
anchor_ios_vector_status=skipped
```

Interpretation:

- The default Linux CI path remains compatible with the new Android branch because `ANCHOR_RUN_ANDROID` defaults off.

### 4.4 Local Android branch screening

Command:

```sh
ANCHOR_SKIP_IOS=1 ANCHOR_RUN_ANDROID=1 \
  bash suites/anchor/core/tests/run-cross-target-vectors.sh
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
anchor_wasm_vector_status=0
anchor_android_vector_status=not_run_no_ndk
```

Interpretation:

- This local run is not Android execution evidence.
- It verifies that the Android branch fails explicitly before claiming runtime proof when no NDK is available.

### 4.5 Local Android tool availability

Command:

```sh
command -v adb
command -v emulator
command -v qemu-aarch64
command -v qemu-aarch64-static
command -v wasmtime
command -v cargo-ndk
printf 'ANDROID_HOME=%s\nANDROID_SDK_ROOT=%s\nANDROID_NDK_HOME=%s\nANDROID_NDK_ROOT=%s\n' \
  "${ANDROID_HOME-}" "${ANDROID_SDK_ROOT-}" "${ANDROID_NDK_HOME-}" "${ANDROID_NDK_ROOT-}"
ls -ld "${ANDROID_HOME:-/Users/plimeor/Library/Android/sdk}"
```

Observed:

```text
ANDROID_HOME=/Users/plimeor/Library/Android/sdk
ANDROID_SDK_ROOT=
ANDROID_NDK_HOME=
ANDROID_NDK_ROOT=
ls: /Users/plimeor/Library/Android/sdk: No such file or directory
```

Interpretation:

- No local Android SDK/NDK/emulator/adb runtime is available in this environment.

### 4.6 Boundary audits

Command:

```sh
git diff --check
```

Observed:

```text
clean, exit 0
```

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
rg -n "diff3|order-key|fractional|merge.*semantic|canonical" suites/anchor/apple
```

Observed:

```text
0 matches, exit 1
```

Command:

```sh
find suites/anchor/apple -name Cargo.lock -print
```

Observed:

```text
0 paths
```

Interpretation:

- No root/workspace/lockfile drift was introduced.
- `anchor-core` remains free of Apple cloud / file-coordination / ubiquity symbols.
- Apple probe code still has no Swift/TextKit-side deterministic core semantics matching the audit pattern.

---

## 5. Gate evaluation

| Gate | Result |
|---|---|
| Android runner branch | closed / local syntax and explicit no-NDK screening observed |
| workflow Android emulator job config | closed as YAML/config wiring |
| local Android execution | open / not available (`not_run_no_ndk`) |
| hosted Android emulator execution | open / not observed until PR workflow runs |
| cross-target execution CI | partially closed: native/wasm/iOS-sim hosted pass; Android hosted execution pending |
| CP-1 whole-exit | **not exited** |

Gate evaluation: **CONTINUE**. Next action is to push this wiring and observe the hosted `android-emulator` job; only a successful hosted run with `anchor_android_vector_status=0` closes Android execution.
