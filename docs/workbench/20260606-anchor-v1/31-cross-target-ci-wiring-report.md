# Anchor Stage 1 — Cross-Target CI Wiring Report

任务：CP-1 cross-target execution CI gate，把 repo-local native/wasm/iOS Simulator vector runner 接入 GitHub Actions，并验证本地 skip/full 路径。
日期：2026-06-10
状态：**workbench artifact** —— 非公开接口契约；本轮关闭 CI workflow wiring 的配置下限，不声称 hosted GitHub Actions run 已观察通过；Android execution 仍 open。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**package / workspace / 产品 app / 生成 lockfile / public CLI schema 改动；本轮没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；没有改 `suites/anchor/core/src/**` production source；没有创建 Apple product app shell。新增 CI 配置限于 `.github/workflows/anchor-cross-target-vectors.yml`；runner 变更限于 `suites/anchor/core/tests/run-cross-target-vectors.sh` 的 `ANCHOR_SKIP_IOS` 支持。

---

## 1. 结论

**Strongest conclusion：cross-target vectors 已有 repo-local runner 和 GitHub Actions workflow wiring；hosted run 与 Android execution 仍未关闭。**

本轮新增：

- `.github/workflows/anchor-cross-target-vectors.yml`；
- Linux `native-wasm` job：`ANCHOR_SKIP_IOS=1` 跑 native cargo vectors + wasm Node WebAssembly execution；
- macOS `ios-simulator` job：boot first available iOS Simulator，跑完整 native + wasm + iOS Simulator runner；
- `run-cross-target-vectors.sh` 增加 `ANCHOR_SKIP_IOS=1`，支持 Linux CI 不要求 Xcode/iOS simulator。

本机验证：

- workflow YAML parses；
- `ANCHOR_SKIP_IOS=1` path：native 6 passed、wasm status 0、iOS skipped；
- full local path：native 6 passed、wasm status 0、iOS Simulator status 0。

未关闭：

- GitHub hosted run 尚未实际触发/观察；
- Android execution 本机不可跑：`adb` / `emulator` / `qemu-*` / `wasmtime` 不在 PATH，`ANDROID_HOME=/Users/plimeor/Library/Android/sdk` 指向不存在目录。

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| root workspace / package / lockfile | not changed |
| `suites/anchor/core/src/**` | not changed |
| public CLI schema | not changed |
| product app shell | not created |
| workflow config | added one Anchor-scoped workflow |
| checkpoint exit | not reached |

---

## 3. Observed evidence

### 3.1 Android / runtime environment screening

Command:

```sh
command -v adb
command -v emulator
command -v qemu-aarch64
command -v qemu-aarch64-static
command -v wasmtime
command -v node
command -v rustup
```

Observed output:

```text
/Users/plimeor/.local/state/fnm_multishells/35792_1781019504861/bin/node
/Users/plimeor/.cargo/bin/rustup
```

Command:

```sh
printf 'ANDROID_HOME=%s\nANDROID_SDK_ROOT=%s\nANDROID_NDK_HOME=%s\nANDROID_NDK_ROOT=%s\n' \
  "${ANDROID_HOME-}" "${ANDROID_SDK_ROOT-}" "${ANDROID_NDK_HOME-}" "${ANDROID_NDK_ROOT-}"
ls -ld "$ANDROID_HOME"
```

Observed:

```text
ANDROID_HOME=/Users/plimeor/Library/Android/sdk
ANDROID_SDK_ROOT=
ANDROID_NDK_HOME=
ANDROID_NDK_ROOT=
ls: /Users/plimeor/Library/Android/sdk: No such file or directory
```

Command:

```sh
rustup target list --installed | sort | rg 'android|wasm32|apple-ios|apple-darwin'
```

Observed:

```text
aarch64-apple-darwin
aarch64-apple-ios
aarch64-apple-ios-sim
aarch64-linux-android
wasm32-unknown-unknown
```

Interpretation: Android compile target is installed, but no local Android execution runtime is available in this environment.

### 3.2 Workflow config

New file:

```text
.github/workflows/anchor-cross-target-vectors.yml
```

Workflow shape:

- `native-wasm` on `ubuntu-latest`;
- `ios-simulator` on `macos-latest`;
- path filters limited to workflow file and `suites/anchor/**`;
- permissions `contents: read`;
- Node 24 via `actions/setup-node@v6`;
- Rust targets installed explicitly in each job.

### 3.3 Syntax / YAML checks

Command:

```sh
bash -n suites/anchor/core/tests/run-cross-target-vectors.sh
```

Observed:

```text
exit 0
```

Command:

```sh
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/anchor-cross-target-vectors.yml"); puts "workflow_yaml=ok"'
```

Observed:

```text
workflow_yaml=ok
```

### 3.4 Native + wasm skip path

Command:

```sh
ANCHOR_SKIP_IOS=1 bash suites/anchor/core/tests/run-cross-target-vectors.sh
```

Observed:

```text
running 6 tests
test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
anchor_wasm_vector_status=0
anchor_ios_vector_status=skipped
```

### 3.5 Full local native + wasm + iOS Simulator path

Command:

```sh
ANCHOR_IOS_SIMULATOR_ID=A1D90DAB-1FAC-413A-BCB4-F92B9F798F75 \
  bash suites/anchor/core/tests/run-cross-target-vectors.sh
```

Observed:

```text
running 6 tests
test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
anchor_wasm_vector_status=0
anchor_ios_vector_status=0
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
| repo-local native/wasm/iOS Simulator runner | closed locally |
| Linux native+wasm CI path | closed as workflow config + local skip-path run |
| macOS iOS Simulator CI path | closed as workflow config + local full-path run |
| hosted GitHub Actions run | open / not observed |
| Android execution | open / unavailable in current local environment |
| CP-1 whole-exit | **not exited** |

Gate evaluation: **CONTINUE**.
