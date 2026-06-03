# 计划：Anchor V1 Note Model and Editor

创建日期：2026-05-24

## 澄清状态

本计划按当前 V1 边界和用户补充执行：编辑器体感目标参考 Bear 的单 surface 写作，而不是分屏 preview、source mode、纯源码 textarea 或传统 rich-text WYSIWYG。

保守假设：

- Tiptap 仍是 V1 首选编辑器基础，但必须先做单 surface 写作、auto-save 与 Markdown round-trip 可行性验证。
- 如果 Tiptap 无法在不破坏 Markdown source-of-truth 的前提下支持关键交互，实施阶段在替换 editor engine 前暂停确认。
- V1 只承诺一组明确 Markdown 能力矩阵；矩阵之外的语法保留原文并阻断 auto-save，不能通过 source mode 作为默认兜底。

## 背景 / 问题

Anchor 的核心资产是本地 Markdown 文件。编辑器必须让用户感觉自己在写笔记，而不是在源码模式和预览模式之间切换：常用 Markdown 结构在同一 surface 内直接呈现，写入仍回到 Markdown。

这个模块在 `Notes Operation Core` 上实现，不直接读写文件。Tiptap / ProseMirror document state 只属于当前编辑会话，不是持久化 source。

## 目标

建立 Anchor V1 的用户笔记模型和 Bear-like Markdown 编辑体验：用户只需要理解 `Journal` 和普通 `Note`，可以用一个主编辑 surface 创建、阅读、编辑并 auto-save Markdown，并通过 metadata panel 增强 Object Type 和 Properties。

## 范围

包含：

- `Journal` 和普通 `Note` 的用户模型。
- title editing。
- Bear-like Markdown editor。
- Markdown import / export adapter。
- unsupported Markdown auto-save gate。
- frontmatter metadata panel。
- tags、aliases、Object Type 和 Properties editing。
- `/objects` 的最小浏览：按 Object Type、Property 和 related notes 查看普通 Note。
- backlinks / links inspector 的占位接入。
- auto-save status 和 dirty state。
- conflict reload / retry surface。

不包含：

- Block-based outliner 作为主编辑模型。
- Rich-text WYSIWYG 作为主编辑器。
- Tiptap JSON 或 ProseMirror JSON 持久化。
- 实时多人协作。
- 自定义 property view builder。
- 复杂 template engine。
- Obsidian plugin syntax 的完整兼容。
- block id、block reference、embed transclusion 的 V1 承诺。

## 必要上下文

实施前先读这些上下文，不从空白产品假设开始：

- `docs/plans/2026-05-24-anchor-v1.md`
- `docs/plans/2026-05-24-anchor-v1-vault-and-index.md`
- `docs/plans/2026-05-24-anchor-v1-operation-core.md`
- `docs/plans/2026-05-24-anchor-v1-relations-search-graph.md`
- `docs/ideas/2026-05-23-note-first-agent-safe-knowledge-app.md`
- Tiptap Markdown 相关 extension、serializer 和 parser 的实际能力。
- 当前 app route、Tauri command wrapper、Query mutation pattern 和可用测试工具。

## 计划迭代

本轮是 local plan refinement，未委派子代理。主要设计风险在 editor engine：Tiptap 天然偏 ProseMirror document model，Anchor 的产品边界要求 Markdown source-of-truth、Bear-like 单 surface 和可靠 auto-save。

计划已把该风险前置为第一个实现 checkpoint。只有当 spike 证明 Tiptap 能满足单 surface 写作 + auto-save + round-trip 矩阵时，后续 slice 才继续沿 Tiptap adapter 实施；否则暂停，在 Tiptap adapter、CodeMirror-first Markdown editor、或混合方案之间做一次明确设计选择。

## 用户模型

用户可见的笔记本体只有两类：

- `Journal`：按日期生成的日记笔记。
- `Note`：所有非日期笔记，包括项目、人物、书、代码模块、长期知识节点和普通想法。

Object Type 不是新的笔记层级，而是普通 Note 的增强：

- `Project`
- `Person`
- `Book`
- `CodeModule`
- 后续用户自定义类型

没有 Object Type 的普通 Note 仍然能被编辑、搜索、链接、打标签和进入 Local Graph。

## 存储模型

Markdown frontmatter 保存可迁移 metadata：

```yaml
id: note_...
kind: note
type: Project
created: 2026-05-24T10:00:00+08:00
updated: 2026-05-24T10:20:00+08:00
aliases:
  - Anchor
tags:
  - product
properties:
  status: active
  repository: "[[labs]]"
```

`kind` 描述存储身份；`type` 描述 Object Type。没有 `type` 的普通 Note 仍然是完整可用的 Note。

Agent 产物使用 `reference` 和 `proposal` 作为存储身份，但不改变用户笔记只有 `Journal` 和 `Note` 的主模型。

## 编辑器设计边界

`MarkdownEditor` 是 UI adapter，不属于 note model。它隐藏 Tiptap lifecycle、extension 配置、parser、serializer、selection state 和 unsupported syntax diagnostics。

输入：

- note id。
- title。
- body Markdown。
- projected metadata。
- base revision。
- relation hints。

输出：

- body Markdown。
- metadata patch。
- base revision。
- round-trip status。
- unsupported syntax diagnostics。
- dirty state。

Adapter 不输出 Tiptap JSON 给 Operation Core。Operation Core 只接收 Markdown body、metadata patch 和 base revision。

## Editor 行为

V1 默认只有一个主编辑 surface：

- 不使用默认分屏 preview。
- 不提供 source mode 作为主流程或 fallback。
- 段落、heading、list、quote、code fence、table、Markdown link 和 checkbox 渲染成接近阅读状态。
- Markdown shortcuts 在输入时生效：`#`、`-`、`1.`、`>`、`` ``` ``、`- [ ]`、`[[`、`#tag`、`[text](url)`、inline code、bold、italic。
- `[[link]]`、`[[link|alias]]` 和 `#tag` 至少保持可输入、可保存、可索引；Bear-like chip / token decoration 是后续增强，不改变 Markdown source-of-truth。
- checkbox 可点击切换，auto-save 后回写 `- [ ]` 或 `- [x]`。
- note link 默认用 keyboard / command 打开，普通点击优先保持编辑光标；具体快捷键在 UI 实现中固定。
- 正文变更经过 debounce auto-save，状态至少区分 `Saved`、`Autosaving`、`Saving`、`Conflict`、`Needs review` 和 `Save failed`。

## Markdown 能力矩阵

V1 必须支持 single-surface 编辑、auto-save 和 round-trip：

| 能力 | V1 行为 | 验收证据 |
| --- | --- | --- |
| Frontmatter | 默认由 metadata panel 编辑，不在正文 source mode 中展示 | 修改 metadata 后只改变对应 YAML 字段 |
| Paragraph / heading | 同一 surface 中渲染和编辑 | auto-save 后 heading level 保持 |
| Bold / italic / inline code | 同一 surface 中渲染和编辑 | Round-trip 无未批准 diff |
| Ordered / unordered list | 支持缩进、继续列表和退出列表 | 重开后层级和顺序保持 |
| Checkbox | 支持输入 `- [ ]` 和点击 toggle | auto-save 后文件中保存为 Markdown checkbox |
| Blockquote | 支持 `>` 输入和渲染 | 多行 quote 不被扁平化 |
| Code fence | 支持 language、原文保留和非活动渲染 | fence 内容不被 link / tag parser 误改 |
| Table | V1 至少保留 Markdown table，并提供可编辑状态 | 不丢列；允许表格对齐空格规范化 |
| Markdown link | 支持 `[text](url)` 编辑、渲染和打开 | link text 和 target 保持 |
| Wikilink | 支持 `[[target]]`、`[[target|alias]]`、unresolved link | Relation parser 能拿到 source span |
| Tag | 支持正文 `#tag` 输入、渲染和搜索索引 | code fence 内的 `#tag` 不进入 tag index |
| Image | 保留 `![alt](path)`；可预览时预览 | 不做附件管理时仍保留原文 |

V1 只做 preserve / auto-save gate：

- HTML block。
- Footnote。
- Math。
- Callout。
- Obsidian block id。
- Embed transclusion。
- Plugin-specific Markdown。
- MDX-like directive。

这些语法不得被静默删除、重排或改写。Editor 显示 unsupported diagnostic，正文 auto-save 不提交可能造成损失的序列化结果。

## Journal 行为

- 用户进入 `/today` 时，Operation Core 打开或生成当天 Journal。
- 同一天只能有一篇 Journal。
- Journal 路径由用户本地日期决定。
- 创建普通 Note 时，默认关联到创建日期对应 Journal。
- 导入或迁移历史内容时，可以显式设置 `created`。
- 用户修改 `created` 时，系统更新 Journal 关联索引。

## Metadata 行为

Metadata panel 编辑 frontmatter projection：

- title。
- aliases。
- tags。
- Object Type。
- Properties。
- created / updated 只在明确编辑或写入成功时变化。

metadata mutation 由 Operation Core 统一序列化。Editor adapter 不能自己拼写 frontmatter 文件。

## Object Type 行为

V1 内置基础类型：

- `Project`
- `Person`
- `Book`
- `CodeModule`

每个 Object Type 包含：

- display name。
- recommended properties。
- property value type。
- relation policy。

V1 先支持轻量 schema，不提供完整类型设计器。用户可以在 metadata panel 中设置 `type` 和 properties。

## Properties 行为

V1 property value 支持：

- plain text。
- select-like text value。
- date text。
- note link value，例如 `[[Ray Dalio]]`。

Property link 可以进入关系索引，例如：

```yaml
properties:
  author: "[[Kent Beck]]"
```

是否进入 Core Graph 由 relation policy 决定。

## 工作序列

1. 建立 Markdown fixture matrix 和 baseline notes。
   - 触点：fixtures、parser/serializer spike、manual smoke notes。
   - 前向证据：每类语法都有输入样例、期望 auto-save 结果和 unsupported gate 期望。
   - 回归证据：现有 Markdown 文件不会因打开而写入。
2. 做 Tiptap Bear-like editor feasibility checkpoint。
   - 触点：Tiptap extension、parser、serializer、selection decoration、auto-save gate。
   - 前向证据：同一 surface 能完成 heading、list、checkbox、code fence、table、`[[link]]`、`#tag` 的输入和保存。
   - 回归证据：fixture round-trip 无未批准 diff；unsupported fixture 进入 auto-save 阻断。
3. 定义 note DTO、metadata DTO、editor input / output 和 unsupported diagnostic。
   - 触点：frontend types、Tauri DTO、Operation Core command DTO。
   - 前向证据：adapter 输出 Markdown body、metadata patch、base revision 和 diagnostics。
   - 回归证据：Operation Core 不接收 Tiptap JSON。
4. 实现 `/today` 入口和 Journal auto-create。
   - 触点：route、query、mutation、Operation Core command。
   - 前向证据：首次进入创建当天 Journal，重复进入打开同一篇。
   - 回归证据：普通 Note 创建仍按本地时间关联 Journal。
5. 实现 note list 到 note editor 的打开流程。
   - 触点：note route、query key、loading state、empty state、right inspector shell。
   - 前向证据：打开 Note 后加载 title、body、metadata 和 base revision。
   - 回归证据：切换 note 不丢 dirty state。
6. 实现 Bear-like editor surface。
   - 触点：`MarkdownEditor` adapter、toolbar/commands、keyboard shortcuts、decorations。
   - 前向证据：single-surface 行为矩阵通过 manual smoke。
   - 回归证据：保存后重新打开仍从 Markdown 恢复，不从 Tiptap state 恢复。
7. 实现 auto-save 和 unsupported gate。
   - 触点：debounced body mutation、diagnostic banner、base revision、save status。
   - 前向证据：正文编辑不需要 Save 按钮，成功后 Markdown 文件更新。
   - 回归证据：unsupported fixture 不被 editor 自动改写。
8. 实现 title、aliases、tags 的 metadata editing。
   - 触点：metadata panel、Operation Core metadata update。
   - 前向证据：metadata panel 修改后 frontmatter 更新。
   - 回归证据：正文 Markdown 不因 metadata-only edit 发生未批准 diff。
9. 实现 Object Type selector 和 Properties editing。
   - 触点：metadata panel、property value editors、relation policy hint。
   - 前向证据：property link 保存为 `[[note]]` 字符串并进入 relation projection。
   - 回归证据：未设置 Object Type 的 Note 仍能正常编辑和搜索。
10. 接入 `/objects` 的最小浏览。
    - 触点：objects route、type list、property list、related notes query。
    - 前向证据：能浏览 `Project` / `Person` / `Book` / `CodeModule` 和对应 notes。
    - 回归证据：Object route 只消费 projection，不要求所有 Note 强制设置 `type`。
11. 接入 dirty state 和 conflict error display。
    - 触点：dirty state、base revision、conflict reload surface。
    - 前向证据：过期 base revision auto-save 返回 conflict UI。
    - 回归证据：conflict 不覆盖磁盘文件，不刷新为成功状态。
12. 接入 right inspector 的 links / backlinks / object 占位数据。
    - 触点：inspector query、relation placeholder、object metadata summary。
    - 前向证据：当前 note 能显示 links/backlinks/object 摘要。
    - 回归证据：inspector 只读查询不触发 body save。

## 接受、回归证据和验证

接受结果：

- 用户能打开当天 Journal，重复打开不会创建第二篇。
- 用户能创建普通 Note，并在重启后恢复内容和 metadata。
- 默认编辑体验是 Bear-like 单 surface，不是分屏 preview 或 source mode。
- 正文编辑 auto-save，无显式正文 Save 按钮；保存状态可见。
- 用户能输入和编辑 heading、list、checkbox、blockquote、code fence、table、Markdown link、`[[link]]` 和 `#tag`。
- Tiptap 无法无损处理的 Markdown 必须阻止静默 auto-save。
- Round-trip smoke 覆盖 frontmatter、`[[link]]`、tag、property link、table、code fence 和 unsupported Markdown。
- 用户能编辑 frontmatter projection。
- 用户能给普通 Note 设置 Object Type 和 Properties。
- 用户能在 `/objects` 浏览 Object Type、Properties 和 related notes。
- 没有 Object Type 的普通 Note 仍能被编辑、搜索和链接。
- 保存冲突不会静默覆盖用户文件。

回归证据：

- Markdown 文件是唯一正文持久化 source；Tiptap JSON 不出现在 vault。
- 打开 note 不产生磁盘写入。
- metadata-only edit 不改写正文。
- body-only edit 不丢 frontmatter。
- unsupported Markdown 不被 auto-save normalize。
- Operation Core conflict 行为保持：过期 base revision 不覆盖文件。

实现阶段验证：

- `bun run check`
- `bun run lint`
- Markdown fixture round-trip：支持语法无未批准 diff；unsupported fixture 进入 auto-save guard。
- Tauri dev smoke：创建 vault、进入 `/today`、创建 Note、single-surface 编辑、auto-save、重启、重新打开。
- Manual editor smoke：在同一 editor surface 验证 Markdown shortcut、渲染、auto-save 状态、dirty state 和 conflict surface。

测试缺口决策：

- 如果项目还没有覆盖 editor 体感的 E2E 测试，推荐为 single-surface auto-save 和 reopen 增加最小 E2E；如果只授权低成本验证，则以 fixture round-trip + Tauri manual smoke 作为 V1 暂时证据，并在风险里记录覆盖缺口。

## 风险与规避

- Tiptap 的内部文档模型可能偏离 Markdown source-of-truth。规避：先做 feasibility checkpoint，通过 `MarkdownEditor` adapter 固定 import / export 边界，持久化只写 Markdown。
- Markdown round-trip 不完整会造成内容丢失。规避：以 fixture matrix 做 gate，遇到不支持结构时阻断 auto-save。
- 单 surface 容易滑向不可迁移 rich text。规避：Tiptap state 只存在于 session，持久化只写 Markdown。
- metadata UI 和 frontmatter 解析不一致会造成数据丢失。规避：metadata mutation 由 Operation Core 统一序列化。
- 把 Object Type 做成强制层级会偏离 note-first。规避：`type` 始终可空，所有内容先是普通 Note。

## 检查点

- Tiptap feasibility checkpoint 通过前，不实现完整 metadata 和 object UI。
- Markdown fixture matrix 通过前，不开放默认 auto-save 路径。
- Operation Core metadata update 可用前，metadata panel 只读或禁用保存。
- Conflict surface 可用前，不把 editor auto-save 标记为可靠完成。

## 暂停条件

遇到以下情况暂停确认：

- Tiptap 无法满足 single-surface auto-save 与 round-trip gate，需要改用 CodeMirror-first 或混合 editor。
- 需要支持 block-level identity、block reference 或 embed transclusion。
- 需要把 Tiptap JSON 作为持久化 source。
- 需要自动改写无法无损 round-trip 的 Markdown。
- 需要把 Object Type schema 做成公开可迁移 contract。
- 需要新增广泛 E2E 或测试基础设施才能证明 editor 体感。

## 停止条件

本模块完成时应停在这个状态：

- Journal 和普通 Note 的用户模型可用。
- Bear-like single-surface editor、auto-save、Markdown 持久化和 metadata 编辑可用。
- 支持语法通过 round-trip evidence；不支持语法不会被静默改写。
- Object Type 和 Properties 作为普通 Note 的增强可用。
- 编辑写入全部通过 Operation Core。
