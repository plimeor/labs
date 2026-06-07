# Anchor Stage 1 — Integration / CP-1 Readiness Report（Claude / core owner 整合）

日期：2026-06-07
状态：**workbench artifact** —— 非公开接口契约。本文件把 Codex / Apple verifier 的 Stage 1 实测报告（binding / TextKit / iCloud Drive）与 Claude / core owner 的 core spike 证据（`core-spike-report.md` / `core-evidence.md`）整合为**当前决策状态**与 **CP-1 下一步 gate** 的收口结论。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**任何 package / workspace / app / 生成 lockfile 改动；**不**改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置，**不**创建产品 app shell / entitlement / bundle id / iCloud container，**不**把 Apple probe 升级为产品工程。权威接口契约在实现后归 `anchor-core` 包 README。
>
> 引用：core 报告 = `core-spike-report.md` / `core-evidence.md`；Apple 报告 = `apple-binding-report.md` / `textkit-adapter-report.md` / `icloud-drive-report.md`；交接 = `codex-apple-input.md`（core→Codex 被调 surface）/ `apple-patch-list-for-claude.md`（Codex→Claude 整合状态）；决策 = `../2026-06-06-phase-0/`（`cp-0-final.md` / `cp-0-approval.md` / `key-decisions.md` D01–D38 / `contract-baseline.md` / `fixture-set.md` F01–F43 / `stage-1-spike-plan.md` / `stage-1-entry-brief.md`）。

---

## 1. 结论（CP-1 readiness）

**Core side = complete；CP-1 整体 = 未退出（compromise，按 axis 分）。** Claude / core owner 的确定性 core（spike 组 1、5）已落成正式测试并 live 复跑通过；World A 多目标编译 gate、client 零真理逻辑红线、core 零云符号边界 live 复跑通过。Codex / Apple verifier 的 binding（组 2）与 TextKit（组 3）机制面通过、可作 Stage 1 recommendation；iCloud Drive（组 4）为 **compromise**，**未**升级为已批准首期默认 transport。CP-1 整体退出与 B14 默认 transport 批准仍 gated on 一组 Codex/Apple + 用户签署项（见 §6、§9）。本轮无任何 stop condition 触发（§10）。

---

## 2. Live-verified ground truth（本轮复跑，Observed）

本轮以 `f292042 Add Anchor stage 1 verification spikes` 的 Stage 1 证据为基线复跑；当前 HEAD `1fd3f03` 仅多一条与 Anchor 无关的 `.claude/scheduled_tasks.lock` 删除提交。整合报告与 4 份决策文档是本轮待提交改动，工作区不含代码、root workspace、lockfile、Apple product app、entitlement 或 bundle id 改动。

| 命令 | 观察 |
|---|---|
| `git status --short` | 仅显示本整合报告 + 4 份决策文档待提交；无代码 / root workspace / lockfile / Apple product app 改动 |
| `git diff --check` | clean |
| `cargo test --manifest-path suites/anchor/Cargo.toml` | **74 passed; 0 failed**；1 ignored（`scale_bench::replay_cost_curve`，默认门控） |
| `cargo build … --target wasm32-unknown-unknown` | `Finished` — OK |
| `cargo build … --target aarch64-linux-android` | `Finished` — OK |
| `rg "CloudKit\|CKRecord\|CKAsset\|CKContainer\|CKSyncEngine\|NSFileCoordinator\|NSMetadataQuery\|ubiquit\|iCloud\|NSURLIsExcludedFromBackupKey" suites/anchor/core` | **0 matches, exit 1**（含注释；边界文案不含被审 token）→ 可直接作 CI 红线 |
| `rg "OpSyncPort\|push_segment\|pull_segment\|SegmentId\|BlobId" suites/anchor/core` | 仅命中 core sync boundary：`src/sync_port.rs` / `src/dto.rs` / `src/lib.rs` 边界注释 |

这些数字与 Apple/core 报告中引用值逐项一致（C ABI 64MB ≈38.22ms / 96MB RSS、UniFFI 64MB ≈145.22ms / 267MB RSS、million-op replay ≈2.1µs/op；report-Observed，本轮未重跑 `--release --ignored` 基准）。

---

## 3. CP-1 readiness matrix（按 axis）

| Axis | Verdict | 依据 |
|---|---|---|
| **core deterministic（组 1）** | **go** | 74/0 测试、clippy 干净、`no_std`+`forbid(unsafe_code)`+零外部依赖、`BTreeMap`/`BTreeSet`（无迭代序不确定）、diff3/order-key/merge 为 core 内唯一 vendored 实现。Core side complete。 |
| **core multi-target gate（D36）** | **go** | `wasm32-unknown-unknown` + `aarch64-linux-android` 编译 gate 通过；零依赖使 gate by construction 不可被 transitive crate 打破。仅**编译**门控；跨目标**执行**（wasmtime / android emulator）golden 接线留 CI（Not run）。 |
| **mirror / search parity（组 5）** | **go** | `mirror_parity` 测试通过：structured search == ripgrep(md)、mirror 写失败隔离（op-log 不回滚）、body 冲突 git fence。 |
| **Apple binding（组 2，A2/B4）** | **compromise** | 机制 frozen-ready 作 **Stage 1 recommendation**：`UniFFI DTO / ordinary dispatch + C ABI bytes fast path`。产品分发**冻结**仍 gated on typed `ValidationError` 决策 + Swift 6 strict concurrency release surface + DTO/error vocabulary + packaging 用户签署（§5）。 |
| **TextKit adapter（组 3，D18）** | **compromise（mechanism-go）** | 机制面可行且边界干净（Swift 零确定性语义、buffer 非真理）；real-app responder-chain undo 抑制、IME marked-text commit、accessibility、hit-testing、patch replay over moving views、UTF-16 内部单位换算稳定性仍是**产品级 runtime gate**（Not run）。 |
| **iCloud Drive（组 4，B14）** | **compromise** | signed iPhone + signed macOS app 通过 ubiquity/package/coordinator/direct-enumeration/online-converge/offline-conflict；package-internal `.seg` 发现**不依赖** `NSMetadataQuery`。默认 transport 仍 gated（§6）。 |
| **layout / Bun（D02）** | **compromise** | Option A 纪律 live 守住（`members=["core"]`、`suites/anchor/**` 无 `package.json`、root 配置未动）；`bun install` / `bun run check` 对该 glob 的行为本轮未跑 = Unknown（实现期收口，非确定性 gate）。 |
| **retention（D14/D38）** | **compromise** | 四-horizon 模型内部一致、core `retention`(7) + `segment_budget`(3) 测试通过；steady-state segment budget、million-op compaction、stale-peer watermark advance、product conflict-resolution policy 是 scale-gate / Codex-Apple 工作（未测）。 |

> **Verdict 语义：** go = 本轮证据足以进 CP-1 当前基线；compromise = 机制/core 面通过但仍有明确 open gate 或用户签署前置；blocked / no-go = 无（本轮未出现）。

---

## 4. Observed / Recommended / Compromise / Open gate / Stop condition

### 4.1 Observed evidence（已实测，不含 Not run 当事实）

- **Core（`core-evidence.md`）：** 74 测试、clippy 干净、wasm32+android 编译、零云符号、跨目标一致性 golden（8 向量，`aarch64-apple-darwin` 捕获）、million-op replay 线性（release `--ignored`，report-Observed ≈2.1µs/op、1.25M ops≈2.6s）。
- **Binding（`apple-binding-report.md`）：** Rust macOS/iOS/iOS-sim 三 slice 构建；UniFFI generated Swift **full round-trip**（`EditorIntentDto` insert→`changedIds=[blk_a]`、UTF-16 caret `3:3`、`set_life=deleted` 保结构化 `validation_error`、post-dispatch snapshot revision + 非空 segment bytes + `seg_` id）；C ABI/UniFFI 三 slice XCFramework + SwiftPM wrapper import；1/4/16/64MB bytes benchmark（C ABI 64MB ≈38.22ms/96MB，UniFFI 64MB ≈145.22ms/267MB，3.8×慢/2.8×RSS）。跨 FFI 真值一致：fixture `snapshot_revision 3ef88671…a877b63` 在两侧 Swift smoke 与 core `determinism_vectors` 逐字节一致。
- **TextKit（`textkit-adapter-report.md`）：** macOS `NSTextView` runtime 设 UTF-16 selection、layout、adapter-owned `UndoManager` semantic-inverse-intent；iOS sim 编译；UTF-16 fixture 计数（emoji/ZWJ/combining/CRLF/mixed）；intent-shaped 映射 + patch replay 到 view-model projection（buffer 非真理）。
- **iCloud（`icloud-drive-report.md`）：** signed iPhone + signed macOS `.app` 通过 ubiquity container lookup、`.anchorvault` package UTType（conform `com.apple.package`、`vault_is_ubiquitous=true`）、`NSFileCoordinator` 读写（equal）、package-level `NSMetadataQuery` 发现（macOS `count=1`）、package-internal **direct enumeration**（macOS 1024 hidden + 128 visible）、1024-file subset 写（iOS≈3720ms / macOS≈3247ms）、online 跨设备收敛（0 conflict）、offline fork 后 `NSFileVersion` 冲突 materialization（1 retained，未解决）。**确认：** package-internal `.seg` 发现**返回 0**（每变体），package-external `.seg` 被枚举（125/128）。

### 4.2 Recommended decision（当前基线）

- **Binding：** `UniFFI DTO / ordinary dispatch + C ABI bytes fast path`（**非** pure-UniFFI bulk bytes）。C ABI fast path **保留**（非删除），因 UniFFI 64MB 慢 3.8×/RSS 2.8×。
- **iCloud adapter 形状：** `NSMetadataQuery` 发现 vault/package；`NSFileCoordinator` 保护读写；package-internal segment 用 **file-coordinated direct enumeration**（**不**用 `NSMetadataQuery` 枚举 package internals）；manifest 默认 per-device immutable cursor。
- **边界：** core 永不出现云/文件协调/account 类型；Swift/TextKit 不实现 merge/normalization/op-creation/tree-invariant/diff3/order-key；Option A `suites/anchor/*` 为已批准 spike 位置。

### 4.3 Compromise（机制通过但未达批准）

- **iCloud Drive 作首期默认 transport（B14）= compromise**，**不是**已批准。runtime/file-transport 机制已证，scale/placeholder/account/conflict-policy gate 未满足。
- **TextKit = mechanism-go**，产品 editor runtime 未完成。
- **layout/Bun = compromise**：Option A 纪律守住，Bun glob 行为 Unknown。

### 4.4 Open gate（待证 / 待签署，不得当已验证）

- **Binding freeze（B4）：** typed `ValidationError` enum 决策（core dto `validation_error: Option<String>`，core 无 `enum ValidationError`）→ **core-owner 决策**；Swift 6 strict concurrency / async-`Sendable` release surface；DTO/error vocabulary + wrapper import surface + XCFramework packaging + release/CI 复现的用户签署。
- **iCloud（§6 最小矩阵）：** 10K/50K/100K segment-file-count scale、remote `.icloud` placeholder download、signed-out / over-quota、product conflict-resolution policy、million-op replay/merge/compaction + steady-state segment budget、local-only path-in-ubiquity 边界、iOS package-level metadata gather、repo-local signed Anchor app target。
- **TextKit（组 3）：** real-app responder-chain undo 抑制 / IME marked-text commit / accessibility / hit-testing / patch replay over moving views / keyboard→`EditorIntent` / UTF-16 内部单位换算（D18 fixture）。
- **跨目标执行：** wasm（wasmtime）/ iOS slice 的 golden 向量**执行**接线（编译 gate 已过；执行 by construction，CI 接线 Not run）。

### 4.5 Stop condition（本轮无触发，作为前置守卫）

改 root workspace/package/lockfile；在 Swift/TextKit 复制 core 确定性语义；在 gate 未满足下升级 iCloud 为默认 transport；CloudKit schema / CKSyncEngine；公开 CLI schema 变更；把 Apple probe 变产品 app shell；`anchor-core` 泄漏 Apple 云/文件协调类型。**本轮一项未触。**

---

## 5. Binding — final recommendation

**Binding 已 frozen-ready 作为 Stage 1 recommendation：`UniFFI 生成 Swift（DTO / 结构化 error / 普通 dispatch）+ C ABI bytes fast path（bulk segment/blob）`。** C ABI fast path 是**保留**项（非 fallback-only 也非 pure-UniFFI），由 64MB benchmark（3.8× 时延 / 2.8× RSS）直接支撑。Swift 侧零确定性语义（`EditorIntent`/`OpStamp` 在 Rust 构造，时钟/熵由 Swift 传入，D36）。

**作为产品分发边界冻结（B4 / D01）仍待以下落地，本轮全部 Not run：**

1. **typed `ValidationError` enum 决策（core-owner）。** core DTO 现为 `TransactionResult.validation_error: Option<String>`；若产品冻结要求 enum 化的 validation 语义，须在 core 先加 `enum ValidationError`（live 确认 core 无此 enum）。
2. **Swift 6 strict concurrency / async-`Sendable` release surface** 证为冻结 gate（当前仅 compile-pass；D01 Risk 标 UniFFI async/Sendable 已知不完整）。
3. **最终生产 DTO/error vocabulary 冻结**（Stage 1 用 flat `EditorIntentDto`/`TransactionResultSummary` 以免把确定性逻辑搬进 Swift）。
4. **用户签署** DTO/error vocabulary + Swift wrapper import surface + XCFramework packaging + release-build/CI 复现（含显式 Rust Apple-target 检查与 wasm32 一致性向量 gate）。

在以上落地前，binding 是 recommendation，**不是**已冻结的产品分发边界。

---

## 6. iCloud Drive — 状态与最小下一轮验证矩阵

**状态 = `compromise`（不是 viable / 已批准）。** 可批准的 adapter 形状已锁定（metadata 发现 vault/package + file-coordinated direct package-internal enumeration + `NSFileVersion` 暴露冲突面 + per-device immutable cursor）。作首期默认 transport 的批准（B14）gated on：

| # | 最小验证项 | 当前态 |
|---|---|---|
| 1 | **segment-file-count scale 10K / 50K / 100K**：write_ms + direct-enumeration_ms + synced-segment-file-count；断言 N 个 logical op 不产 ~N 个 synced segment | 仅 1K（1024）跑过 |
| 2 | **remote `.icloud` placeholder download**：驱逐 package-internal segment 成真 placeholder 再 `startDownloadingUbiquitousItem` 到 `Current`（区别于本地/current；刻画 macOS `NSCocoaErrorDomain:4` 路径） | 仅 local/current |
| 3 | **signed-out / over-quota account states** | Blocked / not run |
| 4 | **product conflict-resolution policy**：对 `NSFileVersion` 冲突的 surfacing / preservation / resolution（绝不静默解决或丢弃 conflict version） | 仅 observe，无 policy |
| 5 | **million-op replay / merge / compaction + steady-state segment budget**（signed-app 语境 + release `--ignored` 基准） | report-Observed core 面线性，未在 iCloud 语境重跑 |
| 6 | **local-only path-in-ubiquity 边界（D21/D21a）**：symlink / 外部卷 / security-scoped bookmark / signed-out | Blocked / not run |
| 7 | **iOS package-level metadata gather**（仅 macOS 证 `package_metadata_gathered=true`；iOS probe 窗口内 `metadata_seg_count=0`） | Not demonstrated on iOS |
| 8 | **repo-local signed Anchor app target + 全 Anchor-target iCloud runtime**（今天只有 repo-external signed probe） | Not run |
| 9 | **用户确认 B14**（sync 路线作首期产品选择，plan §13 stop condition）后方可任何默认 transport 升级 | 待签署 |

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
| `cp-0-final.md` | decision-contract（CP-0 索引） | synced | §4 Stage 1 Status 与报告一致，无改 |
| `cp-0-approval.md` | approval-surface | **已同步** | 中和 §4 #3（iCloud container 批准状态叙述）、§4 #8（CloudKit 50MB cap 叙述）、§6（free/paid team 时序对比）3 处编辑痕迹 → 目标态；批准语义 100% 保留 |
| `key-decisions.md` | decision-contract | **已同步** | D06 Status 升为 `Needs Stage 1 scale/policy gate`（对齐 D14/D35）+ 吸收 1024-file signed-app Stage 1 Observed；保留 10K/50K/100K 等 open gate |
| `contract-baseline.md` | decision-contract | **已同步** | Sync baseline 中「watermark…**不再**是…充分条件」→「**不是**」、「retention **扩为**四 horizon」→「**含**」；约束语义不变 |
| `stage-1-spike-plan.md` | brief/plan | **已同步** | §1 Evidence 把「三目标**执行**逐字节相同」软化为「darwin 实跑捕获 + 多目标编译 gate 通过 + 执行接线为强制 CI gate（未实跑）」，`wasm32` 仍显式保留为强制 gate |
| `stage-1-entry-brief.md` | brief | synced | 已反映 Stage 1 结果，无改 |
| `fixture-set.md` | decision-contract | synced | F23/F26/F42/F43 Stage 1 回填一致，无改 |
| `apple-verification.md` | **evidence-record**（cp-0-final 索引：现实核验证据） | leave-as-is | 其 clause-correction 发现叙述是验证内容，非决策契约编辑痕迹 → 不改 |
| `research-notes.md` | **evidence-record**（早期调研原始记录，非批准面） | leave-as-is | 其 gate-resolution / 时序推理叙述是研究记录 → 不改 |
| `codex-verification-packet.md` | **evidence-record**（Codex 验证原始记录，非批准面） | leave-as-is | 其 clause-correction 指令叙述是原始记录 → 不改 |

> **分类规则（决定性）：** 长期决策文档 / 批准面只写当前目标态与责任边界（中和编辑痕迹）；evidence-record / 原始记录 / research-notes 合法地记录跨时间的发现与推理，其过程叙述是**内容**、不得抹除。`cp-0-final.md` 索引对「证据 vs 决策」的归类为权威。故 patch-style 扫描在三份 evidence-record 上的命中是**设计内保留**，不是污染。

---

## 9. 是否需要 Codex 回来补跑 Apple verifier

**需要。** Core side complete（74 测试、多目标 gate、边界干净，全部 live 复跑）。但 CP-1 整体退出与 B14 默认 transport 批准依赖的 open gate **全部是 Codex/Apple + 用户签署工作，非 core 工作**。本轮**不**需要重跑 core / 边界检查（本会话已绿）。

**精确命令 / 环境 / stop condition：**

- **Env：** macOS + Xcode 26.5 (17F42)、Swift 6.3.2、rustc/cargo 1.95.0；`aarch64-apple-darwin` + `aarch64-apple-ios` + `aarch64-apple-ios-sim` targets 已装；付费 ADP team（已开通，apple-verification §2.6）+ signed Anchor-context app + 真实 iCloud account + 物理 iOS 设备；构建产物落 `/tmp/anchor-apple-stage1`（**repo 外**）；probe 只在 `suites/anchor/apple/**`（Option A）；root `package.json` / `bun.lock` / workspace config / `suites/anchor/core` / `suites/anchor/Cargo.toml` **不得改**。
- **命令骨架：**
  - iCloud scale：在真实 account 写 + file-coordinated direct-enumerate package-internal `.seg` 于 10_000 / 50_000 / 100_000，记 `write_ms` + `enumeration_ms` + synced-segment-file-count（断言 N op 不产 ~N segment）。
  - remote placeholder：驱逐 package-internal segment 成真 `.icloud` placeholder，再 `startDownloadingUbiquitousItem` 到 `Current`（刻画 macOS `NSCocoaErrorDomain:4`）。
  - account states：signed-out 与 over-quota 下重跑 ubiquity/`NSFileCoordinator` probe，记 adapter 行为。
  - conflict policy：扩展 offline-fork probe，跑一条 surfacing/preservation/resolution 路径（绝不静默解决 `NSFileVersion` 冲突）。
  - `cargo test --release --manifest-path suites/anchor/Cargo.toml -- --ignored scale_bench::replay_cost_curve`（million-op replay 线性，确认 1.25M+ ≈2.1µs/op + compaction 后稳态 segment budget）。
  - TextKit 产品 runtime：IME marked-text commit / accessibility range / hit-testing on rendered geometry / direct-buffer undo 抑制 / keyboard→`EditorIntent` / `EditorPatch` replay over splitting/moving views；UTF-16 内部单位换算稳定性（emoji/ZWJ/combining/CRLF/IME fixture，D18）。
  - Binding freeze 输入（在 core-owner 决定是否加 `enum ValidationError` 后）：重生成 UniFFI Swift + 证 Swift 6 strict concurrency / async-`Sendable` 于 release build；确认 release/CI 复现含显式 Rust Apple-target + wasm32 一致性向量 gate（fresh CI/dev 机器）。
- **Stop condition：** 出现以下任一即暂停重评——(a) 须改 root workspace/`package.json`/`bun.lock`/lockfile 或加 placeholder `package.json`；(b) 在 Swift/TextKit 复制 core 确定性语义；(c) gate 未满足下升 iCloud 为默认 transport；(d) iCloud-Drive 路径引入 CloudKit schema / CKSyncEngine；(e) 公开 CLI schema 变更；(f) 把 Apple probe 变产品 app shell；(g) `anchor-core` 获任何 Apple 云/文件协调/account/ubiquity 类型（重跑 0-match 云符号 + Apple 类型审计，要求 exit 1）。另：scale 出现 N op→~N segment 的 no-go，使 batching/compaction 设计失效（非 transport 选择失效），须停。

---

## 10. Commit 决定

**建议提交（严格 scope）。** 本轮 deliverable = 本整合报告 + 对 4 份决策文档的最小目标态编辑（cp-0-approval ×2、key-decisions ×2、contract-baseline ×1、stage-1-spike-plan ×1）。**无**代码 / lockfile / workspace / `Cargo.toml` member / app target / entitlement / bundle id 改动；三份 evidence-record 不动。`.claude/scheduled_tasks.lock` 删除已是独立提交（`1fd3f03`），不并入本 docs 提交。提交信息须 scope 为「docs(anchor): Stage 1 integration report + target-state decision-doc sync」，**不得**暗示 CP-1 整体退出或 iCloud 默认 transport 已批准。已在 `anchor-v1`（非 main），可直接提交。

---

## 11. Stop-condition check（本轮）

| Stop condition | 触发 |
|---|---|
| 改 root workspace / package / lockfile | 否（`members=["core"]`、root 配置未动） |
| Swift/TextKit 复制 core 确定性语义 | 否（`apple/` 零确定性语义 grep） |
| gate 未满足下升 iCloud 为默认 transport | 否（保持 compromise） |
| CloudKit schema / CKSyncEngine | 否 |
| 公开 CLI schema 变更 | 否 |
| Apple probe 变产品 app shell | 否（仅 SwiftPM probe + repo-external 签名 probe） |
| `anchor-core` 泄漏 Apple 云/文件协调类型 | 否（0 matches, exit 1） |

**全部未触发。**
