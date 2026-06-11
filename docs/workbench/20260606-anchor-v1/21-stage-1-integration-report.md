# Anchor — Workbench Ledger（CP-1/CP-2/Stage-2 readiness）

任务：Anchor workbench 唯一进度 ledger（rewrite-in-place state block §1–§7 + append-only iteration history §8）
日期：2026-06-10
状态：**workbench ledger —— 非公开接口契约**。gate 状态只在本文件记录；cursor 在 `00` §0；决策/批准只在 `05`（D01–D44）。

> **边界声明（AGENTS 工作台规则，强制）：** 本文件**不授权**任何 package / workspace / 生成 lockfile / 额外代码改动；不改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置，不创建 entitlement / bundle id 外部记录 / iCloud container。D40 已授权通过 Xcode.app 在 `suites/anchor/apple/` 创建正式 product app shell；D41 已授权 product app project config 由 XcodeGen 管理，`project.yml` 为源头，`.xcodeproj` 为 ignored 生成物；除此之外的产品能力、签名、分发、持久写入仍须按 gate 执行。权威接口契约归 `suites/anchor/core/README.md` 与 `suites/anchor/cli/README.md`，本文件仅记录 gate 状态。

本文件整合 core spike 证据（Claude / core owner）与 Apple verifier Stage 1 实测（Codex），并作为全工作台进度 ledger。它取代分散的逐次迭代记录。**Consolidated evidence pointers：** `09-apple-verification.md`（Apple 现实核验 + integration state）、`17-apple-binding-evidence.md`（binding）、`18-textkit-adapter-evidence.md`（TextKit/UIKit）、`19-icloud-drive-evidence.md`（iCloud Drive）、`20-cross-target-ci-evidence.md`（cross-target 执行 / CI）、`26-xcode-product-app-scaffold.md`（D40 product app shell）、`27-stage-3-macos-binding-projection.md`（product app C ABI read-only projection lower bound）、`28-stage-3-xcodegen-product-config.md`（D41 XcodeGen product config source）。决策契约：`04-contract-baseline.md` / `05-key-decisions.md`（D01–D44）/ `06-fixture-set.md`（F01–F43）/ `10-cp-0-approval.md` / `11-cp-0-final.md`。逐迭代原始 reruns 已 consolidate 进 `09`/`17`/`18`/`19`/`20`；core CP-2 迭代已并入 `23`；Stage-2 ground floor 终态 = `24`；CP-1 exit assembly = `22`。

---

## 1. 结论（当前状态）

**全部 Claude/core-executable 工作已收口：CP-1 core side complete，CP-2 core 已落地（`23`），Stage-2 ground floor 全关（`24`，终态 145 tests）；非 Apple whole-exit 已由用户签字（D39，2026-06-10）；D40 授权正式 Apple product app 项目与 macOS-first 开发，Xcode.app 已创建 `suites/anchor/apple/Anchor/Anchor.xcodeproj`，macOS debug build + runtime shell 与 iOS Simulator compile-only gate 均通过（`26`），product app 现已通过 `AnchorCoreC` C ABI module 关闭 read-only core projection runtime lower bound（`27`）；D41 已将 product app project config 源头迁到 `suites/anchor/apple/Anchor/project.yml`，`.xcodeproj` 为 ignored generated output，XcodeGen 生成项目通过 macOS + iOS Simulator build（`28`）。D42/D43（`29`）已完成 Apple 侧 code-review 硬化（含 Team-ID 外置）+ 冗余 spike/smoke 清理，并把 macOS/iOS app 回归验证从 computer-use 截图改为 Swift 测试体系（`AnchorCoreBindingsTests` 10 + `AnchorUnitTests` 4 runnable green，`AnchorUITests` 编译为门）。** World A 多目标编译 gate、client 零真理逻辑红线、core/cli 零云符号边界均通过。binding（组 2）= B4 产品边界已批准（release-distribution-gated）；TextKit（组 3）机制面通过且 product shell 已在位（product TextKit runtime 集成仍 open）；iCloud Drive（组 4）= **approved default transport WITH compromise constraints**（B14）。CP-1 / CP-2 / Stage-2 的**形式** whole-exit 仍 gated on Apple delivery 链：release distribution + product integration + iCloud runtime gates（§7）。Stop condition 全部未触发（§4）。

---

## 2. Verified ground truth（Stage-1 时点快照，Observed）

Stage-1 时点（CP-2 / Stage-2 之前）的实测快照；**终态 command + output（145 tests、audit 范围含 `cli`、`members=["core","cli"]`）的 home 是 `24` §3**，此处不复述。Repo-local Apple addition 限于 verifier-only 工程；root workspace、lockfile、core、product app target 均未改。命令为可复跑红线。

| 命令 | 观察 |
|---|---|
| `git diff --check` | clean |
| `bun install --dry-run --frozen-lockfile --ignore-scripts` | passed；Bun 未把 `suites/anchor/apple` 拉入 workspaces |
| `find suites/anchor -name package.json -print` | 0 results（Option A 纪律：`members=["core"]`） |
| `cargo test --manifest-path suites/anchor/Cargo.toml` | **77 passed; 0 failed; 1 ignored**（`scale_bench::replay_cost_curve`，默认门控；Stage-1 起点为 74，core 迭代后升至 77） |
| `cargo clippy --manifest-path suites/anchor/Cargo.toml --all-targets -- -D warnings` | `Finished`（clean） |
| `cargo build … --target wasm32-unknown-unknown` | `Finished` |
| `cargo build … --target aarch64-linux-android` | `Finished` |
| `rg "CloudKit\|CKRecord\|CKAsset\|CKContainer\|CKSyncEngine\|NSFileCoordinator\|NSMetadataQuery\|ubiquit\|iCloud\|NSURLIsExcludedFromBackupKey" suites/anchor/core` | **0 matches, exit 1** → 可直接作 CI 红线 |
| `rg "diff3\|order-key\|merge\|normaliz\|op-creation\|tree-invariant\|blake3" suites/anchor/apple` | **0 matches** → Swift 侧零确定性语义 |

跨 FFI 真值一致：fixture `snapshot_revision 3ef88671…a877b63` 在两侧 Swift smoke、physical-device async smoke 与 core `determinism_vectors` 逐字节一致。benchmark report-Observed：C ABI 64MB ≈38.22ms / 96MB RSS；UniFFI 64MB ≈145.22ms / 267MB RSS（3.8× 慢 / 2.8× RSS）；million-op replay ≈2.1µs/op（1.25M ops ≈2.6s，release `--ignored`）。

**D40 product app shell（2026-06-11，Observed；home = `26`）：** Xcode.app UI 使用 Multiplatform App 模板创建 `suites/anchor/apple/Anchor/Anchor.xcodeproj`（Product Name `Anchor`，Storage `None`，CloudKit off）；`xcodebuild -list` 发现 target/scheme `Anchor`；macOS Debug build `** BUILD SUCCEEDED **`；iOS Simulator Debug compile-only `** BUILD SUCCEEDED **`；`rg "diff3|order-key|merge|normaliz|op-creation|tree-invariant|blake3" suites/anchor/apple/Anchor` = 0 matches, exit 1；`rg "CloudKit|CKRecord|CKAsset|CKContainer|CKSyncEngine|NSFileCoordinator|NSMetadataQuery|ubiquit|iCloud|NSURLIsExcludedFromBackupKey" suites/anchor/core suites/anchor/cli` = 0 matches, exit 1；macOS runtime UI snapshot shows sidebar rows `Product loop` / `Binding integration` / `Sync boundary`, detail title `Product loop`, inspector revision `3ef88671`, and disabled `New Note` / `Sync` toolbar buttons.

**D40+ product binding read-floor（2026-06-11，Observed；home = `27`）：** default macOS build `** BUILD SUCCEEDED **`；binding macOS arm64 build with `AnchorCoreC` module map + `anchor_core_ffi` link `** BUILD SUCCEEDED **`；runtime UI shows core fixture truth `vault_demo_0001` / `jnl_f99080f823e0815a8e1440955eb896d1c82d4ec371e19b2e0df89ad581f96b89` / snapshot `3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63` / segment bytes `3148`；iOS Simulator compile-only `** BUILD SUCCEEDED **`；product deterministic-semantics redline and core/cli cloud-symbol redline both remain clean. Xcode.app Add Local package attempt did not persist config, which led to D41.

**D41 XcodeGen product config source（2026-06-11，Observed；home = `28`）：** `xcodegen --version` = 2.45.4；`project.yml` parsed with local package `AnchorCoreBindings`, pre-build script `Build anchor-core FFI`, and `basedOnDependencyAnalysis: false`；`Anchor.xcodeproj/` is ignored and regenerated from `project.yml`; generated `project.pbxproj` references `../AnchorCoreBindings`, not `AnchorAppleSpike`; FFI pre-build script produces universal `x86_64 arm64` `libanchor_core_ffi.a`; generated project macOS and iOS Simulator builds exit 0; product deterministic-semantics redline, core/cli cloud-symbol redline, Bun dry-run, and `git diff --check` pass.

---

## 3. Readiness matrix（AUTHORITATIVE state block，按 axis）

| Axis | Verdict | 依据 |
|---|---|---|
| **core deterministic（组 1+5）** | **go** | 终态 **145/0 测试 + 2 ignored**（corpus、scale_bench 按设计；`24` §3。Stage-1 时点 77，见 §2）、clippy clean、`no_std`+`alloc`+`forbid(unsafe_code)`+零外部依赖、`BTreeMap`/`BTreeSet`（无迭代序不确定）、diff3/order-key/merge/BLAKE3 为 core 内唯一 vendored 实现；`mirror_parity`（structured search == ripgrep(md)、mirror 写失败隔离、body 冲突 git fence）通过。Core side complete。 |
| **CP-2 dispatch / op-shape（core）** | **go（core landed；formal freeze 签字已授 D39）** | 单一已校验 dispatch chokepoint（chokegrep 恰 2 个 appender：`Session::commit` + `IngestState::ingest`）、all-or-nothing structural macros、`split_merge_structural` 冲突物化、D24 op-shape full-envelope freeze golden `18582d53…`（三轮未漂移）、native+wasm 跨目标执行。见 `23`。 |
| **Stage-2 ground floor** | **go（全部 closed）** | codec（严格 canonical）、Markdown importer + parity + 330-file 语料浸泡、`Renormalize` + F26c CAS 坍缩、确定性 split/merge intent-rebase、editor-core 完整意图面 + F21 选择阶梯、resolve 产线（`supersedes_rev` 首次消费）、`anchor` CLI（D31 Phase-2）；权威契约 = `suites/anchor/core/README.md` + `suites/anchor/cli/README.md`。见 `24` §2。 |
| **multi-target compile（D36）** | **go** | `wasm32-unknown-unknown` + `aarch64-linux-android` 编译 gate 通过（CLI 为 std host bin，跨目标保证属 core）；零依赖使 gate by construction 不可被 transitive crate 打破。 |
| **zero-cloud-symbol boundary** | **go** | core+cli 云/文件协调/ubiquity/account token grep = 0 matches, exit 1（终态范围含 `cli`，`24` §3）；core 内唯一 Apple 命中是 `src/lib.rs` 描述性边界注释，无 import/使用。`OpSyncPort` 仅 `SegmentId`/`BlobId` + `&[u8]`，`associated type Error` 让 adapter 用自有 typed error。 |
| **binding B4（组 2，A2/B4）** | **approved / release-distribution-gated** | 用户 2026-06-07 批准产品边界 `UniFFI DTO / ordinary dispatch + C ABI bytes fast path`（C ABI 为**保留**项，非 fallback-only，由 64MB benchmark 3.8×/2.8× 支撑）。typed `ValidationError` enum 已落 core DTO + C ABI + UniFFI；synchronous + async generated Swift 通过 `-swift-version 6 -strict-concurrency=complete -warnings-as-errors`；三 slice XCFramework + SwiftPM checksum wrapper；physical-device generated-async runtime 与 development-signed verifier app-bundle/device runtime 已观察（exit `0`）。**Open：** Developer ID / App Store distribution、product app 集成。 |
| **TextKit（组 3，D18）** | **compromise（mechanism-go）** | 机制面可行且边界干净（Swift 零确定性语义、buffer 非真理）；macOS AppKit + iOS UIKit 的 selection/marked-text/keyboard-intent/menu/undo-suppression/view-lifecycle/accessibility mechanism floor 已观察；probe-level insert + structural split/merge intent → real `anchor-core` dispatch bridge 已观察；core-sourced `EditorPatch` projection + core-owned undo-group/undo-replay lower bound 已观察。**Open：** 产品 app-hosted UI runtime、`NSUndoManager` grouping/redo、VoiceOver、moving-view replace replay、concurrent intent rebase。 |
| **iCloud B14（组 4）** | **approved default transport / compromise constraints** | 用户 2026-06-07 批准 iCloud Drive 作首期 default transport。signed macOS app + repo-local Xcode-created verifier 通过 ubiquity/package/coordinator/direct-enumeration/build-signing gates；package-internal `.seg` 发现**不依赖** `NSMetadataQuery`（direct enumeration）。manifest conflict floor = surface/preserve/block/no-auto-resolve，explicit current-winner resolution mechanism 已观察。physical iPhone CloudDocuments container + file-coordinated segment write/read mechanism floor 已观察。生成这些证据的 repo-local verifier 探针 `AnchorMacICloudProbe` 已于 **D44** 因账号 PII 移除（机制证据存 `19`；iCloud 后续经 product-app 测试重建，非独立探针）。**Open：** remote `.icloud` placeholder、signed-out/over-quota、product resolver UX/core integration、steady-state budget、non-macOS large-scale delivery。 |
| **Stage-3 macOS product shell（D40/D41）** | **in progress（test-harness-go）** | D40 授权后，Xcode.app 创建正式 Multiplatform App target `Anchor`；同一 target 对 macOS Debug 与 iOS Simulator Debug compile-only 均通过；macOS runtime shell 可见 sidebar / detail / inspector；toolbar 写入与同步入口保持 disabled。`27` 关闭 C ABI read-only projection runtime floor；`28`（D41）后 `project.yml` 为 config 源头、`.xcodeproj` ignored/regenerated。`29`（D42/D43）后：Apple 侧 code-review 优化 + 冗余 spike/smoke 清理落地，且验证方式由 computer-use 截图改为 Swift 测试体系（`AnchorCoreBindingsTests` 10 + `AnchorUnitTests` 4 = runnable machine gate green；`AnchorUITests` 编译为门）。**Open：** EditorIntent dispatch wiring、TextKit adapter product runtime（非只读）、undo/VoiceOver/conflict UX、UI 测试 signed-run、release signing/distribution。见 `26` / `27` / `28` / `29`。 |
| **verification method（D43）** | **go（Swift 测试体系；截图降级人工抽查）** | macOS/iOS app 回归门 = Swift 测试：`swift test`（AnchorCoreBindings 包，含 macOS FFI round-trip）+ `xcodebuild test -only-testing:AnchorUnitTests`（macOS host, `CODE_SIGNING_ALLOWED=NO`）须 green；UI 测试以「编译通过」为门，运行需 signed machine/CI（同 CP-1 Apple delivery 链）。测试只断言 Swift 对 core 输出的解码/映射/UI 投影与 intent 转发，不重算 core 语义（D24 golden 仍由 Rust core 测试拥有）。见 `29` / `05` D43。 |
| **layout / retention（D02/D14/D38）** | **compromise** | Option A 纪律守住，`bun install --dry-run` passed；四-horizon retention 模型内部一致，core `retention`(7) + `segment_budget`(3) 通过，1M-op steady-state segment-budget file-count floor 已观察。**Open：** iCloud-语境 steady-state budget、stale-peer watermark advance、产品 conflict policy。 |
| **cross-target execution** | **partially-run** | native + wasm（Node WebAssembly）+ iOS Simulator slice + hosted Android emulator golden-vector execution 均已观察通过（`anchor_*_vector_status=0`，6 determinism vectors）；repo-local runner 持久化。**Note：** 当期 hosted GitHub workflow 已移除（成本），历史执行证据保留；persistent repo-enforced CI wiring 未重建。 |

> **Verdict 语义：** go = 证据足以进 CP-1 当前基线；approved / *-gated = 产品边界已批准但仍有 delivery gate；compromise = 机制/core 面通过但仍有明确 open gate；partially-run = 部分目标已执行、其余未持久化；blocked / no-go = 无（本轮未出现）。

---

## 4. Stop-condition check（本轮）

| Stop condition | 触发 |
|---|---|
| 改 root workspace / package / lockfile（或加 placeholder `package.json`） | 否（`members = ["core", "cli"]` 为 round-3 用户授权的显式覆盖（D39）；Bun workspace / root 配置 / root lockfile 未动，`24` §4） |
| Swift/TextKit 复制 core 确定性语义 | 否（product app path `suites/anchor/apple/Anchor` 零确定性语义 grep = 0 matches, exit 1） |
| 绕过 B14 compromise constraints 发布 iCloud transport（package-internal `NSMetadataQuery` / 静默处理 unresolved conflict / 绕过 placeholder/account gates） | 否（transport approved；delivery gates preserved） |
| iCloud-Drive 路径引入 CloudKit schema / CKSyncEngine | 否 |
| 公开 CLI schema 变更 | 否 |
| Apple probe 变产品 app shell | 否（D40 授权后由 Xcode.app 新建正式 product app；未把 verifier probe 改造成产品 app） |
| `anchor-core` 泄漏 Apple 云/文件协调/account/ubiquity 类型 | 否（0 matches, exit 1） |
| scale 出现 N logical op → ~N synced segment（使 batching/compaction 失效） | 否（macOS direct enumeration 到 100K，未观察 N→~N） |

**全部未触发。**

---

## 5. Approved decision baseline + clean boundary（当前）

- **非 Apple whole-exit（D39 approved，2026-06-10）：** CP-1 非 Apple 签字 / CP-2 formal freeze 授权 / Stage-2 ground floor whole-exit / CLI（D31 Phase-2）/ editor-core 完整意图面；批准原文 home = `05` D39。剩余 open = Apple 类（§7）。
- **正式 product app（D40 approved，2026-06-11）：** 通过 Xcode.app 在 Option A 位置创建 `suites/anchor/apple/Anchor/Anchor.xcodeproj`；当前只关闭 product shell scaffold、macOS debug runtime 与 iOS Simulator compile-only gate，不关闭 TextKit/iCloud/release gates。
- **Product project config（D41 approved，2026-06-11）：** `suites/anchor/apple/Anchor/project.yml` 是 Xcode project config 源头；`suites/anchor/apple/Anchor/Anchor.xcodeproj/` 是 XcodeGen generated output，ignored and regenerable；后续 target/package/build-setting/script 变更走 XcodeGen。
- **Binding（B4 approved，2026-06-07）：** `UniFFI DTO / ordinary dispatch + C ABI bytes fast path`（非 pure-UniFFI bulk bytes）。Swift 侧零确定性语义；时钟/熵（`op_id` / HLC）由 Swift 传入 core，core 永不自取（D36）。
- **iCloud adapter 形状：** `NSMetadataQuery` 发现 vault/package；`NSFileCoordinator` 保护读写；package-internal segment 用 **file-coordinated direct enumeration**（**不**用 `NSMetadataQuery` 枚举 package internals）；manifest 默认 per-device immutable cursor；冲突 surface/preserve/block/no-auto-resolve。
- **边界：** core 永不出现云/文件协调/account 类型；Swift/TextKit 不实现 merge/normalization/op-creation/tree-invariant/diff3/order-key；Option A `suites/anchor/*` 为已批准 spike 位置；`apple/ffi`（staticlib）与 `apple/uniffi`（staticlib+cdylib）是 **非 member** wrapper crate（显式 `--manifest-path` 构建），故不破坏 core 红线与 multi-target gate。
- **核验环境：** macOS + Xcode 26.5、Swift 6.3.2、rustc/cargo 1.95.0；`aarch64-apple-darwin` target 已装；付费 ADP team（Team ID `<TEAM_ID>`，developer `<DEVELOPER_NAME>`）+ signed macOS verifier app + 真实 iCloud account；构建产物落 repo 外（`/tmp/anchor-apple-stage1`）；签名身份 hash `<SIGNING_HASH>`；profile UUID `<PROFILE_UUID>`；home paths `<HOME>/...`；bundle id `<BUNDLE_ID>`；container `<ICLOUD_CONTAINER>`。

---

## 6. Closed-gate ledger（deduplicated；one row per closed gate）

每条 gate 仅记一次，指向其权威 evidence 文档（逐迭代原始 reruns 已 dedupe）。所有列为 **closed / observed** 的 gate 均为机制下限或 verifier-runtime 证据，**不**蕴含 CP-1 whole-exit 或 release distribution。

| 已关闭 gate | Evidence doc |
|---|---|
| repo-local signed macOS iCloud verifier 复跑可重现 | `19` |
| macOS 10K direct package-internal enumeration | `19` |
| Xcode-managed iOS Simulator build/install/launch chain | `19` |
| native + wasm（Node WASM）+ iOS Simulator slice golden-vector execution | `20` |
| repo-local 持久化 cross-target runner（native/wasm/iOS-sim） | `20` |
| iCloud conflict surfacing / preservation / blocking floor + duplicate-manifest detection | `19` |
| macOS TextKit IME marked-text / hit-testing / controlled direct-buffer undo suppression floor + iOS-sim compile | `18` |
| Swift wrapper actor async surface + DTO/error `Sendable` floor + macOS release strict-concurrency runtime | `17` |
| repo-external SwiftPM path-dependency import（external consumer release strict run） | `17` |
| raw C ABI binary-target import（external binary consumer release strict run） | `17` |
| Linux native+wasm 与 macOS iOS-sim vector job workflow config + local skip/full runner validation | `20` |
| physical iPhone build/install/entitlement chain | `19`, `18` |
| macOS placeholder failure-shape + package-internal start-download negative evidence | `19` |
| final production DTO/error vocabulary + core-vs-adapter error boundary + Swift structured-error decode | `17` |
| product wrapper binary-package mechanism floor（Swift over binary target release strict run） | `17` |
| UniFFI generated-async source gen + macOS strict-concurrency async runtime + iOS-sim compile/link | `17` |
| SwiftPM binary-artifact checksum mechanism + wrapper-compatible XCFramework zip shape | `17` |
| explicit destructive/user-resolution exec mechanism + branch archival + duplicate-manifest live cleanup + post-refresh clean state | `19` |
| iPhoneOS generated-async standalone `arm64` compile/link（prior `arm64e` mismatch = wrong target selection） | `17` |
| hosted Linux native+wasm + hosted macOS native+wasm+iOS-sim vector execution | `20` |
| hosted/fresh-runner binding-package reproduction（C ABI wrapper binary package + UniFFI async smokes） | `17` |
| artifact provenance/signing/notarization **policy floor** + verifier artifact provenance manifest shape | `17` |
| local-only path classifier floor（normal / direct iCloud / symlink↔iCloud / backup-exclusion readback） | `19` |
| macOS accessibility selected-range readback floor | `18` |
| adapter view-model projection patch replay（insert/move/remove text surfaces） | `18` |
| macOS AppKit `keyDown` capture → split/merge-backward intents | `18` |
| real AppKit `NSView`/`NSTextView` insert/move/remove lifecycle floor | `18`* |
| macOS AppKit first-responder keyboard routing across two text surfaces | `18` |
| macOS AppKit accessibility hierarchy across two text surfaces | `18` |
| macOS AppKit selector / menu-item sender routing → split/merge-backward floor | `18` |
| macOS AppKit responder-chain `undo:` suppression → adapter-owned semantic undo | `18` |
| macOS AppKit split/scroll focus lifecycle across two text surfaces | `18` |
| iOS-sim `UITextView` runtime floor（UTF-16 selection / marked-text commit / `UIKeyInput` intent / scroll-hosted identity+a11y） | `18` |
| iOS-sim UIKit `UIScrollView`/`UITextView` insert/move/remove lifecycle replay floor | `18` |
| iOS-sim UIKit `UIKeyCommand` target-action routing → split/merge-backward floor | `18` |
| iOS-sim UIKit responder target-action undo → adapter-owned grouped semantic undo floor | `18` |
| Android runner branch + hosted Android emulator workflow config | `20` |
| hosted Android emulator execution（cross-target execution machine gate） | `20` |
| probe-level TextKit adapter insert intent → real `anchor-core` dispatch bridge | `18` |
| no-container account-state classifier floor（`blocked_no_ubiquity_container`） | `19` |
| 1M-op steady-state segment-budget file-count floor（default budget） | `19` |
| probe-level structural split/merge-backward intents → real `anchor-core` dispatch typed-deferral bridge | `18` |
| physical iPhone CloudDocuments container + file-coordinated segment write/read floor | `19` |
| physical-device generated-async runtime + development-signed verifier app-bundle/device runtime integration（exit `0`） | `17` |
| current-period hosted Android/WASM workflow removed（cost；historical execution evidence retained） | `20` |
| Xcode.app-created product app shell（Multiplatform App target `Anchor`）+ macOS debug build/runtime + iOS Simulator compile-only | `26` |
| macOS product app read-only core projection via `AnchorCoreC` module + C ABI staticlib runtime | `27` |
| XcodeGen product config source-of-truth + ignored/regenerated `.xcodeproj` + formal `AnchorCoreBindings` local package dependency + FFI universal pre-build script | `28` |
| Apple Team ID 从 tracked `project.yml` 外置到 gitignored `Signing.local.xcconfig`（`#include?` 可选引入；generated `.xcodeproj` 亦无 Team ID） | `29` |
| Apple code-review 优化（dead `AnchorCoreClient` 删除、`View.init` 阻塞加载移 `.task`、投影错误 `Logger` 上报、`ValidationErrorCode` 前向兼容、`TextKitNoteBodyView` 去冗余、`blobID` DTO 规范化） | `29` |
| 冗余 spike/smoke 删除（`AnchorAppleSpike/`、`macos-icloud-probe/`）+ release 脚本 binding 源 repoint 到正式包 | `29` |
| Swift 单元/集成测试 machine gate green：`AnchorCoreBindingsTests` 10（含 macOS C-ABI round-trip）+ `AnchorUnitTests` 4（投影映射/样本） | `29` |
| `AnchorUITests`（XCUITest）编译通过（`** TEST BUILD SUCCEEDED **`），accessibility-id 断言取代截图/`get_app_state` 检查 | `29` |
| core split/merge-backward dispatch lower bound + Swift structural-intent bridge | `23` |
| core-sourced `EditorPatch` DTO lower bound + C ABI JSON/Swift decode + TextKit projection probe | `23` |
| core-owned undo-group DTO lower bound + C ABI JSON/Swift decode + TextKit inverse projection | `23` |
| core-only undo replay lower bound（insert/split/merge-backward groups lower to committed core ops + replay state） | `23` |
| op-segment round-trippable codec（strict canonical decode；op-log file format） | `24` |
| Markdown importer + import/export parity + 330-file 本机语料浸泡 | `24` |
| `Renormalize` producer + F26c all-or-nothing CAS 坍缩 | `24` |
| 确定性 split/merge intent-rebase（保守单侧规则；floor 不变） | `24` |
| editor intent surface 扩展（`DeleteText`/`ReplaceText`/`RemoveMark`/`CreateBlock`） | `24` |
| editor-core 完整意图面（indent/outdent/exit-container/transform/insert-code-block/paste-fragment + 多块选区 `DeleteBlocks`/`MoveBlocks`） | `24` |
| F21 选择提升/降级阶梯（core 拥有；`Selection::Block`/`Embedded` 首次发射） | `24` |
| body keep-both resolution 产线（`dispatch_resolve_body`；D24 预留 `supersedes_rev` 首次消费） | `24` |
| 结构冲突启发式因果收紧（macro 下游编辑 + superseded rev 不再误报并发） | `24` |
| `anchor` CLI（D31 Phase-2，user-approved 2026-06-10）：vault segment I/O + 公开 ConflictRecord/resolve/restore 面 + 退出码契约 e2e | `24` |

\* 上表每行的 evidence pointer 指向 consolidation 后的权威证据文档（`09`/`17`/`18`/`19`/`20`；core CP-2 迭代已并入 `23`，Stage-2 ground floor 为 `24`）。原本分散的逐次 reruns（iOS-device locked rerun、device visibility-only、iOS-sim 复测、support reruns、Developer-ID signing availability 等负面/无新增证据项）不产生新的 closed gate，仅强化既有证据或记录负面 delivery 结论；其净结论已并入 §3 readiness matrix 与 §7 open gates，原始命令输出（含设备/账号细节）已在 consolidation 中按工作台规则脱敏移除。

---

## 7. Remaining work / open gates

CP-1 whole-exit gated on 以下未关闭项。所有 **closed** gate（§6）均为机制/verifier-runtime 证据，不蕴含 release / product / whole-exit。

| Open gate | 状态 | Owner | Evidence pointer |
|---|---|---|---|
| Developer ID Application / Installer / Apple Distribution identity | Blocked — no match observed locally | Needs-Apple-account（distribution identity） | `20` |
| macOS product app archive / notarization | Not run — product shell exists; no archive, no Developer ID identity | Needs-Apple-runtime + distribution identity | `20`, `26` |
| App Store / TestFlight distribution + real upload/distribution channel | Not run — no Apple Distribution identity or upload artifact | Needs-Apple-account | `20`, `17` |
| product app write-dispatch integration（非 verifier） | Partially run — product shell reads core fixture through formal `AnchorCoreBindings` local package dependency generated by XcodeGen; no product write dispatch, persistence, or editor intent routing | Apple product owner | `17`, `26`, `27`, `28` |
| remote `.icloud` placeholder download to `Current` | Not run — macOS package-internal path returns `NSCocoaErrorDomain:4`; true remote placeholder unproved | Needs-Apple-runtime（remote ubiquity） | `19` |
| signed-out / over-quota account states | Not run — only no-container classifier floor observed | Needs-Apple-runtime | `19` |
| iOS / non-macOS CloudDocuments runtime | Blocked — iOS Simulator returns `BRCloudDocsErrorDomain:153` "iCloud Drive not supported"; physical-iPhone container observed but full delivery unproved | Needs-Apple-runtime（real iOS account） | `19` |
| product conflict-resolution UX / core integration（never silently resolve `NSFileVersion`） | Not run — policy floor only | Apple product owner | `19` |
| iCloud-context million-op replay/merge/compaction + steady-state segment budget | Not run in iCloud context — core-side linear + 1M-op floor observed only | core + Apple verifier | `19` |
| non-macOS package-level metadata gather / large-scale delivery | Not run — macOS-only gate | Needs-Apple-runtime | `19` |
| local-only path-in-ubiquity 边界（D21/D21a：external volume / security-scoped bookmark / signed-out） | Partially Blocked — classifier floor observed; signed-out/external-volume not run | Needs-Apple-runtime | `19` |
| TextKit 产品 runtime（`NSUndoManager` grouping/redo、VoiceOver/UI runtime、moving-view replace replay、mark-preserving full inverse-op contract；concurrent intent rebase 与 `split_merge_structural` materialization 的 core 侧已落地 `24`，product runtime 集成未跑） | Partially run — product shell, read-only core projection runtime, and XcodeGen config source observed; TextKit adapter/product editor not integrated | Apple product owner | `18`/`23`/`26`/`27`/`28` |
| Swift/FFI undo-group input contract | Not run — core-only replay lower bound observed | binding owner | `23` |
| persistent repo-enforced cross-target CI wiring（incl. android in CI；含 Swift 测试 gate 的 CI 接线） | Not run — hosted workflow removed; historical execution retained; runner under `/tmp`；Swift 测试本机可跑但未接 CI | core / infra owner | `20`, `29` |
| `AnchorUITests`（XCUITest）signed-run | Blocked(env) — bundle 编译通过；automatic signing 缺「该 team 的 Xcode 登录 Apple 账号」（`No Account for Team`），且 keychain 证书 team（`<TEAM_ID_ALT>`）≠ 项目原 team（`<TEAM_ID>`）；需用户在 Xcode > Settings > Accounts 登录匹配账号并设 `Signing.local.xcconfig` 的 team（已外置），再 `-allowProvisioningUpdates` 运行。与 CP-1 Apple delivery signing 同链 | Apple product owner（用户登录 Apple 账号 / signed machine/CI） | `29` |
| **CP-1 whole-exit** | **Open — 非 Apple human sign-off 已签（D39，2026-06-10）；D40 product shell scaffold、product C ABI read-only projection floor、D41 XcodeGen config source 已关；剩余 = Apple delivery / release / product integration gates** | Needs-Apple-runtime + Apple product owner | D39；D40；D41；assembly `22` §5；`26` / `27` / `28` |

> Claude/core 与 human-approval 可达的工作已全部收口（Stage-2 ground floor 关闭、CLI D31 Phase-2 落地、非 Apple whole-exit 签字 = D39）。D40/D41 后 product app 已关闭 shell scaffold、C ABI read-only projection runtime floor、XcodeGen config source；D42/D43（`29`）后已完成 Apple 侧 code-review 硬化 + 冗余清理，并把回归门改为 Swift 测试体系（runnable 14-test gate green，UI 测试编译为门）。当前可自治动作转为 macOS product TextKit runtime lower bound——**按 D43 先写覆盖该改动的 Swift 测试再实现**，仍不做持久写入、不启用 iCloud、不关闭 release distribution。Cursor home = `00` §0。

---

## 8. Iteration history（append-only；一行一轮）

> 2026-06-10 consolidation（76→25 docs）之前的逐次迭代原始文档已折叠（原始记录在 git 历史）；该日期前的行以 consolidation 粒度重建（Inferred from consolidated docs），此后逐轮追加。

| # | 日期 | Gate / 动作 | Evidence |
|---|---|---|---|
| 0 | 2026-06-06 | CP-0 packet 起草（plan / conflict model / research / contract / decisions / fixtures / layout / verification packet） | `01`–`08` |
| 1 | 2026-06-07 | CP-0 批准（user sign-off，A1–A9 / B1–B16）+ Stage-1 entry | `09`–`13` |
| 2 | 2026-06-07 | CP-1 core spike（74→77 tests、multi-target compile、零云符号红线） | `14` / `15` / `16` |
| 3 | 2026-06-07 → 06-10 | Apple verifier rounds（binding / TextKit / iCloud / cross-target；逐次 reruns 已 dedupe 进 §6） | `17` / `18` / `19` / `20` |
| 4 | 2026-06-10 | Workbench consolidation 76→25 + 全量 PII scrub | 全目录（git 历史） |
| 5 | 2026-06-10 | CP-2 core（dispatch chokepoint、structural macros、D24 freeze golden、native+wasm 执行；77→85 tests） | `23` |
| 6 | 2026-06-10 | Stage-2 round 1（公开契约 `core/README.md` + reference `MemoryOpSyncPort`） | `24` |
| 7 | 2026-06-10 | Stage-2 round 2（codec / importer+语料浸泡 / renormalize+F26c / intent-rebase / +4 intents；→120 tests；D39 round-2 授权） | `24` |
| 8 | 2026-06-10 | Stage-2 round 3（editor-core 全集 + F21 阶梯、`anchor` CLI（D31 Phase-2）、resolve 产线；→145 tests；D39 round-3 授权 + 非 Apple whole-exit 签字；round-2/3 报告 `25`/`26` 并入 `24` 后删除） | `24` / `22` §5 / `23` |
| 9 | 2026-06-10 | Workbench 整理（spec conformance pass）：本文件终态化为 ledger（state block + §8 history）、D39 入决策表 `05`、driver `00` cursor 置顶并去重 | `25` |
| 10 | 2026-06-11 | D40：通过 Xcode.app 创建正式 Multiplatform product app shell；macOS Debug build/runtime 与 iOS Simulator compile-only 通过；client/core 红线复跑 clean | `26` |
| 11 | 2026-06-11 | Stage-3 macOS product app binding lower bound：C ABI module read-only projection runtime；default macOS + explicit binding macOS + iOS Simulator compile clean；Xcode-managed package dependency still open | `27` |
| 12 | 2026-06-11 | D41：引入 XcodeGen 作为 product app project config 源头；`.xcodeproj` ignored/regenerated；`AnchorCoreBindings` local package dependency + FFI pre-build script generated into project；macOS/iOS Simulator build + redline audits clean | `28` |
| 13 | 2026-06-11 | D42/D43：ultracode 多维 review + Apple code-review 硬化（Team-ID 外置、dead actor 删除、async/logging/enum/TextKit 优化）+ 冗余 spike/smoke 清理（`AnchorAppleSpike`、`macos-icloud-probe`）；验证方式 pivot 到 Swift 测试体系；macOS/iOS build + redline + core 145 基线 clean | `29` |
| 14 | 2026-06-11 | D44：账号 PII 清理——签名诊断中泄入文档的真实 Team ID/dev-name/cert-hash/container 全部改占位符；移除 `AnchorMacICloudProbe` 探针（工作区 0 account PII）；本机签名解决后三层测试全绿（10+4+3=17，含 UI）；`git filter-repo` 历史 scrub 已 prepared、pending 用户执行 | `29` |
