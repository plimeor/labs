# Anchor Phase 0 — Research Notes（Observed / Inferred / Unknown）

日期：2026-06-06
状态：workbench DRAFT（STEP 1 of 3：Claude 起草 → Codex 验证 Apple/Xcode/Swift-Rust/TextKit 现实 → Claude 整合为可批准 CP-0）
归属：`docs/workbench/anchor/2026-06-06-phase-0/research-notes.md`

> 本文件是 workbench 调研记录，**不是公开接口契约**。按 AGENTS.md：创建 workbench 目录**不授权**任何 package / workspace / app / 生成 lockfile 改动。本文只记录事实分桶，不实现 anchor-core、editor 或 app shell，不写 Rust/Swift，不跑 Apple spike。
>
> 三桶定义：**Observed** = 直接从仓库 / 文件验证；**Inferred** = 由 Observed 推理得出的结论；**Unknown** = 需 Codex 现实验证或用户拍板的开放问题。每条尽量给出 plan 章节 / 行号或仓库证据，供 STEP 3 追溯。

---

## A. Observed（直接验证）

### A1. 当前仓库结构（workspace tiers / 现有 packages / tsconfig include / 脚本）

- **Workspace globs（`package.json` line 37–40）：** `workspaces = ["apps/*", "packages/*", "suites/*/*"]`。三个 tier 都是 bun/TS workspace glob。
- **脚本（`package.json` line 29–34）：** `check = "tsc --noEmit"`、`lint = "biome check --write"`、`format = "biome format --write"`、`test = "bun run --filter './packages/*' --filter './suites/*/*' test"`。即 `bun run check` 等于纯 TS 类型检查；`test` 只覆盖 `./packages/*` 与 `./suites/*/*` 两类 JS/TS workspace。
- **Root tsconfig `include`（`tsconfig.json` line 12–18）：** 仅 `apps/*/src/**/*.ts(x)`、`packages/*/src/**/*.ts(x)`、`suites/*/*/src/**/*.ts(x)`。**只含 TS/TSX**，不含任何 Rust/Swift/非-`src` 路径。
- **现有 packages（`ls packages`）：** `browser-peek`、`claudify`、`command-kit`、`git-kit`、`skills`。
- **现有 suite（`ls suites` / `ls suites/*`）：** 仅 `imprint`，且只有一个成员 `imprint/react`。
- **现有 apps（`ls apps`）：** 空。
- **不存在的目录：** `suites/anchor`、`apps/anchor-*`、`packages/anchor-*` 均无（glob 匹配返回 no matches）。
- **无 Rust/Swift：** `find` 全仓未发现 `Cargo.toml`、`*.xcodeproj`、`*.swift`（排除 node_modules）。仓库今天没有任何 Rust/Cargo 或 Swift/Xcode 工程。
- **workbench 目录：** `docs/workbench/anchor/2026-06-06-phase-0/` 在本任务前不存在，由本任务创建。

### A2. Anchor 当前状态（零代码；仅两份 plan 文档）

- Anchor 当前**零实现代码**。仓库内只有两份 plan 文档：
  - `docs/plans/2026-06-06-anchor-apple-native-note-workbench.md`（Apple 原生 Note 工作台主计划）。
  - `docs/plans/2026-06-06-anchor-conflict-resolution-model.md`（冲突处置模型 v1，§8.3–8.5 增强版）。
- 主计划自我定位为「新项目方案……实现待单独授权」（主计划 line 4、line 518「授权后的第一个实现单元是阶段0」、line 757「实现仍待单独授权」）。无既有实现可沿用（主计划 line 518）。

### A3. AGENTS.md / CLAUDE.md workbench 与 workspace 规则

- **workbench 路径约定（AGENTS line 19–26）：** `docs/workbench/<project>/<YYYY-MM-DD>-<task>/` 存放当前项目 workbench 工件（agent 协作基线、验证报告、批准草案、决策包）；用一次性的 dated task 目录；文件用语义化命名，如 `contract-baseline.md`、`apple-verification.md`、`cp-0-approval.md`。
- **workbench 不是契约（AGENTS line 24–26）：** workbench 工件不是公开接口契约；**创建 workbench 目录不授权 package / workspace / app / 生成 lockfile 改动**。
- **三 tier 含义（AGENTS line 30–32）：** `packages/*` = 跨 suite 通用包；`suites/<suite>/*` = 主题域相关包组；`apps/*` = 无 suite 归属的独立 app。
- **tsconfig 深度规则（AGENTS line 33–36）：** 每个 workspace package extends root `tsconfig.json`、定义 `prepack`、package-local override 保持窄。`packages/*` 与 `apps/*` extend `../../tsconfig.json`；`suites/<suite>/*` extend `../../../tsconfig.json`。
- **prepack（AGENTS line 37–39）：** 发布生成工件的包，`prepack` 构建它们；直接发布 source 的包，`prepack` 跑 package 级 entrypoint smoke check。
- **可发布包要求（AGENTS line 40–43）：** 新可发布包需定义 `repository.directory`、`homepage`、`bugs` 和 `files` 白名单；可发布 CLI 包 README 含安装指引与一条用已安装可执行文件的最小首命令。
- **boundaries（AGENTS line 48–52）：** 不改 package 边界 / workspace 结构 / 生成 lockfile，除非任务明确要求；不加 test case 或跑 test 命令，除非用户明确要求。
- （契约归属，AGENTS line 14–18 / 主计划 line 6：）实现后权威且稳定的 CLI / API / schema / file format 契约归 `anchor-core` 包 README；`docs/plans/` 是历史记录，非当前接口契约。

### A4. Package / workspace 规则的硬约束（与 Phase 0 layout 直接相关）

- 三 tier + glob、tsconfig 深度规则、prepack、可发布包要求、TS-only include glob 均如 A1/A3 所述，已验证。
- 「不改 package 边界 / workspace 结构 / lockfile，除非任务明确要求」（AGENTS line 48–50，CLAUDE.md 同文）——直接约束 Phase 0 的 layout 建议（见 §B5 与 §C2）。
- 「不加 test / 不跑 test 命令，除非明确要求」（AGENTS line 51–52）——Phase 0 是设计 / 契约基线阶段，本身不要求跑 test；注意这与 plan §12 引用的 `cargo test -p anchor-core`（主计划 line 698）属于**未来实现阶段**的验证命令，不是 Phase 0 现在要执行的。

### A5. 两份 plan 文档中 Phase-0-BINDING 的内容（plan 要求 Phase 0 冻结 / 产出的事项）

#### A5.1 主计划 §11「阶段 0：平台、产品与契约基线」产物（line 524–538）

- 平台路线确认：macOS + iOS 首期，iPadOS 后续，其他平台最后（line 528）。
- Apple 工程边界建议：工程位置、target、bundle、共享代码方式、验证命令（line 529）。
- Rust core 到 Apple 的 binding 方案比较与推荐（line 530）。
- `OpSyncPort` 传输适配器接口 + iCloud Drive 文件适配器可行性 spike 计划；明确 core 不依赖 CloudKit API；CloudKit / CKSyncEngine 列为二期评估（line 531）。
- `anchor-editor-core` 内部模块合约：只拥有 selection / intent / patch 映射；tree invariant、schema-aware normalization、op creation 归 `anchor-core::dispatch`（line 532）。
- 七个编辑器类型草图：`EditorSnapshot`、`BlockProjection`、`InlineRun`、`EditorSelection`、`EditorIntent`、`EditorPatch`、`TransactionResult`（line 533）。
- 交互契约：选择、结构编辑、Note 行为、引用、props/type、命令、Settings、失败状态（line 534）。
- macOS / iOS 信息架构草图（line 535）。
- core DTO 草图：Note、block、op、projection、search result、validation error、mirror status、settings、sync status（line 536）。
- **关键技术决策确认（line 537）** —— 显式枚举（逐字记录以便 STEP 3 逐项核对）：客户端↔core 传输边界、vault 落盘布局与同步单元、顶层 Note 内部表示、journal content-addressed 身份与 `calendar_date` 唯一性、Calendar projection 排序、journal 默认 parent、`life` 枚举 vs 单 tombstone、target/register stale guard、同步 ingestion、提交节奏与 op-log 粒度、op-log compaction、mirror post-commit job、搜索/backlinks 后端、blob 落盘与 cap 校验、UTF-16/UTF-8 offset 换算边界、字体来源（内置 vs 原生枚举）、同步单元（op-segment 文件 vs 镜像）、segment 大小与提交节奏、compaction GC 保留窗口与 manifest/cursor 协调、local-only vault 位置语义与防误放断言、Web 同步适配器（中立 object-store）、加密与密钥所有权。
- **Fixture set（line 538）** —— 至少覆盖：顶层 Note、子 Note/subpage、journal Note、Calendar 年/月/周/日期 projection、同日 journal 去重、journal `calendar_date` 隐藏属性、title `$type`、title `#tag`、body block `#tag`、嵌套 tag tree、嵌套 list item 内含代码、带行内引用的表格、unsupported block、relation prop、embed、target/register conflict case、sync merge case、mirror stale case、settings case、单块文本选择、block 选择、嵌入编辑器选择、跨 block 编辑拒绝/拆分 case。
- **证明（line 540–545）：** 每个用户可见 primitive 映射到 core 概念；每个首期编辑行为映射到 `EditorIntent` 并可被 core 校验为合法 op 或明确拒绝；没有 UI 行为要求 Markdown 字节真理或仅前端持久状态；Apple binding 选择有明确验证命令与失败条件。
- **检查点 CP-0（line 547）：** 平台路线、Apple binding 方案、`anchor-editor-core` 合约、交互契约、信息架构、DTO 草图、关键技术决策和 fixture set 已批准。

#### A5.2 主计划 §8.1 责任边界（line 327–377）

- `anchor-core` 拥有真理层 / 共享模型 / 不变量：Note/Block/Inline/PropDef/Type/Tag/BlobRef 模型；公开模型、op target、DTO 字段、CLI 词汇固定为 Note/Block（line 332）；canonical serialize + hash、校验、规范化；append-only op-log、HLC/LWW merge、replay、物化；SQLite/等价 projection（派生可重建，非真理）；导入导出、mirror 队列与 freshness；dispatch、op 创建、本地 stale guard、同步 ingestion 与 merge；传输无关 `OpSyncPort` trait（list/pull/push segment+blob，仅 SegmentId/BlobId + 字节，不含云类型，line 338）；CLI DTO、Apple binding DTO、schema version envelope。
- **Apple binding 机制在阶段0决定**（C ABI、UniFFI、Swift Package、XCFramework 或其他；line 341）；首选继续把 Rust core 作平台无关核心。
- **客户端↔core 传输（line 343）：** Apple 客户端通过**进程内 binding 直接调用 core，不经网络**；`anchor serve` + `/rpc` 是**可选 localhost 开发/测试传输**，与 CLI、Apple binding 共享同一 op registry / DTO 词汇 / dispatch 入口——**不是产品同步通道**。
- **`anchor-editor-core`（line 354–364）：** 是 `anchor-core` **内部的无 UI 编辑语义模块**（不是独立 package/crate）。拥有 portable selection、intent shaping、选择提升/降级规则、paste fragment shaping、跨 block 文本编辑拆分建议、platform patch 生成、undo intent 映射。**Tree invariant、schema-aware normalization、op creation、merge、最终非法结构拒绝归 `anchor-core::dispatch`。** 七个类型见 line 359–362。
- Apple 编辑器 adapter（line 366–370）只产出 `EditorIntent`、消费 `EditorPatch`；TextKit/NSTextView/UITextView/NSAttributedString/NSTextRange/平台 selection/view identity 仅作输入/排版/显示/命中测试，**不作存储格式或文档模型**，`anchor-editor-core` 也不拥有它们（line 368）；首期 Apple 编辑器为 block list 形态（line 370）；Undo 接 `NSUndoManager` 但 dispatch inverse intent/op，不直接改 TextKit buffer（line 370）。
- CLI 负责本地命令契约（line 372–376）：`apiVersion` 信封；全局 I/O 契约（`--vault`/`$ANCHOR_VAULT`/向上发现、`--format tsv|json`、`--fields`、`--limit`、`--count`、固定退出码 0 ok / 1 usage / 2 not_found / 3 conflict / 4 blocked / 5 vault_not_open / 6 io）。

#### A5.3 主计划 §8.4 vault 落盘 / 同步单元（line 431–453）

- 真理层 = append-only op-log；物化 state、`.json`、`.md` mirror 全是 replay 输出（line 433）。
- 三 merge register：`location`（parent+order）、`content`（content+props+tags）、`life`（`active/archived/trashed/deleted`，`deleted` 终态 tombstone）（line 437–441）。基础 op 记录字段与预留 `provenance`/`approvalState`（line 443）。
- **vault 布局（line 447）：** op-log 是被同步核心产物（如 `.anchor/operations/`）；projection（SQLite，如 `.anchor/cache/index.sqlite`）可从 op-log 重建、不进同步；`.anchor/config/vault.toml` 声明 `source_of_truth = "op-log"`、`sync`（adapter，`none`=纯本地）、projection 路径；`.md`/`.json` 镜像是 post-commit 导出、记录 freshness、**不进同步**（同步它会制造第二真理）。
- **同步单元（line 447）：** 不可变 op-segment 文件，如 `.anchor/operations/<device_id>/<seq>.seg`，**每设备独占命名空间、一封一密、永不修改**；选不可变 segment 因 iCloud Drive 无 delta 同步、任何改动整文件重传，不可变 segment 只上传一次。
- **vault 同步形态三选一（line 449）：** Synced(iCloud)：vault 作为 file package 放 ubiquity container `Documents/`，projection 留本地 Application Support、不进 container；Synced(中立 object-store)：本地任意目录，adapter 推/拉 segment+blob 到用户自有 bucket（默认非零知识）；Local-only：`sync="none"`、非 ubiquity 目录、标 `NSURLIsExcludedFromBackupKey`、core 不挂 adapter、vault-open 断言路径不在任何 ubiquity container 下否则拒开。**`synced → local-only` 切换不可逆**。
- **Apple 首期同步（line 451）：** 不建自有服务器；首期 transport = iCloud Drive 文件适配器（零配置、core 纯文件 I/O、无任何 CloudKit 代码）；core 永不出现 CloudKit/iCloud 类型（line 349）。CloudKit/CKSyncEngine = 二期可选，同一 `OpSyncPort` 接入；其 64MB blob cap 超 CKAsset 上限、record schema 入私有库后难迁移，故 op 形状须在任何 CloudKit 记录落地前冻结。
- **Compaction（line 445）：** 阶段0 定期物化快照 + 截断/分段策略，使 replay 从最近快照起算；GC 必须经 manifest 协调并保留一个窗口；离线超窗口设备需 fallback 整快照重拉；manifest 是多设备写的共享可变文件，竞争协调属 storage/transport 范畴。
- 附件是内容寻址 blob，单附件上限 64MB，dispatch 写前校验并以独立失败态拒绝超限（line 423）。

#### A5.4 主计划 §7.2 字体来源 phase-0 决策（line 296–321）

- 外观设置三组：主题（`ThemeMode = system|light|dark`，默认 `system`）、三字体选择器（`textFont`/`headingFont`/`codeFont`，含「系统默认」）、五数值（`fontSize` 10–30/步1/pt/默认15、`lineHeight` 1–2/0.1/em/1.5、`lineWidth` 32–130/1/em/48、`paragraphSpacing` 0–2/0.1/em/0、`paragraphIndent` 0–3/0.1/em/0；line 309–316）。
- normalize/clamp（line 318）：非有限→默认；越界→clamp；类型不符→忽略保默认；未知字体→丢弃。
- **阶段0 决定字体来源（line 321）：** 随包内置一组跨平台一致字体 vs 枚举原生 OS 字体（后者改变「未知字体被丢弃」的含义）。

#### A5.5 主计划 §8.5 提交节奏 phase-0 决策（line 455–472）

- 单一 `dispatch` 写入路径 10 步（line 457–468）：接收 intent/CLI → 解析 ids/schema → 规范化为 op → 校验 tree invariants → 本地写比对 touched target/register base rev 不匹配返回 `Conflict`(退出码3) → 同步 ingestion 走 schema envelope + actor/HLC 校验 + 幂等去重 → append op-log → replay/update DB → 安排 post-commit mirror job 更新 freshness → 返回 DTO。单一已校验 dispatch 是首期不变量，对 core 写入点 grep 必须可证（line 470）。
- **提交节奏（line 472）：** 阶段0 决定每个 `EditorIntent` 同步落一条 op，还是防抖/批量合并为 commit op——决定 op-log 粒度与 replay/mirror 开销，必须在冻结 op 形状前定下。

#### A5.6 主计划 §8.2 journal 内容寻址身份（已采纳模型；line 384、line 408–411）

- 普通 Note 创建时一次铸造随机 nanoid（line 384）；**journal Note 例外：`id = blake3("journal:" ‖ vault_id ‖ calendar_date)` 由日期内容寻址派生**，「同 vault 同日恒为同一 journal」是身份不变量（line 384、line 94）。
- 阶段0 必须冻结（line 411）：顶层 Note 内部表示（`parent_note_id = null` vs 隐藏 root sentinel）、Calendar projection 排序、journal 默认 parent、trash/restore 对 journal 的边界（含 journal 被 trashed 后重开「今日」须解析回同一 content-addressed id 并 restore，不产生重复）。rename 改 title runs、move 改 `location`，均不触身份（line 411）。
- 行内 offset 对外以 UTF-16 code unit 表达；core 内部存储单位与换算边界在阶段0 定下（line 413）。

#### A5.7 冲突文档 §13.1 phase-0 决策清单（line 423–438；硬截止 = op-shape 冻结）

逐项（编号对齐文档）：
1. **预留全部 §7.1 信封字段**——`op_id`、`op_envelope_version` 不可协商，缺任一即 op-log 迁移（line 425）。§7.1 字段集（line 274–288）：`op_id`、`op_envelope_version`、`macro_op_id`(可空)、`sub_field_key`(可空)、`base_sub_rev`/`new_sub_rev`(可空)、`op_kind`、`supersedes_rev`(可空)、`dominates_frontier`(终态 delete)、`observed_adds`(tag_remove)、`diff_algo_version`(merged body)、每 actor `seq`。
2. 批准 `content` sub-field 集合 `{body, type_id, props, tags}` 为完整（line 426）。
3. **提交节奏 + body merge 共定**：建议每个语义 `EditorIntent` 一条 op（句/段边界，防抖），**绝不 mid-keystroke**；决定 §6.1 触发频率（line 427）。
4. **pin diff3 实现 + 版本 + 跨设备一致性向量集**为一等 CI gate（macOS+iOS 逐字节一致），强制非可选（line 428）。
5. **pin fractional-index order-key 生成器**为一等跨设备一致性 gate（与 diff3 并列）；禁 jitter/精度/字母表漂移（line 429）。
6. causal-stability watermark 策略：per-device frontier 跟踪；低于 watermark 到达 = force-rebase（move op 例外，pin）否则 keep-both；无 frontier 新设备处理（line 430）。watermark 定义见 line 369：所有已知设备各自已确认 HLC frontier 的 `min`（非日历 epoch）。
7. 确认 trash-vs-archive tie 取 `archived`-wins（keep-biased 单用户默认）（line 431）。
8. **tag OR-Set**：批准复用 `op_id` 作 add-identity + remove 携 `observed_adds`（**推翻** gate resolution #3 的 zero-new-storage 取舍）；observed-add id 的 watermark-GC 规则（line 432）。
9. **journal 身份（已 resolve）**：采纳 `blake3("journal:"‖vault‖date)` + rename/move alias + trashed-后重开-restore 边界（§6.9）；随机-id 回退已否决；剩余确认项仅为「一日一 journal」取舍是否接受（line 433）。
10. **`life` 终态可达性**：dispatch 拒绝直接 `active → deleted`；终态 `delete` 携 `dominates_frontier` 的跨 register 支配检查规则（§5.4、§6.3）（line 434）。
11. **split/merge macro-op**：批准 `macro_op_id` + intent-rebase 语义（§6.8）（line 435）。
12. `snapshot_revision` canonicalization：over 物化输出、排除 jitter、含全序 tie-break 输入——附跨设备 snapshot-equality 一致性测试（line 436）。
13. **§13 行 742 DTO 预留**：conflict/resolve CLI schema（line 437）。
14. **边界决策签署**：Kleppmann 祖先检查为在范围内（§12）（line 438）。

- 全局全序键（§4 line 98）：`T = (hlc.wall, hlc.logical, hlc.device, actor, op_id)`，保证两 op 不 tie，replay 是 `T` 序纯 fold。
- content register 合并机制（§3.2 line 67–72）：`body` = 确定性 3-way diff3 / keep-both（永不静默 LWW）；`props`/`type_id` = causality-aware per-cell LWW；`tags` = OR-Set add-wins by `op_id`；`life` = 时钟无关优先级 lattice（`active<{trashed,archived}<deleted`），非级联、派生子树可见性、终态 `deleted` 仅经显式 `trashed→deleted` 且因果支配编辑可达。

#### A5.8 冲突文档 §13.2 建议补入的冲突 fixture（line 440–451）

现状 §11 fixture 只有 target/register conflict、sync merge、mirror stale、同日 journal 去重；建议补：并发同段 body 编辑（不相交 auto-merge / 重叠 keep-both / base 低于 watermark 降级，断言两 replica body + `snapshot_revision` 逐字节相同，含两种 ingestion 顺序与不匹配 watermark）；move-vs-edit with parent change（断言 `location_relocated` emit）；祖先 trashed + 后代 edited（断言收敛 + `ancestor_life_vs_descendant_edit` emit + 后代 content op pin 对抗 compaction）；并发 reorder + reorder_blend（order-key 跨平台逐字节相同 + 整列表 renormalize 不打散）；2-cycle 与 N-cycle move（含跨 watermark，断言无环、整体 cycle-reject、相反到达顺序 snapshot 逐字节相同）；并发 scalar prop（含时钟跳变，断言 causality-aware winner、open 冲突不被常规写入静默关闭、`resolve` op 记录弃值）；tag add-vs-remove（含 pre-existing tag、add/remove/re-add，OR-Set add-wins 跨 replica 确定）；并发 split-vs-overlapping-edit / merge-vs-edit（无重复 tail 文本、不相交 head 编辑不降级、派生块 bY 纳入无丢失检测）；edit-vs-delete 同节点（可逆 trashed + 编辑保留 + restore 完好）；journal 同日（两设备并发铸同一 `note_id` → 一 target 两 body §6.1 不相交合并 + 无隐藏 + 无败方；含 trashed-后重开-restore-不重复 case）。

#### A5.9 冲突文档 §12 边界标注 / §13 暂停条件触及（line 403–417）

- **在范围内、不触 §9/§13**（line 405）：sub-field 分解、per-cell causality-aware LWW、OR-Set tag（复用 op_id、watermark-bounded）、`life` lattice、非级联 delete、fractional-index tie-break、确定性 diff3 body merge、watermark compaction、派生 conflict DTO、split/merge intent rebase。
- **唯一一处有意识边界决策（line 407）：** §5.2 的 **Kleppmann 祖先/成环检查**取自标「CRDT」的论文——不加数据类型/元数据/不保留 move 历史，是 `T` 序前缀 + 当前物化树的纯 tree-invariant 校验。建议采纳为在范围内，但记为有意识的 §13 边界决策（=§13.1 #14 签署项）。
- **有意不做（触 §9/§13 暂停）（line 409–411）：** 字符级文本 CRDT（Peritext/Fugue/RGA/Yjs/Loro-text；若日后采纳唯一可接受为 FugueMax）；完整 undo-do-redo 收敛 move；可移动列表 order CRDT；任何完整 CRDT 引擎；任何中央权威服务器/全局 sequencer。
- **触 §13 行 742（新公开 CLI schema）（line 413）：** `ConflictRecord` 与 `resolve`/`restore`/`restore_order`/`restore_subtree` 的 CLI/DTO 面是超出 phase-0 草图的新公开 schema；现在预留形状使日后暴露是增量而非迁移，但**公开 CLI 命令需要 §13 用户决策**。
- **触 §4.3 模型变更（已采纳并回填，line 415）：** journal 内容寻址 id 是真实模型变更，已采纳为承诺模型，主计划 §4.3/§8.2/§11 已同步；随机-id 回退已否决。
- **不触发（line 417）：** 实时多人（仍单用户异步）、传输暂停（watermark 是 HLC frontier，传输无关）、package 边界暂停（全在 `anchor-core`）、agent-审批暂停（`approvalState` 不复用，§7.4）。

---

## B. Inferred（推理结论）

### B1. STALE auto-memory 记录与现实矛盾（按 Inferred/Unknown 处理，不当事实）

- auto-memory `MEMORY.md` 的 anchor-architecture 条目声称 Anchor 现位于 `suites/anchor/{web,desktop,editor,core}`，技术栈为 React 19 + HeroUI v3 + TanStack React + CM6 plain-DOM widgets + Rust core，2026-06-04 从独立 repo 迁入。
- **与 Observed 矛盾：** 文件系统无 `suites/anchor`（§A1），无任何 React/HeroUI/CM6 的 anchor 代码，且 2026-06-06 的两份 Apple 原生 plan 把首期 UI 明确定为 Apple 原生（SwiftUI/AppKit/UIKit），把 React/HeroUI/Lexical/CM6 列为**后置的独立 Web 客户端选项**且明确「不拥有 Note/block/op/merge/schema/同步/存储语义」（主计划 line 496）。
- **推理：** STALE memory 描述的是一个更早的、被新 plan 取代的方向。**按新 plan 为权威**；该 memory 条目作为研究 caveat 标为过时（Inferred），不作为当前事实，也不据其推断任何 layout / 技术栈。STEP 3 不应引用该 memory 条目作为 anchor 现状证据。

### B2. Phase 0 不产出实现代码，只冻结契约/决策

- 由 §A5.1 产物清单（全是「确认 / 建议 / 合约 / 草图 / 决策 / fixture set」）与「实现待单独授权」（§A2）推理：Phase 0 交付物是**文档化契约与决策**，不是 Rust/Swift 实现。Phase 1 才开始 spike（主计划 §11 line 549–569）。本 workbench packet 正是 Phase 0 的载体。

### B3. 当前仓库的 TS/bun 工具链不会自动覆盖 Rust/Swift

- 由 §A1（`check = tsc --noEmit`、`test` 只 filter TS workspaces、tsconfig include 仅 TS/TSX）推理：`bun run check` / 现有 `test` 脚本**不会**类型检查或测试任何 Rust/Swift；anchor 的 Rust 验证须靠 plan §12 引用的 `cargo` 命令（主计划 line 698–699），Apple 验证须靠待补的 `xcodebuild`（line 700）。这些都是独立于现有 bun 工具链的命令链，是 layout 张力的根源（见 §B5、§C2）。

### B4. anchor-editor-core 不应成为独立 workspace 成员

- 由 §A5.2（line 354「`anchor-editor-core` 是 `anchor-core` 内部的无 UI 编辑语义模块」）推理：它**不是**独立 package/crate，而是 `anchor-core` 内部模块，只拥有 portable selection / intent shaping / patch 生成 / undo-intent 映射；tree invariant、schema-aware normalization、op creation、merge、最终非法结构拒绝归 `anchor-core::dispatch`。任何把它做成单独 crate/包的 layout 提议都偏离 plan。

### B5. LAYOUT 推论：`suites/anchor/` 是最贴合 plan 的归属，但有真实张力（需用户批准 + Codex 验证）

- **推论依据（强）：** plan §12 的验证命令明确在 `suites/anchor` 下跑 `cargo test -p anchor-core` 与 `cargo clippy -p anchor-core --all-targets`（主计划 line 698–699）。plan 自身已把 anchor 的 cargo 工作放在 `suites/anchor`，故 `suites/anchor/` 作为内聚归属是 plan 的自然落点。
- **示意内层布局（需批准，非契约）：** `suites/anchor/{core(Rust crate: anchor-core，含 anchor-editor-core 模块), cli(Rust bin), apple(Xcode project/workspace，macOS+iOS targets，Swift adapters + OpSyncPort impls), fixtures/, Cargo.toml(嵌套 cargo workspace)}`；契约 README 在 anchor-core 实现后随其落地（AGENTS：package README 拥有 CLI/API/schema/file-format）。
- **关键张力（须诚实陈述）：** Rust cargo workspace + Xcode project **不符合** bun/TS 的 `suites/*/*` workspace glob，也不进 TS-only root tsconfig include（§A1）。bun 是否容忍 glob 下的非-package 目录、Xcode project 嵌在 `suites/anchor` 下是否人体工学，都是开放问题。这是一次**package 边界 / workspace 结构变更**，按 AGENTS line 48–50 与冲突文档 §13 暂停条件（line 748「Package / workspace / Apple project 边界需要改变」），需用户批准（=主计划 line 504「Workspace / package 重组……除非阶段0明确需要并另行授权」）。**Needs user approval + Needs Codex verification。**

### B6. Apple binding 推荐 = UniFFI（自然选择），但属 Phase-0 决策且需验证

- 由 §A5.2 line 341（binding 机制阶段0 决定，候选含 C ABI / UniFFI / Swift Package / XCFramework）与冲突文档外 §8.4 line 453「UniFFI 为自然选择」推理：推荐 UniFFI 生成 Swift 绑定、以 XCFramework / Swift Package 分发；但 plan 把它列为 Phase-0 待定决策，需可重复验证命令与失败条件（主计划 line 545）。**Needs Codex verification。**

### B7. 客户端↔core 传输：进程内 binding 为产品路径，`anchor serve`/`/rpc` 仅开发工具

- 由 §A5.2 line 343 推理：Apple 客户端走进程内 binding 直调 core，无网络；`anchor serve` + `/rpc` 只是共享同一 op registry/DTO/dispatch 的可选 localhost 开发/测试 transport，不是产品同步通道。Phase 0 的「客户端↔core 传输边界」决策（§A5.1 关键决策清单）应据此固化。CLI 是**本地结构化命令契约**（apiVersion 信封、固定退出码、`--format tsv|json`），**不是 MCP**。

### B8. 同步分层是 Phase-0 必冻边界，且与 op-shape 冻结互锁

- 由 §A5.3 + §A5.7 推理：truth = append-only op-log；同步单元 = 不可变 per-device op-segment 文件（`.anchor/operations/<device_id>/<seq>.seg`）；mirror（.md/.json）是有损派生导出**不同步**；SQLite projection 可重建本地缓存**不同步**；同步经 core trait `OpSyncPort`（仅 SegmentId/BlobId + 字节）；首期 transport = iCloud Drive 文件适配器（NSFileCoordinator + `.icloud` placeholder 下载 + NSMetadataQuery），core 只做纯文件 I/O、不碰 CloudKit；CloudKit/CKSyncEngine = 二期可选同一 `OpSyncPort`；跨平台/Web = 中立 object-store（S3/WebDAV），非 iCloud；local-only：`sync="none"` + 非 ubiquity 目录 + `NSURLIsExcludedFromBackupKey` + vault-open 断言不在 ubiquity container 下，`synced→local-only` 不可逆。因 §A5.7 #1 要求 op-shape 冻结前预留全部信封字段、§A5.3 要求 op 形状在任何 CloudKit 记录落地前冻结，**同步形态与 op-envelope 冻结在 Phase 0 互锁**。

### B9. 首期范围排除项不得回拉为 in-scope

- 由主计划 §9（line 494–506）与冲突文档 §12 推理，以下为显式非目标 / 保留 hook，Phase 0 只可作为非目标或预留引用：Markdown 字节保真；note-centric route/payload/UI parity；应用内 AI agent / proposed-change 子系统（op 信封预留 `actor`/`provenance`/`approvalState` 作 hook，但不实现）；实时多人 / CRDT / Loro；独立 Web 客户端（后置，落地时走中立 object-store + OPFS）；首期 iPadOS 专项优化。

---

## C. Unknown（需 Codex 现实验证或用户拍板）

### C1. Apple / Xcode / Swift-Rust / TextKit 现实（Codex 验证）

- **UniFFI 是否仍是 Rust↔Swift 的自然选择**（vs C ABI / 手写 Swift Package / 直接 XCFramework），其当前版本生态、async/错误类型/内存桥接成熟度、以及把 UniFFI 生成绑定打成 XCFramework / Swift Package 的实际流程与失败条件。（对应 §A5.1 binding 推荐 + 主计划 line 545 失败条件要求。）
- **跨 FFI 批量 marshaling segment 字节的成本**（主计划 line 558 要求实测），是否影响 op 形状 / 提交节奏选择。
- **TextKit / NSTextView / UITextView 现实**：平台事件能否稳定转换为 `EditorIntent`、`EditorPatch` 能否回放到原生 view model；UTF-16 code unit offset 与 Swift String / NSAttributedString 桥接边界；IME / 跨 block 选择 / accessibility 的实际复杂度（主计划 line 189、line 740；跨 block 文本选择列为独立 spike）。
- **iCloud Drive 文件适配器可行性**：`NSFileCoordinator` 协调、`.icloud` placeholder 下载、`NSMetadataQuery` 发现远端 segment 是否足以喂纯字节给 core，且 core 全程不碰 CloudKit；over-quota / signed-out / 上传延迟（秒到约 1 小时）的可观测性（主计划 line 276–279、line 349）。
- **实际 `xcodebuild` 命令**：macOS / iOS target 的构建/验证命令（主计划 line 700 留待 Phase 0 补充）。
- **diff3 / order-key 跨平台 bit-reproducibility**：能否保证 macOS 与 iOS 对相同输入产出逐字节相同的合并 body 与 fractional key（冲突文档 §13.1 #4、#5，强制 CI gate）。

### C2. Workspace / layout 决策（用户批准 + Codex 验证）

- **`suites/anchor/` 归属是否批准**，以及 cargo workspace + Xcode project 嵌在 `suites/*/*` glob 下的可行性：bun 是否容忍该 glob 下的非-JS-package 目录、是否污染 `bun install` / `test` filter；TS-only tsconfig include 是否需调整（§B5）。这是 package 边界 / workspace 结构变更，触 AGENTS line 48–50 与冲突文档 §13 暂停条件（line 748）。**Needs user approval + Needs Codex verification。**
- 内层目录命名（`core`/`cli`/`apple`/`fixtures`）、嵌套 `Cargo.toml` 位置、契约 README 落点是否符合 plan 与 AGENTS 期望。

### C3. plan 自身留给 Phase 0 的待决项（用户 / 设计复查拍板）

- **字体来源**：随包内置跨平台一致字体 vs 枚举原生 OS 字体（主计划 line 321；后者改变「未知字体被丢弃」语义）。
- **提交节奏 / op-log 粒度**：每个 `EditorIntent` 一条 op vs 防抖/批量 commit op（主计划 line 472、冲突文档 §13.1 #3 建议「每语义 intent 一条、绝不 mid-keystroke」）。
- **顶层 Note 内部表示**：`parent_note_id = null` vs 隐藏 root sentinel（主计划 line 411）。
- **mirror 目录组织**：Note id 寻址 vs 人类可读路径；镜像是否纳入版本库（主计划 line 447）。
- **搜索 / backlinks 后端**：SQLite FTS vs replay 后内存索引（主计划 line 478）。
- **UTF-16 / UTF-8 offset 换算边界**与 core 内部存储单位（主计划 line 413）。
- **compaction GC 保留窗口 + manifest / cursor 协调**与 watermark 策略细节（主计划 line 445、冲突文档 §13.1 #6、§10 line 369–376）。
- **加密与密钥所有权**：中立 object-store 零知识所需的客户端加密层、向新设备分发密钥（主计划 line 449）。
- **「一日一 journal」取舍是否接受**（冲突文档 §13.1 #9 剩余确认项）。
- **CloudKit 二期 64MB blob vs CKAsset 上限**取舍（分片 / 降 cap / out-of-band；主计划 line 451）——二期，但影响 op 形状是否需提前考虑。
- **§13 边界签署**：Kleppmann 祖先检查作为有意识 §13 边界决策的签署（冲突文档 §13.1 #14）；`ConflictRecord` / `resolve` 新公开 CLI schema 的预留（§13.1 #13、§12 line 413，公开命令需 §13 用户决策）。

---

## Open questions for Codex / user（指针清单）

- **Codex（现实验证）：** §C1 全部——UniFFI vs 其他 binding + XCFramework/Swift Package 打包现实；FFI segment-bytes marshaling 成本；TextKit→`EditorIntent`/`EditorPatch` 与 UTF-16 桥接；iCloud Drive 适配器（NSFileCoordinator/.icloud/NSMetadataQuery）可行性与 core-no-CloudKit；实际 `xcodebuild` 命令；diff3 / order-key 跨平台 bit-reproducibility。
- **User（批准）：** §B5 / §C2 `suites/anchor/` layout（cargo + Xcode 嵌入 bun/TS glob 的 package-边界变更，触 §13 暂停）；§C3 plan 留待 Phase 0 的设计决策（字体来源、提交节奏、顶层 Note 表示、mirror 组织、搜索后端、offset 边界、compaction/watermark、加密密钥、一日一 journal 取舍、§13 边界签署与 conflict/resolve CLI schema 预留）。
- **Caveat（不当事实）：** STALE auto-memory 的 `suites/anchor` React+HeroUI+CM6 描述与文件系统及新 plan 矛盾（§B1）；按新 Apple 原生 plan 为权威，该 memory 条目视为过时。

---

## Packet 覆盖范围说明（本 6 文件 packet 覆盖什么 / CP-0 仍欠什么）

本 packet 是 STEP 1 草稿，刻意只产出 6 份对齐用 workbench 文件（research-notes / project-layout-options / contract-baseline-draft / key-decisions-draft / fixture-set-draft / codex-verification-packet）。它**已覆盖**主计划 §11 阶段0 的：平台路线、Apple 工程边界建议、binding 方案比较与推荐、`OpSyncPort` + iCloud Drive 适配器方向、`anchor-editor-core` 模块合约与七个编辑器类型的责任级列举、交互契约（选择/结构编辑/Note 行为/引用/props·type/命令/Settings/失败状态，散见 contract-baseline 与 fixture-set）、全部「关键技术决策」（key-decisions D01–D32，逐项对齐 §537 与冲突文档 §13.1）与 fixture set（fixture-set F01–F40，逐项对齐 §538 与冲突文档 §13.2）。

但有两项主计划 §11 阶段0 明列产物，本 packet 只在责任 / 描述层提及、**未渲染为字段级 / 图示级的独立 artifact**，属 STEP 3 CP-0 整合阶段须补齐项（在此显式登记，避免把本 packet 误读为 Phase 0 的 100%）：

- **core DTO 字段级草图（主计划 line 536）：** Note / block / op / projection / search result / validation error / mirror status / settings / sync status 的**字段级** DTO 草图。contract-baseline 已给 Note/Block 字段与七个编辑器类型的字段列举、key-decisions D24 已给 op-envelope 字段级草图，但**派生 / 读侧 DTO**（search result、validation error、mirror status、sync status）尚无与 Note/Block 同粒度的字段草图。
- **macOS / iOS 信息架构草图（主计划 line 535）：** 四个稳定区域 + 主导航结构在主计划 §5 已描述、Settings/IA 邻接语义在 fixture F37–F40 与 contract-baseline 有涉及，但**未单独画出 IA 草图 artifact**。

二者均为「已命名、部分覆盖、未出独立草图」；对以对齐为目的的 STEP 1 草稿是可接受的延后，但 **CP-0 批准前须由 STEP 3 闭合**。CP-0 检查点（主计划 line 547）明列「DTO 草图、信息架构」为批准项。
