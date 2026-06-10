# Anchor Stage 1 — Cross-Target Deterministic Vector Execution & CI Consolidated Evidence

任务：CP-1 cross-target execution gate —— 收口 anchor-core 6 个 determinism golden vectors 在 native / wasm32 / iOS Simulator / Android emulator 上的实测证据与 CI wiring 历史。
日期：2026-06-10
状态：**workbench evidence（consolidated）—— 非公开接口契约**

> **边界声明（AGENTS 工作台规则，强制）：** 本文件**不授权**任何 package / workspace / 产品 app / 生成 lockfile / public CLI schema / 代码改动；权威接口契约在实现后归未来 `anchor-core` 包 README。本文件仅整合既有 cross-target 执行与 CI 证据，去除多份碎片化报告（替代 24 / 25 / 31 / 41 / 61 / 62 / 68 / 71）。

---

## 1. 结论（Strongest conclusion）

**同一组 anchor-core 6 个 determinism golden vectors 在 native、`wasm32-unknown-unknown`（Node WebAssembly runtime）、iOS Simulator、Android emulator 四条执行路径上跑出 byte-identical 输出。** 这关闭了 cross-target deterministic vector execution 作为 Stage 1 machine gate。

The 6 golden vectors（来自 `tests/determinism_vectors.rs`，复用于 cross-target harness）：

| Vector | 含义 |
|---|---|
| `order_key_vector` | fractional order-key（`key_between`）确定性 |
| `hash_and_identity_vectors` | BLAKE3 hash + identity 派生 |
| `diff3_merge_vector` | diff3 三方合并 |
| `fixture_vault_snapshot_vector` | fixture vault canonical snapshot |
| `conflict_vault_snapshot_vector` | conflict vault canonical snapshot |
| `merged_vault_snapshot_vector` | merged vault canonical snapshot |

每条路径都返回 `status=0`（all six vectors matched）；non-zero 编码指向失败的 vector family。

**仍未退出：** CP-1 whole-exit；剩余 open gates 是 Apple delivery / product runtime / human sign-off，不是 cross-target deterministic vector execution（见 §7）。

---

## 2. Artifact surface（repo-local runner）

固化在 repo 内的可复跑 surface：

```text
suites/anchor/core/tests/cross_target_vector_harness.rs   # anchor_cross_target_vector_status() -> u32, 0 = all matched
suites/anchor/core/tests/run-cross-target-vectors.sh      # 一条命令复跑 native + wasm + iOS-sim (+ optional Android)
```

- `cross_target_vector_harness.rs` 复用 `anchor-core` public API 构造与 `determinism_vectors.rs` 同一组 golden checks；导出 `anchor_cross_target_vector_status() -> u32`，`0` 表示全部 vector matched。
- `run-cross-target-vectors.sh` 行为：
  - 先跑 native `cargo test -p anchor-core --test determinism_vectors`；
  - 临时生成 wasm `cdylib` harness，编到 `wasm32-unknown-unknown`，用 Node WebAssembly runtime 执行；
  - 临时生成 iOS Simulator binary，编到 `aarch64-apple-ios-sim`，用 `simctl spawn` 在 booted simulator 执行；
  - `ANCHOR_RUN_ANDROID=1` 时编到 `x86_64-linux-android` 并用 `adb push` + on-device 执行。
- Runner 使用临时工作目录（`/tmp/anchor-cross-target-vectors`），**不**新增 Cargo workspace member。
- Env 开关：`ANCHOR_IOS_SIMULATOR_ID`（pin 一个 simulator，否则取首个 booted available）；`ANCHOR_SKIP_IOS=1`（Linux CI 不要求 Xcode/iOS simulator）；`ANCHOR_RUN_ANDROID=1`（`ANCHOR_ANDROID_TARGET` 默认 `x86_64-linux-android`，`ANCHOR_ANDROID_API` 默认 `35`，NDK 自动发现 `ANDROID_NDK_HOME` / `ANDROID_NDK_ROOT` / `ANDROID_NDK_LATEST_HOME` / `$ANDROID_HOME/ndk/*`）。

---

## 3. Local execution evidence（Observed）

Native vectors（`cargo test -p anchor-core --test determinism_vectors`）→ `6 passed; 0 failed; 0 ignored`，6 个 vector 全 `ok`。

wasm runtime choice：`wasmtime` 未安装（`command not found: wasmtime`），本期 wasm runtime 用 Node 内置 WebAssembly engine —— 它执行同一 `wasm32-unknown-unknown` artifact，但不是最终 CI runner selection（见 §7 OPEN GATE）。

Full local runner（native + wasm + iOS Simulator）：

```sh
ANCHOR_IOS_SIMULATOR_ID=<DEVICE_ID> bash suites/anchor/core/tests/run-cross-target-vectors.sh
# 6 passed; 0 failed; anchor_wasm_vector_status=0; anchor_ios_vector_status=0
```

wasm artifact 经 Node WebAssembly 返回 `0`；iOS Simulator slice 经 `simctl spawn` 在 booted simulator 内返回 `0`。

Skip-iOS path（Linux-shape，`ANCHOR_SKIP_IOS=1`）：`6 passed`、`anchor_wasm_vector_status=0`、`anchor_ios_vector_status=skipped`。

Local Android branch screening（Not-run / explicit no-NDK）：

```sh
ANCHOR_SKIP_IOS=1 ANCHOR_RUN_ANDROID=1 bash suites/anchor/core/tests/run-cross-target-vectors.sh
# 6 passed; anchor_wasm_vector_status=0; anchor_android_vector_status=not_run_no_ndk
```

本机无 Android SDK/NDK/emulator/adb runtime：`adb` / `emulator` / `qemu-aarch64` / `wasmtime` / `cargo-ndk` 不在 PATH；`ANDROID_HOME=<HOME>/Library/Android/sdk` 指向不存在目录。此 run **不是** Android 执行证据；它只验证 Android branch 在缺 NDK 时显式失败（`not_run_no_ndk`），而非伪装成 runtime proof。

Installed Rust targets（`rustup target list --installed`）：`aarch64-apple-darwin`、`aarch64-apple-ios`、`aarch64-apple-ios-sim`、`aarch64-linux-android`、`wasm32-unknown-unknown` —— Android compile target 已装，但本机无 Android 执行 runtime。

---

## 4. Hosted CI execution（historical, observed pass — workflow since REMOVED）

> 重要：hosted GitHub Actions workflow（`Anchor Cross-Target Vectors`）曾被加入又被**移除**（见 §6）。下列 hosted run 是**历史证据**（valid as historical evidence），current head **不再**有 per-push / per-PR hosted regression coverage。

历史 hosted workflow shape `.github/workflows/anchor-cross-target-vectors.yml`：

- `native-wasm` job on `ubuntu-latest`（`ANCHOR_SKIP_IOS=1`：native cargo vectors + wasm Node WebAssembly）；
- `ios-simulator` job on `macos-latest`（boot first available simulator，跑完整 native + wasm + iOS Simulator）；
- `android-emulator` job on `ubuntu-latest`（`system-images;android-35;google_apis;x86_64`，NDK `27.2.12479018`，boot `anchor-vector` AVD，`ANCHOR_SKIP_IOS=1 ANCHOR_RUN_ANDROID=1`）；
- path filters 限于 workflow file + `suites/anchor/**`；permissions `contents: read`；Node 24 via `actions/setup-node@v6`；Rust targets per-job 显式安装。

### 4.1 First hosted run — native+wasm + iOS Simulator（observed pass）

`pull_request` run on draft PR <PR>，`conclusion=success`：

```text
native-wasm    pass    26s
ios-simulator  pass    7m27s
```

iOS Simulator job key output（`ANCHOR_IOS_SIMULATOR_ID=<DEVICE_ID>`, `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`）：

```text
running 6 tests
test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
anchor_wasm_vector_status=0
anchor_ios_vector_status=0
```

### 4.2 Android emulator hosted run（observed pass after AVD-path fix）

第一次 amended hosted Android run 失败，root cause 是 runner step AVD path persistence（非 vector logic）：

```text
adb wait-for-device timed out
ERROR | Unknown AVD name [anchor-vector], use -list-avds to see valid list.
ERROR | HOME is defined but there is no file anchor-vector.ini in $HOME/.android/avd
```

Fix：`ANDROID_AVD_HOME=$RUNNER_TEMP/android-avd`（创建并固定 AVD home）。修复后的 `pull_request` run（`conclusion=success`，`ANDROID_AVD_HOME=/home/runner/work/_temp/android-avd`, `ANCHOR_ANDROID_TARGET=x86_64-linux-android`, `ANCHOR_ANDROID_API=35`）：

```text
running 6 tests
test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
anchor_wasm_vector_status=0
anchor-cross-target-android: 1 file pushed, 0 skipped
anchor_android_vector_status=0
anchor_ios_vector_status=skipped
```

同一 run 内 jobs：`native-wasm=success`、`android-emulator=success`、`ios-simulator=success`、`apple-binding-package=success`（后者含 C ABI wrapper package reproduction、UniFFI async macOS smoke、iOS Simulator / iPhoneOS compile-link smokes）。

---

## 5. Boundary audits（每轮 clean）

每轮迭代都跑 boundary audit，结果一致：

```sh
rg "CloudKit|CKRecord|CKAsset|CKContainer|CKSyncEngine|NSFileCoordinator|NSMetadataQuery|ubiquit|iCloud|NSURLIsExcludedFromBackupKey" suites/anchor/core
# 0 matches, exit 1

rg "diff3|order-key|order_key|key_between|merge|normaliz|op-creation|tree-invariant|canonical_serialize|blake3" suites/anchor/apple
# 0 matches, exit 1

git diff --check    # clean, exit 0
find suites/anchor/apple -name Cargo.lock -print    # 0 paths
```

Interpretation：`anchor-core` 零 Apple/cloud/file-coordination 符号；Apple-side 文件不含 deterministic merge/order/hash 实现术语；无 root/workspace/lockfile drift。

工具版本（evidence）：Xcode 26.5、Swift 6.3.2、rustc 1.95.0。

---

## 6. GitHub workflow removal（current-period scope）

按 2026-06-10 用户指令，Anchor cross-target GitHub Actions workflow 在 current head **被移除**，停止本期 Android/WASM hosted gate 消耗。

Scope reason（显式）：Android 与 WASM 不是 current-period support targets；iOS/macOS build verification 可本地跑，节省 hosted CI time。
Tradeoff（显式）：历史 cross-target 证据仍 valid as historical evidence，但 current head 不再有 per-push / per-PR hosted regression coverage（Android emulator / WASM vectors）；若 core 依赖形状在重新引入 workflow 前再次变化，D36 漂移风险上升。

| 项 | 状态 |
|---|---|
| deleted workflow | `.github/workflows/anchor-cross-target-vectors.yml` |
| retained workflows | `.github/workflows/check-package-versions.yml`, `.github/workflows/publish.yml` |
| current iOS/macOS build verification | local path |
| current hosted Android/WASM regression coverage | none at this head（do not claim） |

结论：**hosted execution is not currently wired**；local + repo-local runner remain。

---

## 7. Gate matrix（consolidated, deduped）

| Gate | Verdict |
|---|---|
| native golden execution | closed / repo-local runner（local Observed; hosted Observed historically） |
| wasm golden execution（Node WebAssembly） | closed / repo-local runner（local Observed; hosted Observed historically） |
| iOS Simulator slice golden execution（`simctl spawn`） | closed / repo-local runner（local Observed; hosted Observed historically） |
| Android emulator golden execution | closed / hosted Observed historically（local Not-run: `not_run_no_ndk`） |
| repo-local runner persistence | closed |
| core cloud-symbol boundary | clean |
| Apple deterministic-semantics boundary | clean |
| hosted CI wiring (per-push/per-PR) | **REMOVED for current period — not currently wired** |
| wasmtime-native execution wiring | **OPEN** — compile gate green; native-runner execution still to be locked（owner: Claude / core） |
| iOS-slice execution gating | **Apple-gated** — execution stays Apple-runtime-gated |
| CP-1 whole-exit | **not exited** |

---

## 8. Distribution — Developer ID signing availability（doc 68 finding）

CP-1 binding / distribution release gate 子项：read-only 检查本机 keychain signing identities。

```sh
security find-identity -p codesigning -v
```

```text
  1) <SIGNING_HASH> "Apple Development: <DEVELOPER_NAME> (<TEAM_ID>)"
  2) <SIGNING_HASH> "Apple Development: <DEVELOPER_NAME> (<TEAM_ID>)"
     2 valid identities found
```

Distribution-identity grep（`Developer ID Application|Developer ID Installer|Apple Distribution`）→ `exit=1`（no matches）。

**结论：本机仍只有 Apple Development identities；没有 `Developer ID Application` / `Developer ID Installer` / `Apple Distribution` identity。** development-signed verifier probes 可跑，但 Developer ID notarization / macOS release distribution 不可从本机 keychain 跑。这与 user authorization 无关；缺的 input 是合适的 distribution identity + product archive/distribution artifact。本轮无 keychain mutation、无 signing/notarization/upload。

---

## 9. Remaining work / open gates

| Open gate | 分类 | Owner |
|---|---|---|
| wasmtime-native execution wiring（compile gate green，native-runner execution 待锁） | Not-run | Claude / core |
| iOS-slice execution（保持 Apple-runtime-gated） | Needs-Apple-runtime | Apple verifier |
| hosted Android/WASM regression coverage（workflow 已移除，current period 不重接） | Blocked（scope，per user 指令） | human decision |
| Developer ID Application signing identity + macOS product archive / notarization | Blocked（缺 distribution identity） | human + Apple |
| App Store / TestFlight distribution identity + upload path | Blocked（缺 distribution identity） | human + Apple |
| 物理 iPhone app launch / iCloud runtime（device unlock 后） | Needs-Apple-runtime | Apple verifier |
| iOS/非 macOS CloudDocuments delivery（超出 simulator nil evidence） | Needs-Apple-runtime | Apple verifier |
| true remote `.icloud` placeholder delivery | Needs-Apple-runtime | Apple verifier |
| signed-out / over-quota account states | Needs-Apple-runtime | Apple verifier |
| steady-state segment budget / million-op iCloud context | Needs-Apple-runtime | Apple verifier |
| product conflict-resolution UX / core integration | Not-run | product |
| signed-device generated async runtime + release distribution | Needs-Apple-runtime + human | Apple + human |
| product-level TextKit/UI runtime integration | Not-run | product |
| human CP-1 sign-off（所有 exit criteria 关闭后） | Needs-human-approval | human |

Gate evaluation：**CONTINUE**。Cross-target deterministic vector execution（native + wasm + iOS-sim + Android emulator）已作为 Stage 1 machine gate 关闭；下一步 target 应是剩余 Apple delivery / product runtime gate，或 Claude 侧 wasmtime-native execution wiring，而非 cross-target deterministic vector execution。
