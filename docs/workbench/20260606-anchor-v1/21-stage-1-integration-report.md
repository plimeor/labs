# Anchor Stage 1 — Integration / CP-1 Readiness Report

日期：2026-06-07
状态：**workbench artifact** —— 非公开接口契约。本文件把 Codex / Apple verifier 的 Stage 1 实测报告（binding / TextKit / iCloud Drive）与 Claude / core owner 的 core spike 证据（`14-core-spike-report.md` / `15-core-evidence.md`）整合为**当前决策状态**与 **CP-1 下一步 gate** 的收口结论。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**任何 package / workspace / 产品 app / 生成 lockfile 改动；**不**改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置，**不**创建产品 app shell / entitlement / bundle id / iCloud container。`suites/anchor/apple/AnchorMacICloudProbe` 是 verifier-only macOS Xcode project，不是产品工程。权威接口契约在实现后归 `anchor-core` 包 README。
>
> 引用：core 报告 = `14-core-spike-report.md` / `15-core-evidence.md`；Apple 报告 = `17-apple-binding-report.md` / `18-textkit-adapter-report.md` / `19-icloud-drive-report.md`；交接 = `16-codex-apple-input.md`（core→Codex 被调 surface）/ `20-apple-integration-state-for-claude.md`（Codex→integration evidence）；决策 = `./`（`11-cp-0-final.md` / `10-cp-0-approval.md` / `05-key-decisions.md` D01–D38 / `04-contract-baseline.md` / `06-fixture-set.md` F01–F43 / `12-stage-1-spike-plan.md` / `13-stage-1-entry-brief.md`）。

---

## 1. 结论（CP-1 readiness）

**Core side = complete；CP-1 整体 = 未退出（按 axis 分）。** Core owner 的确定性 core（spike 组 1、5）已落成正式测试并通过；World A 多目标编译 gate、client 零真理逻辑红线、core 零云符号边界通过。Codex / Apple verifier 的 binding（组 2）已由用户批准为 B4 产品边界；TextKit（组 3）机制面通过；iCloud Drive（组 4）已由用户批准为首期 default transport，批准形状为 **default transport with compromise constraints**。CP-1 整体退出仍 gated on Codex/Apple implementation gates（见 §6、§9）。Stop condition check 见 §11。

---

## 2. Verified ground truth（Stage 1 Observed）

Stage 1 evidence is synchronized into the current decision files. The current repo-local Apple addition is limited to a verifier-only macOS project created through Xcode UI under `suites/anchor/apple/AnchorMacICloudProbe`. Persistent project configuration stays Xcode-created; the signed iCloud runtime uses explicit `xcodebuild` entitlement/Info build settings. Root workspace, lockfile, core, and product app targets remain unchanged.

| 命令 | 观察 |
|---|---|
| `git status --short` | expected changes are docs plus verifier-only Apple project files under `suites/anchor/apple/AnchorMacICloudProbe` |
| `git diff --check` | clean |
| `bun install --dry-run --frozen-lockfile --ignore-scripts` | passed；Bun workspace resolution did not pull `suites/anchor/apple` into workspaces |
| `find suites/anchor -name package.json -print` | 0 results |
| `cargo test --manifest-path suites/anchor/Cargo.toml` | **74 passed; 0 failed**；1 ignored（`scale_bench::replay_cost_curve`，默认门控） |
| `cargo build … --target wasm32-unknown-unknown` | `Finished` — OK |
| `cargo build … --target aarch64-linux-android` | `Finished` — OK |
| `rg "CloudKit\|CKRecord\|CKAsset\|CKContainer\|CKSyncEngine\|NSFileCoordinator\|NSMetadataQuery\|ubiquit\|iCloud\|NSURLIsExcludedFromBackupKey" suites/anchor/core` | **0 matches, exit 1**（含注释；边界文案不含被审 token）→ 可直接作 CI 红线 |
| `rg "OpSyncPort\|push_segment\|pull_segment\|SegmentId\|BlobId" suites/anchor/core` | 仅命中 core sync boundary：`src/sync_port.rs` / `src/dto.rs` / `src/lib.rs` 边界注释 |

这些数字与 Apple/core 报告中引用值逐项一致（C ABI 64MB ≈38.22ms / 96MB RSS、UniFFI 64MB ≈145.22ms / 267MB RSS、million-op replay ≈2.1µs/op；report-Observed）。

---

## 3. CP-1 readiness matrix（按 axis）

| Axis | Verdict | 依据 |
|---|---|---|
| **core deterministic（组 1）** | **go** | 74/0 测试、clippy 干净、`no_std`+`forbid(unsafe_code)`+零外部依赖、`BTreeMap`/`BTreeSet`（无迭代序不确定）、diff3/order-key/merge 为 core 内唯一 vendored 实现。Core side complete。 |
| **core multi-target gate（D36）** | **go** | `wasm32-unknown-unknown` + `aarch64-linux-android` 编译 gate 通过；零依赖使 gate by construction 不可被 transitive crate 打破。native/wasm/iOS Simulator golden-vector execution 已有本地 runner 与 hosted GitHub Actions pass；Android execution 仍 open。 |
| **mirror / search parity（组 5）** | **go** | `mirror_parity` 测试通过：structured search == ripgrep(md)、mirror 写失败隔离（op-log 不回滚）、body 冲突 git fence。 |
| **Apple binding（组 2，A2/B4）** | **approved / release-gated** | 用户已于 2026-06-07 批准产品边界：`UniFFI DTO / ordinary dispatch + C ABI bytes fast path`。typed `ValidationError` enum 已落到 core DTO + C ABI Swift wrapper + UniFFI generated enum；synchronous release-surface smoke 已过 Swift 6 strict concurrency + warnings-as-errors；core-owned final DTO/error vocabulary、wrapper binary package 机制下限、UniFFI generated async macOS/iOS-sim/iPhoneOS-arm64 mechanism floor、SwiftPM checksum mechanism、hosted/fresh-runner verifier artifact reproduction、artifact provenance policy floor 已关闭。Remaining release implementation gates 为 signed app-bundle/device runtime integration、actual Developer ID notarization/App Store distribution 与 real release upload/distribution channel（§5）。 |
| **TextKit adapter（组 3，D18）** | **compromise（mechanism-go）** | 机制面可行且边界干净（Swift 零确定性语义、buffer 非真理）；real-app responder-chain undo 抑制、IME marked-text commit、accessibility、hit-testing、patch replay over moving views、UTF-16 内部单位换算稳定性仍是**产品级 runtime gate**（Not run）。 |
| **iCloud Drive（组 4，B14）** | **approved default transport / compromise constraints** | 用户已批准 iCloud Drive 作首期 default transport（2026-06-07）。signed macOS app + repo-local Xcode-created macOS verifier 通过 ubiquity/package/coordinator/direct-enumeration/build-signing gates；package-internal `.seg` 发现**不依赖** `NSMetadataQuery`。Mutable manifest conflict floor 已关闭为 surface/preserve/block/no-auto-resolve，explicit current-winner resolution mechanism 已观察；remote placeholder / account states / non-macOS runtime-scale / steady-state budget / product resolver UX/core integration 仍是 delivery gates（§6）。 |
| **layout / Bun（D02）** | **go for macOS-only verifier placement** | Option A 纪律 live 守住（`members=["core"]`、`suites/anchor/**` 无 `package.json`、root 配置未动）；`bun install --dry-run --frozen-lockfile --ignore-scripts` passed。 |
| **retention（D14/D38）** | **compromise** | 四-horizon 模型内部一致、core `retention`(7) + `segment_budget`(3) 测试通过；steady-state segment budget、million-op compaction、stale-peer watermark advance、product conflict-resolution policy 是 scale-gate / Codex-Apple 工作（未测）。 |

> **Verdict 语义：** go = 本轮证据足以进 CP-1 当前基线；approved / release-gated = 产品边界已批准但仍有 release delivery gate；compromise = 机制/core 面通过但仍有明确 open gate；blocked / no-go = 无（本轮未出现）。

---

## 4. Observed / Recommended / Compromise / Open gate / Stop condition

### 4.1 Observed evidence（已实测，不含 Not run 当事实）

- **Core（`15-core-evidence.md`）：** 74 测试、clippy 干净、wasm32+android 编译、零云符号、跨目标一致性 golden（8 向量，`aarch64-apple-darwin` 捕获）、million-op replay 线性（release `--ignored`，report-Observed ≈2.1µs/op、1.25M ops≈2.6s）。
- **Binding（`17-apple-binding-report.md`）：** Rust macOS/iOS/iOS-sim 三 slice 构建；UniFFI generated Swift **full round-trip**（`EditorIntentDto` insert→`changedIds=[blk_a]`、UTF-16 caret `3:3`、`set_life=deleted` 返回 typed `ValidationErrorCode.directActiveToDeleted`、post-dispatch snapshot revision + 非空 segment bytes + `seg_` id）；C ABI/UniFFI 三 slice XCFramework + SwiftPM wrapper import；release-surface rerun 下 C ABI/UniFFI 三 slice XCFramework 均创建成功，generated Swift 通过 `-swift-version 6 -strict-concurrency=complete -warnings-as-errors` synchronous smoke；1/4/16/64MB bytes benchmark（C ABI 64MB ≈38.22ms/96MB，UniFFI 64MB ≈145.22ms/267MB，3.8×慢/2.8×RSS）。跨 FFI 真值一致：fixture `snapshot_revision 3ef88671…a877b63` 在两侧 Swift smoke 与 core `determinism_vectors` 逐字节一致。
- **TextKit（`18-textkit-adapter-report.md`）：** macOS `NSTextView` runtime 设 UTF-16 selection、layout、adapter-owned `UndoManager` semantic-inverse-intent；iOS sim 编译；UTF-16 fixture 计数（emoji/ZWJ/combining/CRLF/mixed）；intent-shaped 映射 + patch replay 到 view-model projection（buffer 非真理）。
- **iCloud（`19-icloud-drive-report.md`）：** signed macOS `.app` + repo-local Xcode-created macOS verifier 通过 ubiquity container lookup、`.anchorvault` package UTType（conform `com.apple.package`、`vault_is_ubiquitous=true`）、`NSFileCoordinator` 读写（equal）、package-level `NSMetadataQuery` 发现（macOS `count=1`）、package-internal **direct enumeration**（macOS 1024 hidden + 128 visible）、macOS 10K/50K/100K package-internal direct enumeration（≈27.70ms / 142.63ms / 299.51ms）、repo-local macOS 10K/50K/100K direct enumeration（≈22.53ms / 124.70ms / 269.50ms）、1024-file subset 写（macOS≈3247ms / repo-local macOS≈378ms）、online 跨设备收敛（0 conflict）、offline fork 后 `NSFileVersion` 冲突 materialization（1 retained，未解决）。**确认：** package-internal `.seg` 发现**返回 0**（每变体与 10K/50K/100K），package-external `.seg` 被枚举（125/128）；macOS package-internal segment evict/download both return `NSCocoaErrorDomain:4`。

### 4.2 Approved / recommended decision（当前基线）

- **Binding（B4 approved，2026-06-07）：** `UniFFI DTO / ordinary dispatch + C ABI bytes fast path`（**非** pure-UniFFI bulk bytes）。C ABI fast path **保留**（非 fallback-only），因 UniFFI 64MB 慢 3.8×/RSS 2.8×。
- **iCloud adapter 形状：** `NSMetadataQuery` 发现 vault/package；`NSFileCoordinator` 保护读写；package-internal segment 用 **file-coordinated direct enumeration**（**不**用 `NSMetadataQuery` 枚举 package internals）；manifest 默认 per-device immutable cursor。
- **边界：** core 永不出现云/文件协调/account 类型；Swift/TextKit 不实现 merge/normalization/op-creation/tree-invariant/diff3/order-key；Option A `suites/anchor/*` 为已批准 spike 位置。

### 4.3 Compromise / delivery gates（机制通过或路线批准后的剩余门）

- **iCloud Drive 作首期默认 transport（B14）= approved default transport with compromise constraints**。runtime/file-transport 机制已证，macOS direct enumeration scale gate 通过到 100K；conflict floor/resolution mechanism 已证到 adapter-visible clean state；remote placeholder、account-state、non-macOS large-scale delivery、steady-state segment budget 与 product resolver integration 是交付 gate；transport 路线选择状态保持 approved。
- **TextKit = mechanism-go**，产品 editor runtime 未完成。
- **layout/Bun = go for macOS-only verifier placement**：Option A 纪律守住，Bun glob dry-run passed。

### 4.4 Open gate（待证 / 交付，不得当已验证）

- **Binding release gates（B4 approved）：** signed app-bundle/device runtime integration；actual Developer ID notarization/App Store distribution；real release upload/distribution channel。Synchronous generated Swift strict-concurrency release smoke and three-slice XCFramework packaging are observed；typed `ValidationError` enum 已由 core-owner 决策并落地并由 `34-dto-error-vocabulary-report.md` 冻结，wrapper binary package 机制下限由 `35-binding-wrapper-binary-package-report.md` 关闭，UniFFI generated async macOS runtime + iOS Simulator compile/link 由 `36-uniffi-generated-async-report.md` 关闭，iPhoneOS standalone arm64 compile/link 由 `40-uniffi-iphoneos-packaging-report.md` 关闭，SwiftPM checksum mechanism 由 `38-binding-artifact-checksum-report.md` 关闭，hosted/fresh-runner verifier artifact reproduction 由 `43-hosted-binding-package-ci-report.md` 关闭，artifact provenance policy floor 由 `44-binding-artifact-provenance-policy.md` 关闭，现有 validated code 包含 `invalid_utf16_offset`、`direct_active_to_deleted`、`structural_dispatch_deferred`。
- **iCloud（§6 最小矩阵）：** remote `.icloud` placeholder download、signed-out / over-quota、product conflict-resolution UX/core integration、million-op replay/merge/compaction + steady-state segment budget、local-only path-in-ubiquity 边界、non-macOS large-scale delivery / package-level metadata gather、repo-local signed Anchor app target。
- **TextKit（组 3）：** real-app responder-chain undo 抑制 / IME marked-text commit / accessibility / hit-testing / patch replay over moving views / keyboard→`EditorIntent` / UTF-16 内部单位换算（D18 fixture）。
- **跨目标执行：** native / wasm / iOS Simulator golden-vector execution 已有本地 runner 与 hosted GitHub Actions pass；Android execution 仍 open。

### 4.5 Stop condition（本轮无触发，作为前置守卫）

改 root workspace/package/lockfile；在 Swift/TextKit 复制 core 确定性语义；绕过 B14 compromise constraints 发布 iCloud transport；CloudKit schema / CKSyncEngine；公开 CLI schema 变更；把 Apple probe 变产品 app shell；`anchor-core` 泄漏 Apple 云/文件协调类型。**本轮一项未触。**

---

## 5. Binding — approved product boundary

**B4 已由用户于 2026-06-07 批准：`UniFFI 生成 Swift（DTO / 结构化 error / 普通 dispatch）+ C ABI bytes fast path（bulk segment/blob）`。** C ABI fast path 是**保留**项（非 fallback-only 也非 pure-UniFFI），由 64MB benchmark（3.8× 时延 / 2.8× RSS）直接支撑。Swift 侧零确定性语义（`EditorIntent`/`OpStamp` 在 Rust 构造，时钟/熵由 Swift 传入，D36）。

**Release implementation gates：**

1. **UniFFI async-`Sendable` release surface** 仍是冻结 gate；synchronous generated Swift 已在 release artifact 上通过 `-swift-version 6 -strict-concurrency=complete -warnings-as-errors`。
2. **signed app-bundle/device runtime integration / release distribution surface** 仍是冻结 gate；Swift wrapper actor async surface、UniFFI generated async macOS+iOS-sim surface、iPhoneOS standalone arm64 compile/link、hosted/fresh-runner verifier artifact reproduction、core-owned DTO/error vocabulary 均已过。先前 iPhoneOS standalone failure 是 `arm64e` target 与 Rust `arm64` slice mismatch，不再作为 `arm64` mechanism blocker。
3. **Product Swift wrapper import surface + hosted/fresh-runner verifier artifact reproduction + artifact provenance policy floor** 已关闭；remaining release work 是 signed app-bundle/device runtime integration、actual Developer ID notarization/App Store distribution 与 real release upload/distribution channel。

---

## 6. iCloud Drive — 状态与最小下一轮验证矩阵

**状态 = approved default transport with compromise constraints。** 可批准的 adapter 形状已锁定（metadata 发现 vault/package + file-coordinated direct package-internal enumeration + `NSFileVersion` 暴露冲突面 + per-device immutable cursor）。B14 已由用户于 2026-06-07 批准；剩余项作为交付 gate：

| # | 最小验证项 | 当前态 |
|---|---|---|
| 1 | **segment-file-count scale 10K / 50K / 100K**：write_ms + direct-enumeration_ms + synced-segment-file-count；断言 N 个 logical op 不产 ~N 个 synced segment | repo-local macOS verifier passed 10K / 50K / 100K direct enumeration (`22.53ms` / `124.70ms` / `269.50ms` enum); package-internal metadata stayed 0; non-macOS large-scale delivery not run |
| 2 | **remote `.icloud` placeholder download**：驱逐 package-internal segment 成真 placeholder 再 `startDownloadingUbiquitousItem` 到 `Current`（区别于本地/current；刻画 macOS `NSCocoaErrorDomain:4` 路径） | macOS package-internal evict/download attempted; both returned `NSCocoaErrorDomain:4`; true remote placeholder not proved |
| 3 | **signed-out / over-quota account states** | Blocked / not run |
| 4 | **product conflict-resolution policy**：对 `NSFileVersion` 冲突的 surfacing / preservation / resolution（绝不静默解决或丢弃 conflict version） | policy floor observed：surface / preserve / block / no-auto-resolve；explicit current-winner resolution mechanism observed with archive + post-read clean state；product UX/core integration and scale context remain open |
| 5 | **million-op replay / merge / compaction + steady-state segment budget**（signed-app 语境 + release `--ignored` 基准） | report-Observed core 面线性，未在 iCloud 语境重跑 |
| 6 | **local-only path-in-ubiquity 边界（D21/D21a）**：symlink / 外部卷 / security-scoped bookmark / signed-out | Blocked / not run |
| 7 | **non-macOS package-level metadata gather**（本轮 macOS-only gate 不覆盖） | Not run in this macOS-only gate |
| 8 | **repo-local signed Anchor product app target + 全 Anchor-target iCloud runtime** | Product target not run; repo-local verifier-only macOS target builds and runtime pass |
| 9 | **用户确认 B14**（sync 路线作首期产品选择，plan §13 stop condition） | approved 2026-06-07 |

**no-go 转 CloudKit / 中立 object-store**（B14）。若实测 N 个 logical op → ~N 个 synced segment，则 batching/compaction 设计失效（不是 transport 选择失效），须重设 batching。

---

## 7. 边界干净度（core deterministic vs Apple verifier）

**干净，live 复跑确认。**

- **core 零云符号：** `rg`（云/文件协调/ubiquity/account token）over `suites/anchor/core` = 0 matches, exit 1。
- **Apple 类型零泄漏：** core 内唯一 Apple 相关命中是 `src/lib.rs` 描述性边界注释，无任何 Apple/Swift 类型 import/使用。
- **Swift 侧零确定性语义：** `rg`（diff3/order-key/merge/normaliz/op-creation/tree-invariant/canonical_serialize/blake3）over `suites/anchor/apple` = 0 matches。merge/normalization/op-creation/diff3/order-key/tree-invariant 仅在 core。
- **sync 边界单向 id+字节：** `OpSyncPort` 仅 `SegmentId`/`BlobId` + `&[u8]`，`associated type Error` 让 adapter 用自有 typed error 而不向 core 泄漏类型。
- **单向交接：** core 经 `16-codex-apple-input.md` 提供 DTO/dispatch/`SegmentId` 真值约定，Codex/Apple adapter 消费；时钟/熵（`op_id` / HLC）由 Swift 传入 core，core 永不自取（D36）。
- **workspace 边界：** `members=["core"]`；`apple/ffi`（staticlib）与 `apple/uniffi`（staticlib+cdylib）是 **非 member** wrapper crate（显式 `--manifest-path` 构建），故 `apple/` 内合法 Apple 类型不破坏 core 红线，wasm32+android gate 不被污染。

---

## 8. Decision-file sync status

| 文件 | 角色 | 状态 | 本轮动作 |
|---|---|---|---|
| `11-cp-0-final.md` | decision-contract（CP-0 索引） | **已同步** | §4 / §6 作为 Stage 1 后当前入口：B4 approved binding product boundary、TextKit mechanism、B14 default transport approval、core gate 与剩余 open gates 对齐 |
| `10-cp-0-approval.md` | approval-surface | **已同步** | 保留 CP-0 批准事实；A2/B4 更新为 approved binding product boundary；B14 更新为 approved default transport with compromise constraints |
| `05-key-decisions.md` | decision-contract | **已同步** | D01 B4 approved binding product boundary + typed `ValidationError` + release-surface evidence；D06/D35 macOS 10K/50K/100K direct enumeration evidence；保留 placeholder/account/conflict/steady-state budget gates |
| `04-contract-baseline.md` | decision-contract | **已同步** | Binding / sync baseline 吸收 typed error、C ABI bytes fast path、iCloud direct-enumeration compromise |
| `12-stage-1-spike-plan.md` | brief/plan | **已同步** | Stage 1 observed items 与 remaining product gates 分离；不把 product runtime / CI / default transport 当已批准 |
| `13-stage-1-entry-brief.md` | brief | **已同步** | 已反映 Stage 1 binding/iCloud/TextKit 当前状态 |
| `06-fixture-set.md` | decision-contract | synced | F23/F26/F42/F43 Stage 1 回填一致，无改 |
| `09-apple-verification.md` | **evidence-record**（cp-0-final 索引：现实核验证据） | leave-as-is | clause-correction 发现叙述属于验证内容，不作为当前决策契约改写 |
| `03-research-notes.md` | **evidence-record**（早期调研原始记录，非批准面） | leave-as-is | 其 gate-resolution / 时序推理叙述是研究记录 → 不改 |
| `08-codex-verification-packet.md` | **evidence-record**（Codex 验证原始记录，非批准面） | leave-as-is | 其 clause-correction 指令叙述是原始记录 → 不改 |

> **分类规则（决定性）：** 长期决策文档 / 批准面只写当前目标态与责任边界；evidence-record / 原始记录 / research-notes 合法地记录跨时间的发现与推理，其过程叙述是**内容**、不得抹除。`11-cp-0-final.md` 索引对「证据 vs 决策」的归类为权威。

---

## 9. Remaining work

**Stage 1 current state:** Core side complete（74 测试、多目标 gate、边界干净）；B4 binding 产品边界、TextKit mechanism evidence、B14 默认 transport 均已进入当前基线。CP-1 整体退出仍依赖后续 Codex/Apple implementation gates，非 core deterministic 工作。

**精确命令 / 环境 / stop condition：**

- **Env：** macOS + Xcode 26.5 (17F42)、Swift 6.3.2、rustc/cargo 1.95.0；`aarch64-apple-darwin` target 已装；付费 ADP team（已开通，apple-verification §2.6）+ signed macOS verifier app + 真实 iCloud account；构建产物落 `/tmp/anchor-apple-stage1`（**repo 外**）；probe 只在 `suites/anchor/apple/**`（Option A）；repo-local verifier project 为 `suites/anchor/apple/AnchorMacICloudProbe/AnchorMacICloudProbe.xcodeproj`，project provenance 见 §2；root `package.json` / `bun.lock` / workspace config / `suites/anchor/core` / `suites/anchor/Cargo.toml` **不得改**。
- **命令骨架：**
  - iCloud scale：在真实 account 写 + file-coordinated direct-enumerate package-internal `.seg` 于 10_000 / 50_000 / 100_000，记 `write_ms` + `enumeration_ms` + synced-segment-file-count（断言 N op 不产 ~N segment）。
  - remote placeholder：驱逐 package-internal segment 成真 `.icloud` placeholder，再 `startDownloadingUbiquitousItem` 到 `Current`（刻画 macOS `NSCocoaErrorDomain:4`）。
  - account states：signed-out 与 over-quota 下重跑 ubiquity/`NSFileCoordinator` probe，记 adapter 行为。
  - conflict policy：扩展 offline-fork probe，跑一条 surfacing/preservation/resolution 路径（绝不静默解决 `NSFileVersion` 冲突）。
  - `cargo test --release --manifest-path suites/anchor/Cargo.toml -- --ignored scale_bench::replay_cost_curve`（million-op replay 线性，确认 1.25M+ ≈2.1µs/op + compaction 后稳态 segment budget）。
  - TextKit 产品 runtime：IME marked-text commit / accessibility range / hit-testing on rendered geometry / direct-buffer undo 抑制 / keyboard→`EditorIntent` / `EditorPatch` replay over splitting/moving views；UTF-16 内部单位换算稳定性（emoji/ZWJ/combining/CRLF/IME fixture，D18）。
  - Binding release 输入：typed `ValidationError` enum 已落地并冻结；generated UniFFI Swift 的 synchronous strict-concurrency release smoke 与三 slice XCFramework packaging 已观察；wrapper binary package 机制下限已观察；UniFFI generated async macOS+iOS-sim+iPhoneOS-arm64 机制下限已观察；SwiftPM checksum mechanism 已观察；hosted/fresh-runner verifier artifact reproduction 已观察；artifact provenance policy floor 已观察；剩余 gate 是 signed app-bundle/device runtime integration、actual Developer ID notarization/App Store distribution 与 real release upload/distribution channel。
- **Stop condition：** 出现以下任一即暂停重评——(a) 须改 root workspace/`package.json`/`bun.lock`/lockfile 或加 placeholder `package.json`；(b) 在 Swift/TextKit 复制 core 确定性语义；(c) iCloud transport 依赖 package-internal `NSMetadataQuery`、静默处理 unresolved `NSFileVersion` conflict，或绕过 placeholder/account-state gates；(d) iCloud-Drive 路径引入 CloudKit schema / CKSyncEngine；(e) 公开 CLI schema 变更；(f) 把 Apple probe 变产品 app shell；(g) `anchor-core` 获任何 Apple 云/文件协调/account/ubiquity 类型（重跑 0-match 云符号 + Apple 类型审计，要求 exit 1）。另：scale 出现 N op→~N segment 的 no-go，使 batching/compaction 设计失效（非 transport 选择失效），须停。

---

## 10. Commit status

B4 binding approval and B14 default transport approval are recorded in the current decision docs. Repo-local Apple edits are limited to the verifier-only macOS Xcode project under `suites/anchor/apple/AnchorMacICloudProbe`; product app target, root workspace, lockfile, and `Cargo.toml` membership remain unchanged. Future edits must not imply CP-1 overall exit or iCloud transport delivery gates are complete.

---

## 11. Stop-condition check（本轮）

| Stop condition | 触发 |
|---|---|
| 改 root workspace / package / lockfile | 否（`members=["core"]`、root 配置未动） |
| Swift/TextKit 复制 core 确定性语义 | 否（`apple/` 零确定性语义 grep） |
| 绕过 B14 compromise constraints 发布 iCloud transport | 否（transport approved; delivery gates preserved） |
| CloudKit schema / CKSyncEngine | 否 |
| 公开 CLI schema 变更 | 否 |
| Apple probe 变产品 app shell | 否（SwiftPM probe + repo-external 签名 probe + repo-local verifier-only macOS Xcode project；无产品 app target） |
| `anchor-core` 泄漏 Apple 云/文件协调类型 | 否（0 matches, exit 1） |

**全部未触发。**

---

## 12. Progress ledger update — 2026-06-10

本节追加 `22-apple-verifier-rerun-report.md` 的 ledger 状态。`21` 的原始 CP-1 synthesis 结论仍成立：CP-1 core side complete；Apple half 仍 release / delivery gated；CP-1 whole-exit 未退出。

### 12.1 Axis matrix after doc 22

| Axis | Verdict |
|---|---|
| core deterministic（groups 1+5） | **go**（unchanged） |
| multi-target compile | **go**（unchanged） |
| zero-cloud-symbol boundary | **go**（live audit rerun: 0 matches, exit 1） |
| binding（B4） | **approved boundary / release-gated**（unchanged） |
| TextKit（group 3 runtime） | **compromise / mechanism-only**（unchanged） |
| iCloud Drive（B14） | **approved default transport WITH compromise constraints**（macOS verifier rerun passed; iOS/non-macOS runtime still open） |
| layout / retention | **compromise**（unchanged） |
| cross-target execution CI | **not run**（unchanged） |
| **CP-1 whole-exit** | **未退出 (NOT exited)** |

### 12.2 Open-gate checklist after doc 22

| Gate | Status | Evidence pointer |
|---|---|---|
| repo-local signed macOS verifier reproducibility | closed / rerun passed | `22 §3.2`–`§3.4` |
| macOS 10K direct package-internal enumeration | closed / rerun passed | `22 §3.4` |
| remote `.icloud` placeholder download | open | `22 §3.3`: package-internal path still returns `NSCocoaErrorDomain Code=4`; true remote placeholder not proved |
| non-macOS / iOS Simulator iCloud runtime | open | `22 §3.5`: executable lacks app entitlement; hand-built ad-hoc simulator app launch denied |
| signed-out / over-quota account states | open / not run | unchanged |
| product conflict-resolution policy | open / not run | unchanged |
| binding async `Sendable`, wrapper surface, fresh-machine/CI repro | open / not run | unchanged |
| TextKit product-runtime gates | open / not run | unchanged |
| cross-target execution CI wiring | open / not run | unchanged |

### Ledger entry — 2026-06-10 — iteration 1 — doc 22-apple-verifier-rerun-report.md

- **Checkpoint / cursor:** CP-1 Apple half.
- **Action selected:** rerun repo-local signed macOS iCloud verifier; test minimal iOS Simulator iCloud feasibility.
- **Owner classification:** Apple-runtime → executed here with explicit `DEVELOPER_DIR`; iOS Simulator proof remains pending Xcode-managed app target.
- **Scope-fence check:** passed — no root workspace / lockfile / core changes; no product app shell.
- **Evidence (Observed = command + output):**
  - `xcodebuild ... AnchorMacICloudProbe ... build` → `** BUILD SUCCEEDED **`, Xcode-managed profile `3f0476f1-ba42-404e-be20-945e7cec4a7f`.
  - `codesign -d --entitlements :- ... AnchorMacICloudProbe.app` → CloudDocuments + `<ICLOUD_CONTAINER>`.
  - `... AnchorMacICloudProbe --icloud-runtime-probe` → explicit/implicit non-nil, coordinated equality true, metadata segment count 0, placeholder Code=4.
  - `... AnchorMacICloudProbe --icloud-scale-probe 10000` → direct count 10000, enum `24.46ms`, metadata count 0.
  - `simctl spawn ... ios-sim-icloud-probe` → explicit/implicit nil because no app entitlement.
  - `simctl launch ... dev.plimeor.AnchorIOSSimICloudProbe` → denied by SpringBoard; log reported launch failed / entitlement recognition not valid.
  - core cloud-symbol audit → 0 matches, exit 1.
- **Gates closed this iteration:** none new; macOS verifier reproducibility strengthened only.
- **Gates still open:** iOS/non-macOS iCloud runtime, remote placeholder, signed-out/over-quota, product conflict policy, TextKit product runtime, binding release gates, cross-target execution CI.
- **Backfill to 04/05/06:** none.
- **Axis matrix delta:** unchanged.
- **Gate evaluation:** CONTINUE — next action: use Xcode-managed iOS app target / project for simulator iCloud runtime, or wire cross-target execution CI if iOS project creation is deferred.
- **New doc:** `docs/workbench/20260606-anchor-v1/22-apple-verifier-rerun-report.md`

---

## 13. Progress ledger update — 2026-06-10 — iOS Simulator CloudDocuments

本节追加 `23-ios-simulator-icloud-report.md` 的 ledger 状态。`21` 的原始 CP-1 synthesis 结论仍成立：CP-1 core side complete；Apple half 仍 release / delivery gated；CP-1 whole-exit 未退出。

### 13.1 Axis matrix after doc 23

| Axis | Verdict |
|---|---|
| core deterministic（groups 1+5） | **go**（unchanged） |
| multi-target compile | **go**（unchanged） |
| zero-cloud-symbol boundary | **go**（unchanged） |
| binding（B4） | **approved boundary / release-gated**（unchanged） |
| TextKit（group 3 runtime） | **compromise / mechanism-only**（unchanged） |
| iCloud Drive（B14） | **approved default transport WITH compromise constraints**（macOS verifier remains active evidence; iOS Simulator CloudDocuments runtime failed with `BRCloudDocsErrorDomain:153` / `iCloud Drive not supported`） |
| layout / retention | **compromise**（unchanged） |
| cross-target execution CI | **not run**（unchanged） |
| **CP-1 whole-exit** | **未退出 (NOT exited)** |

### 13.2 Open-gate checklist after doc 23

| Gate | Status | Evidence pointer |
|---|---|---|
| repo-local signed macOS verifier reproducibility | closed / rerun passed | `22 §3.2`–`§3.4` |
| macOS 10K direct package-internal enumeration | closed / rerun passed | `22 §3.4` |
| Xcode-managed iOS Simulator build/install/launch | closed as launch-chain evidence | `23 §3.2`–`§3.4` |
| iOS Simulator CloudDocuments runtime | **open / failed** | `23 §3.4`–`§3.5`: explicit/implicit ubiquity container nil; `bird` says iCloud Drive not supported |
| remote `.icloud` placeholder download | open | unchanged |
| signed-out / over-quota account states | open / not run | unchanged |
| product conflict-resolution policy | open / not run | unchanged |
| binding async `Sendable`, wrapper surface, fresh-machine/CI repro | open / not run | unchanged |
| TextKit product-runtime gates | open / not run | unchanged |
| cross-target execution CI wiring | open / not run | unchanged |

### Ledger entry — 2026-06-10 — iteration 2 — doc 23-ios-simulator-icloud-report.md

- **Checkpoint / cursor:** CP-1 Apple half.
- **Action selected:** use Xcode-managed iOS app target / project for simulator iCloud runtime.
- **Owner classification:** Apple-runtime → executed here with existing repo-external Xcode project and explicit `DEVELOPER_DIR`; XcodeBuildMCP defaults were configured but its tool environment could not resolve `simctl`.
- **Scope-fence check:** passed — no root workspace / lockfile / core changes; no repo product app shell.
- **Evidence (Observed = command + output):**
  - `xcodebuild -list -project /Users/plimeor/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj` → target/scheme `AnchorProvisionProbe`.
  - `xcodebuild -showdestinations ... -scheme AnchorProvisionProbe` → iOS Simulator destination `A1D90DAB-1FAC-413A-BCB4-F92B9F798F75`, iPhone 17, iOS 26.5.
  - `xcrun simctl list devices available` → same simulator booted.
  - `xcodebuild ... -destination 'platform=iOS Simulator,id=A1D90DAB-1FAC-413A-BCB4-F92B9F798F75' ... build` → `** BUILD SUCCEEDED **`.
  - generated simulator xcent / Mach-O section → CloudDocuments + `<ICLOUD_CONTAINER>` entitlement keys observed.
  - `simctl install ... AnchorProvisionProbe.app` → exit 0.
  - `simctl launch --console ... dev.plimeor.AnchorProvisionProbe --icloud-runtime-probe` → `explicit_nil=true`, `implicit_nil=true`, `blocked=no_ubiquity_container`.
  - simulator `log show` for `bird` → `BRCloudDocsErrorDomain:153`, `Returning error because iCloud Drive not supported`.
- **Gates closed this iteration:** Xcode-managed iOS Simulator build/install/launch chain only.
- **Gates still open:** iOS/non-macOS CloudDocuments runtime, remote placeholder, signed-out/over-quota, product conflict policy, TextKit product runtime, binding release gates, cross-target execution CI.
- **Backfill to 04/05/06:** none.
- **Axis matrix delta:** iOS Simulator account assumption narrowed; simulator launch-chain evidence improved, but iOS CloudDocuments gate remains open.
- **Gate evaluation:** CONTINUE — next action should move to another CP-1 open gate, or use a real signed iOS device if iOS/non-macOS CloudDocuments evidence is required before exit.
- **New doc:** `docs/workbench/20260606-anchor-v1/23-ios-simulator-icloud-report.md`

---

## 14. Progress ledger update — 2026-06-10 — cross-target execution vectors

本节追加 `24-cross-target-execution-report.md` 的 ledger 状态。`21` 的原始 CP-1 synthesis 结论仍成立：CP-1 core side complete；Apple half 仍 release / delivery gated；CP-1 whole-exit 未退出。

### 14.1 Axis matrix after doc 24

| Axis | Verdict |
|---|---|
| core deterministic（groups 1+5） | **go**（native vector test still passed） |
| multi-target compile | **go**（unchanged） |
| zero-cloud-symbol boundary | **go**（live audit rerun: 0 matches, exit 1） |
| binding（B4） | **approved boundary / release-gated**（unchanged） |
| TextKit（group 3 runtime） | **compromise / mechanism-only**（unchanged） |
| iCloud Drive（B14） | **approved default transport WITH compromise constraints**（unchanged after doc 23） |
| layout / retention | **compromise**（unchanged） |
| cross-target execution CI | **partially closed** — native + wasm + iOS Simulator execution observed; persistent CI wiring and android execution remain open |
| **CP-1 whole-exit** | **未退出 (NOT exited)** |

### 14.2 Open-gate checklist after doc 24

| Gate | Status | Evidence pointer |
|---|---|---|
| native golden vector execution | closed / passed | `24 §3.1` |
| wasm golden vector execution | closed / passed through Node WebAssembly runtime | `24 §3.3`–`§3.4` |
| iOS Simulator slice golden vector execution | closed / passed through `simctl spawn` | `24 §3.5`–`§3.6` |
| persistent cross-target CI wiring | open | `24 §4`: harness is still under `/tmp`, not repo-enforced |
| android execution | open / not run | unchanged |
| repo-local signed macOS verifier reproducibility | closed / rerun passed | `22 §3.2`–`§3.4` |
| Xcode-managed iOS Simulator build/install/launch | closed as launch-chain evidence | `23 §3.2`–`§3.4` |
| iOS Simulator CloudDocuments runtime | open / failed | `23 §3.4`–`§3.5` |
| remote `.icloud` placeholder download | open | unchanged |
| signed-out / over-quota account states | open / not run | unchanged |
| product conflict-resolution policy | open / not run | unchanged |
| binding async `Sendable`, wrapper surface, fresh-machine/CI repro | open / not run | unchanged |
| TextKit product-runtime gates | open / not run | unchanged |

### Ledger entry — 2026-06-10 — iteration 3 — doc 24-cross-target-execution-report.md

- **Checkpoint / cursor:** CP-1 Apple half plus machine gate cross-target execution.
- **Action selected:** execute deterministic golden vectors on native, wasm, and iOS Simulator slice.
- **Owner classification:** core-deterministic machine gate → executed here; harness artifacts kept under `/tmp/anchor-apple-stage1/**`.
- **Scope-fence check:** passed — no root workspace / lockfile / core source changes; no repo product app shell; no public CLI schema; no Swift/TextKit deterministic implementation.
- **Evidence (Observed = command + output):**
  - `cargo test -p anchor-core --test determinism_vectors` → 6 passed, 0 failed.
  - `wasmtime --version` → command not found; Node WebAssembly runtime used for this iteration.
  - `cargo build --release --target wasm32-unknown-unknown --manifest-path /tmp/anchor-apple-stage1/wasm-vector-harness/Cargo.toml` → `Finished`.
  - Node instantiated `/tmp/.../anchor_wasm_vector_harness.wasm` and called `anchor_wasm_vector_status()` → `anchor_wasm_vector_status=0`.
  - `cargo build --release --target aarch64-apple-ios-sim --manifest-path /tmp/anchor-apple-stage1/ios-vector-harness/Cargo.toml` → `Finished`.
  - `xcrun simctl spawn A1D90DAB-1FAC-413A-BCB4-F92B9F798F75 /tmp/.../anchor-ios-vector-harness` → `anchor_ios_vector_status=0`.
  - core cloud-symbol audit → 0 matches, exit 1.
  - Apple deterministic-semantics audit → 0 matches, exit 1.
- **Gates closed this iteration:** native/wasm/iOS Simulator execution evidence for golden vectors.
- **Gates still open:** persistent cross-target CI wiring, android execution, iOS/non-macOS CloudDocuments runtime, remote placeholder, signed-out/over-quota, product conflict policy, TextKit product runtime, binding release gates.
- **Backfill to 04/05/06:** none.
- **Axis matrix delta:** cross-target execution CI: `not run` → `partially closed`.
- **Gate evaluation:** CONTINUE — next machine gate can persist cross-target execution harness as repo-local CI wiring if that can be done without root workspace / lockfile / package-boundary changes; otherwise move to another Apple verifier gate.
- **New doc:** `docs/workbench/20260606-anchor-v1/24-cross-target-execution-report.md`

---

## 15. Progress ledger update — 2026-06-10 — repo-local cross-target runner

本节追加 `25-cross-target-runner-report.md` 的 ledger 状态。`21` 的原始 CP-1 synthesis 结论仍成立：CP-1 core side complete；Apple half 仍 release / delivery gated；CP-1 whole-exit 未退出。

### 15.1 Axis matrix after doc 25

| Axis | Verdict |
|---|---|
| core deterministic（groups 1+5） | **go**（native vector runner passed） |
| multi-target compile | **go**（unchanged） |
| zero-cloud-symbol boundary | **go**（live audit rerun: 0 matches, exit 1） |
| binding（B4） | **approved boundary / release-gated**（unchanged） |
| TextKit（group 3 runtime） | **compromise / mechanism-only**（unchanged） |
| iCloud Drive（B14） | **approved default transport WITH compromise constraints**（unchanged after doc 23） |
| layout / retention | **compromise**（unchanged） |
| cross-target execution CI | **mostly closed locally** — repo-local runner now executes native + wasm + iOS Simulator vectors; android execution and hosted CI integration remain open |
| **CP-1 whole-exit** | **未退出 (NOT exited)** |

### 15.2 Open-gate checklist after doc 25

| Gate | Status | Evidence pointer |
|---|---|---|
| native golden vector execution | closed / repo-local runner | `25 §3.1` |
| wasm golden vector execution | closed / repo-local runner using Node WebAssembly | `25 §3.1` |
| iOS Simulator slice golden vector execution | closed / repo-local runner using `simctl spawn` | `25 §3.1` |
| repo-local cross-target runner persistence | closed | `25 §1`, `25 §3.1` |
| android execution | open / not run | `25 §4` |
| hosted CI workflow integration | open / not added | `25 §4` |
| repo-local signed macOS verifier reproducibility | closed / rerun passed | `22 §3.2`–`§3.4` |
| Xcode-managed iOS Simulator build/install/launch | closed as launch-chain evidence | `23 §3.2`–`§3.4` |
| iOS Simulator CloudDocuments runtime | open / failed | `23 §3.4`–`§3.5` |
| remote `.icloud` placeholder download | open | unchanged |
| signed-out / over-quota account states | open / not run | unchanged |
| product conflict-resolution policy | open / not run | unchanged |
| binding async `Sendable`, wrapper surface, fresh-machine/CI repro | open / not run | unchanged |
| TextKit product-runtime gates | open / not run | unchanged |

### Ledger entry — 2026-06-10 — iteration 4 — doc 25-cross-target-runner-report.md

- **Checkpoint / cursor:** CP-1 machine gate cross-target execution.
- **Action selected:** persist cross-target golden-vector execution as a repo-local runner without root workspace / lockfile / package-boundary changes.
- **Owner classification:** core-deterministic machine gate → executed here.
- **Scope-fence check:** passed — no root workspace / lockfile / workspace member changes; no `suites/anchor/core/src/**` production source change; no repo product app shell; no public CLI schema.
- **Evidence (Observed = command + output):**
  - Added `suites/anchor/core/tests/cross_target_vector_harness.rs`.
  - Added `suites/anchor/core/tests/run-cross-target-vectors.sh`.
  - `ANCHOR_IOS_SIMULATOR_ID=A1D90DAB-1FAC-413A-BCB4-F92B9F798F75 bash suites/anchor/core/tests/run-cross-target-vectors.sh` → native 6 passed; `anchor_wasm_vector_status=0`; `anchor_ios_vector_status=0`.
  - `bash -n suites/anchor/core/tests/run-cross-target-vectors.sh` → exit 0.
  - core cloud-symbol audit → 0 matches, exit 1.
  - Apple deterministic-semantics audit → 0 matches, exit 1.
  - `git diff --check` → exit 0.
- **Gates closed this iteration:** repo-local native/wasm/iOS Simulator cross-target runner.
- **Gates still open:** android execution, hosted CI integration, iOS/non-macOS CloudDocuments runtime, remote placeholder, signed-out/over-quota, product conflict policy, TextKit product runtime, binding release gates.
- **Backfill to 04/05/06:** none.
- **Axis matrix delta:** cross-target execution CI: `partially closed` → `mostly closed locally`.
- **Gate evaluation:** CONTINUE — next action should move to another open CP-1 gate unless an android execution path can be closed without root workspace / lockfile changes.
- **New doc:** `docs/workbench/20260606-anchor-v1/25-cross-target-runner-report.md`

---

## 16. Progress ledger update — 2026-06-10 — iCloud conflict policy floor

本节追加 `26-icloud-conflict-policy-floor-report.md` 的 ledger 状态。`21` 的原始 CP-1 synthesis 结论仍成立：CP-1 core side complete；Apple half 仍 release / delivery gated；CP-1 whole-exit 未退出。

### 16.1 Axis matrix after doc 26

| Axis | Verdict |
|---|---|
| core deterministic（groups 1+5） | **go**（unchanged） |
| multi-target compile | **go**（unchanged） |
| zero-cloud-symbol boundary | **go**（unchanged） |
| binding（B4） | **approved boundary / release-gated**（unchanged） |
| TextKit（group 3 runtime） | **compromise / mechanism-only**（unchanged） |
| iCloud Drive（B14） | **approved default transport WITH compromise constraints** — conflict policy floor closed; destructive/user-resolution execution remains open |
| layout / retention | **compromise** — manifest conflict surfaces now block frontier / GC / cursor advancement |
| cross-target execution CI | **mostly closed locally** — native + wasm + iOS Simulator runner observed; android execution and hosted CI integration remain open |
| **CP-1 whole-exit** | **未退出 (NOT exited)** |

### 16.2 Open-gate checklist after doc 26

| Gate | Status | Evidence pointer |
|---|---|---|
| native/wasm/iOS Simulator cross-target runner | closed locally | `25 §3.1` |
| repo-local signed macOS verifier reproducibility | closed / rerun passed | `22 §3.2`–`§3.4` |
| Xcode-managed iOS Simulator build/install/launch | closed as launch-chain evidence | `23 §3.2`–`§3.4` |
| conflict surfacing / preservation / blocking floor | closed | `26 §3.3`–`§4` |
| destructive/user-resolution execution for iCloud manifest conflict | open / not run | `26 §5` |
| iOS Simulator CloudDocuments runtime | open / failed | `23 §3.4`–`§3.5` |
| remote `.icloud` placeholder download | open | unchanged |
| signed-out / over-quota account states | open / not run | unchanged |
| iOS/non-macOS CloudDocuments delivery beyond simulator launch | open | unchanged |
| android execution | open / not run | `25 §4` |
| hosted CI workflow integration | open / not added | `25 §4` |
| binding async `Sendable`, wrapper surface, fresh-machine/CI repro | open / not run | unchanged |
| TextKit product-runtime gates | open / not run | unchanged |

### Ledger entry — 2026-06-10 — iteration 5 — doc 26-icloud-conflict-policy-floor-report.md

- **Checkpoint / cursor:** CP-1 Apple half, iCloud delivery gate.
- **Action selected:** add and run a read-only macOS verifier command that surfaces manifest conflict branches and returns the minimum adapter policy floor.
- **Owner classification:** Apple-runtime / verifier → executed here with repo-local signed macOS verifier and explicit `DEVELOPER_DIR`.
- **Scope-fence check:** passed — no root workspace / lockfile / `suites/anchor/core/src/**` production source changes; no product app shell; no public conflict/resolve CLI schema.
- **Evidence (Observed = command + output):**
  - Added `--icloud-conflict-policy-probe <runID>` to `suites/anchor/apple/AnchorMacICloudProbe/AnchorMacICloudProbe/ICloudRuntimeProbe.swift`.
  - `find "$HOME/Library/Mobile Documents/iCloud~dev~plimeor~AnchorProvisionProbe" -maxdepth 6 -path '*AnchorConflictProbe*'` → historical offline-conflict run contains `manifest.json` and `manifest 2.json`.
  - Python read of `manifest*.json` → `manifest.json` writer `ios-offline`; `manifest 2.json` writer `ios-base`.
  - `xcodebuild ... AnchorMacICloudProbe ... build` → `** BUILD SUCCEEDED **`.
  - `AnchorMacICloudProbe --icloud-conflict-policy-probe offline-conflict-20260607T113449Z` → explicit/implicit ubiquity non-nil; current writer `ios-offline`; unresolved conflict version writer `mac-online`; duplicate manifest writer `ios-base`; `adapter_status=blocked_manifest_conflict`; `policy_surface_conflicts=true`; `policy_preserve_versions=true`; `policy_auto_resolve=false`; `resolution_executed=false`.
- **Gates closed this iteration:** conflict surfacing / preservation / blocking floor; duplicate manifest detection.
- **Gates still open:** destructive/user-resolution execution, remote placeholder, signed-out/over-quota, iOS/non-macOS CloudDocuments runtime/delivery, TextKit product runtime, binding release gates, android execution, hosted CI integration.
- **Backfill to 04/05/06:** `04-contract-baseline.md` iCloud baseline; `05-key-decisions.md` D14 and D35.
- **Axis matrix delta:** iCloud Drive conflict policy: `open` → `policy floor closed; destructive resolution open`.
- **Gate evaluation:** CONTINUE — next action should target remote placeholder/account-state/iOS delivery/TextKit/binding gates, or stop if a destructive iCloud account operation would be required.
- **New doc:** `docs/workbench/20260606-anchor-v1/26-icloud-conflict-policy-floor-report.md`

---

## 17. Progress ledger update — 2026-06-10 — TextKit runtime floor

本节追加 `27-textkit-runtime-floor-report.md` 的 ledger 状态。`21` 的原始 CP-1 synthesis 结论仍成立：CP-1 core side complete；Apple half 仍 release / delivery gated；CP-1 whole-exit 未退出。

### 17.1 Axis matrix after doc 27

| Axis | Verdict |
|---|---|
| core deterministic（groups 1+5） | **go**（unchanged） |
| multi-target compile | **go**（unchanged） |
| zero-cloud-symbol boundary | **go**（live audit rerun: 0 matches, exit 1） |
| binding（B4） | **approved boundary / release-gated**（unchanged） |
| TextKit（group 3 runtime） | **partial mechanism floor closed** — macOS IME marked-text / hit-testing / controlled direct-buffer undo suppression observed; full product runtime remains open |
| iCloud Drive（B14） | **approved default transport WITH compromise constraints** — unchanged after doc 26 |
| layout / retention | **compromise**（unchanged） |
| cross-target execution CI | **mostly closed locally** — native + wasm + iOS Simulator runner observed; android execution and hosted CI integration remain open |
| **CP-1 whole-exit** | **未退出 (NOT exited)** |

### 17.2 Open-gate checklist after doc 27

| Gate | Status | Evidence pointer |
|---|---|---|
| native/wasm/iOS Simulator cross-target runner | closed locally | `25 §3.1` |
| repo-local signed macOS verifier reproducibility | closed / rerun passed | `22 §3.2`–`§3.4` |
| Xcode-managed iOS Simulator build/install/launch | closed as launch-chain evidence | `23 §3.2`–`§3.4` |
| conflict surfacing / preservation / blocking floor | closed | `26 §3.3`–`§4` |
| macOS IME marked-text commit mapping | closed as mechanism floor | `27 §3.1` |
| macOS hit-testing insertion index | closed as mechanism floor | `27 §3.1` |
| macOS controlled direct-buffer undo suppression | closed as controlled probe floor | `27 §3.1` |
| iOS Simulator TextKit compile surface | closed | `27 §3.2` |
| real app responder-chain undo suppression | open / not run | `27 §4` |
| keyboard event capture → `EditorIntent` | open / not run | `27 §4` |
| accessibility range mapping | open / not run | `27 §4` |
| `EditorPatch` replay over splitting/moving views | open / not run | `27 §4` |
| `UITextView` runtime IME/accessibility behavior | open / not run | `27 §4` |
| destructive/user-resolution execution for iCloud manifest conflict | open / not run | `26 §5` |
| iOS Simulator CloudDocuments runtime | open / failed | `23 §3.4`–`§3.5` |
| remote `.icloud` placeholder download | open | unchanged |
| signed-out / over-quota account states | open / not run | unchanged |
| iOS/non-macOS CloudDocuments delivery beyond simulator launch | open | unchanged |
| android execution | open / not run | `25 §4` |
| hosted CI workflow integration | open / not added | `25 §4` |
| binding async `Sendable`, wrapper surface, fresh-machine/CI repro | open / not run | unchanged |

### Ledger entry — 2026-06-10 — iteration 6 — doc 27-textkit-runtime-floor-report.md

- **Checkpoint / cursor:** CP-1 Apple half, TextKit product-runtime gate.
- **Action selected:** add and run macOS `NSTextView` runtime probes for IME marked-text commit, hit-testing, and controlled direct-buffer undo suppression; verify iOS Simulator compile surface.
- **Owner classification:** Apple-runtime / verifier → executed here through SwiftPM and Xcode build.
- **Scope-fence check:** passed — no root workspace / lockfile / `suites/anchor/core/src/**` production source changes; no product app shell; no Swift/TextKit deterministic semantics.
- **Evidence (Observed = command + output):**
  - Added `MarkedTextCommitProbeResult` and macOS runtime probe methods in `AnchorTextKitProbe.swift`.
  - `ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-darwin/release swift run --package-path suites/anchor/apple/AnchorAppleSpike --scratch-path /tmp/anchor-apple-stage1/swift-build-textkit-20260610 AnchorTextKitSmoke` → build complete; UTF-16 fixture counts observed; `textkit:ime_marked=true commit=A拼 intent_insert_at=1`; `textkit:hittest_index=1`; `textkit:direct_buffer_undo_suppressed=true`.
  - `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-ios-sim/release xcodebuild -scheme AnchorTextKitProbe -destination 'generic/platform=iOS Simulator' -configuration Debug -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/AnchorTextKitProbe-iossim-20260610 build` → `** BUILD SUCCEEDED **`.
  - core cloud-symbol audit → 0 matches, exit 1.
  - Apple deterministic-semantics audit → 0 matches, exit 1.
- **Gates closed this iteration:** macOS TextKit IME marked-text mechanism floor, hit-testing mechanism floor, controlled direct-buffer undo suppression floor, iOS Simulator TextKit compile surface.
- **Gates still open:** real app responder-chain undo suppression, keyboard event capture, accessibility range mapping, patch replay over splitting/moving views, `UITextView` runtime behavior, destructive iCloud conflict resolution, remote placeholder, signed-out/over-quota, iOS/non-macOS CloudDocuments runtime/delivery, binding release gates, android execution, hosted CI integration.
- **Backfill to 04/05/06:** `04-contract-baseline.md` TextKit baseline; `05-key-decisions.md` D18.
- **Axis matrix delta:** TextKit: `compromise / mechanism-only` → `partial mechanism floor closed; full product runtime open`.
- **Gate evaluation:** CONTINUE — next action should target binding release gates, account/placeholder iCloud gates, or a real product-runtime editor probe if it can remain verifier-only.
- **New doc:** `docs/workbench/20260606-anchor-v1/27-textkit-runtime-floor-report.md`

---

## 18. Progress ledger update — 2026-06-10 — binding async wrapper

本节追加 `28-binding-async-wrapper-report.md` 的 ledger 状态。`21` 的原始 CP-1 synthesis 结论仍成立：CP-1 core side complete；Apple half 仍 release / delivery gated；CP-1 whole-exit 未退出。

### 18.1 Axis matrix after doc 28

| Axis | Verdict |
|---|---|
| core deterministic（groups 1+5） | **go**（unchanged） |
| multi-target compile | **go**（unchanged） |
| zero-cloud-symbol boundary | **go**（live audit rerun: 0 matches, exit 1） |
| binding（B4） | **approved boundary / partially release-gated** — Swift wrapper actor async surface observed; UniFFI generated async, final DTO/error vocab, product import, fresh-machine/CI remain open |
| TextKit（group 3 runtime） | **partial mechanism floor closed** — unchanged after doc 27 |
| iCloud Drive（B14） | **approved default transport WITH compromise constraints** — unchanged after doc 26 |
| layout / retention | **compromise**（unchanged） |
| cross-target execution CI | **mostly closed locally** — native + wasm + iOS Simulator runner observed; android execution and hosted CI integration remain open |
| **CP-1 whole-exit** | **未退出 (NOT exited)** |

### 18.2 Open-gate checklist after doc 28

| Gate | Status | Evidence pointer |
|---|---|---|
| native/wasm/iOS Simulator cross-target runner | closed locally | `25 §3.1` |
| Swift wrapper actor async surface | closed as mechanism floor | `28 §3.2`–`§3.5` |
| Swift wrapper DTO/error `Sendable` conformance | closed as mechanism floor | `28 §3.3`–`§3.5` |
| macOS release strict-concurrency runtime | closed | `28 §3.3`–`§3.4` |
| iOS Simulator release strict-concurrency compile | closed | `28 §3.5` |
| UniFFI generated async surface | open / not run | `28 §4` |
| final production DTO/error vocabulary | open / not frozen | `28 §4` |
| product binary-target/import surface | open / not run | `28 §4` |
| fresh-machine/hosted CI reproduction | open / not run | unchanged |
| macOS IME marked-text / hit-testing / controlled undo floor | closed | `27 §3.1` |
| real app responder-chain undo / keyboard / accessibility / patch replay | open / not run | `27 §4` |
| conflict surfacing / preservation / blocking floor | closed | `26 §3.3`–`§4` |
| destructive/user-resolution execution for iCloud manifest conflict | open / not run | `26 §5` |
| iOS Simulator CloudDocuments runtime | open / failed | `23 §3.4`–`§3.5` |
| remote `.icloud` placeholder download | open | unchanged |
| signed-out / over-quota account states | open / not run | unchanged |
| iOS/non-macOS CloudDocuments delivery beyond simulator launch | open | unchanged |
| android execution | open / not run | `25 §4` |
| hosted CI workflow integration | open / not added | `25 §4` |

### Ledger entry — 2026-06-10 — iteration 7 — doc 28-binding-async-wrapper-report.md

- **Checkpoint / cursor:** CP-1 Apple half, binding release gate.
- **Action selected:** add and run a SwiftPM wrapper-level async/Sendable actor surface for the existing C ABI binding path.
- **Owner classification:** Apple binding / verifier → executed here through SwiftPM, Xcode build, and release runtime.
- **Scope-fence check:** passed — no root workspace / lockfile / `suites/anchor/core/src/**` production source changes; no `anchor-core` crate-type change; no product app shell; no Swift deterministic semantics.
- **Evidence (Observed = command + output):**
  - Added `Sendable` conformance to wrapper DTO/error types and `AnchorCoreClient` actor in `AnchorCoreBindings.swift`.
  - `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer CARGO_TARGET_DIR=/tmp/anchor-apple-stage1/ffi-target cargo build --manifest-path suites/anchor/apple/ffi/Cargo.toml --release --target aarch64-apple-darwin` → `Finished`.
  - `ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-darwin/release swift run --package-path suites/anchor/apple/AnchorAppleSpike --scratch-path /tmp/anchor-apple-stage1/swift-build-binding-async-20260610b AnchorAppleSmoke` → `async:sendable summary=3ef88671... changed=blk_a segment=979`.
  - `xcodebuild -scheme AnchorAppleSmoke ... OTHER_SWIFT_FLAGS='-strict-concurrency=complete -warnings-as-errors' build` → `** BUILD SUCCEEDED **`.
  - `/tmp/anchor-apple-stage1/DerivedData/AnchorAppleSmoke-async-strict-20260610/Build/Products/Release/AnchorAppleSmoke` → async wrapper output plus 64MB bytes bench passed.
  - `cargo build --manifest-path suites/anchor/apple/ffi/Cargo.toml --release --target aarch64-apple-ios-sim` → `Finished`.
  - `xcodebuild -scheme AnchorCoreBindings -destination 'generic/platform=iOS Simulator' ... OTHER_SWIFT_FLAGS='-strict-concurrency=complete -warnings-as-errors' build` → `** BUILD SUCCEEDED **`.
  - core cloud-symbol audit → 0 matches, exit 1.
  - Apple deterministic-semantics audit → 0 matches, exit 1.
- **Gates closed this iteration:** Swift wrapper actor async surface; Swift wrapper DTO/error `Sendable` mechanism floor; macOS release strict-concurrency runtime; iOS Simulator release strict-concurrency compile.
- **Gates still open:** UniFFI generated async surface, final DTO/error vocabulary freeze, product binary-target/import surface, fresh-machine/hosted CI repro, real app TextKit runtime, destructive iCloud conflict resolution, remote placeholder, signed-out/over-quota, iOS/non-macOS CloudDocuments runtime/delivery, android execution, hosted CI integration.
- **Backfill to 04/05/06:** `04-contract-baseline.md` Binding baseline; `05-key-decisions.md` D01.
- **Axis matrix delta:** binding: `approved boundary / release-gated` → `approved boundary / partially release-gated`.
- **Gate evaluation:** CONTINUE — next action should target final DTO/error vocabulary freeze, product import/fresh-machine evidence, android execution screening, or iCloud/account/placeholder gates.
- **New doc:** `docs/workbench/20260606-anchor-v1/28-binding-async-wrapper-report.md`

---

## 19. Progress ledger update — 2026-06-10 — binding external consumer

本节追加 `29-binding-external-consumer-report.md` 的 ledger 状态。`21` 的原始 CP-1 synthesis 结论仍成立：CP-1 core side complete；Apple half 仍 release / delivery gated；CP-1 whole-exit 未退出。

### 19.1 Axis matrix after doc 29

| Axis | Verdict |
|---|---|
| core deterministic（groups 1+5） | **go**（unchanged） |
| multi-target compile | **go**（unchanged） |
| zero-cloud-symbol boundary | **go**（live audit rerun: 0 matches, exit 1） |
| binding（B4） | **approved boundary / partially release-gated** — wrapper actor + repo-external SwiftPM path consumer observed; binary-target import, UniFFI generated async, final DTO/error vocab, fresh-machine/CI remain open |
| TextKit（group 3 runtime） | **partial mechanism floor closed** — unchanged after doc 27 |
| iCloud Drive（B14） | **approved default transport WITH compromise constraints** — unchanged after doc 26 |
| layout / retention | **compromise**（unchanged） |
| cross-target execution CI | **mostly closed locally** — native + wasm + iOS Simulator runner observed; android execution and hosted CI integration remain open |
| **CP-1 whole-exit** | **未退出 (NOT exited)** |

### 19.2 Open-gate checklist after doc 29

| Gate | Status | Evidence pointer |
|---|---|---|
| native/wasm/iOS Simulator cross-target runner | closed locally | `25 §3.1` |
| Swift wrapper actor async surface | closed as mechanism floor | `28 §3.2`–`§3.5` |
| repo-external SwiftPM path dependency consumer | closed as mechanism floor | `29 §3.1`–`§3.2` |
| external consumer release strict-concurrency run | closed | `29 §3.2` |
| binary-target import surface | open / not run | `29 §4` |
| UniFFI generated async surface | open / not run | `28 §4` |
| final production DTO/error vocabulary | open / not frozen | `28 §4` |
| fresh-machine/hosted CI reproduction | open / not run | unchanged |
| macOS IME marked-text / hit-testing / controlled undo floor | closed | `27 §3.1` |
| real app responder-chain undo / keyboard / accessibility / patch replay | open / not run | `27 §4` |
| conflict surfacing / preservation / blocking floor | closed | `26 §3.3`–`§4` |
| destructive/user-resolution execution for iCloud manifest conflict | open / not run | `26 §5` |
| iOS Simulator CloudDocuments runtime | open / failed | `23 §3.4`–`§3.5` |
| remote `.icloud` placeholder download | open | unchanged |
| signed-out / over-quota account states | open / not run | unchanged |
| iOS/non-macOS CloudDocuments delivery beyond simulator launch | open | unchanged |
| android execution | open / not run | `25 §4` |
| hosted CI workflow integration | open / not added | `25 §4` |

### Ledger entry — 2026-06-10 — iteration 8 — doc 29-binding-external-consumer-report.md

- **Checkpoint / cursor:** CP-1 Apple half, binding product import gate.
- **Action selected:** create a repo-external SwiftPM consumer under `/tmp/anchor-apple-stage1` and import `AnchorCoreBindings` through a path dependency.
- **Owner classification:** Apple binding / verifier → executed here through SwiftPM release strict-concurrency run.
- **Scope-fence check:** passed — no root workspace / lockfile / repo consumer package / `suites/anchor/core/src/**` production source changes; no `anchor-core` crate-type change; no product app shell.
- **Evidence (Observed = command + output):**
  - Added `/tmp/anchor-apple-stage1/binding-consumer/Package.swift` and `/tmp/anchor-apple-stage1/binding-consumer/Sources/BindingConsumer/main.swift` outside the repo.
  - `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-darwin/release swift run --package-path /tmp/anchor-apple-stage1/binding-consumer -c release -Xswiftc -strict-concurrency=complete -Xswiftc -warnings-as-errors BindingConsumer` → `Build of product 'BindingConsumer' complete!`; `consumer:async summary=3ef88671... changed=blk_a segment=979`.
  - core cloud-symbol audit → 0 matches, exit 1.
  - Apple deterministic-semantics audit → 0 matches, exit 1.
- **Gates closed this iteration:** repo-external SwiftPM path dependency import; external consumer release strict-concurrency run.
- **Gates still open:** binary-target import surface, UniFFI generated async surface, final DTO/error vocabulary freeze, fresh-machine/hosted CI repro, real app TextKit runtime, destructive iCloud conflict resolution, remote placeholder, signed-out/over-quota, iOS/non-macOS CloudDocuments runtime/delivery, android execution, hosted CI integration.
- **Backfill to 04/05/06:** `04-contract-baseline.md` Binding baseline; `05-key-decisions.md` D01.
- **Axis matrix delta:** binding remains `approved boundary / partially release-gated`; product import gate narrowed from not-run to path-consumer observed / binary-target open.
- **Gate evaluation:** CONTINUE — next action should target binary-target packaging, final DTO/error vocabulary, android execution screening, or iCloud/account/placeholder gates.
- **New doc:** `docs/workbench/20260606-anchor-v1/29-binding-external-consumer-report.md`

---

## 20. Progress ledger update — 2026-06-10 — binding binary target

本节追加 `30-binding-binary-target-report.md` 的 ledger 状态。`21` 的原始 CP-1 synthesis 结论仍成立：CP-1 core side complete；Apple half 仍 release / delivery gated；CP-1 whole-exit 未退出。

### 20.1 Axis matrix after doc 30

| Axis | Verdict |
|---|---|
| core deterministic（groups 1+5） | **go**（unchanged） |
| multi-target compile | **go**（unchanged） |
| zero-cloud-symbol boundary | **go**（live audit rerun: 0 matches, exit 1） |
| binding（B4） | **approved boundary / partially release-gated** — wrapper actor, external path consumer, and raw C ABI binary-target import observed; complete product wrapper binary package, UniFFI generated async, final DTO/error vocab, fresh-machine/CI remain open |
| TextKit（group 3 runtime） | **partial mechanism floor closed** — unchanged after doc 27 |
| iCloud Drive（B14） | **approved default transport WITH compromise constraints** — unchanged after doc 26 |
| layout / retention | **compromise**（unchanged） |
| cross-target execution CI | **mostly closed locally** — native + wasm + iOS Simulator runner observed; android execution and hosted CI integration remain open |
| **CP-1 whole-exit** | **未退出 (NOT exited)** |

### 20.2 Open-gate checklist after doc 30

| Gate | Status | Evidence pointer |
|---|---|---|
| native/wasm/iOS Simulator cross-target runner | closed locally | `25 §3.1` |
| Swift wrapper actor async surface | closed as mechanism floor | `28 §3.2`–`§3.5` |
| repo-external SwiftPM path dependency consumer | closed as mechanism floor | `29 §3.1`–`§3.2` |
| raw C ABI binary-target import | closed as mechanism floor | `30 §3.2`–`§3.4` |
| complete product wrapper binary package | open / not run | `30 §4` |
| UniFFI generated async surface | open / not run | `28 §4` |
| final production DTO/error vocabulary | open / not frozen | `28 §4` |
| fresh-machine/hosted CI reproduction | open / not run | unchanged |
| macOS IME marked-text / hit-testing / controlled undo floor | closed | `27 §3.1` |
| real app responder-chain undo / keyboard / accessibility / patch replay | open / not run | `27 §4` |
| conflict surfacing / preservation / blocking floor | closed | `26 §3.3`–`§4` |
| destructive/user-resolution execution for iCloud manifest conflict | open / not run | `26 §5` |
| iOS Simulator CloudDocuments runtime | open / failed | `23 §3.4`–`§3.5` |
| remote `.icloud` placeholder download | open | unchanged |
| signed-out / over-quota account states | open / not run | unchanged |
| iOS/non-macOS CloudDocuments delivery beyond simulator launch | open | unchanged |
| android execution | open / not run | `25 §4` |
| hosted CI workflow integration | open / not added | `25 §4` |

### Ledger entry — 2026-06-10 — iteration 9 — doc 30-binding-binary-target-report.md

- **Checkpoint / cursor:** CP-1 Apple half, binding binary-target import gate.
- **Action selected:** package the C ABI staticlib slices into a repo-external XCFramework and consume it from a repo-external SwiftPM `.binaryTarget`.
- **Owner classification:** Apple binding / verifier → executed here through cargo, `xcodebuild -create-xcframework`, and SwiftPM release strict-concurrency run.
- **Scope-fence check:** passed — no root workspace / lockfile / repo consumer package / `suites/anchor/core/src/**` production source changes; no `anchor-core` crate-type change; generated `suites/anchor/apple/ffi/Cargo.lock` removed as build byproduct.
- **Evidence (Observed = command + output):**
  - `cargo build --manifest-path suites/anchor/apple/ffi/Cargo.toml --release --target aarch64-apple-darwin|aarch64-apple-ios|aarch64-apple-ios-sim` → `Finished`.
  - `xcodebuild -create-xcframework ... -output /tmp/anchor-apple-stage1/AnchorCoreFFIBinary.xcframework` → `xcframework successfully written out`.
  - Added `/tmp/anchor-apple-stage1/binary-consumer/Package.swift` and `/tmp/anchor-apple-stage1/binary-consumer/Sources/BinaryConsumer/main.swift` outside the repo.
  - `swift run --package-path /tmp/anchor-apple-stage1/binary-consumer -c release -Xswiftc -strict-concurrency=complete -Xswiftc -warnings-as-errors BinaryConsumer` → `Build of product 'BinaryConsumer' complete!`; `binary:fixture bytes=216 module=AnchorCoreFFI`.
  - core cloud-symbol audit → 0 matches, exit 1.
  - Apple deterministic-semantics audit → 0 matches, exit 1.
- **Gates closed this iteration:** raw C ABI binary-target import; external binary consumer release strict run.
- **Gates still open:** complete product wrapper binary package, UniFFI generated async surface, final DTO/error vocabulary freeze, fresh-machine/hosted CI repro, real app TextKit runtime, destructive iCloud conflict resolution, remote placeholder, signed-out/over-quota, iOS/non-macOS CloudDocuments runtime/delivery, android execution, hosted CI integration.
- **Backfill to 04/05/06:** `04-contract-baseline.md` Binding baseline; `05-key-decisions.md` D01.
- **Axis matrix delta:** binding remains `approved boundary / partially release-gated`; binary-target gate narrowed from not-run to raw C ABI binary-target observed / full product wrapper binary package open.
- **Gate evaluation:** CONTINUE — next action should target final DTO/error vocabulary, fresh-machine/CI, android execution screening, or iCloud/account/placeholder gates.
- **New doc:** `docs/workbench/20260606-anchor-v1/30-binding-binary-target-report.md`

---

## 21. Progress ledger update — 2026-06-10 — cross-target CI wiring

本节追加 `31-cross-target-ci-wiring-report.md` 的 ledger 状态。`21` 的原始 CP-1 synthesis 结论仍成立：CP-1 core side complete；Apple half 仍 release / delivery gated；CP-1 whole-exit 未退出。

### 21.1 Axis matrix after doc 31

| Axis | Verdict |
|---|---|
| core deterministic（groups 1+5） | **go**（native vectors still pass） |
| multi-target compile | **go**（unchanged） |
| zero-cloud-symbol boundary | **go**（live audit rerun: 0 matches, exit 1） |
| binding（B4） | **approved boundary / partially release-gated** — unchanged after doc 30 |
| TextKit（group 3 runtime） | **partial mechanism floor closed** — unchanged after doc 27 |
| iCloud Drive（B14） | **approved default transport WITH compromise constraints** — unchanged after doc 26 |
| layout / retention | **compromise**（unchanged） |
| cross-target execution CI | **workflow-wired / hosted-run-gated** — repo-local runner passes native + wasm + iOS Simulator; GitHub workflow added; hosted run and Android execution remain open |
| **CP-1 whole-exit** | **未退出 (NOT exited)** |

### 21.2 Open-gate checklist after doc 31

| Gate | Status | Evidence pointer |
|---|---|---|
| repo-local native/wasm/iOS Simulator cross-target runner | closed locally | `25 §3.1`, `31 §3.5` |
| Linux native+wasm CI path | closed as workflow config + local skip-path run | `31 §3.2`–`§3.4` |
| macOS iOS Simulator CI path | closed as workflow config + local full-path run | `31 §3.2`, `31 §3.5` |
| hosted GitHub Actions run | open / not observed | `31 §4` |
| Android execution | open / unavailable in current local environment | `31 §3.1` |
| Swift wrapper actor async surface | closed as mechanism floor | `28 §3.2`–`§3.5` |
| raw C ABI binary-target import | closed as mechanism floor | `30 §3.2`–`§3.4` |
| complete product wrapper binary package | open / not run | `30 §4` |
| UniFFI generated async surface | open / not run | `28 §4` |
| final production DTO/error vocabulary | open / not frozen | `28 §4` |
| fresh-machine reproduction | open / not run | unchanged |
| real app responder-chain undo / keyboard / accessibility / patch replay | open / not run | `27 §4` |
| conflict surfacing / preservation / blocking floor | closed | `26 §3.3`–`§4` |
| destructive/user-resolution execution for iCloud manifest conflict | open / not run | `26 §5` |
| iOS Simulator CloudDocuments runtime | open / failed | `23 §3.4`–`§3.5` |
| remote `.icloud` placeholder download | open | unchanged |
| signed-out / over-quota account states | open / not run | unchanged |
| iOS/non-macOS CloudDocuments delivery beyond simulator launch | open | unchanged |

### Ledger entry — 2026-06-10 — iteration 10 — doc 31-cross-target-ci-wiring-report.md

- **Checkpoint / cursor:** CP-1 cross-target execution CI gate.
- **Action selected:** add GitHub Actions workflow wiring for native/wasm and iOS Simulator vector execution; add Linux skip mode to the repo-local runner.
- **Owner classification:** core-deterministic / CI config → executed here with local verification only.
- **Scope-fence check:** passed — no root package / lockfile / workspace member changes; no `suites/anchor/core/src/**` production source changes; no product app shell.
- **Evidence (Observed = command + output):**
  - Added `.github/workflows/anchor-cross-target-vectors.yml`.
  - Added `ANCHOR_SKIP_IOS=1` handling to `suites/anchor/core/tests/run-cross-target-vectors.sh`.
  - `command -v adb emulator qemu-aarch64 qemu-aarch64-static wasmtime node rustup` → only node and rustup found.
  - `ls -ld "$ANDROID_HOME"` → `/Users/plimeor/Library/Android/sdk` does not exist.
  - `bash -n suites/anchor/core/tests/run-cross-target-vectors.sh` → exit 0.
  - `ruby -e 'require "yaml"; YAML.load_file(".github/workflows/anchor-cross-target-vectors.yml"); puts "workflow_yaml=ok"'` → `workflow_yaml=ok`.
  - `ANCHOR_SKIP_IOS=1 bash suites/anchor/core/tests/run-cross-target-vectors.sh` → native 6 passed; `anchor_wasm_vector_status=0`; `anchor_ios_vector_status=skipped`.
  - `ANCHOR_IOS_SIMULATOR_ID=A1D90DAB-1FAC-413A-BCB4-F92B9F798F75 bash suites/anchor/core/tests/run-cross-target-vectors.sh` → native 6 passed; `anchor_wasm_vector_status=0`; `anchor_ios_vector_status=0`.
  - core cloud-symbol audit → 0 matches, exit 1.
  - Apple deterministic-semantics audit → 0 matches, exit 1.
- **Gates closed this iteration:** workflow config for Linux native+wasm and macOS iOS Simulator vector jobs; local skip/full runner validation.
- **Gates still open:** hosted GitHub Actions run, Android execution, complete product wrapper binary package, UniFFI generated async surface, final DTO/error vocabulary freeze, fresh-machine repro, real app TextKit runtime, destructive iCloud conflict resolution, remote placeholder, signed-out/over-quota, iOS/non-macOS CloudDocuments runtime/delivery.
- **Backfill to 04/05/06:** `04-contract-baseline.md` cross-platform baseline; `05-key-decisions.md` D19/D26/D36; `06-fixture-set.md` F23/F26 evidence note.
- **Axis matrix delta:** cross-target execution CI: `mostly closed locally` → `workflow-wired / hosted-run-gated`.
- **Gate evaluation:** CONTINUE — next action should target final DTO/error vocabulary, fresh-machine/hosted CI observation, iCloud/account/placeholder gates, or product-runtime TextKit gates.
- **New doc:** `docs/workbench/20260606-anchor-v1/31-cross-target-ci-wiring-report.md`

---

## 22. Progress ledger update — 2026-06-10 — iOS device iCloud launch

本节追加 `32-ios-device-icloud-launch-report.md` 的 ledger 状态。`21` 的原始 CP-1 synthesis 结论仍成立：CP-1 core side complete；Apple half 仍 release / delivery gated；CP-1 whole-exit 未退出。

### 22.1 Axis matrix after doc 32

| Axis | Verdict |
|---|---|
| core deterministic（groups 1+5） | **go**（unchanged） |
| multi-target compile | **go**（unchanged） |
| zero-cloud-symbol boundary | **go**（live audit rerun: 0 matches, exit 1） |
| binding（B4） | **approved boundary / partially release-gated** — unchanged after doc 30 |
| TextKit（group 3 runtime） | **partial mechanism floor closed** — unchanged after doc 27 |
| iCloud Drive（B14） | **approved default transport WITH compromise constraints** — current physical iPhone build/install/entitlement chain closed; current runtime launch blocked by locked device |
| layout / retention | **compromise**（unchanged） |
| cross-target execution CI | **workflow-wired / hosted-run-gated** — unchanged after doc 31 |
| **CP-1 whole-exit** | **未退出 (NOT exited)** |

### 22.2 Open-gate checklist after doc 32

| Gate | Status | Evidence pointer |
|---|---|---|
| physical iPhone availability | closed / observed | `32 §3.1` |
| physical iPhone Xcode build | closed / observed | `32 §3.2` |
| physical iPhone CloudDocuments entitlement | closed / observed | `32 §3.2`–`§3.3` |
| physical iPhone install | closed / observed | `32 §3.4` |
| physical iPhone iCloud runtime launch | open / blocked by locked device | `32 §3.5` |
| iOS/non-macOS CloudDocuments delivery | open / runtime not observed | `32 §4` |
| iOS Simulator CloudDocuments runtime | open / failed | `23 §3.4`–`§3.5` |
| remote `.icloud` placeholder download | open | unchanged |
| signed-out / over-quota account states | open / not run | unchanged |
| destructive/user-resolution execution for iCloud manifest conflict | open / not run | `26 §5` |
| hosted GitHub Actions run | open / not observed | `31 §4` |
| Android execution | open / unavailable in current local environment | `31 §3.1` |
| complete product wrapper binary package | open / not run | `30 §4` |
| UniFFI generated async surface | open / not run | `28 §4` |
| final production DTO/error vocabulary | open / not frozen | `28 §4` |
| fresh-machine reproduction | open / not run | unchanged |
| real app responder-chain undo / keyboard / accessibility / patch replay | open / not run | `27 §4` |

### Ledger entry — 2026-06-10 — iteration 11 — doc 32-ios-device-icloud-launch-report.md

- **Checkpoint / cursor:** CP-1 Apple half, iCloud non-macOS runtime gate.
- **Action selected:** build, install, and launch the repo-external Xcode-managed iOS CloudDocuments probe on the paired physical iPhone.
- **Owner classification:** Apple runtime / verifier → build/install executed here; runtime blocked by external device lock state.
- **Scope-fence check:** passed — no root workspace / lockfile / repo product app shell / `suites/anchor/core/src/**` changes; no iCloud account mutation.
- **Evidence (Observed = command + output):**
  - `xcrun devicectl list devices` → `Plimeor's iPhone` `C51610FF-15B1-5989-A8A3-DE2EDFACEB5B`, `available (paired)`.
  - `xcodebuild -project /Users/plimeor/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj -scheme AnchorProvisionProbe -destination 'platform=iOS,id=C51610FF-15B1-5989-A8A3-DE2EDFACEB5B' ... build` → `** BUILD SUCCEEDED **`; entitlements include CloudDocuments and `<ICLOUD_CONTAINER>`.
  - `codesign -d --entitlements :- .../AnchorProvisionProbe.app` → CloudDocuments / ubiquity entitlements present.
  - `xcrun devicectl device install app --device C51610FF-15B1-5989-A8A3-DE2EDFACEB5B .../AnchorProvisionProbe.app` → app installed, bundleID `dev.plimeor.AnchorProvisionProbe`.
  - `xcrun devicectl device process launch --console --terminate-existing dev.plimeor.AnchorProvisionProbe --icloud-runtime-probe` → failed: `RequestDenied`, `BSErrorCodeDescription = Locked`, device not unlocked.
  - core cloud-symbol audit → 0 matches, exit 1.
  - Apple deterministic-semantics audit → 0 matches, exit 1.
- **Gates closed this iteration:** physical iPhone build/install/entitlement chain.
- **Gates still open:** physical iPhone runtime rerun after unlock, iOS/non-macOS CloudDocuments delivery, remote placeholder, signed-out/over-quota, destructive iCloud conflict resolution, hosted CI run, Android execution, complete product wrapper binary package, UniFFI generated async surface, final DTO/error vocabulary, fresh-machine repro, real app TextKit runtime.
- **Backfill to 04/05/06:** `04-contract-baseline.md` iCloud baseline; `05-key-decisions.md` D35.
- **Axis matrix delta:** iCloud Drive: current iOS physical build/install strengthened; runtime remains open due locked device.
- **Gate evaluation:** CONTINUE for other gates; rerun physical device runtime after the iPhone is unlocked.
- **New doc:** `docs/workbench/20260606-anchor-v1/32-ios-device-icloud-launch-report.md`

---

## 23. Progress ledger update — 2026-06-10 — iCloud placeholder download

本节追加 `33-icloud-placeholder-report.md` 的 ledger 状态。`21` 的原始 CP-1 synthesis 结论仍成立：CP-1 core side complete；Apple half 仍 release / delivery gated；CP-1 whole-exit 未退出。

### 23.1 Axis matrix after doc 33

| Axis | Verdict |
|---|---|
| core deterministic（groups 1+5） | **go**（unchanged） |
| multi-target compile | **go**（unchanged） |
| zero-cloud-symbol boundary | **go**（live audit rerun: 0 matches, exit 1） |
| binding（B4） | **approved boundary / partially release-gated** — unchanged after doc 30 |
| TextKit（group 3 runtime） | **partial mechanism floor closed** — unchanged after doc 27 |
| iCloud Drive（B14） | **approved default transport WITH compromise constraints** — macOS placeholder failure shape observed; remote `.icloud` placeholder delivery remains open |
| layout / retention | **compromise**（unchanged） |
| cross-target execution CI | **workflow-wired / hosted-run-gated** — unchanged after doc 31 |
| **CP-1 whole-exit** | **未退出 (NOT exited)** |

### 23.2 Open-gate checklist after doc 33

| Gate | Status | Evidence pointer |
|---|---|---|
| macOS signed placeholder probe command | closed / observed | `33 §3.1`–`§3.3` |
| loose iCloud file current-state behavior | observed, not a remote placeholder success | `33 §3.3`–`§3.4` |
| package-internal segment placeholder/download behavior | observed failed with `NSCocoaErrorDomain:4` | `33 §3.3`–`§3.4` |
| remote `.icloud` placeholder delivery | open / not proved | `33 §4` |
| physical iPhone runtime rerun after unlock | open | `32 §3.5` |
| iOS/non-macOS CloudDocuments delivery | open / runtime not observed | `32 §4` |
| signed-out / over-quota account states | open / not run | unchanged |
| destructive/user-resolution execution for iCloud manifest conflict | open / not run | `26 §5` |
| hosted GitHub Actions run | open / not observed | `31 §4` |
| Android execution | open / unavailable in current local environment | `31 §3.1` |
| complete product wrapper binary package | open / not run | `30 §4` |
| UniFFI generated async surface | open / not run | `28 §4` |
| final production DTO/error vocabulary | open / not frozen | `28 §4` |
| fresh-machine reproduction | open / not run | unchanged |
| real app responder-chain undo / keyboard / accessibility / patch replay | open / not run | `27 §4` |

### Ledger entry — 2026-06-10 — iteration 12 — doc 33-icloud-placeholder-report.md

- **Checkpoint / cursor:** CP-1 Apple half, iCloud remote placeholder gate.
- **Action selected:** add and run a signed macOS verifier command that attempts evict/start-download cycles for a loose iCloud file and a package-internal segment.
- **Owner classification:** Apple runtime / verifier → executed here through Xcode-signed macOS app runtime.
- **Scope-fence check:** passed — no root workspace / lockfile / repo product app shell / `suites/anchor/core/src/**` changes; no iCloud account mutation; probe path cleaned up.
- **Evidence (Observed = command + output):**
  - Added `--icloud-placeholder-probe` to `suites/anchor/apple/AnchorMacICloudProbe/AnchorMacICloudProbe/ICloudRuntimeProbe.swift`.
  - `xcodebuild ... AnchorMacICloudProbe ... build` → `** BUILD SUCCEEDED **`; entitlements include CloudDocuments and `<ICLOUD_CONTAINER>`.
  - `... AnchorMacICloudProbe --icloud-placeholder-probe` → explicit/implicit ubiquity lookup non-nil; loose `external.anchorseg` is ubiquitous/current, evict returns `NSCocoaErrorDomain:512`, start download nil, read 29 bytes; package-internal `000001.anchorseg` is not ubiquitous, evict/start download return `NSCocoaErrorDomain:4`, read 28 bytes; cleanup removed probe root.
- **Gates closed this iteration:** macOS placeholder failure-shape evidence; package-internal start-download negative evidence.
- **Gates still open:** true remote `.icloud` placeholder delivery, physical iPhone runtime rerun after unlock, iOS/non-macOS CloudDocuments delivery, signed-out/over-quota, destructive iCloud conflict resolution, hosted CI run, Android execution, complete product wrapper binary package, UniFFI generated async surface, final DTO/error vocabulary, fresh-machine repro, real app TextKit runtime.
- **Backfill to 04/05/06:** `04-contract-baseline.md` iCloud baseline; `05-key-decisions.md` D06/D35.
- **Axis matrix delta:** iCloud Drive remains approved default transport with compromise constraints; placeholder gate is now observed-negative on macOS local-current/package-internal paths, not closed.
- **Gate evaluation:** CONTINUE — next action should target a true remote/non-current placeholder state, account-state probes, physical iPhone runtime after unlock, or remaining binding/product-runtime gates.
- **New doc:** `docs/workbench/20260606-anchor-v1/33-icloud-placeholder-report.md`

---

## 24. Progress ledger update — 2026-06-10 — DTO/error vocabulary

本节追加 `34-dto-error-vocabulary-report.md` 的 ledger 状态。`21` 的原始 CP-1 synthesis 结论仍成立：CP-1 core side complete；Apple half 仍 release / delivery gated；CP-1 whole-exit 未退出。

### 24.1 Axis matrix after doc 34

| Axis | Verdict |
|---|---|
| core deterministic（groups 1+5） | **go**（DTO vocabulary regression passed） |
| multi-target compile | **go**（unchanged） |
| zero-cloud-symbol boundary | **go**（live audit rerun: 0 matches, exit 1） |
| binding（B4） | **approved boundary / partially release-gated** — final DTO/error vocabulary closed; UniFFI generated async, complete product wrapper binary package, and fresh-machine/hosted CI remain open |
| TextKit（group 3 runtime） | **partial mechanism floor closed** — unchanged after doc 27 |
| iCloud Drive（B14） | **approved default transport WITH compromise constraints** — unchanged after doc 33 |
| layout / retention | **compromise**（unchanged） |
| cross-target execution CI | **workflow-wired / hosted-run-gated** — unchanged after doc 31 |
| **CP-1 whole-exit** | **未退出 (NOT exited)** |

### 24.2 Open-gate checklist after doc 34

| Gate | Status | Evidence pointer |
|---|---|---|
| final production DTO/error vocabulary | closed | `34 §3.1`–`§3.3` |
| structured core validation envelope | closed | `34 §1`, `34 §3.1` |
| core vs adapter-local error boundary | closed | `34 §3.2` |
| Swift wrapper structured error decode | closed | `34 §3.3` |
| UniFFI generated async surface | open / not run | `34 §4` |
| complete product wrapper binary package | open / not run | `30 §4`, `34 §4` |
| fresh-machine / hosted CI reproduction | open / not observed | unchanged |
| physical iPhone runtime rerun after unlock | open | `32 §3.5` |
| iOS/non-macOS CloudDocuments delivery | open / runtime not observed | `32 §4` |
| true remote `.icloud` placeholder delivery | open / not proved | `33 §4` |
| signed-out / over-quota account states | open / not run | unchanged |
| destructive/user-resolution execution for iCloud manifest conflict | open / not run | `26 §5` |
| hosted GitHub Actions run | open / not observed | `31 §4` |
| Android execution | open / unavailable in current local environment | `31 §3.1` |
| real app responder-chain undo / keyboard / accessibility / patch replay | open / not run | `27 §4` |

### Ledger entry — 2026-06-10 — iteration 13 — doc 34-dto-error-vocabulary-report.md

- **Checkpoint / cursor:** CP-1 Apple half, binding final DTO/error vocabulary gate.
- **Action selected:** freeze core-owned `TransactionResult` / `ValidationError` vocabulary with a focused core regression test and source/runtime audit.
- **Owner classification:** core DTO / Apple binding contract → executed here with cargo test, source audit, and Swift wrapper smoke.
- **Scope-fence check:** passed — no root workspace / lockfile / repo product app shell / public CLI schema changes; no `suites/anchor/core/src/**` production source changes.
- **Evidence (Observed = command + output):**
  - Added `validation_error_vocabulary_is_frozen` in `suites/anchor/core/tests/dto_surface.rs`.
  - `cargo test --manifest-path suites/anchor/Cargo.toml -p anchor-core --test dto_surface` → 7 passed.
  - `rg ... ValidationError...adapter...` → core source/test contain only the three core validation variants; UniFFI maps only those variants plus `NoError`; `adapter_null_session` / `adapter_parse_error` appear only in C ABI / Swift adapter-local surfaces.
  - `swift run ... AnchorAppleSmoke` → build succeeded; Swift wrapper decoded `dispatch:error validation=direct_active_to_deleted` and async wrapper still returned fixture truth.
- **Gates closed this iteration:** final production DTO/error vocabulary; core vs adapter-local error boundary; Swift wrapper structured error decode.
- **Gates still open:** UniFFI generated async surface, complete product wrapper binary package, fresh-machine/hosted CI repro, real app TextKit runtime, physical iPhone runtime rerun after unlock, iOS/non-macOS CloudDocuments delivery, true remote placeholder, signed-out/over-quota, destructive iCloud conflict resolution, hosted CI run, Android execution.
- **Backfill to 04/05/06:** `04-contract-baseline.md` binding baseline; `05-key-decisions.md` D01.
- **Axis matrix delta:** binding remains `approved boundary / partially release-gated`; final DTO/error vocabulary moved from open to closed.
- **Gate evaluation:** CONTINUE — next action should target UniFFI generated async surface, complete product wrapper packaging, fresh-machine/hosted CI evidence, or remaining Apple runtime gates.
- **New doc:** `docs/workbench/20260606-anchor-v1/34-dto-error-vocabulary-report.md`

---

## 25. Progress ledger update — 2026-06-10 — binding wrapper binary package

本节追加 `35-binding-wrapper-binary-package-report.md` 的 ledger 状态。`21` 的原始 CP-1 synthesis 结论仍成立：CP-1 core side complete；Apple half 仍 release / delivery gated；CP-1 whole-exit 未退出。

### 25.1 Axis matrix after doc 35

| Axis | Verdict |
|---|---|
| core deterministic（groups 1+5） | **go**（unchanged） |
| multi-target compile | **go**（unchanged） |
| zero-cloud-symbol boundary | **go**（live audit rerun: 0 matches, exit 1） |
| binding（B4） | **approved boundary / partially release-gated** — wrapper binary package mechanism floor closed; UniFFI generated async, fresh-machine/hosted CI, and artifact policy remain open |
| TextKit（group 3 runtime） | **partial mechanism floor closed** — unchanged after doc 27 |
| iCloud Drive（B14） | **approved default transport WITH compromise constraints** — unchanged after doc 33 |
| layout / retention | **compromise**（unchanged） |
| cross-target execution CI | **workflow-wired / hosted-run-gated** — unchanged after doc 31 |
| **CP-1 whole-exit** | **未退出 (NOT exited)** |

### 25.2 Open-gate checklist after doc 35

| Gate | Status | Evidence pointer |
|---|---|---|
| final production DTO/error vocabulary | closed | `34 §3.1`–`§3.3` |
| complete product wrapper binary package mechanism floor | closed | `35 §3.1`–`§3.4` |
| Swift wrapper over binary target release strict run | closed | `35 §3.4` |
| artifact signing/checksum/distribution policy | open / not productized | `35 §4` |
| UniFFI generated async surface | open / not run | `34 §4`, `35 §4` |
| fresh-machine / hosted CI reproduction | open / not observed | unchanged |
| physical iPhone runtime rerun after unlock | open | `32 §3.5` |
| iOS/non-macOS CloudDocuments delivery | open / runtime not observed | `32 §4` |
| true remote `.icloud` placeholder delivery | open / not proved | `33 §4` |
| signed-out / over-quota account states | open / not run | unchanged |
| destructive/user-resolution execution for iCloud manifest conflict | open / not run | `26 §5` |
| hosted GitHub Actions run | open / not observed | `31 §4` |
| Android execution | open / unavailable in current local environment | `31 §3.1` |
| real app responder-chain undo / keyboard / accessibility / patch replay | open / not run | `27 §4` |

### Ledger entry — 2026-06-10 — iteration 14 — doc 35-binding-wrapper-binary-package-report.md

- **Checkpoint / cursor:** CP-1 Apple half, binding complete product wrapper binary package gate.
- **Action selected:** create a repo-external SwiftPM package that exposes `AnchorCoreBindings` over a binary XCFramework module named `AnchorCoreC`, then run a release strict-concurrency consumer.
- **Owner classification:** Apple binding / packaging mechanism → executed here with cargo, `xcodebuild -create-xcframework`, and SwiftPM.
- **Scope-fence check:** passed — no root workspace / lockfile / repo product app shell / public CLI schema changes; no `suites/anchor/core/src/**` production source changes; generated `suites/anchor/apple/ffi/Cargo.lock` removed.
- **Evidence (Observed = command + output):**
  - `cargo build --manifest-path suites/anchor/apple/ffi/Cargo.toml --release --target aarch64-apple-darwin|aarch64-apple-ios|aarch64-apple-ios-sim` → `Finished`.
  - `xcodebuild -create-xcframework ... -output /tmp/anchor-apple-stage1/AnchorCoreCBinary.xcframework` → `xcframework successfully written out`.
  - Created `/tmp/anchor-apple-stage1/wrapper-binary-consumer` outside the repo, with `.binaryTarget(name: "AnchorCoreC", path: "../AnchorCoreCBinary.xcframework")`, copied `AnchorCoreBindings.swift`, and an executable consumer.
  - `swift run --package-path /tmp/anchor-apple-stage1/wrapper-binary-consumer -c release -Xswiftc -strict-concurrency=complete -Xswiftc -warnings-as-errors WrapperConsumer` → build succeeded; output `wrapper:fixture snapshot=3ef88671...`, `wrapper:insert changed=blk_a selection=3`, `wrapper:error validation=direct_active_to_deleted`, `wrapper:segment bytes=979`.
- **Gates closed this iteration:** complete product wrapper binary package mechanism floor; Swift wrapper over binary target release strict run.
- **Gates still open:** UniFFI generated async surface, fresh-machine/hosted CI repro, artifact signing/checksum/distribution policy, real app TextKit runtime, physical iPhone runtime rerun after unlock, iOS/non-macOS CloudDocuments delivery, true remote placeholder, signed-out/over-quota, destructive iCloud conflict resolution, hosted CI run, Android execution.
- **Backfill to 04/05/06:** `04-contract-baseline.md` binding baseline; `05-key-decisions.md` D01.
- **Axis matrix delta:** binding remains `approved boundary / partially release-gated`; complete wrapper binary package moved from open to closed as mechanism floor.
- **Gate evaluation:** CONTINUE — next action should target UniFFI generated async surface, fresh-machine/hosted CI evidence, or remaining Apple runtime gates.
- **New doc:** `docs/workbench/20260606-anchor-v1/35-binding-wrapper-binary-package-report.md`

---

## 26. Progress ledger update — 2026-06-10 — UniFFI generated async

本节追加 `36-uniffi-generated-async-report.md` 的 ledger 状态。`21` 的原始 CP-1 synthesis 结论仍成立：CP-1 core side complete；Apple half 仍 release / delivery gated；CP-1 whole-exit 未退出。

### 26.1 Axis matrix after doc 36

| Axis | Verdict |
|---|---|
| core deterministic（groups 1+5） | **go**（unchanged） |
| multi-target compile | **go**（unchanged） |
| zero-cloud-symbol boundary | **go**（live audit rerun: 0 matches, exit 1） |
| binding（B4） | **approved boundary / partially release-gated** — UniFFI generated async macOS+iOS-sim mechanism floor closed; physical-device packaging, fresh-machine/hosted CI, and artifact policy remain open |
| TextKit（group 3 runtime） | **partial mechanism floor closed** — unchanged after doc 27 |
| iCloud Drive（B14） | **approved default transport WITH compromise constraints** — unchanged after doc 33 |
| layout / retention | **compromise**（unchanged） |
| cross-target execution CI | **workflow-wired / hosted-run-gated** — unchanged after doc 31 |
| **CP-1 whole-exit** | **未退出 (NOT exited)** |

### 26.2 Open-gate checklist after doc 36

| Gate | Status | Evidence pointer |
|---|---|---|
| UniFFI generated async UDL/source generation | closed | `36 §3.1`–`§3.3` |
| UniFFI generated async macOS runtime | closed | `36 §3.4` |
| UniFFI generated async iOS Simulator compile/link | closed with clang warning caveat | `36 §3.6` |
| iPhoneOS / physical-device generated async packaging | open / arm64e vs arm64 standalone link mismatch | `36 §3.7` |
| final production DTO/error vocabulary | closed | `34 §3.1`–`§3.3` |
| complete product wrapper binary package mechanism floor | closed | `35 §3.1`–`§3.4` |
| fresh-machine / hosted CI reproduction | open / not observed | unchanged |
| artifact signing/checksum/distribution policy | open / not productized | `36 §4` |
| physical iPhone runtime rerun after unlock | open | `32 §3.5` |
| iOS/non-macOS CloudDocuments delivery | open / runtime not observed | `32 §4` |
| true remote `.icloud` placeholder delivery | open / not proved | `33 §4` |
| signed-out / over-quota account states | open / not run | unchanged |
| destructive/user-resolution execution for iCloud manifest conflict | open / not run | `26 §5` |
| hosted GitHub Actions run | open / not observed | `31 §4` |
| Android execution | open / unavailable in current local environment | `31 §3.1` |
| real app responder-chain undo / keyboard / accessibility / patch replay | open / not run | `27 §4` |

### Ledger entry — 2026-06-10 — iteration 15 — doc 36-uniffi-generated-async-report.md

- **Checkpoint / cursor:** CP-1 Apple half, UniFFI generated async release-surface gate.
- **Action selected:** add a minimal `[Async]` UniFFI function, regenerate Swift, and run/compile generated async smoke under Swift 6 strict-concurrency.
- **Owner classification:** Apple binding / UniFFI verifier → executed here with cargo, UniFFI bindgen, `swiftc`, and vtool.
- **Scope-fence check:** passed — no root workspace / lockfile / repo product app shell / public CLI schema changes; no `suites/anchor/core/src/**` production source changes; generated lockfiles removed.
- **Evidence (Observed = command + output):**
  - Added `[Async] FixtureSummary async_fixture_summary();`, `pub async fn async_fixture_summary`, and Swift smoke `await asyncFixtureSummary()`.
  - `cargo build ... --target aarch64-apple-darwin` → `Finished`.
  - `uniffi-bindgen-swift ...` → exited 0; generated Swift contains `asyncFixtureSummary()` and `uniffiRustCallAsync`; generated header contains RustFuture callbacks.
  - macOS `swiftc -swift-version 6 -strict-concurrency=complete -warnings-as-errors ... && /tmp/anchor-apple-stage1/uniffi-async-smoke` → output includes `uniffi:async fixture snapshot=3ef88671...`.
  - iOS/iOS-sim Rust slices built; iOS Simulator `swiftc ... -target arm64-apple-ios26.0-simulator` exited 0 and `vtool` reports `platform IOSSIMULATOR`, minOS 26.0, SDK 26.5.
  - iPhoneOS `swiftc ... -target arm64e-apple-ios26.0` failed because current Rust iOS slice is arm64 and the standalone Swift link expected arm64e symbols.
- **Gates closed this iteration:** UniFFI generated async source generation; macOS strict-concurrency async runtime; iOS Simulator strict-concurrency compile/link.
- **Gates still open:** physical-device/iPhoneOS async packaging, fresh-machine/hosted CI repro, artifact signing/checksum/distribution policy, real app TextKit runtime, physical iPhone runtime rerun after unlock, iOS/non-macOS CloudDocuments delivery, true remote placeholder, signed-out/over-quota, destructive iCloud conflict resolution, hosted CI run, Android execution.
- **Backfill to 04/05/06:** `04-contract-baseline.md` binding baseline; `05-key-decisions.md` D01.
- **Axis matrix delta:** binding remains `approved boundary / partially release-gated`; UniFFI generated async moved from open to macOS+iOS-sim mechanism-closed / physical-device packaging open.
- **Gate evaluation:** CONTINUE — next action should target fresh-machine/hosted CI, physical-device packaging/runtime, or remaining iCloud/TextKit product-runtime gates.
- **New doc:** `docs/workbench/20260606-anchor-v1/36-uniffi-generated-async-report.md`

---

## 27. Progress ledger update — 2026-06-10 — iOS device iCloud rerun

本节追加 `37-ios-device-icloud-rerun-report.md` 的 ledger 状态。`21` 的原始 CP-1 synthesis 结论仍成立：CP-1 core side complete；Apple half 仍 release / delivery gated；CP-1 whole-exit 未退出。

### 27.1 Axis matrix after doc 37

| Axis | Verdict |
|---|---|
| core deterministic（groups 1+5） | **go**（unchanged） |
| multi-target compile | **go**（unchanged） |
| zero-cloud-symbol boundary | **go**（unchanged） |
| binding（B4） | **approved boundary / partially release-gated** — unchanged after doc 36 |
| TextKit（group 3 runtime） | **partial mechanism floor closed** — unchanged after doc 27 |
| iCloud Drive（B14） | **approved default transport WITH compromise constraints** — physical iPhone runtime still blocked by locked device |
| layout / retention | **compromise**（unchanged） |
| cross-target execution CI | **workflow-wired / hosted-run-gated** — unchanged after doc 31 |
| **CP-1 whole-exit** | **未退出 (NOT exited)** |

### 27.2 Open-gate checklist after doc 37

| Gate | Status | Evidence pointer |
|---|---|---|
| physical iPhone build/install/entitlement chain | closed | `32 §3.1`–`§3.4` |
| physical iPhone runtime launch | open / still blocked by locked device | `32 §3.5`, `37 §3` |
| iOS/non-macOS CloudDocuments delivery | open / runtime not observed | `37 §4` |
| UniFFI generated async macOS/iOS-sim surface | closed | `36 §3.1`–`§3.6` |
| iPhoneOS / physical-device generated async packaging | open / arm64e vs arm64 standalone link mismatch | `36 §3.7` |
| fresh-machine / hosted CI reproduction | open / not observed | unchanged |
| artifact signing/checksum/distribution policy | open / not productized | `36 §4` |
| true remote `.icloud` placeholder delivery | open / not proved | `33 §4` |
| signed-out / over-quota account states | open / not run | unchanged |
| destructive/user-resolution execution for iCloud manifest conflict | open / not run | `26 §5` |
| hosted GitHub Actions run | open / not observed | `31 §4` |
| Android execution | open / unavailable in current local environment | `31 §3.1` |
| real app responder-chain undo / keyboard / accessibility / patch replay | open / not run | `27 §4` |

### Ledger entry — 2026-06-10 — iteration 16 — doc 37-ios-device-icloud-rerun-report.md

- **Checkpoint / cursor:** CP-1 Apple half, physical iPhone iCloud runtime gate.
- **Action selected:** rerun the installed Xcode-managed iOS CloudDocuments probe on the paired physical iPhone.
- **Owner classification:** Apple runtime / physical device → executed here through `devicectl`.
- **Scope-fence check:** passed — no root workspace / lockfile / repo product app shell / public CLI schema changes; no `suites/anchor/core/src/**` production source changes; no iCloud account mutation.
- **Evidence (Observed = command + output):**
  - `xcrun devicectl device process launch --device C51610FF-15B1-5989-A8A3-DE2EDFACEB5B --console --terminate-existing dev.plimeor.AnchorProvisionProbe --icloud-runtime-probe` → acquired tunnel/DDI/usage assertion, then failed with `FBSOpenApplicationServiceErrorDomain`, `BSErrorCodeDescription = Locked`, `Unable to launch ... because the device was not, or could not be, unlocked`.
- **Gates closed this iteration:** none.
- **Gates still open:** physical iPhone runtime rerun after unlock, iOS/non-macOS CloudDocuments delivery, physical-device generated async packaging, fresh-machine/hosted CI repro, artifact signing/checksum/distribution policy, real app TextKit runtime, true remote placeholder, signed-out/over-quota, destructive iCloud conflict resolution, hosted CI run, Android execution.
- **Backfill to 04/05/06:** `04-contract-baseline.md` iCloud baseline; `05-key-decisions.md` D35.
- **Axis matrix delta:** iCloud Drive unchanged; physical iPhone runtime remains externally blocked by locked device.
- **Gate evaluation:** CONTINUE for non-device gates; rerun physical device runtime only after the iPhone is unlocked.
- **New doc:** `docs/workbench/20260606-anchor-v1/37-ios-device-icloud-rerun-report.md`

---

## 28. Progress ledger update — 2026-06-10 — binding artifact checksum

本节追加 `38-binding-artifact-checksum-report.md` 的 ledger 状态。`21` 的原始 CP-1 synthesis 结论仍成立：CP-1 core side complete；Apple half 仍 release / delivery gated；CP-1 whole-exit 未退出。

### 28.1 Axis matrix after doc 38

| Axis | Verdict |
|---|---|
| core deterministic（groups 1+5） | **go**（unchanged） |
| multi-target compile | **go**（unchanged） |
| zero-cloud-symbol boundary | **go**（unchanged） |
| binding（B4） | **approved boundary / partially release-gated** — SwiftPM binary checksum mechanism closed; physical-device packaging, fresh-machine/hosted CI, and signing/provenance policy remain open |
| TextKit（group 3 runtime） | **partial mechanism floor closed** — unchanged after doc 27 |
| iCloud Drive（B14） | **approved default transport WITH compromise constraints** — unchanged after doc 37 |
| layout / retention | **compromise**（unchanged） |
| cross-target execution CI | **workflow-wired / hosted-run-gated** — unchanged after doc 31 |
| **CP-1 whole-exit** | **未退出 (NOT exited)** |

### 28.2 Open-gate checklist after doc 38

| Gate | Status | Evidence pointer |
|---|---|---|
| SwiftPM binary artifact checksum mechanism | closed | `38 §3.1` |
| wrapper-compatible XCFramework zip shape | closed | `38 §3.2`–`§3.3` |
| artifact signing/notarization/provenance policy | open / not run | `38 §4` |
| fresh-machine / hosted CI reproduction | open / not observed | unchanged |
| iPhoneOS / physical-device generated async packaging | open / arm64e vs arm64 standalone link mismatch | `36 §3.7` |
| physical iPhone runtime launch | open / still blocked by locked device | `37 §3` |
| iOS/non-macOS CloudDocuments delivery | open / runtime not observed | `37 §4` |
| true remote `.icloud` placeholder delivery | open / not proved | `33 §4` |
| signed-out / over-quota account states | open / not run | unchanged |
| destructive/user-resolution execution for iCloud manifest conflict | open / not run | `26 §5` |
| hosted GitHub Actions run | open / not observed | `31 §4` |
| Android execution | open / unavailable in current local environment | `31 §3.1` |
| real app responder-chain undo / keyboard / accessibility / patch replay | open / not run | `27 §4` |

### Ledger entry — 2026-06-10 — iteration 17 — doc 38-binding-artifact-checksum-report.md

- **Checkpoint / cursor:** CP-1 Apple half, binding artifact checksum/distribution mechanism gate.
- **Action selected:** zip the wrapper-compatible XCFramework and compute SwiftPM binary target checksum plus SHA-256.
- **Owner classification:** Apple binding packaging mechanism → executed locally under `/tmp/anchor-apple-stage1`.
- **Scope-fence check:** passed — no root workspace / lockfile / repo product app shell / public CLI schema changes; no `suites/anchor/core/src/**` production source changes; no publishing/signing/notarization.
- **Evidence (Observed = command + output):**
  - `ditto -c -k --sequesterRsrc --keepParent AnchorCoreCBinary.xcframework AnchorCoreCBinary.xcframework.zip`
  - `swift package compute-checksum /tmp/anchor-apple-stage1/AnchorCoreCBinary.xcframework.zip` → `6dab5c671ae33737a19462fc5452dff390bc0a6afa7c80b91b505bb6e063c890`.
  - `shasum -a 256 ...` → same hash; zip size 17M.
  - artifact content includes macOS/iOS/iOS-sim slices, `Info.plist`, each `libanchor_core_ffi.a`, and headers/module maps.
- **Gates closed this iteration:** SwiftPM binary artifact checksum mechanism; wrapper-compatible XCFramework zip shape.
- **Gates still open:** artifact signing/notarization/provenance policy, fresh-machine/hosted CI repro, physical-device packaging, physical iPhone runtime after unlock, iOS/non-macOS CloudDocuments delivery, true remote placeholder, signed-out/over-quota, destructive iCloud conflict resolution, hosted CI run, Android execution, real app TextKit runtime.
- **Backfill to 04/05/06:** `04-contract-baseline.md` binding baseline; `05-key-decisions.md` D01.
- **Axis matrix delta:** binding remains `approved boundary / partially release-gated`; artifact checksum mechanism moved from open to closed.
- **Gate evaluation:** CONTINUE — next action should target hosted/fresh-machine evidence, physical-device packaging/runtime, or remaining iCloud/TextKit gates.
- **New doc:** `docs/workbench/20260606-anchor-v1/38-binding-artifact-checksum-report.md`

---

## 29. Progress ledger update — 2026-06-10 — iCloud conflict resolution

本节追加 `39-icloud-conflict-resolution-report.md` 的 ledger 状态。`21` 的原始 CP-1 synthesis 结论仍成立：CP-1 core side complete；Apple half 仍 release / delivery gated；CP-1 whole-exit 未退出。

### 29.1 Axis matrix after doc 39

| Axis | Verdict |
|---|---|
| core deterministic（groups 1+5） | **go**（unchanged） |
| multi-target compile | **go**（unchanged） |
| zero-cloud-symbol boundary | **go**（unchanged） |
| binding（B4） | **approved boundary / partially release-gated** — unchanged after doc 38 |
| TextKit（group 3 runtime） | **partial mechanism floor closed** — unchanged after doc 27 |
| iCloud Drive（B14） | **approved default transport WITH compromise constraints** — explicit mutable-manifest resolution mechanism floor closed; remote placeholder, account states, physical/iOS runtime, scale, and product resolver integration remain open |
| layout / retention | **compromise** — conflict policy/resolution floor improved, but steady-state segment budget, stale-peer/watermark, and scale context remain open |
| cross-target execution CI | **workflow-wired / hosted-run-gated** — unchanged after doc 31 |
| **CP-1 whole-exit** | **未退出 (NOT exited)** |

### 29.2 Open-gate checklist after doc 39

| Gate | Status | Evidence pointer |
|---|---|---|
| conflict surfacing / preserve / block floor | closed | `26 §3`–`§5` |
| explicit destructive/user-resolution execution mechanism | closed with metadata-refresh caveat | `39 §3.2`–`§3.4` |
| product conflict-resolution UX / core integration | open / not implemented | `39 §4`–`§5` |
| conflict resolution in scale / stale-peer / retention context | open / not run | `39 §5` |
| physical iPhone runtime launch | open / still blocked by locked device | `37 §3` |
| iOS/non-macOS CloudDocuments delivery | open / runtime not observed | `37 §4` |
| true remote `.icloud` placeholder delivery | open / not proved | `33 §4` |
| signed-out / over-quota account states | open / not run | unchanged |
| steady-state segment budget / million-op iCloud context | open / not run | unchanged |
| local-only path-in-ubiquity edge cases | open / not run | unchanged |
| artifact signing/notarization/provenance policy | open / not run | `38 §4` |
| fresh-machine / hosted CI reproduction | open / not observed | unchanged |
| iPhoneOS / physical-device generated async packaging | open / arm64e vs arm64 standalone link mismatch | `36 §3.7` |
| hosted GitHub Actions run | open / not observed | `31 §4` |
| Android execution | open / unavailable in current local environment | `31 §3.1` |
| real app responder-chain undo / keyboard / accessibility / patch replay | open / not run | `27 §4` |

### Ledger entry — 2026-06-10 — iteration 18 — doc 39-icloud-conflict-resolution-report.md

- **Checkpoint / cursor:** CP-1 Apple half, iCloud mutable-manifest conflict resolution mechanism gate.
- **Action selected:** execute explicit current-winner resolution for the historical offline-fork manifest conflict, archive all branches, then re-check policy state.
- **Owner classification:** Apple iCloud runtime verifier → executed locally through a signed macOS app with CloudDocuments entitlements.
- **Scope-fence check:** passed — no root workspace / lockfile / repo product app shell / public CLI schema changes; no `suites/anchor/core/src/**` production source changes; no CloudKit; conflict operation stayed in the existing probe container.
- **Evidence (Observed = command + output):**
  - `xcodebuild ... -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/AnchorMacICloudProbe-resolve-20260610 ... build` → signing identity/profile observed; `** BUILD SUCCEEDED **`.
  - `AnchorMacICloudProbe --icloud-conflict-resolve-probe offline-conflict-20260607T113449Z` → archived current writer `ios-offline`, conflict version writer `mac-online`, duplicate writer `ios-base`; `remove_other_versions_error=nil`; same-run `after_conflict_versions=1`, `after_duplicate_manifest_files=0`, `archive_preserved=true`, `resolution_executed=true`.
  - `AnchorMacICloudProbe --icloud-conflict-policy-probe offline-conflict-20260607T113449Z` → `conflict_versions=0`, `duplicate_manifest_files=0`, `adapter_status=ok_no_conflict`.
  - `find .../AnchorConflictProbe/offline-conflict-20260607T113449Z -maxdepth 2 -type f` → archive contains `current-manifest.json`, `conflict-version-0.json`, and `duplicate-0-manifest 2.json`.
- **Gates closed this iteration:** explicit destructive/user-resolution execution mechanism; branch archival before cleanup; duplicate-manifest live cleanup; post-refresh adapter-visible clean state.
- **Gates still open:** product conflict-resolution UX/core integration, conflict resolution under scale/stale-peer context, physical iPhone runtime after unlock, iOS/non-macOS CloudDocuments delivery, true remote placeholder, signed-out/over-quota, steady-state segment budget/million-op iCloud context, local-only path edge cases, physical-device packaging, fresh-machine/hosted CI, hosted GitHub Actions run, Android execution, real app TextKit runtime.
- **Backfill to 04/05/06:** `04-contract-baseline.md` iCloud baseline; `05-key-decisions.md` D14 and D35.
- **Axis matrix delta:** iCloud Drive remains `approved default transport WITH compromise constraints`; destructive/user-resolution mechanism moved from open to mechanism-closed with metadata-refresh caveat.
- **Gate evaluation:** CONTINUE — next action should target another remaining iCloud, binding, TextKit, hosted CI, or physical-device gate.
- **New doc:** `docs/workbench/20260606-anchor-v1/39-icloud-conflict-resolution-report.md`

---

## 30. Progress ledger update — 2026-06-10 — UniFFI iPhoneOS packaging

本节追加 `40-uniffi-iphoneos-packaging-report.md` 的 ledger 状态。`21` 的原始 CP-1 synthesis 结论仍成立：CP-1 core side complete；Apple half 仍 release / delivery gated；CP-1 whole-exit 未退出。

### 30.1 Axis matrix after doc 40

| Axis | Verdict |
|---|---|
| core deterministic（groups 1+5） | **go**（unchanged） |
| multi-target compile | **go**（unchanged） |
| zero-cloud-symbol boundary | **go**（unchanged） |
| binding（B4） | **approved boundary / partially release-gated** — iPhoneOS standalone arm64 generated async compile/link mechanism closed; signed app-bundle/device runtime, fresh-machine/hosted CI, and artifact policy remain open |
| TextKit（group 3 runtime） | **partial mechanism floor closed** — unchanged after doc 27 |
| iCloud Drive（B14） | **approved default transport WITH compromise constraints** — unchanged after doc 39 |
| layout / retention | **compromise** — unchanged after doc 39 |
| cross-target execution CI | **workflow-wired / hosted-run-gated** — unchanged after doc 31 |
| **CP-1 whole-exit** | **未退出 (NOT exited)** |

### 30.2 Open-gate checklist after doc 40

| Gate | Status | Evidence pointer |
|---|---|---|
| UniFFI generated async macOS runtime | closed | `36 §3.4` |
| UniFFI generated async iOS Simulator compile/link | closed with clang warning caveat | `36 §3.6` |
| UniFFI generated async iPhoneOS standalone arm64 compile/link | closed with clang warning caveat | `40 §3.1`–`§3.3` |
| signed iOS app bundle with generated async binding | open / not run | `40 §4` |
| physical device install/runtime for generated async binding | open / not run | `40 §4` |
| fresh-machine / hosted CI reproduction | open / not observed | unchanged |
| artifact signing/notarization/provenance policy | open / not run | `38 §4`, `40 §4` |
| physical iPhone iCloud runtime launch | open / still blocked by locked device across three attempts | `37 §3`, `42 §3` |
| iOS/non-macOS CloudDocuments delivery | open / runtime not observed | `37 §4` |
| true remote `.icloud` placeholder delivery | open / not proved | `33 §4` |
| signed-out / over-quota account states | open / not run | unchanged |
| steady-state segment budget / million-op iCloud context | open / not run | unchanged |
| local-only path-in-ubiquity edge cases | open / not run | unchanged |
| product conflict-resolution UX / core integration | open / not implemented | `39 §4`–`§5` |
| hosted GitHub Actions run | open / not observed | `31 §4` |
| Android execution | open / unavailable in current local environment | `31 §3.1` |
| real app responder-chain undo / keyboard / accessibility / patch replay | open / not run | `27 §4` |

### Ledger entry — 2026-06-10 — iteration 19 — doc 40-uniffi-iphoneos-packaging-report.md

- **Checkpoint / cursor:** CP-1 Apple half, binding iPhoneOS generated async packaging mechanism gate.
- **Action selected:** rerun the UniFFI generated async standalone Swift compile/link for iPhoneOS using `arm64-apple-ios26.0`, matching the Rust `aarch64-apple-ios` slice.
- **Owner classification:** Apple binding packaging mechanism → executed locally under `/tmp/anchor-apple-stage1`.
- **Scope-fence check:** passed — no root workspace / lockfile / repo product app shell / public CLI schema changes; no Xcode project/bundle/entitlement changes; no `suites/anchor/core/src/**` production source changes.
- **Evidence (Observed = command + output):**
  - `swiftc -swift-version 6 -strict-concurrency=complete -warnings-as-errors -target arm64-apple-ios26.0 ...` → exit 0; emitted clang sysroot warning only.
  - `file /tmp/anchor-apple-stage1/uniffi-async-smoke-ios-arm64` → `Mach-O 64-bit executable arm64`.
  - `vtool -show-build ...` → `platform IOS`, `minos 26.0`, `sdk 26.5`.
  - `lipo -archs` on Rust staticlib, Rust dylib, and Swift smoke executable → `arm64` for all three.
- **Gates closed this iteration:** iPhoneOS generated async standalone arm64 compile/link; prior arm64e mismatch narrowed to wrong target selection for the current Rust slice.
- **Gates still open:** signed app-bundle/device runtime integration, fresh-machine/hosted CI reproduction, artifact signing/notarization/provenance policy, physical iPhone runtime after unlock, iOS/non-macOS CloudDocuments delivery, true remote placeholder, signed-out/over-quota, steady-state segment budget/million-op iCloud context, local-only path edge cases, product conflict-resolution UX/core integration, hosted GitHub Actions run, Android execution, real app TextKit runtime.
- **Backfill to 04/05/06:** `04-contract-baseline.md` binding baseline; `05-key-decisions.md` D01.
- **Axis matrix delta:** binding remains `approved boundary / partially release-gated`; iPhoneOS generated async standalone compile/link moved from open/mismatch to mechanism-closed for `arm64`.
- **Gate evaluation:** CONTINUE — next action should target hosted/fresh-machine evidence, signed app-bundle/device runtime integration, artifact provenance policy, or remaining iCloud/TextKit gates.
- **New doc:** `docs/workbench/20260606-anchor-v1/40-uniffi-iphoneos-packaging-report.md`

---

## 31. Progress ledger update — 2026-06-10 — hosted cross-target CI

本节追加 `41-hosted-cross-target-ci-report.md` 的 ledger 状态。`21` 的原始 CP-1 synthesis 结论仍成立：CP-1 core side complete；Apple half 仍 release / delivery gated；CP-1 whole-exit 未退出。

### 31.1 Axis matrix after doc 41

| Axis | Verdict |
|---|---|
| core deterministic（groups 1+5） | **go**（unchanged） |
| multi-target compile | **go**（unchanged） |
| zero-cloud-symbol boundary | **go**（unchanged） |
| binding（B4） | **approved boundary / partially release-gated** — hosted cross-target run closed; signed app-bundle/device runtime integration, fresh-machine release packaging, and artifact policy remain open |
| TextKit（group 3 runtime） | **partial mechanism floor closed** — unchanged after doc 27 |
| iCloud Drive（B14） | **approved default transport WITH compromise constraints** — unchanged after doc 39 |
| layout / retention | **compromise** — unchanged after doc 39 |
| cross-target execution CI | **hosted native/wasm/iOS-sim closed; Android execution open** |
| **CP-1 whole-exit** | **未退出 (NOT exited)** |

### 31.2 Open-gate checklist after doc 41

| Gate | Status | Evidence pointer |
|---|---|---|
| hosted Linux native vectors | closed | `41 §3.2`–`§3.3` |
| hosted Linux wasm vectors | closed | `41 §3.2`–`§3.3` |
| hosted macOS native vectors | closed | `41 §3.2`, `41 §3.4` |
| hosted macOS wasm vectors | closed | `41 §3.2`, `41 §3.4` |
| hosted macOS iOS Simulator vectors | closed | `41 §3.2`, `41 §3.4` |
| Android execution | open / not run | `31 §3.1`, `41 §4` |
| signed app-bundle/device runtime integration | open / not run | `40 §4` |
| fresh-machine release packaging beyond hosted runner | open / not observed | unchanged |
| artifact signing/notarization/provenance policy | open / not run | `38 §4`, `40 §4` |
| physical iPhone iCloud runtime launch | open / still blocked by locked device | `37 §3` |
| iOS/non-macOS CloudDocuments delivery | open / runtime not observed | `37 §4` |
| true remote `.icloud` placeholder delivery | open / not proved | `33 §4` |
| signed-out / over-quota account states | open / not run | unchanged |
| steady-state segment budget / million-op iCloud context | open / not run | unchanged |
| local-only path-in-ubiquity edge cases | open / not run | unchanged |
| product conflict-resolution UX / core integration | open / not implemented | `39 §4`–`§5` |
| real app responder-chain undo / keyboard / accessibility / patch replay | open / not run | `27 §4` |

### Ledger entry — 2026-06-10 — iteration 20 — doc 41-hosted-cross-target-ci-report.md

- **Checkpoint / cursor:** CP-1 cross-target execution CI gate.
- **Action selected:** push `anchor-v1`, open draft PR `#9`, and observe hosted GitHub Actions `pull_request` workflow.
- **Owner classification:** hosted CI / GitHub Actions → executed through GitHub after local commit+push.
- **Scope-fence check:** passed — no root workspace / lockfile / repo product app shell / public CLI schema changes; external side effect limited to branch push, draft PR, and hosted workflow run.
- **Evidence (Observed = command + output):**
  - `git commit -m "Advance Anchor CP-1 verifier evidence"` followed by evidence-doc amend → final commit `5cbc5a1`.
  - `git push --force-with-lease origin anchor-v1` → branch updated on `origin/anchor-v1`.
  - `gh pr create --draft --base main --head anchor-v1 ...` → `https://github.com/plimeor/labs/pull/9`.
  - `gh run view 27225972591 --json ...` → `workflowName=Anchor Cross-Target Vectors`, `event=pull_request`, `headSha=5cbc5a174bfad2da4243d70772e240d2eec6d885`, `conclusion=success`.
  - `gh pr checks 9` → `native-wasm pass 26s`, `ios-simulator pass 7m27s`.
  - Hosted `native-wasm` log → native deterministic vectors `6 passed`, `anchor_wasm_vector_status=0`, `anchor_ios_vector_status=skipped`.
  - Hosted `ios-simulator` log → booted simulator, native deterministic vectors `6 passed`, `anchor_wasm_vector_status=0`, `anchor_ios_vector_status=0`.
- **Gates closed this iteration:** hosted Linux native+wasm vector execution; hosted macOS native+wasm+iOS Simulator vector execution.
- **Gates still open:** Android execution, signed app-bundle/device runtime integration, fresh-machine release packaging beyond hosted runner, artifact signing/notarization/provenance policy, physical iPhone runtime after unlock, iOS/non-macOS CloudDocuments delivery, true remote placeholder, signed-out/over-quota, steady-state segment budget/million-op iCloud context, local-only path edge cases, product conflict-resolution UX/core integration, real app TextKit runtime.
- **Backfill to 04/05/06:** `04-contract-baseline.md` cross-target baseline; `05-key-decisions.md` D19, D26, D36.
- **Axis matrix delta:** cross-target execution CI: `workflow-wired / hosted-run-gated` → `hosted native/wasm/iOS-sim closed; Android execution open`.
- **Gate evaluation:** CONTINUE — next action should target Android execution feasibility, signed app-bundle/device runtime integration, artifact provenance policy, or remaining iCloud/TextKit gates.
- **New doc:** `docs/workbench/20260606-anchor-v1/41-hosted-cross-target-ci-report.md`

---

## 32. Progress ledger update — 2026-06-10 — iOS device locked rerun

本节追加 `42-ios-device-icloud-locked-rerun-report.md` 的 ledger 状态。`21` 的原始 CP-1 synthesis 结论仍成立：CP-1 core side complete；Apple half 仍 release / delivery gated；CP-1 whole-exit 未退出。

### 32.1 Axis matrix after doc 42

| Axis | Verdict |
|---|---|
| core deterministic（groups 1+5） | **go**（unchanged） |
| multi-target compile | **go**（unchanged） |
| zero-cloud-symbol boundary | **go**（unchanged） |
| binding（B4） | **approved boundary / partially release-gated** — unchanged after doc 41 |
| TextKit（group 3 runtime） | **partial mechanism floor closed** — unchanged after doc 27 |
| iCloud Drive（B14） | **approved default transport WITH compromise constraints** — physical iPhone runtime remains externally blocked by locked device state |
| layout / retention | **compromise** — unchanged after doc 41 |
| cross-target execution CI | **hosted native/wasm/iOS-sim closed; Android execution open** — unchanged after doc 41 |
| **CP-1 whole-exit** | **未退出 (NOT exited)** |

### 32.2 Open-gate checklist after doc 42

| Gate | Status | Evidence pointer |
|---|---|---|
| physical iPhone visibility / pairing | closed for this attempt | `42 §3.1` |
| physical iPhone app launch | open / blocked by locked device across three attempts | `32 §3.5`, `37 §3`, `42 §3.2` |
| physical iPhone iCloud runtime | open / not observed | `42 §4` |
| iOS/non-macOS CloudDocuments delivery | open / not observed | `42 §4` |
| true remote `.icloud` placeholder delivery | open / not proved | `33 §4` |
| signed-out / over-quota account states | open / not run | unchanged |
| steady-state segment budget / million-op iCloud context | open / not run | unchanged |
| local-only path-in-ubiquity edge cases | open / not run | unchanged |
| Android execution | open / not run | `31 §3.1`, `41 §4` |
| signed app-bundle/device runtime integration | open / not run | `40 §4` |
| fresh-machine release packaging beyond hosted runner | open / not observed | unchanged |
| artifact signing/notarization/provenance policy | open / not run | `38 §4`, `40 §4` |
| product conflict-resolution UX / core integration | open / not implemented | `39 §4`–`§5` |
| real app responder-chain undo / keyboard / accessibility / patch replay | open / not run | `27 §4` |

### Ledger entry — 2026-06-10 — iteration 21 — doc 42-ios-device-icloud-locked-rerun-report.md

- **Checkpoint / cursor:** CP-1 Apple half, physical iPhone iCloud runtime gate.
- **Action selected:** retry the installed signed iOS CloudDocuments verifier on the paired physical iPhone.
- **Owner classification:** Apple runtime / physical device → executed through `devicectl`.
- **Scope-fence check:** passed — no root workspace / lockfile / repo product app shell / public CLI schema changes; no Xcode project/bundle/entitlement changes; no `suites/anchor/core/src/**` production source changes; no iCloud account mutation.
- **Evidence (Observed = command + output):**
  - `devicectl list devices` → `Plimeor's iPhone ... available (paired) ... iPhone 15 Pro Max`.
  - `devicectl device process launch --device C51610FF-15B1-5989-A8A3-DE2EDFACEB5B --console --terminate-existing dev.plimeor.AnchorProvisionProbe --icloud-runtime-probe` → acquired tunnel/DDI/usage assertion, then SpringBoard denied launch with `BSErrorCodeDescription = Locked`, `Unable to launch ... because the device was not, or could not be, unlocked`.
- **Gates closed this iteration:** none beyond confirming device visibility/pairing for this attempt.
- **Gates still open:** physical iPhone runtime after unlock, iOS/non-macOS CloudDocuments delivery, true remote placeholder, signed-out/over-quota, steady-state segment budget/million-op iCloud context, local-only path edge cases, Android execution, signed app-bundle/device runtime integration, fresh-machine release packaging beyond hosted runner, artifact signing/notarization/provenance policy, product conflict-resolution UX/core integration, real app TextKit runtime.
- **Backfill to 04/05/06:** `04-contract-baseline.md` iCloud baseline; `05-key-decisions.md` D35.
- **Axis matrix delta:** iCloud Drive remains `approved default transport WITH compromise constraints`; physical iPhone runtime remains externally blocked by locked device state.
- **Gate evaluation:** CONTINUE for non-device gates; do not spend more iterations on this physical-device runtime gate until the iPhone is unlocked.
- **New doc:** `docs/workbench/20260606-anchor-v1/42-ios-device-icloud-locked-rerun-report.md`

---

## 33. Progress ledger update — 2026-06-10 — hosted binding package CI

本节追加 `43-hosted-binding-package-ci-report.md` 的 ledger 状态。`21` 的原始 CP-1 synthesis 结论仍成立：CP-1 core side complete；Apple half 仍 release / delivery gated；CP-1 whole-exit 未退出。

### 33.1 Axis matrix after doc 43

| Axis | Verdict |
|---|---|
| core deterministic（groups 1+5） | **go**（unchanged） |
| multi-target compile | **go**（unchanged） |
| zero-cloud-symbol boundary | **go**（local audit rerun: 0 matches, exit 1） |
| binding（B4） | **approved boundary / partially release-gated** — hosted/fresh-runner binding package reproduction closed for verifier artifacts; signed app-bundle/device runtime and artifact provenance policy remain open |
| TextKit（group 3 runtime） | **partial mechanism floor closed** — unchanged after doc 27 |
| iCloud Drive（B14） | **approved default transport WITH compromise constraints** — unchanged after doc 42 |
| layout / retention | **compromise** — unchanged after doc 42 |
| cross-target execution CI | **hosted native/wasm/iOS-sim closed; Android execution open** — latest run also passed after adding `apple-binding-package` |
| **CP-1 whole-exit** | **未退出 (NOT exited)** |

### 33.2 Open-gate checklist after doc 43

| Gate | Status | Evidence pointer |
|---|---|---|
| hosted/fresh-runner C ABI wrapper binary package | closed | `43 §4.2`–`§4.3` |
| hosted/fresh-runner UniFFI generated async macOS runtime | closed | `43 §4.3` |
| hosted/fresh-runner UniFFI generated async iOS Simulator compile/link | closed | `43 §4.3` |
| hosted/fresh-runner UniFFI generated async iPhoneOS `arm64` compile/link | closed | `43 §4.3` |
| hosted Linux native/wasm and macOS iOS Simulator vectors after workflow expansion | closed | `43 §4.2`, `43 §4.4` |
| artifact provenance/signing/notarization policy floor | closed | `44 §4`–`§5` |
| signed app-bundle/device runtime integration | open / not run | `40 §4`, `43 §5` |
| physical-device generated async runtime | open / not run | `43 §5` |
| Developer ID signing availability | open / no Developer ID Application identity observed locally | `44 §3.5` |
| macOS product app archive / notarization submission | open / not run | `44 §5` |
| iOS app archive / TestFlight / App Store path | open / not run | `44 §5` |
| real release upload/distribution channel | open / not run | `43 §5` |
| physical iPhone runtime after unlock | open / blocked by locked device across three attempts | `32 §3.5`, `37 §3`, `42 §3.2` |
| iOS/non-macOS CloudDocuments delivery | open / runtime not observed | `42 §4` |
| true remote `.icloud` placeholder delivery | open / not proved | `33 §4` |
| signed-out / over-quota account states | open / not run | unchanged |
| steady-state segment budget / million-op iCloud context | open / not run | unchanged |
| local-only path-in-ubiquity edge cases | open / not run | unchanged |
| Android execution | open / not run | `31 §3.1`, `41 §4` |
| product conflict-resolution UX / core integration | open / not implemented | `39 §4`–`§5` |
| real app responder-chain undo / keyboard / accessibility / patch replay | open / not run | `27 §4` |

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

---

## 34. Progress ledger update — 2026-06-10 — binding artifact provenance policy

本节追加 `44-binding-artifact-provenance-policy.md` 的 ledger 状态。`21` 的原始 CP-1 synthesis 结论仍成立：CP-1 core side complete；Apple half 仍 release / delivery gated；CP-1 whole-exit 未退出。

### 34.1 Axis matrix after doc 44

| Axis | Verdict |
|---|---|
| core deterministic（groups 1+5） | **go**（unchanged） |
| multi-target compile | **go**（unchanged） |
| zero-cloud-symbol boundary | **go**（unchanged after doc 43 audit） |
| binding（B4） | **approved boundary / partially release-gated** — artifact provenance policy floor closed; actual app signing/notarization/distribution and signed app/device runtime remain open |
| TextKit（group 3 runtime） | **partial mechanism floor closed** — unchanged after doc 27 |
| iCloud Drive（B14） | **approved default transport WITH compromise constraints** — unchanged after doc 42 |
| layout / retention | **compromise** — unchanged after doc 43 |
| cross-target execution CI | **hosted native/wasm/iOS-sim closed; Android execution open** — unchanged after doc 43 |
| **CP-1 whole-exit** | **未退出 (NOT exited)** |

### 34.2 Open-gate checklist after doc 44

| Gate | Status | Evidence pointer |
|---|---|---|
| artifact provenance/signing/notarization policy floor | closed | `44 §4`–`§5` |
| verifier binding artifact checksum provenance | closed | `43 §4.3`, `44 §4.1` |
| Developer ID signing availability | open / no Developer ID Application identity observed locally | `44 §3.5` |
| macOS product app archive | open / not created | `44 §5` |
| macOS notarization submission | open / not run | `44 §5` |
| iOS app archive / TestFlight / App Store path | open / not run | `44 §5` |
| real release upload/distribution channel | open / not run | `44 §5` |
| signed app-bundle/device runtime integration | open / not run | `40 §4`, `43 §5` |
| physical-device generated async runtime | open / not run | `43 §5` |
| physical iPhone runtime after unlock | open / blocked by locked device across three attempts | `32 §3.5`, `37 §3`, `42 §3.2` |
| iOS/non-macOS CloudDocuments delivery | open / runtime not observed | `42 §4` |
| true remote `.icloud` placeholder delivery | open / not proved | `33 §4` |
| signed-out / over-quota account states | open / not run | unchanged |
| steady-state segment budget / million-op iCloud context | open / not run | unchanged |
| local-only path-in-ubiquity edge cases | open / not run | unchanged |
| Android execution | open / not run | `31 §3.1`, `41 §4` |
| product conflict-resolution UX / core integration | open / not implemented | `39 §4`–`§5` |
| real app responder-chain undo / keyboard / accessibility / patch replay | open / not run | `27 §4` |

### Ledger entry — 2026-06-10 — iteration 23 — doc 44-binding-artifact-provenance-policy.md

- **Checkpoint / cursor:** CP-1 Apple half, binding artifact provenance/signing/notarization policy gate.
- **Action selected:** define and evidence the artifact provenance policy floor using official Apple reference pointers, local tool help, local signing identity inventory, and the hosted binding package run.
- **Owner classification:** Apple binding release policy → executed as documentation/evidence synthesis; no signing/notarization/upload was performed.
- **Scope-fence check:** passed — no root workspace / lockfile / repo product app shell / public CLI schema changes; no Apple project / bundle / entitlement changes; no `suites/anchor/core/src/**` production source changes; no external release upload.
- **Evidence (Observed = command + output):**
  - `swift package compute-checksum --help` → checksum is for a binary artifact path.
  - `xcodebuild -create-xcframework -help` → packages libraries/frameworks into an XCFramework.
  - `xcrun notarytool --help` / `xcrun notarytool submit --help` → manages notary service submissions and submits an archive path.
  - `xcodebuild -help` → archive/export/notarized-app export and signing/export method surfaces.
  - `security find-identity -v -p codesigning` → only Apple Development identities observed; no Developer ID Application identity observed locally.
  - `gh run view 27227167945 ...` → hosted provenance anchor, success, head `a54aa1fc526e6125e3be97d649fededa8e97a2ca`.
- **Gates closed this iteration:** artifact provenance/signing/notarization policy floor; verifier artifact provenance manifest shape.
- **Gates still open:** Developer ID signing availability, macOS product app archive, macOS notarization submission, iOS app archive/TestFlight/App Store path, real release upload/distribution channel, signed app-bundle/device runtime integration, physical-device generated async runtime, physical iPhone runtime after unlock, iOS/non-macOS CloudDocuments delivery, true remote placeholder, signed-out/over-quota, steady-state segment budget/million-op iCloud context, local-only path edge cases, product conflict-resolution UX/core integration, Android execution, real app TextKit runtime.
- **Backfill to 04/05/06:** `04-contract-baseline.md` binding baseline; `05-key-decisions.md` D01.
- **Axis matrix delta:** binding remains `approved boundary / partially release-gated`; artifact provenance policy floor moved from open to closed, while actual signing/notarization/distribution remains open.
- **Gate evaluation:** CONTINUE — next action should target signed app/device runtime after unlock, remaining iCloud gates, Android execution feasibility, TextKit product-runtime gates, or product app archive only if explicitly scoped.
- **New doc:** `docs/workbench/20260606-anchor-v1/44-binding-artifact-provenance-policy.md`

---

## 35. Progress ledger update — 2026-06-10 — iOS Simulator iCloud rerun

本节追加 `45-ios-simulator-icloud-rerun-report.md` 的 ledger 状态。`21` 的原始 CP-1 synthesis 结论仍成立：CP-1 core side complete；Apple half 仍 release / delivery gated；CP-1 whole-exit 未退出。

### 35.1 Axis matrix after doc 45

| Axis | Verdict |
|---|---|
| core deterministic（groups 1+5） | **go**（unchanged） |
| multi-target compile | **go**（unchanged） |
| zero-cloud-symbol boundary | **go**（unchanged after doc 45 audit） |
| binding（B4） | **approved boundary / partially release-gated** — unchanged after doc 44 |
| TextKit（group 3 runtime） | **partial mechanism floor closed** — unchanged after doc 27 |
| iCloud Drive（B14） | **approved default transport WITH compromise constraints** — iOS Simulator runtime rejected as physical iOS substitute for current runtime |
| layout / retention | **compromise** — unchanged after doc 44 |
| cross-target execution CI | **hosted native/wasm/iOS-sim closed; Android execution open** — unchanged after doc 43 |
| **CP-1 whole-exit** | **未退出 (NOT exited)** |

### 35.2 Open-gate checklist after doc 45

| Gate | Status | Evidence pointer |
|---|---|---|
| iOS Simulator CloudDocuments runtime | rejected for current runtime / `BRCloudDocsErrorDomain:153` | `45 §3.4`–`§3.5` |
| physical iPhone runtime after unlock | open / blocked by locked device across three attempts | `32 §3.5`, `37 §3`, `42 §3.2` |
| iOS/non-macOS CloudDocuments delivery | open / not closed by Simulator | `45 §4` |
| true remote `.icloud` placeholder delivery | open / not proved | `33 §4` |
| signed-out / over-quota account states | open / not run | unchanged |
| steady-state segment budget / million-op iCloud context | open / not run | unchanged |
| local-only path-in-ubiquity edge cases | open / not run | unchanged |
| Developer ID signing availability | open / no Developer ID Application identity observed locally | `44 §3.5` |
| macOS product app archive | open / not created | `44 §5` |
| macOS notarization submission | open / not run | `44 §5` |
| iOS app archive / TestFlight / App Store path | open / not run | `44 §5` |
| real release upload/distribution channel | open / not run | `44 §5` |
| signed app-bundle/device runtime integration | open / not run | `40 §4`, `43 §5` |
| physical-device generated async runtime | open / not run | `43 §5` |
| Android execution | open / not run | `31 §3.1`, `41 §4` |
| product conflict-resolution UX / core integration | open / not implemented | `39 §4`–`§5` |
| real app responder-chain undo / keyboard / accessibility / patch replay | open / not run | `27 §4` |

### Ledger entry — 2026-06-10 — iteration 24 — doc 45-ios-simulator-icloud-rerun-report.md

- **Checkpoint / cursor:** CP-1 Apple half, iOS Simulator CloudDocuments delivery gate.
- **Action selected:** rerun the Xcode-managed iOS Simulator CloudDocuments verifier after user stated the Simulator is logged into iCloud.
- **Owner classification:** Apple iOS Simulator runtime verifier → executed through repo-external Xcode project and explicit `DEVELOPER_DIR` shell commands after XcodeBuildMCP tool environment failed to resolve `simctl`.
- **Scope-fence check:** passed — no root workspace / lockfile / repo product app shell / public CLI schema changes; no Xcode project / bundle / entitlement changes; no `suites/anchor/core/src/**` production source changes; no iCloud account mutation.
- **Evidence (Observed = command + output):**
  - `mcp__xcodebuildmcp.session_show_defaults` → project/scheme/simulator/bundle defaults set for `AnchorProvisionProbe`.
  - `mcp__xcodebuildmcp.build_run_sim({"launchArgs":["--icloud-runtime-probe"]})` → `xcrun: error: unable to find utility "simctl"`; classified as tool-environment friction.
  - `xcrun simctl list devices available` → `iPhone 17 (A1D90DAB-1FAC-413A-BCB4-F92B9F798F75) (Booted)`.
  - `xcodebuild -showdestinations` → iOS Simulator destination `A1D90DAB-1FAC-413A-BCB4-F92B9F798F75`, OS 26.5.
  - `xcodebuild ... build` → `** BUILD SUCCEEDED **`.
  - simulated xcent → CloudDocuments / ubiquity entitlement keys present for `<ICLOUD_CONTAINER>`.
  - `simctl install` → exit 0.
  - `simctl launch --console --terminate-running-process ... --icloud-runtime-probe` → app launched, `explicit_nil=true`, `implicit_nil=true`, `blocked=no_ubiquity_container`.
  - `log show` for `bird` → `BRCloudDocsErrorDomain:153`, `Returning error because iCloud Drive not supported`.
  - core cloud-symbol audit → 0 matches, exit 1.
  - Apple deterministic-semantics audit for `diff3|order-key|fractional|merge semantic|canonical` → 0 matches, exit 1; `snapshot_revision` remains a transported DTO field name only.
- **Gates closed this iteration:** none. This is negative delivery evidence.
- **Gates rejected/kept open:** current iOS 26.5 Simulator is not a valid substitute for physical iOS CloudDocuments runtime proof; iOS/non-macOS CloudDocuments delivery remains open.
- **Gates still open:** physical iPhone runtime after unlock, iOS/non-macOS CloudDocuments delivery, true remote placeholder, signed-out/over-quota, steady-state segment budget/million-op iCloud context, local-only path edge cases, product conflict-resolution UX/core integration, Android execution, real app TextKit runtime, signed app-bundle/device runtime integration, physical-device generated async runtime, Developer ID signing availability, product app archive/notarization/App Store/release upload.
- **Backfill to 04/05:** `04-contract-baseline.md` iCloud baseline; `05-key-decisions.md` D35.
- **Axis matrix delta:** iCloud Drive remains `approved default transport WITH compromise constraints`; Simulator evidence moved from “maybe usable after login” to “not usable for this runtime.”
- **Gate evaluation:** CONTINUE — next action should target physical iPhone runtime after unlock, remaining non-simulator iCloud gates, Android execution feasibility, TextKit product-runtime gates, or signed app/device runtime integration.
- **New doc:** `docs/workbench/20260606-anchor-v1/45-ios-simulator-icloud-rerun-report.md`

---

## 36. Progress ledger update — 2026-06-10 — local-only path classifier

本节追加 `46-local-only-path-classifier-report.md` 的 ledger 状态。`21` 的原始 CP-1 synthesis 结论仍成立：CP-1 core side complete；Apple half 仍 release / delivery gated；CP-1 whole-exit 未退出。

### 36.1 Axis matrix after doc 46

| Axis | Verdict |
|---|---|
| core deterministic（groups 1+5） | **go**（unchanged） |
| multi-target compile | **go**（unchanged） |
| zero-cloud-symbol boundary | **go**（unchanged after doc 46 audit） |
| binding（B4） | **approved boundary / partially release-gated** — unchanged after doc 45 |
| TextKit（group 3 runtime） | **partial mechanism floor closed** — unchanged after doc 27 |
| iCloud Drive（B14） | **approved default transport WITH compromise constraints** — local-only path classifier floor partially closed |
| layout / retention | **compromise** — unchanged after doc 45 |
| cross-target execution CI | **hosted native/wasm/iOS-sim closed; Android execution open** — unchanged after doc 45 |
| **CP-1 whole-exit** | **未退出 (NOT exited)** |

### 36.2 Open-gate checklist after doc 46

| Gate | Status | Evidence pointer |
|---|---|---|
| local-only direct local path + backup exclusion | closed / observed | `46 §4.2`–`§4.3` |
| local-only direct iCloud path blocked | closed / observed | `46 §4.2`–`§4.3` |
| local symlink resolving into iCloud blocked | closed / observed | `46 §4.2`–`§4.3` |
| iCloud symlink resolving to local blocked by raw-path policy | closed / observed | `46 §4.2`–`§4.3` |
| local-only external volume path behavior | open / not run | `46 §6` |
| local-only security-scoped bookmark restoration | open / not run | `46 §6` |
| local-only Finder-moved package UI surface | open / not run | `46 §6` |
| local-only `.icloud` placeholder path classification | open / not run | `46 §6` |
| signed-out / unavailable account path classification | open / not run | `46 §6` |
| physical iPhone runtime after unlock | open / blocked by locked device across three attempts | `32 §3.5`, `37 §3`, `42 §3.2` |
| iOS/non-macOS CloudDocuments delivery | open / not closed by Simulator | `45 §4` |
| true remote `.icloud` placeholder delivery | open / not proved | `33 §4` |
| signed-out / over-quota account states | open / not run | unchanged |
| steady-state segment budget / million-op iCloud context | open / not run | unchanged |
| Developer ID signing availability | open / no Developer ID Application identity observed locally | `44 §3.5` |
| signed app-bundle/device runtime integration | open / not run | `40 §4`, `43 §5` |
| physical-device generated async runtime | open / not run | `43 §5` |
| Android execution | open / not run | `31 §3.1`, `41 §4` |
| product conflict-resolution UX / core integration | open / not implemented | `39 §4`–`§5` |
| real app responder-chain undo / keyboard / accessibility / patch replay | open / not run | `27 §4` |

### Ledger entry — 2026-06-10 — iteration 25 — doc 46-local-only-path-classifier-report.md

- **Checkpoint / cursor:** CP-1 Apple half, local-only path-in-ubiquity classifier gate.
- **Action selected:** add and run a signed macOS verifier command for D21/D21a local-only path classification.
- **Owner classification:** Apple iCloud/local filesystem runtime verifier → implemented in repo-local signed macOS verifier; no product app shell or core code touched.
- **Scope-fence check:** passed — no root workspace / lockfile / repo product app shell / public CLI schema changes; no `suites/anchor/core/src/**` production source changes; no iCloud account mutation.
- **Evidence (Observed = command + output):**
  - initial `/tmp/anchor-apple-stage1/local-only-path-probe` local root attempt → `NSCocoaErrorDomain Code=513`, sandbox write denied; final probe uses app sandbox temp dir.
  - `xcodebuild ... AnchorMacICloudProbe ... build` → signed Apple Development build with CloudDocuments entitlements, `** BUILD SUCCEEDED **`.
  - `codesign -d --entitlements :- .../AnchorMacICloudProbe.app` → CloudDocuments / ubiquity container entitlements and app sandbox present.
  - `AnchorMacICloudProbe --icloud-local-only-path-probe` → explicit/implicit ubiquity non-nil; local sandbox vault `blocked_local_only_open=false`, `excluded_from_backup=true`; direct iCloud Documents vault blocked; local symlink→iCloud blocked by resolved path/ubiquity; iCloud symlink→local blocked by raw path/ubiquity; iCloud and local temp roots removed.
  - core cloud-symbol audit → 0 matches, exit 1.
  - Apple deterministic-semantics audit for `diff3|order-key|fractional|merge semantic|canonical` → 0 matches, exit 1.
- **Gates closed this iteration:** local-only path classifier mechanism floor for normal local, direct iCloud, local symlink→iCloud, iCloud symlink→local, and backup exclusion readback.
- **Gates still open:** external volume, security-scoped bookmark restoration, Finder move UI surface, `.icloud` placeholder classification, signed-out/unavailable account path classification, physical iPhone runtime after unlock, iOS/non-macOS CloudDocuments delivery, true remote placeholder, signed-out/over-quota, steady-state segment budget/million-op iCloud context, product conflict-resolution UX/core integration, Android execution, real app TextKit runtime, signed app-bundle/device runtime integration, physical-device generated async runtime, Developer ID signing availability.
- **Backfill to 04/05/06:** `04-contract-baseline.md` local-only baseline; `05-key-decisions.md` D21/D21a; `06-fixture-set.md` F41.
- **Axis matrix delta:** iCloud Drive remains `approved default transport WITH compromise constraints`; local-only path-in-ubiquity moved from fully open to partially mechanism-closed.
- **Gate evaluation:** CONTINUE — next action should target another remaining iCloud edge case, Android execution feasibility, TextKit product-runtime gates, or signed app/device runtime integration.
- **New doc:** `docs/workbench/20260606-anchor-v1/46-local-only-path-classifier-report.md`

---

## 37. Progress ledger update — 2026-06-10 — TextKit accessibility range

本节追加 `47-textkit-accessibility-range-report.md` 的 ledger 状态。`21` 的原始 CP-1 synthesis 结论仍成立：CP-1 core side complete；Apple half 仍 release / delivery gated；CP-1 whole-exit 未退出。

### 37.1 Axis matrix after doc 47

| Axis | Verdict |
|---|---|
| core deterministic（groups 1+5） | **go**（unchanged） |
| multi-target compile | **go**（unchanged） |
| zero-cloud-symbol boundary | **go**（unchanged after doc 47 audit） |
| binding（B4） | **approved boundary / partially release-gated** — unchanged after doc 46 |
| TextKit（group 3 runtime） | **partial mechanism floor closed** — macOS accessibility selected range readback floor closed; product/iOS accessibility remains open |
| iCloud Drive（B14） | **approved default transport WITH compromise constraints** — unchanged after doc 46 |
| layout / retention | **compromise** — unchanged after doc 46 |
| cross-target execution CI | **hosted native/wasm/iOS-sim closed; Android execution open** — unchanged after doc 46 |
| **CP-1 whole-exit** | **未退出 (NOT exited)** |

### 37.2 Open-gate checklist after doc 47

| Gate | Status | Evidence pointer |
|---|---|---|
| macOS accessibility selected range readback | closed as mechanism floor | `47 §4.1` |
| product accessibility mapping | open / not run | `47 §5` |
| VoiceOver / Accessibility Inspector runtime | open / not run | `47 §5` |
| cross-view / cross-block accessibility expression | open / not run | `47 §5` |
| `UITextView` runtime accessibility behavior | open / not run | `47 §4.2`, `47 §5` |
| real app responder-chain undo / keyboard / patch replay | open / not run | `27 §4`, `47 §5` |
| external volume | open / not run | `46 §6` |
| security-scoped bookmark restoration | open / not run | `46 §6` |
| Finder move UI surface | open / not run | `46 §6` |
| `.icloud` placeholder classification | open / not run | `46 §6` |
| signed-out/unavailable account path classification | open / not run | `46 §6` |
| physical iPhone runtime after unlock | open / blocked by locked device across three attempts | `32 §3.5`, `37 §3`, `42 §3.2` |
| iOS/non-macOS CloudDocuments delivery | open / not closed by Simulator | `45 §4` |
| true remote `.icloud` placeholder delivery | open / not proved | `33 §4` |
| signed-out / over-quota account states | open / not run | unchanged |
| steady-state segment budget / million-op iCloud context | open / not run | unchanged |
| Developer ID signing availability | open / no Developer ID Application identity observed locally | `44 §3.5` |
| signed app-bundle/device runtime integration | open / not run | `40 §4`, `43 §5` |
| physical-device generated async runtime | open / not run | `43 §5` |
| Android execution | open / not run | `31 §3.1`, `41 §4` |
| product conflict-resolution UX / core integration | open / not implemented | `39 §4`-`§5` |

### Ledger entry — 2026-06-10 — iteration 26 — doc 47-textkit-accessibility-range-report.md

- **Checkpoint / cursor:** CP-1 Apple half, TextKit product-runtime accessibility range gate.
- **Action selected:** add a macOS `NSTextView` probe that sets a UTF-16 selected range over `"A🍎B"` and reads it back through `accessibilitySelectedTextRange()`.
- **Owner classification:** Apple TextKit runtime verifier → implemented in repo-local spike probe/smoke; no product app shell or core code touched.
- **Scope-fence check:** passed — no root workspace / lockfile / repo product app shell / public CLI schema changes; no `suites/anchor/core/src/**` production source changes; no deterministic core semantics duplicated in Swift.
- **Evidence (Observed = command + output):**
  - `swift run --package-path suites/anchor/apple/AnchorAppleSpike --scratch-path /tmp/anchor-apple-stage1/swift-build-textkit-accessibility-20260610 AnchorTextKitSmoke` → `textkit:accessibility_selected_range=1:2` with existing UTF-16 / IME / hit-testing / direct-buffer undo outputs.
  - `xcodebuild -scheme AnchorTextKitProbe -destination 'generic/platform=iOS Simulator' ... build` → `** BUILD SUCCEEDED **`.
  - core cloud-symbol audit → 0 matches, exit 1.
  - Apple deterministic-semantics audit for `diff3|order-key|fractional|merge.*semantic|canonical` → 0 matches, exit 1.
- **Gates closed this iteration:** macOS accessibility selected range readback mechanism floor.
- **Gates still open:** product accessibility mapping, VoiceOver/UI runtime, cross-view accessibility expression, `UITextView` runtime accessibility behavior, real app responder-chain undo, keyboard event capture, `EditorPatch` replay over splitting/moving views, remaining local-only path edge cases, physical iPhone runtime after unlock, iOS/non-macOS CloudDocuments delivery, true remote placeholder, signed-out/over-quota, steady-state segment budget/million-op iCloud context, product conflict-resolution UX/core integration, Android execution, signed app-bundle/device runtime integration, physical-device generated async runtime, Developer ID signing availability.
- **Backfill to 04/05/06:** `04-contract-baseline.md` TextKit baseline; `05-key-decisions.md` D18; `06-fixture-set.md` Apple TextKit fixture evidence.
- **Axis matrix delta:** TextKit remains `partial mechanism floor closed`; accessibility selected range readback moved from open mechanism evidence to closed, while product/iOS accessibility gates remain open.
- **Gate evaluation:** CONTINUE — next action should target remaining TextKit product-runtime gates, another iCloud edge case, Android execution feasibility, signed app/device runtime integration, or physical-device generated async runtime.
- **New doc:** `docs/workbench/20260606-anchor-v1/47-textkit-accessibility-range-report.md`
