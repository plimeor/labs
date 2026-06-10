# Anchor Stage 1 — Apple Binding Consolidated Evidence

任务：CP-1 Apple binding release gate —— 把多份 binding 工作台报告合并成单一证据文档，记录 B4 approved binding direction、frozen DTO/error vocabulary、已关闭的 mechanism floors、以及仍未关闭的 release gates。
日期：2026-06-10
状态：**workbench evidence（consolidated）—— 非公开接口契约**

> **边界声明（AGENTS 工作台规则，强制）：** 本文件**不授权**任何 package / workspace / 产品 app / 生成 lockfile / public CLI schema / 代码改动；它只合并已有 verifier 证据。权威 cross-language 契约属于未来的 `anchor-core` README，而非本工作台文档。各原始 run 没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置，没有改 `suites/anchor/core/src/**` production source，没有改变 `anchor-core` crate type，没有创建 repo 内 product app shell。verifier wrapper / generated Swift / build artifacts 均位于 `/tmp/anchor-apple-stage1`（或 repo 外 consumer package），唯一 repo source 触点是 `suites/anchor/apple/**` verifier wrapper 与一处 `suites/anchor/core/tests/dto_surface.rs` regression test。

---

## 1. Net story（强结论）

**B4 approved binding direction（2026-06-07）：UniFFI-primary for DTO / ordinary dispatch + C ABI bytes fast path for bulk segment/blob bytes。** 纯 UniFFI bulk-bytes 默认路径被否决——在 64MB transfer 上 C ABI 比 UniFFI 约快 **3.8x**、max RSS 约轻 **2.8x**。`anchor-core` crate type 保持平台无关 rlib（wasm/android gate 不受影响）；Apple FFI 与 UniFFI 都是**独立 wrapper crate**，不把任何 deterministic 逻辑（merge / normalize / op-creation / diff3 / order-key / tree-invariant / canonical serialize / BLAKE3）移进 Swift。

Production DTO/error vocabulary 已为 Stage 1 **冻结**：core-owned structured `TransactionResult` envelope + **恰好三个** core `ValidationError` code。`adapter_null_session` / `adapter_parse_error` 是 adapter-local，不属于 core DTO vocabulary。

机制下限（mechanism floors）现已全部关闭：async `Sendable` wrapper actor、repo-external path/binary-target consumer、iPhoneOS `arm64` 打包、physical-device generated-async runtime、hosted/fresh-runner CI、artifact checksum、artifact provenance policy floor。仍保留的 release gate：fresh-machine 与 product 级 full packaging、最终 distribution/signing/notarization。

CP-1 whole-exit：**not exited**。

---

## 2. Approved direction + frozen vocabulary

### 2.1 B4 binding direction

| 维度 | 决定 |
|---|---|
| DTO / ordinary dispatch transport | UniFFI primary（generated Swift structs + enums + RustFuture async） |
| bulk segment/blob bytes | C ABI fast path（Swift `Data` copy） |
| pure-UniFFI bulk bytes default | rejected（64MB 上 ~3.8x slower、~2.8x max RSS） |
| `anchor-core` crate type | unchanged（platform-agnostic rlib） |
| wrapper crates | separate（`suites/anchor/apple/ffi`、`suites/anchor/apple/uniffi`） |
| Swift-side deterministic semantics | none introduced（merge/diff3/order-key/op-creation/normalize/tree-invariant 留在 Rust） |

### 2.2 Frozen core validation codes（exactly three）

| Code | Meaning |
|---|---|
| `invalid_utf16_offset` | Apple text edit produced invalid UTF-16 boundary |
| `direct_active_to_deleted` | direct active → deleted rejected; trash first（D10/D20） |
| `structural_dispatch_deferred` | split/merge structural dispatch deferred to CP-2 |

Structured envelope（core-owned）：

```text
TransactionResult {
  changed_ids,
  validation_error: Option<{ code, message }>,
  new_revisions,
  selection_hint,
  conflicts,
  projection_fresh,
  mirror_fresh
}
```

Adapter-local（**不属于** core vocabulary）：`adapter_null_session`、`adapter_parse_error` —— 只出现在 C ABI JSON wrapper / Swift wrapper decode/session surface。

Vocabulary freeze 仅覆盖 Stage 1；任何新增 core validation code 改变 cross-language 契约，必须同时更新 tests / docs / bindings，且需新 checkpoint 批准。

### 2.3 Vocabulary regression evidence

Changed file：`suites/anchor/core/tests/dto_surface.rs`（唯一 core test 触点）。Test 断言三个 code 的顺序与精确 message，并断言 `adapter_null_session` / `adapter_parse_error` 不在 core validation vocabulary。

```sh
cargo test --manifest-path suites/anchor/Cargo.toml -p anchor-core --test dto_surface
```

```text
running 7 tests
test validation_error_vocabulary_is_frozen ... ok
... (6 more)
test result: ok. 7 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

Source mapping audit（`rg` over `dto.rs` / `ffi/src/lib.rs` / `uniffi/src/lib.rs` / `anchor_core_uniffi.udl` / `AnchorCoreBindings.swift`）确认：`dto.rs` 只定义并映射 `InvalidUtf16Offset` / `DirectActiveToDeleted` / `StructuralDispatchDeferred`；UniFFI `lib.rs` 只映射这三个 variant；UDL 暴露 `NoError` + 这三个 code；adapter-local 两个 code 只在 C ABI JSON / Swift session surface 出现。

---

## 3. Environment（toolchain）

| 项 | 值 |
|---|---|
| Xcode | `26.5`，build `17F42` |
| Swift | `6.3.2`，target `arm64-apple-macosx26.0` |
| rustc / cargo | `1.95.0` |
| UniFFI | `0.31.1`（`uniffi-bindgen-swift`） |
| Apple Rust targets added | `aarch64-apple-ios`、`aarch64-apple-ios-sim`（基础已有 `aarch64-apple-darwin`、`aarch64-linux-android`、`wasm32-unknown-unknown`） |
| Simulator runtimes | iOS 26.2 / 26.4.1 / 26.5 |

---

## 4. Golden values（cross-run evidence，verbatim）

这些值在多次 run 中一致，作为正确性锚点（非 PII，保留 verbatim）：

| 名称 | 值 |
|---|---|
| fixture vault | `vault_demo_0001`（1 note） |
| frozen snapshot_revision | `3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63` |
| round-trip after-revision | `56e9e39d17157e6bc97d9008aef910791ae4d89b340b4aa767abb8f2fba0e1b6` |
| round-trip segment id | `seg_1a1fa331b3f1e2c09a880af24bc76e74c5f829c80e47cd7752cf895454a364e3` |
| insert dispatch | `changed=blk_a`，UTF-16 caret `3:3`（`"🍎 "` advances 3 UTF-16 units） |
| structured error | `direct_active_to_deleted` / `directActiveToDeleted` |
| segment bytes（C ABI / wrapper） | `979` |
| segment bytes（UniFFI round-trip） | `806`，checksum `9609028308393580495` |
| bytes-bench 64MB checksum | `1479290224479992690` |

C ABI XCFramework 观测大小 `51M`；wrapper-compatible binary XCFramework zip `17M`。

---

## 5. Bulk-bytes benchmark（C ABI vs UniFFI）

C ABI fast path（Swift `Data` copy，debug smoke）：

| Size | Time | Max RSS |
|---:|---:|---:|
| 1MB | 1.94ms | 8,093,696 |
| 4MB | 5.34ms | 12,386,304 |
| 16MB | 9.70ms | 29,229,056 |
| 64MB | 38.22ms | 96,387,072 |

UniFFI generated `bytes` → Swift `Data`：

| Size | Time | Max RSS |
|---:|---:|---:|
| 1MB | 2.36ms | 11,190,272 |
| 4MB | 8.47ms | 23,871,488 |
| 16MB | 33.31ms | 74,268,672 |
| 64MB | 145.22ms | 267,272,192 |

64MB UniFFI 约 3.8x slower、约 2.8x max RSS。release-surface strict 重测 64MB UniFFI = `134.06ms` / max RSS `267,501,568`，结论一致。这是把 C ABI 保留为 segment/blob fast-path 的载荷依据；pure-UniFFI bulk = 非默认。

---

## 6. Closed mechanism floors（verdict matrix）

所有 floor 关闭，均无 Swift-side deterministic semantics，且每次 run boundary audit（core cloud-symbol、Apple deterministic-symbol）都是 `0 matches, exit 1`。

| Mechanism floor | Status | 关键观测 | 源 run |
|---|---|---|---|
| C ABI DTO/dispatch round-trip + 3-slice XCFramework | closed / observed | fixture/insert/error/segment 全部命中 golden | 17 |
| UniFFI DTO/dispatch round-trip + 3-slice XCFramework | closed / observed | generated `EditorIntentDto` / `ValidationErrorCode` / round-trip 命中 golden | 17 |
| release-surface strict rebuild（`-swift-version 6 -strict-concurrency=complete -warnings-as-errors`） | closed / observed | generated Swift smoke 返回 `.directActiveToDeleted` | 17 |
| Swift wrapper DTO/error `Sendable` + actor async surface | closed / mechanism floor | `AnchorCoreClient` actor 持有 non-`Sendable` `AnchorSession`，串行化 C ABI；macOS Release strict build+runtime、iOS-sim Release strict compile 均 `BUILD SUCCEEDED` | 28 |
| repo-external SwiftPM **path** dependency consumer | closed / observed | `.package(path:)` → `AnchorCoreClient` async，Release strict run，命中 golden | 29 |
| repo-external **raw C ABI** `.binaryTarget` consumer | closed / observed | `binary:fixture bytes=216 module=AnchorCoreFFI`，Release strict | 30 |
| Swift **wrapper over binary** XCFramework（external package） | closed / observed | `AnchorCoreBindings` 在 binary XCFramework 之上保留 fixture/dispatch/error/segment | 35 |
| final production DTO/error vocabulary freeze | closed for Stage 1 | 三 code frozen + envelope + adapter boundary（见 §2） | 34 |
| UniFFI generated **async** surface（`[Async]` → `asyncFixtureSummary() async`） | closed / observed | macOS Swift 6 strict runtime 返回 frozen snapshot；iOS-sim compile/link `platform IOSSIMULATOR minos 26.0 sdk 26.5` | 36 |
| UniFFI generated async **iPhoneOS `arm64`** standalone compile/link | closed / observed | `-target arm64-apple-ios26.0` → `Mach-O 64-bit executable arm64`，`vtool` `platform IOS minos 26.0 sdk 26.5`，三个 artifact 均 `arm64` | 40 |
| physical-iPhone generated-async **runtime** | closed / observed | development-signed verifier `.app` 在 `<DEVICE>` 上 launch，`exit code 0`，async fixture 命中 frozen snapshot + on-device 1/4/16/64MB bench | 70 |
| SwiftPM binary artifact **checksum** mechanism | closed / observed | `swift package compute-checksum` 与 `shasum -a 256` 一致 `6dab5c671ae33737a19462fc5452dff390bc0a6afa7c80b91b505bb6e063c890` | 38 |
| hosted/fresh-runner CI reproduction（verifier artifacts） | closed / observed | hosted `macos-15-arm64` 三 job pass；见 §7 | 43 |
| artifact provenance **policy floor** | closed / observed-supported | 三层 trust 分离；见 §8 | 44 |

### 6.1 iPhoneOS `arm64e` vs `arm64`（已澄清）

doc 36 中 iPhoneOS standalone link 失败被记为 `arm64e` mismatch（`ld: ... found architecture 'arm64', required architecture 'arm64e'`）。doc 40 澄清：这是 standalone `swiftc` route 选错 target（`arm64e`）而非 generated async 失败；改用 `arm64-apple-ios26.0` 匹配 Rust `aarch64-apple-ios` slice 后 link 成功。该 floor 已关闭。

### 6.2 physical-device runtime 细节（doc 70）

iPhoneOS smoke 原本用绝对 `/tmp` dylib load command（device 上无效）。verifier `.app` 由现有 iPhoneOS UniFFI async smoke + existing development provisioning profile + existing app scaffold 临时组装：embed dylib、`install_name_tool` 改写 load 为 `@executable_path/Frameworks/...`、用本机 Apple Development identity 重新 codesign，`codesign --verify --strict` 通过。`devicectl device install/launch` 在 `<DEVICE>` 上运行 `exit code 0`。运行后把原 iCloud probe app 重新装回。这是 verifier-runtime 证据，非 release-distribution 证据。

---

## 7. Hosted CI reproduction（doc 43）

GitHub `pull_request` run（`<CI_RUN>`，repo `<REPO>`，PR `<PR>`，head SHA 已脱敏）在 hosted `macos-15-arm64` runner 上三 job 全 pass：

```text
apple-binding-package  pass  3m28s
ios-simulator          pass  3m3s
native-wasm            pass  31s
```

`apple-binding-package` job（脚本 `suites/anchor/apple/build-binding-release-artifacts.sh` + workflow `.github/workflows/anchor-cross-target-vectors.yml`）在 fresh runner 上完成：C ABI release slices、wrapper-compatible `AnchorCoreCBinary.xcframework`、external Swift wrapper consumer Release strict runtime（命中 golden）、SwiftPM binary checksum `ae44684eed3e29e68e471125f4999405c0f4e30db61b6ecb77e1ba38e6b3abfd`、UniFFI generated async macOS runtime、iOS-sim compile/link、iPhoneOS `arm64` compile/link（`Mach-O 64-bit executable arm64`）。`native-wasm` / `ios-simulator` job：`6 passed`，`anchor_wasm_vector_status=0`，iOS-sim vector `0`（wasm-only job 上为 `skipped`）。脚本通过 trap 删除 wrapper crate `Cargo.lock`（`ffi` 与 `uniffi`），local 与 hosted 均确认无残留 lockfile。

> Note：脚本/workflow 为 verifier-only CI 触点；此 hosted run 是 verifier 产物的 provenance anchor，**不**继承为 product release manifest。

---

## 8. Artifact provenance policy（from doc 44）

CP-1 把 artifact provenance 关闭为 **policy floor**；实际 product signing/notarization 仍 open。Release boundary 分成三个**不可互换**层：

1. **Binding binary package provenance** —— clean hosted CI run + immutable commit SHA + SwiftPM checksum + artifact manifest。已由 §7 + 本 policy 对 verifier artifacts 关闭。
2. **macOS app distribution trust** —— signed app archive + hardened runtime + notarization/export。**open**：无 product app archive；本机 keychain 只暴露 Apple Development identity，无 Developer ID Application identity（`security find-identity` 仅观测到 `Apple Development: <DEVELOPER_NAME> (<TEAM_ID>)`，两条；real SHA-1 hash 脱敏为 `<SIGNING_HASH>`）。
3. **iOS distribution/device trust** —— Xcode signing/provisioning + device/TestFlight/App Store。**open**，且不是 notarization。

关键边界：**不要把 checksummed SwiftPM binary XCFramework zip 当作 notarized app；也不要把未来 notarized app archive 当作底层 binding package 可复现 provenance 的证明。** 两个 gate 都必需，但证明不同的事。

本机工具能力（`--help` 观测）：`swift package compute-checksum`（binary artifact path）、`xcodebuild -create-xcframework`（packages libraries/frameworks）、`xcrun notarytool submit`（submit archive to Notary service）、`xcodebuild -exportArchive` / `-exportNotarizedApp` 与 export method（`developer-id` / `app-store-connect` / `release-testing` 等）。Notarization 属 product app/archive gate，不由 raw static libs / verifier script / SwiftPM checksum / GitHub success badge / simulator compile / iPhoneOS standalone Mach-O 关闭。

**Stop conditions**（policy 强制）：若未来实现把 checksum-only XCFramework 当 notarized product、把 development-signed probe 当 release-signed evidence、claim notarization 但无 notary submission ID + accepted status、claim App Store/TestFlight readiness 但无 archive/export/upload path、或把 CP-1 verifier manifest 当 public release contract，则必须 stop。

Future release manifest（属 CP-1 之外，除非用户显式 productize）须含：release commit SHA + tag、workflow run ID + job URLs、Xcode/Swift/Rust 版本、所有 Rust targets + Apple SDKs、XCFramework zip checksums、distributed-separately 的 generated Swift/header/modulemap checksums、app archive checksum、signing identity class、notarization submission ID + accepted status、export method、verification 命令与输出。

---

## 9. Scope-fence（合并）

所有 run 一致：root workspace / package / lockfile **not changed**；`suites/anchor/core/src/**` production source **not changed**；`anchor-core` crate type **not changed**；public CLI schema **not changed**；repo product app shell / Apple project / bundle id / entitlement **not created/changed**；Swift-side deterministic semantics **not introduced**；checkpoint exit **not reached**。唯一 repo source delta：`suites/anchor/core/tests/dto_surface.rs`（一个 regression test）+ `suites/anchor/apple/**` verifier wrapper。生成的 wrapper `Cargo.lock`（`ffi` / `uniffi`）作为 build byproduct 删除。binding-release CI 脚本/workflow 为 verifier-only。

---

## 10. Remaining work / open gates

每条只列一次（已对各 run 的 reruns 去重）。Observed = 已运行并观测；Not-run / Blocked / Needs-Apple-runtime / Needs-human-approval = 仍 open。

| Open gate | 状态 | Owner |
|---|---|---|
| fresh-machine（非本机、非 hosted-runner-cached）full reproduction | Not-run | Apple verifier / CI |
| complete **product** wrapper packaging（generated Swift + UniFFI DTO + C ABI bytes + checksum/signing/distribution 组成单一 stable story） | Not-run | Apple verifier |
| signed iOS **app-bundle / device runtime integration**（product app，非 verifier `.app`） | Not-run / Needs-Apple-runtime | Apple verifier |
| product app **binding integration**（把 binding package 接进真实 product app/TextKit/UI） | Not-run | Apple verifier |
| Developer ID signing availability（本机无 Developer ID Application identity） | Blocked / Needs-Apple-runtime | Human + Apple verifier |
| macOS product app archive + **notarization** submission（submission ID + accepted status） | Not-run / Needs-human-approval | Human + Apple verifier |
| iOS app archive / **TestFlight / App Store** upload | Not-run / Needs-human-approval | Human + Apple verifier |
| real release **upload/distribution channel** | Not-run / Needs-human-approval | Human |
| Android execution（binding 侧未跑） | Not-run | Core / Android verifier |
| **CP-1 whole-exit** | not exited（gated by 上述 distribution / product-integration / human sign-off） | Human approver |

Gate evaluation：**CONTINUE**。Binding 的 approved direction、frozen vocabulary 与全部 mechanism floor（含 hosted CI、physical-device runtime、provenance policy floor）已关闭；剩余全部属 product packaging、release distribution/signing/notarization 与 human sign-off。
