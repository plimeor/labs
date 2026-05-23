# 想法：Note-first agent-safe knowledge app

创建日期：2026-05-23
状态：早期产品方向

这份 idea 先确定一个边界：笔记软件本体是本地优先的 Markdown 系统；外部工具和 agent 通过受控的本地操作模型参与维护。基础写作、搜索、链接、标签、属性和局部图谱离线可用。Agent 产生的内容和关系保留来源、状态和写入记录。

## 产品定位

定位是 `Note-first, agent-safe knowledge app`。

产品底座包括 Markdown 编辑、搜索、日期生成的 Journal、链接系统、标签、Object / Properties 和 Local Graph。链接系统包含 `[[link]]`、反向引用和未链接提及，后续只在讨论关系来源时展开。

外部工具和 agent 集成先围绕三类整理任务：

- 归档对话结论。
- 基于明确来源生成 Reference。
- 扫描遗漏关联和补链机会。

## 核心原则

- 笔记本体先成立：没有 agent 时，写作、搜索、链接、标签、对象属性和局部图谱完整可用。
- Agent 负责整理成本：归档、摘要、补链、代码解释这类维护动作交给外部 agent。
- Graph 关系保留 provenance、status 和 trust boundary：手动链接、属性链接、来源支持关系、agent 推断关系和用户确认关系需要可区分。
- 用户笔记只有两类：Journal 和普通 Note。`Book`、`Project`、`CodeModule` 等属于 Object 类型，是结构化增强层。
- 类型化是增量增强：内容先是普通 Note，只有在需要结构化管理时才设置 Type 和 Properties。
- 写入由用户触发：外部工具和 agent 可以通过 CLI 请求写入，但必须经过本地操作边界，并具备预览、撤销或来源记录。

## 存储与本地优先

笔记内容以本地 Markdown 文件作为 source of truth。

用户的核心知识资产是普通文件，可以被文件系统、编辑器、Git、备份工具和迁移流程直接处理。

数据库可以存在，但职责限于可重建的索引和缓存：

- 全文搜索索引。
- 链接、反链、未链接提及和 Graph 邻域。
- 可选的 embedding / semantic index。

删除数据库后，系统应该能从本地 Markdown 文件重新构建基础索引。

必须随 Markdown 可迁移的 metadata 包括：

- `kind`、`type`、`properties`、`tags`、`aliases`。
- `created`、`updated`、`createdFrom`、`sourceRefs`、provenance、review status、stale status。
- `Agent Command` 配置。
- operation records。

这些 metadata 可以存在于 Markdown frontmatter、sidecar files 或同目录配置文件中。索引数据库只保存可重建投影。

产品默认 offline first：

- 写作、编辑、阅读、搜索、链接、标签、属性和 Local Graph 离线可用。
- 依赖外部 agent 的整理任务可以进入不可用、待运行或降级状态。
- 同步和云能力属于增强层。

## 用户笔记层级

用户笔记只分为 `Journal` 和普通 `Note`。

`Journal` 是日期笔记，通过日期、日历或 Today 入口按需生成；同一天只有一篇 Journal。

Journal 和时间强关联：

- 用户进入某个日期时，系统生成或打开当天 Journal。
- 普通 Note 根据 `created` 日期自动关联到对应 Journal。
- 创建普通 Note 时默认使用用户本地时间。
- 导入、迁移或整理历史内容时，可以显式指定 `created`。
- 用户通过调整 `created` 日期把 Note 移动到另一天，系统维护对应 Journal 关联。

普通 `Note` 承担所有非日期笔记：思考总结、长期知识节点、项目记录、人物、书、代码模块等都先是普通 Note，再通过 Type / Properties 获得结构化能力。

## Agent 产物层级

Agent 产物按依据和处理状态分层。

长期保留的 agent 产物只有两类：`Reference` 和 `Proposal`。临时产物是 `Draft`。

| 层级 | 中文名 | 含义 | 默认边界 |
| --- | --- | --- | --- |
| `Draft` | 草稿 | agent task 的临时产物 | 不进入 Core Graph |
| `Reference` | 参考 | 基于明确来源整理出的可追溯笔记 | 可进入 Core Graph，但关系需要能追溯来源 |
| `Proposal` | 建议 | agent 基于对话、近期笔记或行为生成的候选判断 | 默认不进入 Core Graph，用户确认后再转化 |

`Reference` 的可信度来自 sources，不来自 agent。代码笔记、网页整理、论文摘要、会议纪要整理都属于这一层。它需要记录来源、快照、生成时间和 stale 状态。

`Proposal` 承载等待用户判断的候选结论。用户确认前保持 agent 产物身份；用户接受后可以转成普通 `Note`，或追加到已有 `Note`。转化后保留来源 metadata，知识 ownership 归用户。

`Draft`、`Reference` 和 `Proposal` 仍然以 Markdown 为主存储形态。`Reference` / `Proposal` 可以被搜索、链接和打标签，但只有 `Reference` 默认可进入 Core Graph；`Proposal` 进入 Core Graph 前需要用户确认。

## 架构决策

系统分成五层：

| 层级 | 职责 | 边界 |
| --- | --- | --- |
| File Source Layer | 本地 Markdown 文件、附件、文件命名、目录结构 | 笔记正文的 source of truth；数据库可删除重建 |
| Note Model Layer | `Journal`、`Note`、Object Type、Properties、`Draft`、`Reference`、`Proposal` | 定义内容身份、层级和 metadata |
| Relation & Index Layer | 链接、标签、属性关系、Journal 日期关系、搜索索引、Graph 索引 | 从文件和 metadata 推导；区分 Core Graph 和 Agent Overlay |
| Notes Operation Core | 搜索、读取、创建、追加、Reference / Proposal 写入、索引维护、分析任务 | 内部统一语义操作层；公开入口经 CLI 或未来 adapter |
| Experience Layer | 编辑器、Today、Calendar、Search、Graph、Object views、CLI task views | 负责用户交互，不拥有核心数据语义 |

前三层是产品地基。`Notes Operation Core` 是 UI、CLI 和未来协议适配器复用的内部语义操作层。CLI 是第一个公开本地入口；外部工具和 agent 通过 CLI 访问。

## 信息模型决策

所有 Object 都是 Note；Note 可以保持未类型化状态。

- 默认类型是 `Note`。
- `Book`、`Person`、`Project`、`CodeModule` 等类型是增强层。
- Properties 用于查询、排序、表格视图和 typed relations。
- Property link 可以进入 Graph，例如 `author: [[Ray Dalio]]` 形成 `Book --author--> Person`。

Object Type 包含 `schema + view + relation policy + agent command policy`：

- `schema`：字段、推荐字段、目标类型和基本校验。
- `view`：默认浏览和编辑方式。
- `relation policy`：哪些 property 生成 typed edge，以及这些 edge 是否进入 Core Graph。
- `agent command policy`：哪些 `Agent Command` 可以作用于这个类型，以及生成 `Reference` / `Proposal` 时如何落到这个类型。

Tag、Link、Property 的边界：

| 机制 | 适合承担的职责 | 示例 |
| --- | --- | --- |
| Tag | 宽泛分类、临时状态、快速过滤 | `#前端`、`#待整理` |
| Link | 具体对象、概念、主题或长期问题 | `[[React]]`、`[[状态一致性]]` |
| Property | 类型化对象的结构字段 | `author: [[Kent Beck]]` |

判断规则：能成为独立笔记的用 Link；只是分类或状态的用 Tag；需要查询、排序和视图的用 Property。

## Graph 决策

Graph Hygiene 定义关系进入 Graph 的来源、状态和确认规则。

Graph 的主干来自人工可解释的关系：

- 手动链接。
- 属性链接。
- 可选的 tag membership。

Reference 内部也要区分关系来源：

- source 直接支持的关系可以进入 Core Graph。
- agent 摘要出的关系需要带 source record。
- agent 推断出的语义关系默认进入 `Agent Overlay`。
- 用户确认后的关系才进入 Core Graph。

Agent 推断关系默认进入 `Agent Overlay`，不直接混入 `Core Graph`。

优先做 `Local Graph`，也就是当前笔记的一跳和两跳邻域。全库大图、复杂布局和高级语义图谱属于后续增强。

## Notes Operation Core / CLI 决策

`Notes Operation Core` 是内部模块；CLI 是第一个公开本地入口；未来协议通过 adapter 接入。UI、CLI、未来协议适配器和测试工具共享同一套语义操作层。

CLI 的操作模型可以参考 Bear CLI 的本地能力暴露方式。值得借鉴的是边界和习惯，具体命令命名后续在 CLI spec 中确定。

会影响架构的 CLI 决策：

- 写入路径统一：创建、追加、Reference / Proposal 转化、链接应用等写入都应经过 `Notes Operation Core`。
- 系统不变量集中：Journal 生成、当天 Note 与 Journal 的强制关联、Reference provenance、Proposal 进入 Core Graph 前的确认，都应在本地操作层 enforce。
- 文件布局封装：外部调用方不需要直接理解 Markdown 文件路径、frontmatter、索引缓存和 Graph 派生规则。
- 结构化读接口：面向 agent 和脚本的读取、搜索、展示接口应支持稳定 JSON 输出、字段选择、limit 和 count，避免调用方为了少量信息读取整库内容。
- 稳定写接口：mutating commands 应使用明确 note id、stdin 承载长文本，并通过 exit code / 目标读取验证结果。
- 并发写保护：写入应基于当前文件 hash、base revision 或等价版本检查，避免 UI、CLI 或未来协议适配器互相覆盖。
- 操作可追溯：会改变文件、metadata 或 Graph 的操作需要形成 operation record，支撑撤销、审计和任务回放。
- 统一操作预览：agent 或外部工具造成的写入应能在 UI 中呈现将读取什么、写入什么、影响哪些 Graph 关系、是否可撤销。

CLI 是 `Notes Operation Core` 的公开外壳。具体命令形态、参数、输出格式和错误模型进入 CLI spec。

未来如果增加 Agent Client Protocol 集成，应新增 ACP adapter，并复用同一个 `Notes Operation Core`。

## CLI 任务决策

软件第一版通过 CLI 暴露本地读写和分析能力，不内置 agent runtime。外部工具和 agent 通过 CLI 调用 `Notes Operation Core`。

CLI 任务是用户或外部工具发起的一次本地操作意图。

底层提供稳定能力，常用任务由用户在笔记系统里管理为 `Agent Command`。

`Agent Command` 是用户定义的可复用 command，描述任务目的、默认 scope、可用能力、输出类型和写入策略。UI 和 CLI 都可以调用。

`Agent Command` 是特殊配置，可以用 Markdown 存储。内容应是声明式配置：任务目的、默认 scope、allowed capabilities、输出类型、写入策略和结果落点。Operation Core 负责 enforce capability 和 write policy。

例如：

- 归档当前对话为 `Proposal`。
- 从指定 source 生成 `Reference`。
- 扫描最近 7 天的链接建议。

`Notes Operation Core` 向 UI 和 CLI 暴露受控能力。外部调用方通过 CLI 请求能力；读取、写入、应用 patch 和进入 Core Graph 的判断由 Operation Core 执行。

核心能力按 Bear CLI 的成熟操作面来分组：

- Read and search：列出、搜索、展示 metadata、读取正文、在单篇笔记内搜索。
- Create and edit：创建普通 Note、追加内容、精确替换、整篇覆盖、从 `Draft` 转化为可保留产物。
- Organize：管理 tags、Object type、Properties、归档状态和软删除状态。
- Relations：读取 backlinks、检查未链接提及、生成链接建议、应用安全链接。
- Journal：按日期打开或生成 Journal，并维护当天 Note 与 Journal 的强制关联。
- Reference and Proposal：创建、读取、接受、丢弃 `Reference` / `Proposal`，维护 provenance、stale 状态和 review 状态。
- Analyze and maintain：重建索引、扫描一致性问题、执行诊断、输出可复用的分析结果。

每次任务都应声明 scope，例如当前笔记、当天 Journal、当前笔记加邻近关系、最近 7 天笔记、某个 tag / Object type 或当前代码目录。

输出方式分三类：

| 输出方式 | 用途 |
| --- | --- |
| `Draft` | 临时 agent 输出 |
| `Reference` / `Proposal` | 可保留的 agent 产物 |
| Append / Patch / Suggestion | 对已有 Note 的受控修改或建议 |

## 外部写入边界

外部工具和 agent 写入遵守几条固定边界：

- 用户明确触发。
- 写入必须经过 `Notes Operation Core`。
- 写入前有预览，或写入后可撤销。
- 写入结果保留来源记录和 operation log。
- 精确标题和别名匹配可以批量应用。
- 语义推断关系默认保持为建议。

这些边界适用于归档结论、追加摘要、生成 Reference 和应用安全链接。

## 非目标

第一版范围外：

- 完整 AI agent 系统。
- 以 AI chat 为中心的产品形态。
- 软件内置 agent runtime 或直接调用模型 API 执行 agent workflow。
- 第一版内置 Agent Client Protocol 集成。
- 外部 agent 直接读写 Markdown 作为官方集成路径。
- Tana-like Outliner 作为主交互模型。
- 强制所有笔记进入类型系统。
- 将 agent 语义推断直接写进 Core Graph。
- 复杂 review queue 作为核心流程。
