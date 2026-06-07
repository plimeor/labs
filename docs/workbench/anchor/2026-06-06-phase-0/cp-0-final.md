# Anchor CP-0 — Final（最终索引）

日期：2026-06-07
状态：**workbench artifact** —— 非公开接口契约。本文件是 CP-0 的最终索引：一段最强结论 + packet 文件索引 + CP-0 已冻结结论 + 允许 Stage 1 验证的未冻结项 + 进入 Stage 1 时明确禁止的顺手扩展 + 下一步执行入口。结构化批准摘要（含九项最终批准字段）见同目录 `cp-0-approval.md` §0，逐条勾选证据见其 §8。

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
- **World A 受保护不变量：** `anchor-core`（含 `anchor-editor-core`）`wasm32` + android 可编译性是 CP-1 gate；client 零真理逻辑 CI 红线；**受保护的是 core 现在就保持可复用，web / android client 仍延后**（A9 / D36 / D37）。
- **契约级冻结值：** 单附件 cap = 50MB（对齐 `CKAsset`，二期 CloudKit 无需分片 / 降 cap / out-of-band，D17 / B8）；字体来源 = 内置 JetBrains Mono（代码）+ 系统字体（正文 / 标题，可切换）（D18a / B7）；mirror = 人类可读路径 + 不纳入版本库（D05 / B12）；行内 offset 对外 UTF-16（D18）。
- **生命周期 / 保护机制：** time travel 一等能力 + 四-horizon retention（conflict / replay-safety / audit / time-travel），硬删须五数据安全条件 + 显式 excise；7-day conflict horizon 仅 UI、绝不作硬删依据；causal-stability watermark + open-conflict pin 门控 compaction（B15 / B16 / D14 / D38）。
- **local-only 硬规则：** `sync = "none"` vault 严禁置于任何 iCloud ubiquity container 下，vault-open 强制断言，`synced → local-only` 不可逆；误放入 iCloud = blocked open（typed `local_only_vault_in_ubiquity`），不自动转同步（D21 / D21a）。
- **加密：** 首期非 ZK；阶段0 锁定 encryption envelope 缝（首期 no-op）+ non-ZK 文案，绝不对中立 object-store 暗示 zero-knowledge；完整 ZK / 密钥分发延后（D22 / B6）。
- **边界决策签署：** Kleppmann 祖先 / 成环检查作为有意识的 plan §13 边界决策在范围内（B9 / D32）。
- **CLI 面：** 本地结构化命令契约（非 MCP）、`apiVersion` 信封、固定退出码 0–6；公开 `ConflictRecord` / `resolve` / `restore_order` / `restore_subtree` CLI schema 延后二期（首期冲突可见面仅退出码 3），op-envelope 预留留 Phase 0（B5 / D31）。

## 4. Not frozen — open for Stage 1 spike verification（未冻结、允许 Stage 1 验证）

以下机制可行性已 Observed，但 Anchor 专属构建 / 运行 / 规模未证，**允许且应当在 Stage 1 验证并据证据收口**；收口后把任何「必须调整的模型点」回填 contract-baseline.md / key-decisions.md / fixture-set.md（沿用 D / F 编号）。

- **Apple binding 方向与机制最终冻结（A2 / B4 / D01）：** UniFFI primary vs UniFFI DTO + C ABI bytes fast path，待 Anchor DTO round-trip + 1/4/16/64MB bytes benchmark + Swift 6 strict concurrency 证据后由用户签署。
- **iCloud Drive 作首期默认 transport（B14）：** gated on Stage 1 scale gate——segment-file-count（1K/10K/50K/100K）+ million-op replay/merge/compaction + steady-state segment budget + 真机 go/compromise；no-go 转 CloudKit / 中立 object-store。
- **iCloud Anchor file-package runtime（D35 / D14）：** package UTType / placeholder download / `NSMetadataQuery` live / file coordination / `NSFileVersion` manifest 并发 / signed-out / over-quota（付费 ADP team 已开通，Anchor signed app + 真实 account 实测）。
- **TextKit 适配 runtime（D18）：** 事件 → `EditorIntent`、`EditorPatch` 回放、IME marked text / accessibility / direct buffer undo 截断 / 跨 view selection；UTF-16 ↔ core 内部 offset 在 emoji / ZWJ / combining / CRLF / IME 下的换算稳定性。
- **core 多目标编译 gate（D36）：** `anchor-core` 编到 `wasm32-unknown-unknown` + `aarch64-linux-android`，core 依赖政策实跑。
- **Bun 非-package glob 行为（D02）：** `suites/*/*` 下无 `package.json` 目录对 `bun install` / `bun run check` 的影响。
- **retention 数值化（D38）：** 保留期数值、stale-peer 退出规则、archive 压缩格式、深度 time-travel 重建在 iCloud 下的 placeholder 下载成本。

## 5. Forbidden scope creep on entering Stage 1（进入 Stage 1 时明确禁止的顺手扩展）

进入 Stage 1 spike 不得顺手做以下任何一项；触及即暂停并让用户决策（plan §13）：

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

下一轮 agent 从 `stage-1-entry-brief.md` 启动 CP-1 / Stage 1 spike：先取目录 / 工程创建的实现授权（B1 / B2 已批准布局与工程创建，实际落地随实现指令），再按 `stage-1-spike-plan.md` 的五组 spike 执行（owner 严格二分：Claude / core 拥有确定性 Rust core，Codex / Apple 拥有 Apple 现实验证）。CP-1 退出条件见 `stage-1-spike-plan.md` §6。通过 CP-1 前不实现持久应用写入。
