# 计划：Anchor V1 Relations, Search, Graph

创建日期：2026-05-24

## 目标

建立 Anchor V1 的关系索引、搜索和 Local Graph。V1 只做当前笔记的一跳和两跳邻域，不做全库复杂大图。

关系系统需要区分来源、状态和 trust boundary，避免把 agent 推断关系直接混进 Core Graph。

## 范围

包含：

- `[[link]]` 解析。
- `[[link|alias]]` 和 heading fragment 的保留。
- aliases 匹配。
- backlinks。
- unresolved links。
- unlinked mentions。
- tags index。
- property links。
- vault Markdown body search。
- metadata search。
- Local Graph query。
- Core Graph / Agents Graph edge 区分。
- relation source span 和 provenance 展示。

不包含：

- 全库大图布局。
- embedding similarity graph。
- 自动语义聚类。
- agent 推断关系自动进入 Core Graph。
- 复杂 graph editor。

## Relation sources

V1 关系来源：

- `manual_link`：用户在 Markdown 正文中写的 `[[link]]`。
- `property_link`：frontmatter property 中的 note link。
- `tag_membership`：tag 到 note 的 membership。
- `source_supported`：Reference 中被明确 source 支持的关系。
- `agent_inferred`：agent 推断出的候选关系。
- `user_confirmed`：用户确认后的 agent 关系。

默认进入 Core Graph：

- `manual_link`
- `property_link`
- `source_supported`
- `user_confirmed`

默认留在 Agents Graph：

- `agent_inferred`

`tag_membership` 可以作为筛选和可选 graph layer，不强制进入默认 Local Graph。

## SQLite projection

Relations 模块扩展 SQLite projection：

- `links`：from note、raw target、resolved target、source span、status。
- `tags`：tag、note id。
- `property_links`：note id、property key、target note id、status。
- `mentions`：source note、candidate target、match span。
- `graph_edges`：from、to、edge type、source、status、graph layer。

这些表都可以从 Markdown、metadata 和 operation records 重建。

## Link resolution

V1 resolution 规则：

1. 精确匹配 note title。
2. 精确匹配 alias。
3. `[[target|alias]]` 使用 target 解析，alias 作为显示文本保留。
4. `[[target#heading]]` V1 解析 note target，heading fragment 先保留为 unresolved fragment。
5. 同名冲突时标记 ambiguous。
6. 无匹配时标记 unresolved。

V1 不做 fuzzy title 自动写入。Unlinked mentions 可以提示用户，但不能自动改正文。

## Markdown extraction rules

Relations 模块消费 vault/index 提供的 Markdown source span，不直接改写文件：

- 正文 wikilink：`[[target]]`、`[[target|alias]]`、`[[target#heading]]` 进入 link projection。
- Markdown link：`[text](url)` 作为外部链接或文件链接显示，不默认进入 Core Graph note edge。
- Frontmatter tags、正文 `#tag` 和 property link 分开投影，避免把 tag、link、property 混成同一种关系。
- code fence、inline code、HTML block 和 escaped text 中的 `[[link]]` / `#tag` 不进入默认 relation index。
- unlinked mention 只在普通正文文本中匹配，不在已有 link、heading marker、code、frontmatter 或 URL 中匹配。
- 每条 relation 保存 source note、source span、raw text、normalized target、resolution status 和 relation source。

## Search

V1 搜索包含：

- title search。
- body search over vault Markdown files。
- alias search。
- tag filter。
- type filter。
- property key/value filter。

正文搜索直接读取 vault 内 Markdown 文件，不建立 SQLite 正文索引。SQLite 只用于 metadata filters、note path lookup 和关系投影；当 query 同时包含正文关键词和 metadata filter 时，先用 SQLite 缩小候选集，再扫描候选 Markdown 文件。

`search_notes` 必须是有界读接口：

- 必须声明 scope，例如当前 note 邻域、日期范围、tag、Object Type、当前文件夹或全库。
- 必须支持 `limit` 和 `count`。
- 必须支持字段选择，避免 agent 为少量结果读取整篇正文。
- 必须能取消或后台运行，不能阻塞 UI 主线程。
- Agent 默认不能发起无界全库正文扫描；全库扫描需要用户明确 scope 或命令授权。

搜索结果返回：

- note id。
- title。
- path hint。
- kind。
- type。
- snippet。
- matched fields。

长结果列表使用 TanStack Solid Virtual 渲染。

## Local Graph

V1 Local Graph 以当前 note 为中心：

- 默认一跳。
- 用户可切换两跳。
- 支持按 edge source / graph layer 过滤。
- 支持打开 node 对应 note。
- 支持查看 edge provenance。

Graph UI 可以先用简单可读布局，不以复杂力导向布局作为 V1 成功条件。

## 工作序列

1. 实现 Markdown body link parser。
2. 实现 source span filtering，排除 code fence、inline code、HTML block、URL 和 escaped text。
3. 实现 frontmatter tag、正文 tag 和 property link extraction。
4. 实现 title / alias / fragment resolution。
5. 实现 backlinks query。
6. 实现 unresolved links query。
7. 实现 unlinked mentions query。
8. 实现有 scope、limit、count、field selection 和 cancellation 的 disk-backed body search。
9. 实现 graph edge projection 和 Local Graph query。
10. 接入 note inspector、search route 和 graph route。
11. 接入 proposed change 的 graph impact summary。

## 接受标准

- `[[Anchor]]` 能解析为 resolved link 或 unresolved link。
- `[[Anchor|display]]` 保留 display text，并按 target 解析。
- code fence 和 inline code 内的 `[[Anchor]]` 或 `#tag` 不进入默认 links/tags index。
- alias 能被 link resolution 使用。
- 当前 note 能显示 backlinks。
- 当前 note 能显示 unresolved links。
- unlinked mentions 只作为建议展示，不自动修改正文。
- property link 能生成 typed edge。
- Search 能按正文、title、tag、type 和 property 过滤。
- Search API 支持 scope、limit、count、field selection 和 cancellation。
- 搜索 snippet 来自 Markdown 文件正文；metadata filter 只缩小候选集，不替代正文扫描。
- Local Graph 能显示当前 note 的一跳或两跳邻域。
- Agent inferred edge 默认不进入 Core Graph。

## 验证方式

实现阶段验证：

- `bun run check`
- `bun run lint`
- Relation fixture：`[[link]]`、`[[link|alias]]`、`[[link#heading]]`、正文 `#tag`、frontmatter tag、property link、code fence、inline code 和 ambiguous title。
- Search smoke：scope + limit + field selection + cancellation 可用；正文命中返回 snippet，不返回未请求的整篇 body。
- Graph smoke：当前 note 一跳 / 两跳 Local Graph 能按 edge source 和 graph layer 过滤。

## 风险与规避

- 自动链接过激会污染用户笔记。规避：unlinked mention 默认只展示建议，写入必须走 proposed change。
- Graph source 混淆会降低信任。规避：每条 edge 存 source、status 和 graph layer。
- Markdown parser 误把代码块里的文本当关系会制造噪音。规避：source span filtering 是 parser acceptance 的一部分。
- 大图布局容易吞掉 V1 时间。规避：只做 Local Graph，复杂布局后置。

## 暂停条件

遇到以下情况暂停确认：

- 需要 fuzzy matching 自动改写 Markdown。
- 需要默认展示全库 graph。
- 需要 agent 默认执行无界全库正文扫描。
- 需要把 agent inferred edge 自动合并进 Core Graph。

## 停止条件

本模块完成时应停在这个状态：

- 链接、反链、未链接提及、搜索和 Local Graph 可用。
- Graph edge 的来源和状态可追溯。
- 所有关系写入仍然通过 Operation Core。
