# Anchor CP-0 — Final（最终索引）

日期：2026-06-07
状态：**workbench artifact** —— 非公开接口契约。本文件是 CP-0 的最终索引：一段最强结论 + packet 文件索引 + CP-0 已冻结结论 + Stage 1 后当前状态 + 后续 gate 中明确禁止的顺手扩展 + 下一步执行入口。结构化批准摘要（含九项最终批准字段）见同目录 `cp-0-approval.md` §0，逐条勾选证据见其 §8。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本 workbench 目录及本文件**不授权**任何 package / workspace / app / 生成 lockfile 改动，**不**创建 `suites/anchor*` / `apps/anchor-*` / `packages/anchor-*` / 顶层 `anchor-apple/` / Xcode project / Swift Package / Rust crate / entitlements / bundle id / iCloud container，也**不**授权写 Rust / Swift / TS 代码或改 `package.json` / `bun.lock` / `tsconfig` / workspace 配置。权威且稳定的 CLI / API / schema / file-format 契约在实现后归 `anchor-core` 包 README。
>
> 引用约定：`[plan §X]` 指 `docs/plans/2026-06-06-anchor-apple-native-note-workbench.md`；`[conflict §X]` 指 `docs/plans/2026-06-06-anchor-conflict-resolution-model.md`；同目录姐妹文件以相对名引用。

---

## 1. Strongest conclusion（单一最可辩护结论）

Anchor 是一个 **Note 原生（非 Markdown 文本壳）、Apple 原生优先（macOS + iOS 首期）、核心平台无关（platform-agnostic Rust `anchor-core`）** 的本地知识工作台；其真理层是单一 **append-only op-log**（物化 state、`.json` / `.md` mirror、SQLite projection 全为 replay 派生，不是真理），所有持久写入收敛到**单一已校验 dispatch**，冲突调和保持**恰好三个 dispatch register（`location` / `content` / `life`）** 这一产品不变量（`content` 仅在内部分解为 sub-field cell），Apple 客户端通过**进程内 binding** 直接调用 core、不拥有任何业务真理。CP-0 批准的是**契约方向与责任边界**，不是实现许可：当前仓库无任何 Anchor 代码 / Rust crate / Swift 工程，所有创建动作随实现授权另行门控。

## 2. File index（packet 文件索引）

| 文件 | 角色 |
|---|---|
| [plan] `docs/plans/2026-06-06-anchor-apple-native-note-workbench.md` | 产品 / 架构方向摘要（历史记录，非当前接口契约）；CP-0 指针在顶部 + §11 阶段0 / CP-0 |
| [conflict] `docs/plans/2026-06-06-anchor-conflict-resolution-model.md` | 冲突处置模型 v1（§8.3–8.5 增强）；三 register 之上的确定、可 replay、无静默丢失合并模型 |
| `cp-0-approval.md` | **最终用户批准稿**：§0 九项结构化批准摘要 + §8 逐条勾选清单 + §9 停止条件 |
| `contract-baseline.md` | CP-0 责任基线 + 五责任面 Responsibility boundary matrix（谁拥有 / 禁止拥有什么） |
| `key-decisions.md` | 整合决策表 D01–D38（含 D18a / D21a / D38），每项 Decision / Status / Rationale / Evidence / Risk / Stop condition |
| `fixture-set.md` | CP-0 设计 fixture set F01–F43（含 F42 segment budget、F43 四-horizon retention） |
| `project-layout-options.md` | 候选 A/B/C 对比；Primary = Option A `suites/anchor/*`，Fallback = Option C |
| `apple-verification.md` | Codex Step-2 Apple/Xcode/Swift-Rust/TextKit/iCloud 现实性核验证据（Observed / Inferred / Recommended / Unknown / Not run） |
| `stage-1-spike-plan.md` | Stage 1 五组 spike 计划（owner / commands / expected artifact / evidence / failure condition）+ CP-1 退出条件 |
| `stage-1-entry-brief.md` | 下一轮 agent 的 CP-1 启动 briefing（objective / scope / non-goals / owner work items / required reads / commands / CP-1 evidence / pause conditions） |
| `../2026-06-07-stage-1/apple-binding-report.md` / `textkit-adapter-report.md` / `icloud-drive-report.md` | Stage 1 Codex/Apple 实测报告：binding、TextKit、iCloud Drive runtime |
| `../2026-06-07-stage-1/core-evidence.md` / `core-spike-report.md` | Stage 1 Claude/core owner 实测报告：deterministic core、multi-target gate、mirror/search parity |
| `research-notes.md`、`codex-verification-packet.md` | 早期调研与 Codex 验证原始记录（背景，非批准面） |

## 3. CP-0 frozen conclusions（已冻结结论）

冻结 = 进入 CP-1 的固定前提，实现不得在未触发暂停条件的情况下偏离。完整论证见各责任文件，权威批准状态见 `cp-0-approval.md` §0 / §8。

- **产品形态与平台路线：** Note 原生、Apple 原生优先；macOS + iOS 首期 → iPadOS 第二 → 其他平台最后（A1；plan §3、§11）。
- **责任边界：** `anchor-core` 拥有真理 / 模型 / 校验 / 规范化 / op-log / replay / 全部 merge 规则 / diff3 + order-key 唯一执行处 / 单一已校验 dispatch / `OpSyncPort` trait / DTO + schema envelope；`anchor-editor-core` 是 core 内部无 UI 模块（非独立 crate/package），只拥有 selection / intent shaping / patch 映射；Apple 客户端 / CLI / `OpSyncPort` 适配器都是 dispatch 外壳、不拥有业务真理（第 2 节；contract-baseline.md）。
- **项目布局：** Primary = Option A `suites/anchor/*`，Fallback = Option C 顶层 `anchor-apple/`（core 仍留 `suites/anchor/core`）；绝不为适配 glob 添加 placeholder `package.json`（B1；D02）。
- **存储与同步：** op-log 真理层；同步单元 = 不可变 per-device op-segment 文件；mirror + SQLite projection 不进同步；`OpSyncPort` 仅 `SegmentId` / `BlobId` + 字节、core 永不出现云类型；vault file package 须声明 `com.apple.package` UTType（D04 / D06 / D34 / B13）。
- **冲突模型（全部归 core）：** 恰好三 register；content sub-field cell `{body, type_id, props[k], tags[t]}`；body 确定性 diff3 / keep-both 永不静默 LWW + mark re-clamp；props/type_id causality-aware per-cell LWW；tags OR-Set add-wins（复用 op_id）；life 时钟无关优先级 lattice + 非级联 + 派生可见性 + 终态可达（`dominates_frontier`）；全序 `T`；split/merge macro-op intent-rebase；journal 内容寻址身份 `note_id = blake3("journal:" ‖ vault_id ‖ calendar_date)`（D08–D32；conflict §3–§9）。
- **op-envelope 完整字段预留（NON-NEGOTIABLE）：** `op_id` / `op_envelope_version` / `sub_field_key` / `base_sub_rev` / `new_sub_rev` / `op_kind` / `supersedes_rev` / `dominates_frontier` / `observed_adds` / `macro_op_id` / `diff_algo_version` / per-actor `seq`，缺任一即需后续 op-log 迁移（D24；conflict §7.1）。
- **确定性 gate：** diff3 + fractional order-key 只在 Rust core 执行，跨 macOS / iOS / `wasm32` 逐字节一致向量集为强制 CI gate；snapshot_revision over 物化输出、排除 jitter / actor 元数据（D19 / D26 / D30）。
- **World A 受保护不变量：** `anchor-core`（含 `anchor-editor-core`）`wasm32` + android 可编译性是 CP-1 gate；client 零真理逻辑 CI 红线；**受保护的是 core 在 Apple-first 阶段保持可复用，web / android client 仍延后**（A9 / D36 / D37）。
- **契约级冻结值：** 单附件 cap = 50MB（对齐 `CKAsset`，二期 CloudKit 无需分片 / 降 cap / out-of-band，D17 / B8）；字体来源 = 内置 JetBrains Mono（代码）+ 系统字体（正文 / 标题，可切换）（D18a / B7）；mirror = 人类可读路径 + 不纳入版本库（D05 / B12）；行内 offset 对外 UTF-16（D18）。
- **生命周期 / 保护机制：** time travel 一等能力 + 四-horizon retention（conflict / replay-safety / audit / time-travel），硬删须五数据安全条件 + 显式 excise；7-day conflict horizon 仅 UI、绝不作硬删依据；causal-stability watermark + open-conflict pin 门控 compaction（B15 / B16 / D14 / D38）。
- **local-only 硬规则：** `sync = "none"` vault 严禁置于任何 iCloud ubiquity container 下，vault-open 强制断言，`synced → local-only` 不可逆；误放入 iCloud = blocked open（typed `local_only_vault_in_ubiquity`），不自动转同步（D21 / D21a）。
- **加密：** 首期非 ZK；阶段0 锁定 encryption envelope 缝（首期 no-op）+ non-ZK 文案，绝不对中立 object-store 暗示 zero-knowledge；完整 ZK / 密钥分发延后（D22 / B6）。
- **边界决策签署：** Kleppmann 祖先 / 成环检查作为有意识的 plan §13 边界决策在范围内（B9 / D32）。
- **CLI 面：** 本地结构化命令契约（非 MCP）、`apiVersion` 信封、固定退出码 0–6；公开 `ConflictRecord` / `resolve` / `restore_order` / `restore_subtree` CLI schema 延后二期（首期冲突可见面仅退出码 3），op-envelope 预留留 Phase 0（B5 / D31）。

## 4. Stage 1 Status（已验证项与开放 gate）

以下状态来自 2026-06-07 Stage 1 workbench。已验证项进入当前决策基线；开放 gate 保留为 CP-1 / transport delivery / 产品签署前置。

- **Apple binding 方向（A2 / B4 / D01）：** Stage 1 evidence supports **UniFFI DTO / ordinary dispatch + C ABI bytes fast path**. Observed surface includes typed `ValidationError`, full UniFFI round-trip, C ABI/UniFFI three-slice XCFrameworks, synchronous Swift 6 strict-concurrency release smoke, and 1/4/16/64MB bytes benchmarks. Final product freeze requires UniFFI async-`Sendable` review, final DTO/error vocabulary, product wrapper import surface, CI/fresh-machine reproduction, and user signoff.
- **iCloud Drive 作首期默认 transport（B14）：** approved by user on 2026-06-07 as **default transport with compromise constraints**. Signed runtime, package-level discovery, file coordination, package-internal direct enumeration through macOS 100K files, online convergence, and offline `NSFileVersion` conflict materialization are observed. Transport delivery remains gated on remote placeholder behavior, signed-out / over-quota states, iOS large-scale delivery, steady-state segment budget, and product conflict-resolution policy.
- **iCloud Anchor file-package runtime（D35 / D14）：** `.anchorvault` package UTType, package-level `NSMetadataQuery`, `NSFileCoordinator` read/write, 1024-file subset, online convergence, offline conflict materialization, and macOS 10K/50K/100K direct package-internal enumeration are observed. Package-internal segment discovery uses direct enumeration; `NSMetadataQuery` is not approved for package-internal `.seg` discovery.
- **TextKit 适配 runtime（D18）：** mechanism-go. Stage 1 observed macOS UTF-16 selection/layout/semantic undo smoke, iOS simulator compile, intent-shaped mapping, and patch replay to projection. Product runtime gates remain IME marked text, accessibility, hit-testing, direct buffer undo suppression, patch replay over moving views, and UTF-16 internal conversion stability.
- **core 多目标编译 gate（D36）：** `anchor-core` builds for `wasm32-unknown-unknown` + `aarch64-linux-android`; core dependency policy holds. Cross-target execution wiring remains a CI gate.
- **Bun 非-package glob 行为（D02）：** `suites/*/*` 下无 `package.json` 目录对 `bun install` / `bun run check` 的影响。
- **retention 数值化（D38）：** 保留期数值、stale-peer 退出规则、archive 压缩格式、深度 time-travel 重建在 iCloud 下的 placeholder 下载成本。

## 5. Forbidden scope creep（后续 gate 明确禁止的顺手扩展）

后续 gate 不得顺手做以下任何一项；触及即暂停并让用户决策（plan §13）：

- **不**实现持久应用写入（CP-1 通过前；plan §11 CP-1）。
- **不**创建任何超出已批准 Option A/C 的目录 / 工程；**不**为适配 glob 添加 placeholder `package.json`；**不**改 `package.json` / `bun.lock` / `tsconfig` / workspace 配置（除非该 spike 经显式实现授权且属批准布局）。
- **不**实现 CloudKit / CKSyncEngine（二期）；**不**让任何 CloudKit record schema 进入 core；**不**在 op 形状冻结前落地任何 CloudKit 记录。
- **不**实现独立 Web 客户端 / android 客户端 / iPadOS 专项优化（仍延后；World A 受保护的是 core 可编译性、非 client）。
- **不**暴露公开 `ConflictRecord` / `resolve` / `restore_order` / `restore_subtree` CLI schema（二期）。
- **不**实现字符级文本 CRDT / 完整收敛 move / order CRDT / 中央 sequencer（plan §13 暂停）。
- **不**把跨 block 连续原生文本选择当首期 UI 承诺（spike-only）。
- **不**在 client（Swift / TextKit）侧实现任何 merge / normalization / op-creation / tree-invariant 校验 / diff3 / order-key（唯一归 `anchor-core::dispatch`；D37）。
- **不**实现 AI agent / proposed-change 子系统（op 信封仅预留 `actor` / `provenance` / `approvalState` 作 reserved hook，不复用于人工冲突复审）。
- **不**把任何 Blocked / Not run / Unknown 项当已验证事实陈述。

## 6. Next execution entry point（下一步执行入口）

当前入口是 `../2026-06-07-stage-1/stage-1-integration-report.md`。下一步只处理剩余 open gates：binding product-freeze signoff、iCloud transport delivery gates、TextKit product-runtime gate、Bun glob check、cross-target execution CI wiring。通过 CP-1 前不实现持久应用写入。
