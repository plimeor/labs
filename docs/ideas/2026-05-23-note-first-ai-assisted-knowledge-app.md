# 想法：Note-first AI-assisted knowledge app

创建日期：2026-05-23
状态：早期产品方向

这份 idea 的核心判断：先做一款本地优先的笔记软件，再把 AI 放在整理和维护环节。基础能力必须离线可用；AI 的价值是减少归档、补链和代码知识沉淀的成本。

## 产品定位

定位是 `Note-first, AI-assisted knowledge app`。

产品底座包括 Markdown 编辑、搜索、链接系统、标签、Object / Properties 和 Local Graph。这里的链接系统包含 `[[link]]`、反向引用和未链接提及，后续只在讨论关系来源时展开。

AI 层围绕三个高杠杆动作：

- 归档对话结论。
- 整理代码为技术笔记。
- 扫描遗漏关联和补链机会。

## 核心原则

- 笔记本体先成立：没有 AI 时，写作、搜索、链接、标签、对象属性和局部图谱仍然完整可用。
- AI 只处理整理成本：归档、摘要、补链、代码解释这类维护动作适合交给 AI。
- 关联保持可解释：手动链接和属性链接构成主图谱，AI 推断关系默认是建议或 overlay。
- 类型化是增量增强：内容先是普通 Note，只有在需要结构化管理时才设置 Type 和 Properties。
- 写入由用户触发：AI 可以写入，但写入动作需要预览、撤销或来源记录。

## 存储与本地优先

笔记内容以本地 Markdown 文件作为 source of truth。

用户的核心知识资产应该是普通文件，可以被文件系统、编辑器、Git、备份工具和迁移流程直接处理。

数据库可以存在，但职责限于可重建的索引和缓存：

- 全文搜索索引。
- 链接、反链、未链接提及和 Graph 邻域。
- AI jobs 和可复用的扫描结果。
- 可选的 embedding / semantic index。

删除数据库后，系统应该能从本地 Markdown 文件重新构建基础索引。

产品默认 offline first：

- 写作、编辑、阅读、搜索、链接、标签、属性和 Local Graph 离线可用。
- 依赖网络或远程模型的 AI Actions 可以进入不可用、待运行或本地模型降级状态。
- 同步和云能力属于增强层，不是笔记系统成立的前提。

## 架构决策

系统分成四层：

| 层级 | 职责 | 边界 |
| --- | --- | --- |
| Basic Note Layer | 写作、编辑、搜索、Daily Note、文件管理 | 核心可用性 |
| Relation Layer | 链接、标签、反向引用、Graph 基础边 | 可解释关联 |
| Object & Property Layer | Type、Properties、结构化视图、查询 | 增量结构化 |
| AI Enhancement Layer | 归档、代码整理、关联扫描、摘要生成 | 辅助维护 |

前三层是产品地基，第四层是增强能力。

## 信息模型决策

所有 Object 都是 Note，但不是所有 Note 都需要被显式类型化。

- 默认类型是 `Note`。
- `Book`、`Person`、`Project`、`CodeModule` 等类型是增强层。
- Properties 用于查询、排序、表格视图和 typed relations。
- Property link 可以进入 Graph，例如 `author: [[Ray Dalio]]` 形成 `Book --author--> Person`。

Tag、Link、Property 的边界：

| 机制 | 适合承担的职责 | 示例 |
| --- | --- | --- |
| Tag | 宽泛分类、临时状态、快速过滤 | `#前端`、`#待整理` |
| Link | 具体对象、概念、主题或长期问题 | `[[React]]`、`[[状态一致性]]` |
| Property | 类型化对象的结构字段 | `author: [[Kent Beck]]` |

判断规则：能成为独立笔记的用 Link；只是分类或状态的用 Tag；需要查询、排序和视图的用 Property。

## Graph 决策

Graph 的主干来自人工可解释的关系：

- 手动链接。
- 属性链接。
- 可选的 tag membership。

AI 推断关系默认进入 `AI Overlay`，不直接混入 `Core Graph`。

优先做 `Local Graph`，也就是当前笔记的一跳和两跳邻域。全库大图、复杂布局和高级语义图谱属于后续增强。

## AI Actions 决策

AI Actions 是明确动作，不是常驻聊天入口。每个动作都需要清楚说明输入范围和输出方式。

优先动作：

- `Archive Conclusion`：把当前 AI 对话或讨论结论归档成新笔记，或追加到现有笔记。
- `Connection Scan`：扫描显式提及、别名匹配和语义关联，产出可批量处理的 digest。
- `Generate Code Note`：读取 repo / 文件 / 目录，生成 `CodeModule` 技术笔记。

每次 AI 调用都应展示 scope，例如当前笔记、当前笔记加邻近关系、最近 7 天笔记、某个 tag / Object type、当前代码目录或当前 AI 对话。

输出方式分三类：

| 输出方式 | 用途 |
| --- | --- |
| New Note / New Object | 结论归档、代码整理 |
| Append / Patch | 摘要、提纲、局部重写 |
| Suggestion | 关联扫描、语义补链 |

## AI 写入边界

AI 写入遵守几条固定边界：

- 用户明确触发。
- 写入前有预览，或写入后可撤销。
- 写入结果保留来源记录。
- 精确标题和别名匹配可以批量应用。
- 语义推断关系默认保持为建议。

这组边界支持归档结论、追加摘要、生成代码笔记和应用安全链接，同时保护正文和 Core Graph 不被静默改写。

## 非目标

第一版范围外：

- 完整 AI agent 系统。
- 以 AI chat 为中心的产品形态。
- 强制所有笔记进入类型系统。
- 将 AI 语义推断直接写进 Core Graph。
- 复杂 review queue 作为核心流程。
