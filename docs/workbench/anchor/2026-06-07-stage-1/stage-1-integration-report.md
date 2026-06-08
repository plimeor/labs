# Anchor Stage 1 — Integration / CP-1 Readiness Report

日期：2026-06-07
状态：**workbench artifact** —— 非公开接口契约。本文件把 Codex / Apple verifier 的 Stage 1 实测报告（binding / TextKit / iCloud Drive）与 Claude / core owner 的 core spike 证据（`core-spike-report.md` / `core-evidence.md`）整合为**当前决策状态**与 **CP-1 下一步 gate** 的收口结论。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**任何 package / workspace / 产品 app / 生成 lockfile 改动；**不**改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置，**不**创建产品 app shell / entitlement / bundle id / iCloud container。`suites/anchor/apple/AnchorMacICloudProbe` 是 verifier-only macOS Xcode project，不是产品工程。权威接口契约在实现后归 `anchor-core` 包 README。
>
> 引用：core 报告 = `core-spike-report.md` / `core-evidence.md`；Apple 报告 = `apple-binding-report.md` / `textkit-adapter-report.md` / `icloud-drive-report.md`；交接 = `codex-apple-input.md`（core→Codex 被调 surface）/ `apple-patch-list-for-claude.md`（Codex→integration evidence）；决策 = `../2026-06-06-phase-0/`（`cp-0-final.md` / `cp-0-approval.md` / `key-decisions.md` D01–D38 / `contract-baseline.md` / `fixture-set.md` F01–F43 / `stage-1-spike-plan.md` / `stage-1-entry-brief.md`）。

---

## 1. 结论（CP-1 readiness）

**Core side = complete；CP-1 整体 = 未退出（按 axis 分）。** Core owner 的确定性 core（spike 组 1、5）已落成正式测试并通过；World A 多目标编译 gate、client 零真理逻辑红线、core 零云符号边界通过。Codex / Apple verifier 的 binding（组 2）已由用户批准为 B4 产品边界；TextKit（组 3）机制面通过；iCloud Drive（组 4）已由用户批准为首期 default transport，批准形状为 **default transport with compromise constraints**。CP-1 整体退出仍 gated on Codex/Apple implementation gates（见 §6、§9）。Stop condition check 见 §11。

---

## 2. Verified ground truth（Stage 1 Observed）

Stage 1 evidence is synchronized into the current decision files. The current repo-local Apple addition is limited to a verifier-only macOS project created through Xcode UI under `suites/anchor/apple/AnchorMacICloudProbe`; `project.pbxproj` was not hand-patched after creation. The signed iCloud runtime uses explicit `xcodebuild` entitlement/Info build settings. Root workspace, lockfile, core, and product app targets remain unchanged.

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
| **core multi-target gate（D36）** | **go** | `wasm32-unknown-unknown` + `aarch64-linux-android` 编译 gate 通过；零依赖使 gate by construction 不可被 transitive crate 打破。仅**编译**门控；跨目标**执行**（wasmtime / android emulator）golden 接线留 CI（Not run）。 |
| **mirror / search parity（组 5）** | **go** | `mirror_parity` 测试通过：structured search == ripgrep(md)、mirror 写失败隔离（op-log 不回滚）、body 冲突 git fence。 |
| **Apple binding（组 2，A2/B4）** | **approved / release-gated** | 用户已于 2026-06-07 批准产品边界：`UniFFI DTO / ordinary dispatch + C ABI bytes fast path`。typed `ValidationError` enum 已落到 core DTO + C ABI Swift wrapper + UniFFI generated enum；synchronous release-surface smoke 已过 Swift 6 strict concurrency + warnings-as-errors。Release implementation gates 为 async `Sendable` surface、最终 DTO/error vocabulary、product wrapper import surface、CI/fresh-machine 复现（§5）。 |
| **TextKit adapter（组 3，D18）** | **compromise（mechanism-go）** | 机制面可行且边界干净（Swift 零确定性语义、buffer 非真理）；real-app responder-chain undo 抑制、IME marked-text commit、accessibility、hit-testing、patch replay over moving views、UTF-16 内部单位换算稳定性仍是**产品级 runtime gate**（Not run）。 |
| **iCloud Drive（组 4，B14）** | **approved default transport / compromise constraints** | 用户已批准 iCloud Drive 作首期 default transport（2026-06-07）。signed macOS app + repo-local Xcode-created macOS verifier 通过 ubiquity/package/coordinator/direct-enumeration/build-signing gates；repo-local verifier 的 project file 只由 Xcode UI 生成，CloudDocuments/Info 由 build settings 输入；package-internal `.seg` 发现**不依赖** `NSMetadataQuery`。remote placeholder / account states / non-macOS runtime-scale / steady-state budget / conflict policy 仍是 delivery gates（§6）。 |
| **layout / Bun（D02）** | **go for macOS-only verifier placement** | Option A 纪律 live 守住（`members=["core"]`、`suites/anchor/**` 无 `package.json`、root 配置未动）；`bun install --dry-run --frozen-lockfile --ignore-scripts` passed。 |
| **retention（D14/D38）** | **compromise** | 四-horizon 模型内部一致、core `retention`(7) + `segment_budget`(3) 测试通过；steady-state segment budget、million-op compaction、stale-peer watermark advance、product conflict-resolution policy 是 scale-gate / Codex-Apple 工作（未测）。 |

> **Verdict 语义：** go = 本轮证据足以进 CP-1 当前基线；approved / release-gated = 产品边界已批准但仍有 release delivery gate；compromise = 机制/core 面通过但仍有明确 open gate；blocked / no-go = 无（本轮未出现）。

---

## 4. Observed / Recommended / Compromise / Open gate / Stop condition

### 4.1 Observed evidence（已实测，不含 Not run 当事实）

- **Core（`core-evidence.md`）：** 74 测试、clippy 干净、wasm32+android 编译、零云符号、跨目标一致性 golden（8 向量，`aarch64-apple-darwin` 捕获）、million-op replay 线性（release `--ignored`，report-Observed ≈2.1µs/op、1.25M ops≈2.6s）。
- **Binding（`apple-binding-report.md`）：** Rust macOS/iOS/iOS-sim 三 slice 构建；UniFFI generated Swift **full round-trip**（`EditorIntentDto` insert→`changedIds=[blk_a]`、UTF-16 caret `3:3`、`set_life=deleted` 返回 typed `ValidationErrorCode.directActiveToDeleted`、post-dispatch snapshot revision + 非空 segment bytes + `seg_` id）；C ABI/UniFFI 三 slice XCFramework + SwiftPM wrapper import；release-surface rerun 下 C ABI/UniFFI 三 slice XCFramework 均创建成功，generated Swift 通过 `-swift-version 6 -strict-concurrency=complete -warnings-as-errors` synchronous smoke；1/4/16/64MB bytes benchmark（C ABI 64MB ≈38.22ms/96MB，UniFFI 64MB ≈145.22ms/267MB，3.8×慢/2.8×RSS）。跨 FFI 真值一致：fixture `snapshot_revision 3ef88671…a877b63` 在两侧 Swift smoke 与 core `determinism_vectors` 逐字节一致。
- **TextKit（`textkit-adapter-report.md`）：** macOS `NSTextView` runtime 设 UTF-16 selection、layout、adapter-owned `UndoManager` semantic-inverse-intent；iOS sim 编译；UTF-16 fixture 计数（emoji/ZWJ/combining/CRLF/mixed）；intent-shaped 映射 + patch replay 到 view-model projection（buffer 非真理）。
- **iCloud（`icloud-drive-report.md`）：** signed macOS `.app` + repo-local Xcode-created macOS verifier 通过 ubiquity container lookup、`.anchorvault` package UTType（conform `com.apple.package`、`vault_is_ubiquitous=true`）、`NSFileCoordinator` 读写（equal）、package-level `NSMetadataQuery` 发现（macOS `count=1`）、package-internal **direct enumeration**（macOS 1024 hidden + 128 visible）、macOS 10K/50K/100K package-internal direct enumeration（≈27.70ms / 142.63ms / 299.51ms）、repo-local macOS 10K/50K/100K direct enumeration（≈22.53ms / 124.70ms / 269.50ms）、1024-file subset 写（macOS≈3247ms / repo-local macOS≈378ms）、online 跨设备收敛（0 conflict）、offline fork 后 `NSFileVersion` 冲突 materialization（1 retained，未解决）。Repo-local verifier builds/runs for macOS only with CloudDocuments entitlement preserved by explicit build settings, and `project.pbxproj` was not hand-patched. **确认：** package-internal `.seg` 发现**返回 0**（每变体与 10K/50K/100K），package-external `.seg` 被枚举（125/128）；macOS package-internal segment evict/download both return `NSCocoaErrorDomain:4`。

### 4.2 Approved / recommended decision（当前基线）

- **Binding（B4 approved，2026-06-07）：** `UniFFI DTO / ordinary dispatch + C ABI bytes fast path`（**非** pure-UniFFI bulk bytes）。C ABI fast path **保留**（非 fallback-only），因 UniFFI 64MB 慢 3.8×/RSS 2.8×。
- **iCloud adapter 形状：** `NSMetadataQuery` 发现 vault/package；`NSFileCoordinator` 保护读写；package-internal segment 用 **file-coordinated direct enumeration**（**不**用 `NSMetadataQuery` 枚举 package internals）；manifest 默认 per-device immutable cursor。
- **边界：** core 永不出现云/文件协调/account 类型；Swift/TextKit 不实现 merge/normalization/op-creation/tree-invariant/diff3/order-key；Option A `suites/anchor/*` 为已批准 spike 位置。

### 4.3 Compromise / delivery gates（机制通过或路线批准后的剩余门）

- **iCloud Drive 作首期默认 transport（B14）= approved default transport with compromise constraints**。runtime/file-transport 机制已证，macOS direct enumeration scale gate 通过到 100K；remote placeholder、account-state、non-macOS large-scale delivery、steady-state segment budget 与 conflict-policy 是交付 gate；transport 路线选择状态保持 approved。
- **TextKit = mechanism-go**，产品 editor runtime 未完成。
- **layout/Bun = go for macOS-only verifier placement**：Option A 纪律守住，Bun glob dry-run passed。

### 4.4 Open gate（待证 / 交付，不得当已验证）

- **Binding release gates（B4 approved）：** UniFFI async-`Sendable` surface；最终 DTO/error vocabulary；product wrapper import surface；release/CI/fresh-machine 复现。Synchronous generated Swift strict-concurrency release smoke and three-slice XCFramework packaging are observed；typed `ValidationError` enum 已由 core-owner 决策并落地，现有 validated code 包含 `invalid_utf16_offset`、`direct_active_to_deleted`、`structural_dispatch_deferred`。
- **iCloud（§6 最小矩阵）：** remote `.icloud` placeholder download、signed-out / over-quota、product conflict-resolution policy、million-op replay/merge/compaction + steady-state segment budget、local-only path-in-ubiquity 边界、non-macOS large-scale delivery / package-level metadata gather、repo-local signed Anchor app target。
- **TextKit（组 3）：** real-app responder-chain undo 抑制 / IME marked-text commit / accessibility / hit-testing / patch replay over moving views / keyboard→`EditorIntent` / UTF-16 内部单位换算（D18 fixture）。
- **跨目标执行：** wasm（wasmtime）/ iOS slice 的 golden 向量**执行**接线（编译 gate 已过；执行 by construction，CI 接线 Not run）。

### 4.5 Stop condition（本轮无触发，作为前置守卫）

改 root workspace/package/lockfile；在 Swift/TextKit 复制 core 确定性语义；绕过 B14 compromise constraints 发布 iCloud transport；CloudKit schema / CKSyncEngine；公开 CLI schema 变更；把 Apple probe 变产品 app shell；`anchor-core` 泄漏 Apple 云/文件协调类型。**本轮一项未触。**

---

## 5. Binding — approved product boundary

**B4 已由用户于 2026-06-07 批准：`UniFFI 生成 Swift（DTO / 结构化 error / 普通 dispatch）+ C ABI bytes fast path（bulk segment/blob）`。** C ABI fast path 是**保留**项（非 fallback-only 也非 pure-UniFFI），由 64MB benchmark（3.8× 时延 / 2.8× RSS）直接支撑。Swift 侧零确定性语义（`EditorIntent`/`OpStamp` 在 Rust 构造，时钟/熵由 Swift 传入，D36）。

**Release implementation gates：**

1. **UniFFI async-`Sendable` release surface** 仍是冻结 gate；synchronous generated Swift 已在 release artifact 上通过 `-swift-version 6 -strict-concurrency=complete -warnings-as-errors`。
2. **最终生产 DTO/error vocabulary 冻结**（Stage 1 用 flat `EditorIntentDto`/`TransactionResultSummary` 以免把确定性逻辑搬进 Swift；typed `ValidationError` enum 已进入 current DTO）。
3. **Product Swift wrapper import surface + release-build/CI/fresh-machine 复现**（含显式 Rust Apple-target 检查与 wasm32 一致性向量 gate）。

---

## 6. iCloud Drive — 状态与最小下一轮验证矩阵

**状态 = approved default transport with compromise constraints。** 可批准的 adapter 形状已锁定（metadata 发现 vault/package + file-coordinated direct package-internal enumeration + `NSFileVersion` 暴露冲突面 + per-device immutable cursor）。B14 已由用户于 2026-06-07 批准；剩余项作为交付 gate：

| # | 最小验证项 | 当前态 |
|---|---|---|
| 1 | **segment-file-count scale 10K / 50K / 100K**：write_ms + direct-enumeration_ms + synced-segment-file-count；断言 N 个 logical op 不产 ~N 个 synced segment | repo-local macOS verifier passed 10K / 50K / 100K direct enumeration (`22.53ms` / `124.70ms` / `269.50ms` enum); package-internal metadata stayed 0; non-macOS large-scale delivery not run |
| 2 | **remote `.icloud` placeholder download**：驱逐 package-internal segment 成真 placeholder 再 `startDownloadingUbiquitousItem` 到 `Current`（区别于本地/current；刻画 macOS `NSCocoaErrorDomain:4` 路径） | macOS package-internal evict/download attempted; both returned `NSCocoaErrorDomain:4`; true remote placeholder not proved |
| 3 | **signed-out / over-quota account states** | Blocked / not run |
| 4 | **product conflict-resolution policy**：对 `NSFileVersion` 冲突的 surfacing / preservation / resolution（绝不静默解决或丢弃 conflict version） | 仅 observe，无 policy |
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
- **单向交接：** core 经 `codex-apple-input.md` 提供 DTO/dispatch/`SegmentId` 真值约定，Codex/Apple adapter 消费；时钟/熵（`op_id` / HLC）由 Swift 传入 core，core 永不自取（D36）。
- **workspace 边界：** `members=["core"]`；`apple/ffi`（staticlib）与 `apple/uniffi`（staticlib+cdylib）是 **非 member** wrapper crate（显式 `--manifest-path` 构建），故 `apple/` 内合法 Apple 类型不破坏 core 红线，wasm32+android gate 不被污染。

---

## 8. Decision-file sync status

| 文件 | 角色 | 状态 | 本轮动作 |
|---|---|---|---|
| `cp-0-final.md` | decision-contract（CP-0 索引） | **已同步** | §4 / §6 作为 Stage 1 后当前入口：B4 approved binding product boundary、TextKit mechanism、B14 default transport approval、core gate 与剩余 open gates 对齐 |
| `cp-0-approval.md` | approval-surface | **已同步** | 保留 CP-0 批准事实；A2/B4 更新为 approved binding product boundary；B14 更新为 approved default transport with compromise constraints |
| `key-decisions.md` | decision-contract | **已同步** | D01 B4 approved binding product boundary + typed `ValidationError` + release-surface evidence；D06/D35 macOS 10K/50K/100K direct enumeration evidence；保留 placeholder/account/conflict/steady-state budget gates |
| `contract-baseline.md` | decision-contract | **已同步** | Binding / sync baseline 吸收 typed error、C ABI bytes fast path、iCloud direct-enumeration compromise |
| `stage-1-spike-plan.md` | brief/plan | **已同步** | Stage 1 observed items 与 remaining product gates 分离；不把 product runtime / CI / default transport 当已批准 |
| `stage-1-entry-brief.md` | brief | **已同步** | 已反映 Stage 1 binding/iCloud/TextKit 当前状态 |
| `fixture-set.md` | decision-contract | synced | F23/F26/F42/F43 Stage 1 回填一致，无改 |
| `apple-verification.md` | **evidence-record**（cp-0-final 索引：现实核验证据） | leave-as-is | clause-correction 发现叙述属于验证内容，不作为当前决策契约改写 |
| `research-notes.md` | **evidence-record**（早期调研原始记录，非批准面） | leave-as-is | 其 gate-resolution / 时序推理叙述是研究记录 → 不改 |
| `codex-verification-packet.md` | **evidence-record**（Codex 验证原始记录，非批准面） | leave-as-is | 其 clause-correction 指令叙述是原始记录 → 不改 |

> **分类规则（决定性）：** 长期决策文档 / 批准面只写当前目标态与责任边界；evidence-record / 原始记录 / research-notes 合法地记录跨时间的发现与推理，其过程叙述是**内容**、不得抹除。`cp-0-final.md` 索引对「证据 vs 决策」的归类为权威。

---

## 9. Remaining work

**当前整合已补入 repo-local Xcode-created Apple verifier evidence。** 该 verifier project 通过 Xcode UI 创建；`project.pbxproj` 未手动 patch；signed runtime 通过 explicit entitlement/Info build settings 验证。Core side complete（74 测试、多目标 gate、边界干净）；B4 binding 产品边界、TextKit mechanism evidence、B14 默认 transport 均已进入当前基线。CP-1 整体退出仍依赖后续 Codex/Apple implementation gates，非 core deterministic 工作。

**精确命令 / 环境 / stop condition：**

- **Env：** macOS + Xcode 26.5 (17F42)、Swift 6.3.2、rustc/cargo 1.95.0；`aarch64-apple-darwin` target 已装；付费 ADP team（已开通，apple-verification §2.6）+ signed macOS verifier app + 真实 iCloud account；构建产物落 `/tmp/anchor-apple-stage1`（**repo 外**）；probe 只在 `suites/anchor/apple/**`（Option A）；repo-local verifier project 为 `suites/anchor/apple/AnchorMacICloudProbe/AnchorMacICloudProbe.xcodeproj`，由 Xcode UI 创建且不手改 project file；root `package.json` / `bun.lock` / workspace config / `suites/anchor/core` / `suites/anchor/Cargo.toml` **不得改**。
- **命令骨架：**
  - iCloud scale：在真实 account 写 + file-coordinated direct-enumerate package-internal `.seg` 于 10_000 / 50_000 / 100_000，记 `write_ms` + `enumeration_ms` + synced-segment-file-count（断言 N op 不产 ~N segment）。
  - remote placeholder：驱逐 package-internal segment 成真 `.icloud` placeholder，再 `startDownloadingUbiquitousItem` 到 `Current`（刻画 macOS `NSCocoaErrorDomain:4`）。
  - account states：signed-out 与 over-quota 下重跑 ubiquity/`NSFileCoordinator` probe，记 adapter 行为。
  - conflict policy：扩展 offline-fork probe，跑一条 surfacing/preservation/resolution 路径（绝不静默解决 `NSFileVersion` 冲突）。
  - `cargo test --release --manifest-path suites/anchor/Cargo.toml -- --ignored scale_bench::replay_cost_curve`（million-op replay 线性，确认 1.25M+ ≈2.1µs/op + compaction 后稳态 segment budget）。
  - TextKit 产品 runtime：IME marked-text commit / accessibility range / hit-testing on rendered geometry / direct-buffer undo 抑制 / keyboard→`EditorIntent` / `EditorPatch` replay over splitting/moving views；UTF-16 内部单位换算稳定性（emoji/ZWJ/combining/CRLF/IME fixture，D18）。
  - Binding release 输入：typed `ValidationError` enum 已落地；generated UniFFI Swift 的 synchronous strict-concurrency release smoke 与三 slice XCFramework packaging 已观察；剩余 gate 是 async-`Sendable` surface、final DTO/error vocabulary、product wrapper import surface、release/CI 复现（fresh CI/dev 机器）。
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
