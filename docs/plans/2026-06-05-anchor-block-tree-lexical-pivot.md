# Plan: Anchor Pivot — Block-tree canonical + Lexical-as-view + CLI 契约（CRDT 推迟）

创建日期：2026-06-05
状态：设计（实现前的方案；Phase 0 kill-switch 未跑，方向可被 0a 推翻）

> Planning record（历史记录，非当前接口契约）。权威、稳定的 CLI / API / schema /
> file format 契约在实现后归属 `anchor-core` 包 README（per repo `CLAUDE.md`）。
> 本文固定写代码前已商定的形状与排序。
>
> Supersedes（取代）以下早期编辑器/存储方向，它们基于 CM6-flat + “Markdown 即真理” +
> 字节保真，本方案主动废弃该前提：
> `docs/plans/2026-05-24-anchor-lexical-markdown-editor.md`、
> `docs/plans/2026-05-24-anchor-v1-note-model-and-editor.md`、
> `docs/plans/2026-06-01-editor-semantic-feature-renderer-plan.md`。
> `docs/plans/2026-05-30-anchor-operation-core-cli.md` 的 op-core/CLI 契约仍是本方案的底座。
>
> 证据来源：一次研究 workflow（块 vs Markdown、CRDT、agent 工具、编辑器框架）、
> 代码勘察、4 路 grounding（均对照真实符号）、一次 adversarial plan-critic。
> 本文已整合 grounding + critic 的修正。

---

## 1. Clarification status

方向已定，本方案只解决“怎么做”。**3 个属于用户的待决项**（见 §14）：code-block
实现路线（CM6 嵌入 vs Lexical 原生 vs 回退 ProseMirror）、测试落地（CLAUDE.md 禁止未授权加
测试）、迁移执行方式。

保守假设：**单人 offline-first + 多设备非实时同步**。若改为实时多人，CRDT 与编辑器选型都要
重评（§14 触发器）。

## 2. Background / problem

CM6-flat + “Markdown 即真理” 无法表达**块容器嵌套**（代码块作为各种容器的结构子节点，例如
嵌套列表项下的代码块）。这是放弃 Markdown 存储的具体阻断点。历史已证两端：Lexical（旧
SolidJS 版，富文本规范化树）静默重写约 45% 真实笔记；CM6 赢在字节保真但封死表现力上限
（`editor/src/__tests__/corpus-fidelity.test.ts` 守着 `doc.toString() === body`）。

选 **Lexical**：它的 **permissive 嵌套是默认**（无需 ProseMirror 式 restrictive schema），节点
DX / React 贴合好；而“编辑器是 Rust core 块树的 view”这一架构，让 ProseMirror 的文档模型优势
被架空（权威模型与所有结构运算都在 core）。**CRDT 非刚需**（同步 ≠ 实时协作）。

## 3. Objective（单一持久目标）

让 Anchor 的**权威存储成为一棵由 `anchor-core` 校验的块树**（稳定 block id + 每块 revision）；
**Lexical 作为渲染/输入 view**（经 `dispatch` 把编辑翻成结构化块 op，绝不持久化 Lexical
EditorState）；一个**版本化、文本优先的 CLI** 是唯一对外 agent/自动化契约；**持续 export
（md + JSON）镜像**是强制的耐久 + grep 逃生舱；现有乐观并发冲突模型保留在**确定性块哈希**上；
Markdown 仅作导入（一次）与导出（单向）。

## 4. Scope

- **core**：新 `core/src/block.rs`（model / `canonical_serialize`+hash / `validate(tree)` /
  `mint_block_id` / `migrate` / extras 透传）；`lib.rs` 抽 `require_revision()` + 引入单一写关卡
  `write_validated_note`；`vault.rs` 块存储读写替换 + 扩展 `rebuild_sqlite_projection`（块结构 /
  反链 / 类型字段索引，links/tags 转树遍历）；`serve.rs` `dispatch` 加 validate + `NoteView /
  BlockView` DTO（`apiVersion`）；`domain.rs` markdown 保留为 import/export；importer + parity_diff；
  export 镜像 + `anchor export --watch`。
- **editor**：`@plimeor/anchor-editor` 由 CM6-flat 换 Lexical（容器 = ElementNode，code/embed/diff
  = DecoratorBlockNode，富文本 = TextNode，block id 走 NodeState API）；**退役整个 `live-preview/`
  子树**。
- **cli**：clap 保留，arm body 改走 `dispatch`；DTO 防火墙 + 固定 TSV 列序 + block-id 读写接缝。

## 5. Non-goals

CRDT/Loro 实现；MCP server；实时多人；字节保真；**fts5 排序搜索（推迟，export-mirror+ripgrep 已
满足契约，避免 rusqlite feature/lockfile 扰动）**；把 Rust clap CLI 改写成 command-kit（CLAUDE.md 的
command-kit/Valibot 偏好是 TS 侧，不适用此 Rust 二进制）；新 workspace；改 package boundaries /
workspace / lockfile（除非必要）。

## 6. Required context（动工前先读）

`core/src/{serve.rs (dispatch), lib.rs (:343/:762 冲突检查、8 处 write_note_file 调用),
domain.rs (serialize_markdown / __anchor_extras__:88-191 / graph_impact_summary:608 /
property_link:405 / ignored_ranges:521 / stable_hash:842), vault.rs (scan / parse /
write_note_file:115 / rebuild_sqlite_projection:438 / seed_demo_vault:214),
bin/anchor-cli.rs (print_output / tsv_row:381)}`；
`editor/src/{editor/Editor.tsx, rendering/decorations.ts, extensions/{code-block/*,
live-preview/*}, __tests__/{corpus-fidelity,decorations,interaction}.test.ts, keymap.ts:235}`；
现有 Rust 测试 `cli_contract.rs / serve_smoke.rs / lifecycle.rs / domain.rs`。

## 7. Planning iteration

独立研究 workflow → 代码勘察 → 4 路 grounding（对照真实符号）→ 综合 → adversarial
plan-critic。已整合的修正：

- CM6-in-Lexical 是**有不利证据**的头号 kill-switch（见 §11）。
- Rust 回归门必须用 `cargo`，**不是** `bun run check`/`lint`（后者只跑 tsc+biome，根本不编译
  Rust）。
- `validate` 必须覆盖**全部 8 个**写点（critic 发现原稿只覆盖 3/8）。
- 编辑器拆除面被低估约 10×（live-preview 全子树 + 多个 flat-doc 测试）。
- import 的 block-id 必须确定性/幂等（不可照搬时间戳 `next_id`）。
- `require_revision` 不能“合并”可选 If-Match 读穿语义。
- Phase 4 → Phase 6 的 proposed-change diff 前向依赖（已前移）。

## 8. Proposed approach（最小充分路径 + 所有权）

保持 `dispatch()` 为唯一写关卡；**核心不变量单一所有者**：一个私有助手
`write_validated_note(vault, ...)`，内部 `block::validate(tree)` → `write_note_file`，**全部 8 个写
调用点都路由经它**（create / update / apply_proposed_change / archive / trash / restore /
open_today_journal），使“每个写路径都校验”成为可被一次 grep 证明的事实；**core-only
`mint_block_id`**；Lexical 结构规则只是冗余第一道防线。**diff 在 core 算**，编辑器只渲染。

**CRDT 不上**：每块带 `id` + `revision`，用 `operations.jsonl` + `now_iso` 做 LWW tiebreak，note 级
`baseRevisions`（domain.rs:744）泛化到 block-id 键即可。**不可逆步骤（弃 markdown 真理）排最后**，
且在三个 kill-switch + 真实语料 parity 全绿之后。

**关键技术约束（grounding 实证）：**

- `canonical_serialize` 必须是**显式确定性编码器**，不是 `serde_json::to_string(Value)`——固定
  数字/字符串/转义格式与键序，`stable_hash`（FNV，domain.rs:842）只做最终摘要。否则
  revision-as-tree-hash 与 merge-by-block-id 不成立。
- **block id 必须跨 re-import 不变**：import 时确定性派生（内容寻址 或 path+序数）**或**一次性
  mint 并持久化；**禁止**照搬时间戳式 `next_id`。parity 必须断言 `import(import_output)` 的 id
  不变。
- `write_note_file` 现在**返回带哈希的 note**，调用方（lib.rs:269,325；serve.rs:338）读其
  id/revision——块写函数必须保留这个返回契约。
- Lexical：容器 = ElementNode（permissive 默认，只加谓词去**禁止**、从不为**允许**）；
  block id/revision 用 **NodeState API**（`$getState`/`$setState`，0.26 起稳定），note 级放
  RootNode；transforms 保持最小且前置条件守卫（它们会级联到不动点），构造**已合法**的树避免
  normalization 改 id；`@lexical/markdown $convertToMarkdownString` **只**做单向导出，**绝不**接
  `$convertFromMarkdownString` 作输入。

## 9. Work sequence（分阶段；每片 forward + regression 证据）

### Phase 0 — Kill-switch spikes（在 copy 上跑；任一失败按其 fallback 处理，不碰不可逆）

- **0a CM6-in-Lexical 边界（头号，先做，3–5d）**：Lexical `DecoratorBlockNode` 内挂一个独立
  CM6 `EditorView`；测**跨边界 copy/cut**（复现 #3759 的 `Expected valid LexicalSelection`）、
  focus-aware 撤销路由、**CJK IME**。**KILL IF** copy 跨界无法不崩 且 undo/IME 无法以有界成本
  路由 → **fallback：改用 Lexical 原生 `@lexical/code`（Prism）CodeNode，放弃嵌入 CM6**（代价：
  失去 CM6 富能力与现有 code-block 投入）；若坚持“必须完整 CM6”，则升级为**重评 ProseMirror**
  （它有现成 CM6-nodeview 配方，跨界选择/撤销有官方实现）。*这是整个 Lexical 路线的承重假设，
  故第一个跑。*
- **0b canonical_serialize 确定性（core，1–2d）**：import→serialize→hash，
  deserialize→serialize→hash；**KILL IF** 任一 fixture 字节不一致或哈希随键/子序变化 → 必须
  显式确定性编码器。
- **0c export 镜像 vs ripgrep parity（1.5–2d）**：`anchor export --watch` 镜像 + ripgrep 跑 10 个
  真实查询；**KILL IF** 与 core 查询在“缺失/陈旧/代码围栏内 `[[..]]`/#tag 泄漏成假边”任一处
  不符 → 逃生舱不可信，停。
- **Checkpoint CP-A**：三项指标 + 0a 的 code-block 路线结论上报后，才进 Phase 1+。

### Phase 1 — 核心不变量骨架（无 I/O 改动，先把地基测绿）

- **1a 抽 `require_revision(current, expected)`**：**只**用于两个**强制比较**点（`update_note`
  lib.rs:343、`apply_proposed_change` :762，它们本就在缺失 base 时报错）；**可选 If-Match 读穿点**
  （`handle_overwrite` serve.rs:380、CLI overwrite/edit anchor-cli.rs:801/841/879）只在其
  `if let Some(expected)` 分支内调用它——**不改变缺省 If-Match 时“读穿即成功”的语义**。
  *regression：`cargo test -p anchor-core`，具名 `cli_contract.rs::overwrite_with_stale_if_match_returns_conflict`、
  `serve_smoke.rs::create_read_overwrite_with_if_match`。*
- **1b 建 `core/src/block.rs`**：model + 确定性 `canonical_serialize`+hash + `validate(tree)` +
  `mint_block_id`（确定性/持久，见 §8）+ `migrate(note, from)` + extras 透传。**先把 0b 确定性 +
  extras-passthrough 两个测试测绿，再碰 I/O**。
  *regression：`cargo test`；`domain.rs::roundtrip_preserves_unknown_fields /
  stable_hash_is_deterministic_and_64bit`。*
- **1c 单一写关卡 `write_validated_note`**：把 `lib.rs` **全部 8 个 `write_note_file` 调用点**
  （:257/:312/:360/:402/:440/:479/:776 + journal）路由经它（内部 `validate` → `write_note_file`）。
  *regression：`lifecycle.rs` 全套 archive/trash/restore 必须仍绿——证明 validate 接受所有现有
  生命周期形态。*

### Phase 2 — Importer + parity 关卡

- **2a `import_markdown_to_tree`**（在 `domain.rs` / `anchor-cli`，无 boundary 改动）：一次性在 core
  解析 markdown → 块树，确定性解决嵌套代码块缩进歧义；**id 确定性派生/持久**（§8）。
- **2b `parity_diff`（升级 oracle）**：**不止** `graph_impact_summary`（只比 count，不够）——断言
  `extract_links` **集合相等**（用其 camelCase Value 输出，**非** SQLite snake_case）+ 完整
  metadata 相等（extras / sourceRefs / properties / tags）；两侧都**先重建 projection/index** 再比；
  `resolvedNoteId` 相等需同一 title/alias 解析上下文。
- **2c 合成 fixtures**：seed vault 缺高危构造（它只有一个 ` ```md ` 围栏覆盖“代码围栏内 link/tag
  抑制”，**没有** indented-code-in-list / sourceRefs / __anchor_extras__）——为每个排名损失补
  合成 fixture，并纳入用户真实的 `~/Documents/notes`，否则 parity 绿是“漏测的绿”。
- ⚠️ **先扩 extras 捕获**：`parse_frontmatter`（domain.rs:88-191）今天只捕获扁平标量 + 一层列表，
  `sourceRefs` 序列化（:280）丢 id/label/noteId 之外的键——“任意 frontmatter 往返”被高估，要先
  拓宽捕获，否则 importer 上限受现解析器限制。

### Phase 3 — Exporter 作为一等读路径

- **3a `anchor export`（md + 完整 JSON dump）+ `--watch` 镜像**：hook 与
  `rebuild_sqlite_projection` **同一个**写后点（lib.rs 每次写后），复用 `write_note_file` 的原子
  `.anchor-tmp + fsync + rename`，使 model / sqlite / 镜像三者锁步不漂移。`anchor grep` /
  `search --raw` 背靠镜像。**fts5 推迟（§5）。**

### Phase 4 — proposed-change diff 表示 + Lexical 编辑器（注意拆除面）

- **4a diff 载荷再表示（解决 Phase 4 → 6 前向依赖）**：把 `create_proposed_change` /
  `apply_proposed_change` 的 `diff[0].after`（今天是**整段 markdown body 串**，lib.rs:766-776
  逐字写入）改为**块树 / 块 op**——**这片必须在 4c 编辑器渲染 diff 之前**，否则“编辑器渲染 core
  算的 diff”依赖一个尚未做的 body 再表示。下游 blast：`agent_fixtures.rs`、CLI `:818-997`
  baseRevision、TS 前端读此 shape。
- **4b schema_version 放置决定**：per-note vs per-block（per-block revision 意味着块可能比 note
  版本活得久）——**在 vault XL 重写前**定。
- **4c Lexical 换编辑器（XL，拆除面比想象大一个量级）**：容器 / Decorator / TextNode 映射 +
  NodeState 带 id；`blockTreeToLexical`（渲染）与 `lexicalToBlockOps`（经 dispatch 的结构化 op）；
  **退役整个 `editor/src/extensions/live-preview/` 子树**（lists/tags/links/headings/blockquote/
  inline-format 全是 flat-doc 装饰）+ `decorations.test.ts`（约 40 处 `doc.toString() === body`
  断言）+ `interaction.test.ts` + `editor-harness.ts:147` + 重写 `Editor.tsx` 的 `getCurrentText` /
  autosave（:149/:201/:232）/ `keymap.ts:235`（全依赖单一 flat EditorView）；**复用** code-block
  `language.ts / theme.ts / components/*` + CM6 lang-data/highlight；**退役** `plugin.ts /
  widgets.tsx`（flat-Lezer 假设）。code-block 实现按 0a 结论（嵌入 CM6 或原生 CodeNode）。
  *regression（TS 侧）：`bun run check`（tsc）+ `lint`（biome）。*

### Phase 5 — CLI 扶正为契约

- **5a DTO 防火墙**：`contract` 模块 `NoteView / BlockView / SummaryView` + `apiVersion` 信封，
  **仅在 `print_output`** 应用（先不改 model），让 agent 面不再是裸 Value 窗口；`tsv_row` 的
  `map.values()` 换**每命令固定列序**（今天 TSV 字母序是 BTreeMap 巧合，启用 `preserve_order` 会
  静默改列序）。
- **5b arm body 走 `dispatch`**：clap 顶层保留，每个 arm 的**主体**改调 `serve.rs::dispatch`，使
  DTO + `require_revision` 单点存在；**为 CLI 路径镜像现有 serve 测试**防漂移。
- **5c 读写 block-id 接缝**：读出 `note:block-id:text`，写吃 block-id（Phase 1/2 块模型落地后才能
  发真 id——**别在那之前承诺 block id**）。契约文档写进 **core 包 README**（CLAUDE.md README
  归属）：apiVersion semver 规则、固定 TSV 列、退出码、“MCP 是以后薄 adapter”。

### Phase 6 — 不可逆翻转 + 版本

- **6a 翻转前置**：**先 drain/re-base 在途 proposed_changes**——它们的 baseRevisions 键在旧
  `hash(serialize_markdown)` 上，改用 `hash(canonical_serialize(tree))` 会全冲突。
- **6b 翻转（仅在 CP-B 全绿后）**：steady-state 读路径切块存储，弃 markdown 真理；markdown 代码
  **保留**作 import/export。`corpus-fidelity` + flat-doc 装饰测试退役。
- **6c links/tags 转树遍历**：删 `domain.rs:521 ignored_ranges` 正则路径（它不处理 `~~~` 围栏 /
  4 空格缩进码 / 多反引号行内，:534 有记录），从树叶重算——消除代码围栏假边。
- **6d 版本历史**：`anchor` 驱动 git 镜像/快照（挑一个）。

## 10. Acceptance, regression evidence, verification

- **Rust 门（关键修正）**：`cargo test -p anchor-core` + `cargo clippy` 是核心回归边界——
  `bun run check`/`lint` 是 **tsc + biome，根本不编译 Rust**，只用于编辑器/CLI-TS 片（4c/5）。
- **#1 单关卡可证**：一次 grep 证明全部 8 写点经 `write_validated_note` → `validate`；
  `lifecycle.rs` 全绿。
- **冲突模型**：`cli_contract.rs::overwrite_with_stale_if_match_returns_conflict`、`serve_smoke.rs`
  conflict 断言在 1a 前后不变态。
- **确定性**：0b 哈希稳定率 100%（import → serialize → hash 往返）。
- **迁移 parity**：seed + 合成 fixtures + 真实 `~/Documents/notes` 上 `extract_links` 集合相等 +
  metadata 全等 + **block-id 跨 re-import 不变**。
- **可 grep**：0c 的 10 查询 ripgrep-over-mirror 与 core 一致。
- **编辑器拆除**：`decorations.test.ts` / `interaction.test.ts` / `live-preview/` 的退役有
  before/after 记录（不止 `corpus-fidelity`）。
- **CLI 契约**：`apiVersion` 在场；每命令 TSV 列序固定；agent 能读 block-id 并按 id 写。

## 11. Risks and rabbit holes

- **CM6-in-Lexical 边界（头号，有不利证据）**：confirmed crash `Expected valid LexicalSelection` on
  copy/cut（Lexical issue #3759）、undo 结构性非统一、一位 Lexical 维护者称其“not a wise idea”、
  CJK IME 边界未测。→ 0a 先验，原生 CodeNode 兜底。
- Lexical transform 级联 / normalization 改 id（构造合法树 + 守卫前置条件）。
- **Rust 回归门曾是虚的**（已改 cargo）。
- **单关卡曾只覆盖 3/8**（已改 `write_validated_note`）。
- **编辑器拆除被低估约 10×**（已纳入 live-preview 全子树 + 多个 flat-doc 测试）。
- **block-id 确定性/幂等**（已禁时间戳 id）。
- `require_revision` 误“合并”可选 If-Match 读穿语义（已分点）。
- Phase 4 → 6 diff 前向依赖（已前移 4a）。
- revision-basis 不连续（已 6a drain/re-base）。
- extras 捕获上限（已前置拓宽）。
- Lexical EditorState 误被当真理（硬架构边界：仅 headless adapter）。

## 12. Checkpoints

- **CP-A**（Phase 0 后）：三个 kill-switch 指标 + 0a 的 code-block 路线结论，上报后才进 Phase 1+。
- **CP-B**（6b 前）：真实语料 parity 全绿 + proposed_changes 已 drain/re-base，才允许弃 markdown
  真理。

## 13. Stop condition

方案交付。**实现仅在用户明确放行后开始**，第一执行单元 = Phase 0 三个 spike（在 copy 上）。
不写代码、不改文件、不跑测试，除非用户授权。

## 14. Pause conditions / 待决策

1. **Code-block 路线（由 0a 结果触发，但用户偏好决定 fallback）**：嵌入完整 CM6（风险高，有
   #3759 证据）/ Lexical 原生 CodeNode（安全，失 CM6 富能力）/ 若坚持完整 CM6 且 0a 失败则
   **回退 ProseMirror**。
2. **测试落地（CLAUDE.md 禁未授权加测试）**：三个 kill-switch + parity 的证据要落成 `cargo` /
   前端正式测试，还是一次性脚本？（建议落正式测试——它们是不可逆决策的护栏。）
3. **迁移执行**：copy 上 `anchor import --dry-run` + parity 迭代到绿、再原地 + 备份（推荐，
   最低风险）/ 原地 + 备份 / 双写软切。
4. **触发器**：若改为**实时多人协作**，CRDT（Loro）+ 编辑器选型都要重评——本方案不覆盖。

---

## Appendix — 决策溯源（为何如此）

- **为何 block-tree canonical 而非 Markdown**：Markdown 的列表嵌套深度与代码内容缩进都是行首
  空格、不可分离；Tana 级特性（块引用 / transclusion / 类型字段）无 CommonMark 等价物；用户已
  主动放弃字节保真。块树用稳定 id 把结构与内容分离。
- **为何 CLI 而非 MCP**：CLI 可组合（管道 / grep / jq）、通用（任何能跑 bash 的 agent）、token 比
  MCP 省 4–32×；现有 clap CLI 是扶正而非新建。MCP 留作以后薄 adapter。
- **为何 Loro/CRDT 推迟**：offline-first 单人多设备同步 = 稳定 id 块树 + 每块 revision +
  merge-by-block-id，**不是** CRDT；CRDT 只在实时多人或离线改同段无损合并时回本，二者均未承诺。
- **为何 Lexical（但 code-block 路线由 0a 定）**：permissive 嵌套默认、节点 DX / React 贴合；
  且“编辑器是 core 块树的 view”使 ProseMirror 的模型优势被架空。唯一真实疑点是嵌入 CM6 的
  边界 → 0a 验证，必要时回退原生 CodeNode 或 ProseMirror。
