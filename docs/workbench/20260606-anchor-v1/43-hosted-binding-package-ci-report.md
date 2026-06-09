# Anchor Stage 1 — Hosted Binding Package CI Report

任务：CP-1 binding release gate，把 Apple binding package reproduction 纳入 GitHub hosted macOS runner，并观察 C ABI wrapper binary package 与 UniFFI generated async surface 的 fresh-runner 结果。
日期：2026-06-10
状态：**workbench artifact** —— 非公开接口契约；本轮关闭 hosted/fresh-runner binding package reproduction，不关闭 signed app-bundle/device runtime、artifact signing/notarization/provenance policy、Android execution、iCloud delivery gates 或 CP-1 whole-exit。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**package / workspace / 产品 app / 生成 lockfile / public CLI schema 改动；本轮没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；没有改 `suites/anchor/core/src/**` production source；没有创建 repo 内 product app shell。代码变更限于 `.github/workflows/anchor-cross-target-vectors.yml` 与 `suites/anchor/apple/build-binding-release-artifacts.sh`；脚本构建产物位于 `/tmp/anchor-apple-stage1/hosted-binding-artifacts`，并删除 wrapper crate build byproduct `Cargo.lock`。

---

## 1. 结论

**Strongest conclusion：binding 的 hosted/fresh-runner reproduction gate 现在对 verifier release artifacts 关闭。** GitHub `pull_request` run `27227167945` 在 head `a54aa1fc526e6125e3be97d649fededa8e97a2ca` 上通过三项 job：

```text
apple-binding-package  pass  3m28s
ios-simulator          pass  3m3s
native-wasm            pass  31s
```

新增 `apple-binding-package` job 在 hosted `macos-15-arm64` runner 上完成：

- C ABI Rust release slices build；
- wrapper-compatible `AnchorCoreCBinary.xcframework` creation；
- repo-external SwiftPM wrapper consumer Release strict-concurrency runtime；
- SwiftPM binary checksum；
- UniFFI generated async macOS runtime；
- UniFFI generated async iOS Simulator compile/link；
- UniFFI generated async iPhoneOS `arm64` compile/link.

This closes the hosted/fresh-runner reproduction floor for the current verifier binding packaging path. It does **not** close signed app-bundle/device runtime integration, physical-device runtime, real release artifact signing/notarization/provenance, upload/distribution channel, Android execution, or CP-1 whole-exit.

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| root workspace / package / lockfile | not changed |
| `suites/anchor/core/src/**` | not changed |
| public CLI schema | not changed |
| repo product app shell | not created |
| Apple project / bundle id / entitlement | not changed |
| generated wrapper `Cargo.lock` | removed by script trap; absent after local run |
| external side effect | push to PR `#9`, hosted GitHub Actions run |
| checkpoint exit | not reached |

---

## 3. Implementation surface

Added script:

```text
suites/anchor/apple/build-binding-release-artifacts.sh
```

The script uses `/tmp/anchor-apple-stage1/hosted-binding-artifacts` by default through `ANCHOR_APPLE_ARTIFACT_DIR`, builds with explicit `DEVELOPER_DIR`, and removes:

```text
suites/anchor/apple/ffi/Cargo.lock
suites/anchor/apple/uniffi/Cargo.lock
```

from the repo if Cargo creates them during standalone wrapper builds.

Workflow addition:

```text
.github/workflows/anchor-cross-target-vectors.yml
job: apple-binding-package
runner: macos-latest
command: bash suites/anchor/apple/build-binding-release-artifacts.sh
```

Commit pushed for hosted observation:

```text
a54aa1fc526e6125e3be97d649fededa8e97a2ca Add Anchor binding package CI
```

---

## 4. Observed evidence

### 4.1 Local preflight

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
ANCHOR_APPLE_ARTIFACT_DIR=/tmp/anchor-apple-stage1/local-binding-artifacts \
  bash suites/anchor/apple/build-binding-release-artifacts.sh
```

Observed excerpts:

```text
xcframework successfully written out to: /tmp/anchor-apple-stage1/local-binding-artifacts/AnchorCoreCBinary.xcframework
Build of product 'WrapperConsumer' complete! (2.49s)
wrapper:fixture snapshot=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63
wrapper:insert changed=blk_a selection=3
wrapper:error validation=direct_active_to_deleted
wrapper:segment bytes=979
wrapper:actor snapshot=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63 segment=806
uniffi:fixture vault=vault_demo_0001 notes=1 snapshot=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63
uniffi:async fixture snapshot=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63
uniffi:dispatch insert changed=blk_a selection=3:3
uniffi:dispatch error=directActiveToDeleted message=direct active→deleted rejected; trash first (D10/D20)
uniffi:roundtrip before=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63 after=56e9e39d17157e6bc97d9008aef910791ae4d89b340b4aa767abb8f2fba0e1b6 segment=987 id=seg_1a1fa331b3f1e2c09a880af24bc76e74c5f829c80e47cd7752cf895454a364e3
uniffi:segment bytes=806 checksum=9609028308393580495
uniffi:bench size=67108864 bytes=67108864 ms=139.27 maxrss=270024704 checksum=1479290224479992690
platform IOSSIMULATOR
minos 17.0
sdk 26.5
platform IOS
minos 17.0
sdk 26.5
arm64
```

Local guard commands:

```sh
bash -n suites/anchor/apple/build-binding-release-artifacts.sh
git diff --check
rg "CloudKit|CKRecord|CKAsset|CKContainer|CKSyncEngine|NSFileCoordinator|NSMetadataQuery|ubiquit|iCloud|NSURLIsExcludedFromBackupKey" suites/anchor/core; printf 'exit=%s\n' "$?"
rg "diff3|order[-_ ]?key|fractional|canonical_serialize|BLAKE3|blake3|HLC|causal|lattice" suites/anchor/apple; printf 'exit=%s\n' "$?"
find suites/anchor/apple -name Cargo.lock -print
```

Observed:

```text
bash -n: exit 0
git diff --check: exit 0
core cloud-symbol audit: exit=1
Apple deterministic-semantics audit: exit=1
find Cargo.lock: 0 paths
```

Commit hook on `git commit -m "Add Anchor binding package CI"`:

```text
lint-staged could not find any staged files matching configured tasks.
bun test --changed --pass-with-no-tests
--changed: 2 changed files, but no test files are affected
0 pass
0 fail
```

### 4.2 Hosted run metadata

Command:

```sh
gh run view 27227167945 --json databaseId,workflowName,event,status,conclusion,headSha,url,createdAt,updatedAt,jobs
```

Observed:

```text
databaseId=27227167945
workflowName=Anchor Cross-Target Vectors
event=pull_request
headSha=a54aa1fc526e6125e3be97d649fededa8e97a2ca
status=completed
conclusion=success
url=https://github.com/plimeor/labs/actions/runs/27227167945
```

Command:

```sh
gh pr checks 9
```

Observed:

```text
apple-binding-package  pass  3m28s  https://github.com/plimeor/labs/actions/runs/27227167945/job/80397332235
ios-simulator          pass  3m3s   https://github.com/plimeor/labs/actions/runs/27227167945/job/80397332214
native-wasm            pass  31s    https://github.com/plimeor/labs/actions/runs/27227167945/job/80397332323
```

### 4.3 Hosted Apple binding package job

Command:

```sh
gh run view 27227167945 --job 80397332235 --log
```

Observed runner:

```text
Image: macos-15-arm64
Image Release: macos-15-arm64/20260527.0100
```

Observed key output:

```text
== build C ABI FFI release slices ==
Finished `release` profile [optimized] target(s) in 2.97s
Finished `release` profile [optimized] target(s) in 2.59s
Finished `release` profile [optimized] target(s) in 2.17s
Non-fat file: /tmp/anchor-apple-stage1/hosted-binding-artifacts/libanchor_core_ffi_macos.a is architecture: arm64
== create C ABI XCFramework ==
xcframework successfully written out to: /tmp/anchor-apple-stage1/hosted-binding-artifacts/AnchorCoreCBinary.xcframework
== build Swift wrapper consumer ==
Build of product 'WrapperConsumer' complete! (6.53s)
wrapper:fixture snapshot=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63
wrapper:insert changed=blk_a selection=3
wrapper:error validation=direct_active_to_deleted
wrapper:segment bytes=979
wrapper:actor snapshot=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63 segment=806
== checksum C ABI XCFramework zip ==
ae44684eed3e29e68e471125f4999405c0f4e30db61b6ecb77e1ba38e6b3abfd
ae44684eed3e29e68e471125f4999405c0f4e30db61b6ecb77e1ba38e6b3abfd  /tmp/anchor-apple-stage1/hosted-binding-artifacts/AnchorCoreCBinary.xcframework.zip
== build UniFFI release slices ==
Finished `release` profile [optimized] target(s) in 54.22s
Finished `release` profile [optimized] target(s) in 10.98s
Finished `release` profile [optimized] target(s) in 10.96s
== run macOS UniFFI async smoke ==
uniffi:fixture vault=vault_demo_0001 notes=1 snapshot=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63
uniffi:async fixture snapshot=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63
uniffi:dispatch insert changed=blk_a selection=3:3
uniffi:dispatch error=directActiveToDeleted message=direct active→deleted rejected; trash first (D10/D20)
uniffi:roundtrip before=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63 after=56e9e39d17157e6bc97d9008aef910791ae4d89b340b4aa767abb8f2fba0e1b6 segment=987 id=seg_1a1fa331b3f1e2c09a880af24bc76e74c5f829c80e47cd7752cf895454a364e3
uniffi:segment bytes=806 checksum=9609028308393580495
uniffi:bench size=67108864 bytes=67108864 ms=217.18 maxrss=318832640 checksum=1479290224479992690
== compile iOS Simulator UniFFI async smoke ==
clang: warning: using sysroot for 'MacOSX' but targeting 'iPhone' [-Wincompatible-sysroot]
platform IOSSIMULATOR
minos 17.0
sdk 15.5
== compile iPhoneOS UniFFI async smoke ==
clang: warning: using sysroot for 'MacOSX' but targeting 'iPhone' [-Wincompatible-sysroot]
/tmp/anchor-apple-stage1/hosted-binding-artifacts/uniffi-async-smoke-iphoneos: Mach-O 64-bit executable arm64
platform IOS
minos 17.0
sdk 15.5
arm64
```

### 4.4 Hosted native / wasm / iOS Simulator vectors

Command:

```sh
gh run view 27227167945 --job 80397332323 --log
```

Observed key output:

```text
running 6 tests
test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
anchor_wasm_vector_status=0
anchor_ios_vector_status=skipped
```

Command:

```sh
gh run view 27227167945 --job 80397332214 --log
```

Observed key output:

```text
Boot first available iOS Simulator
Finished
running 6 tests
test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
anchor_wasm_vector_status=0
anchor_ios_vector_status=0
```

---

## 5. Gate evaluation

| Gate | Result |
|---|---|
| hosted/fresh-runner C ABI release slices | closed / observed |
| hosted/fresh-runner wrapper-compatible XCFramework creation | closed / observed |
| hosted/fresh-runner Swift wrapper binary consumer | closed / observed |
| hosted SwiftPM checksum mechanism | closed / observed |
| hosted/fresh-runner UniFFI generated async macOS runtime | closed / observed |
| hosted/fresh-runner UniFFI generated async iOS Simulator compile/link | closed / observed |
| hosted/fresh-runner UniFFI generated async iPhoneOS `arm64` compile/link | closed / observed |
| signed app-bundle/device runtime integration | open / not run |
| physical-device generated async runtime | open / not run |
| artifact signing/notarization/provenance policy | open / not run |
| real release upload/distribution channel | open / not run |
| Android execution | open / not run |
| CP-1 whole-exit | **not exited** |

Gate evaluation: **CONTINUE**. Binding hosted/fresh-runner reproduction is now closed for verifier artifacts; CP-1 remains gated by signed app/device runtime, artifact provenance policy, iCloud delivery/account/placeholder/scale gates, TextKit product runtime, Android execution, and human sign-off.

---

## 6. Ledger entry

### Ledger entry — 2026-06-10 — iteration 22 — doc 43-hosted-binding-package-ci-report.md

- **Checkpoint / cursor:** CP-1 Apple half, binding release hosted/fresh-runner reproduction gate.
- **Action selected:** add a hosted macOS GitHub Actions job that builds C ABI wrapper binary artifacts and UniFFI generated async smokes, then observe the PR run.
- **Owner classification:** Apple binding packaging / hosted CI → implemented as verifier script + GitHub Actions job; observed on hosted runner.
- **Scope-fence check:** passed — no root workspace / lockfile / repo product app shell / public CLI schema changes; no Apple project / bundle / entitlement changes; no `suites/anchor/core/src/**` production source changes.
- **Evidence (Observed = command + output):**
  - `bash suites/anchor/apple/build-binding-release-artifacts.sh` locally → wrapper consumer, checksum, UniFFI macOS runtime, iOS-sim compile/link, iPhoneOS compile/link all passed.
  - `git diff --check` → exit 0.
  - core cloud-symbol audit → 0 matches, exit 1.
  - Apple deterministic-semantics audit → 0 matches, exit 1.
  - `find suites/anchor/apple -name Cargo.lock -print` → 0 paths.
  - `git commit -m "Add Anchor binding package CI"` hook → `bun test --changed --pass-with-no-tests`, 0 affected tests, 0 failures.
  - `gh run view 27227167945 ...` → `conclusion=success`, head `a54aa1fc526e6125e3be97d649fededa8e97a2ca`.
  - `gh pr checks 9` → `apple-binding-package pass 3m28s`, `ios-simulator pass 3m3s`, `native-wasm pass 31s`.
  - Hosted `apple-binding-package` log → `xcframework successfully written out`, wrapper snapshot `3ef88671...a877b63`, checksum `ae44684eed3e29e68e471125f4999405c0f4e30db61b6ecb77e1ba38e6b3abfd`, UniFFI async macOS runtime output, iOS Simulator `platform IOSSIMULATOR minos 17.0 sdk 15.5`, iPhoneOS `Mach-O 64-bit executable arm64`.
- **Gates closed this iteration:** hosted/fresh-runner binding package reproduction for C ABI wrapper binary package and UniFFI generated async smokes.
- **Gates still open:** signed app-bundle/device runtime integration, physical-device generated async runtime, artifact signing/notarization/provenance policy, real release upload/distribution channel, physical iPhone runtime after unlock, iOS/non-macOS CloudDocuments delivery, true remote placeholder, signed-out/over-quota, steady-state segment budget/million-op iCloud context, local-only path edge cases, product conflict-resolution UX/core integration, Android execution, real app TextKit runtime.
- **Backfill to 04/05/06:** `04-contract-baseline.md` binding baseline; `05-key-decisions.md` D01.
- **Axis matrix delta:** binding remains `approved boundary / partially release-gated`; hosted/fresh-runner reproduction moved from open to closed for verifier artifacts.
- **Gate evaluation:** CONTINUE — next action should target artifact provenance policy, signed app/device runtime after unlock, remaining iCloud gates, Android execution feasibility, or TextKit product-runtime gates.
- **New doc:** `docs/workbench/20260606-anchor-v1/43-hosted-binding-package-ci-report.md`
