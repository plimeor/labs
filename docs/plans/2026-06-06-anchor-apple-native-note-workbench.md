# Anchor 方案：Apple 原生优先的 Note 知识工作台

日期：2026-06-06
状态：新项目方案（Apple 原生客户端优先；核心平台无关；实现待单独授权）

> 规划记录（历史记录，非当前接口契约）。实现后，权威且稳定的 CLI / API / schema / file format 契约归 `anchor-core` 包 README。
>
> 本方案把 Anchor 定义为新项目：产品对象、交互行为、平台路线、编辑器、存储真理层、同步边界和 CLI 契约一起设计。首期产品形态、UI 行为、数据契约和实现都以本方案为准。
>
> **CP-0 已批准（2026-06-07）。** 阶段0 平台 / 产品 / 契约基线、关键技术决策（D01–D38）、fixture set（F01–F43）与 Stage 1 验证计划经用户逐条批准。最终批准稿见 `docs/workbench/anchor/2026-06-06-phase-0/cp-0-approval.md`，CP-0 索引与冻结结论见同目录 `cp-0-final.md`，下一轮执行入口见同目录 `stage-1-entry-brief.md`。完整 decision table、fixture 矩阵、Apple 验证证据与命令清单归该 workbench packet，不回灌本方案；本方案保持产品 / 架构方向摘要。CP-0 冻结结论与两项 Stage-1-gated 待定项（Apple binding 机制冻结、iCloud Drive 作首期默认 transport 的规模门）见 §11 阶段0 / CP-0。

---

## 1. 背景与问题

Anchor 的核心对象不是文件，也不是 Markdown 文本，而是可引用、可移动、可嵌套、可投影、可合并的结构化 Note 与正文块树。

决定性约束是容器嵌套与结构化语义：代码块、表格、callout、embed、diff、schema 字段和引用关系都需要作为一阶结构存在。列表缩进与代码缩进不能共享 Markdown 行首空格这一条通道；行内引用也不能被压回文本 token 后再由多个层各自解释。

产品对象围绕结构化 Note 组织。`Note` 是用户可打开、搜索、引用和移动的基础单元；有 `parent` 的 Note 表现为 subpage；正文里的 block 负责局部结构与局部 tag。引用指向稳定 `NoteId` / `BlockId`，type、tag、props 与 schema 由 core 管理，backlinks 与 mirror 是派生结果。围绕“打开一篇 Markdown 文本”组织的 UI 会把核心模型压回文本壳。

首期路线是 macOS + iOS，产品应围绕 Apple 原生交互和共享 core 设计，而不是套一个跨平台壳。

---

## 2. 目标与核心决策

交付一个 Note 原生的 Apple 本地知识工作台：用户在 macOS 和 iOS 原生客户端浏览、编辑、重组、引用和投影 Note 与 block 树；`anchor-core` 以 append-only op-log 作为真理层；Apple UI 只负责原生呈现和输入；CLI 提供稳定、结构化的本地命令契约；Markdown / JSON 文件作为导入、导出和 grep 友好的派生镜像。长期目标是在不重写 core 语义的前提下扩展到 iPadOS 和其他平台。

平台顺序：

1. macOS + iOS。
2. iPadOS 适配。
3. 其他平台最后再评估。

核心决策：

- 产品表面按 Note / block 设计，首期 UI 是 Apple 原生 UI。
- 存储真理层采用 append-only op-log。
- 核心模型、操作语义、规范化、校验、replay、导入导出和同步逻辑必须平台无关。
- Apple 客户端可使用 SwiftUI / AppKit / UIKit 和原生系统能力，但 core 逻辑不绑定其中任何一个。
- CLI 是本地命令、诊断和导入导出的外部契约。
- 不建设 Anchor 自有云服务；同步走可插拔 transport-adapter（core 定义传输无关的 `OpSyncPort`），首期 Apple 默认适配器是 iCloud Drive（文件级 ubiquity container），core 不依赖 CloudKit API；跨平台同步由中立 object-store 适配器承担。

高层非目标（细粒度排除见 §9）：

- 平台原生 UI 与任何后续客户端都不拥有业务真理；非法树状态由 core 校验防住，而不是靠 UI 提示。
- 不把未来其他平台的需求提前压到首期 Apple UI 上。

---

## 3. 平台路线

```text
共享核心：Note / block 模型、操作语义、规范化、校验、op-log、replay、导入导出、投影、同步合并
macOS / iOS：原生 UI + 原生系统能力
iPadOS：在 iOS 基础上适配多栏、键盘、拖拽、外接显示和 Pencil 等平板工作流
其他平台：最后评估，依赖 core ABI 和同步传输边界是否已经稳定
```

核心判断：

- UI 可以平台化；核心必须平台无关。
- 同步走可插拔 transport-adapter：op-log 始终是真理层。iCloud Drive（文件级 ubiquity container）是 Apple 首期默认零配置适配器，core 只做普通文件 I/O，连 Swift 侧也不碰 CloudKit；CloudKit / CKSyncEngine 与中立 object-store（S3 / WebDAV）是同一 `OpSyncPort` 接口的可选实现。任何单一云通道都不是架构地基。
- iCloud 对普通第三方 app 没有可用的 Web / Windows / Android 同步 API；跨平台同步靠中立 object-store 适配器，不靠 iCloud。

---

## 4. 产品模型

### 4.1 用户可理解对象

**Note** 是 Anchor 的笔记基础单元，也是用户可被打开、搜索、补全、出现在最近活动、被引用和被移动的对象。Note 有标题、正文、属性、type、tags、生命周期和可选父 Note；有父 Note 的 Note 在产品中表现为 subpage。

**顶层 Note** 是 `parent_note_id = null` 的普通 Note，侧边栏 `Notes` 入口展示所有顶层 Note。顶层不是一个特殊系统容器，也不要求额外的打开资格。

**Block** 是 Note 正文里的可视与结构单位。常见 block 包括 `paragraph`、`heading`、`list-item`、`quote`、`callout`、`code`、`math`、`table`、`row`、`cell`、`embed`、`file`、`divider`、`diff` 和 `unsupported`。正文 block 可以有局部 tag、行内引用和结构化 payload，但默认不等于一个可独立打开的 Note。

**行内内容** 是 block 内容中的文本与 mark 集合。行内 mark 包括装饰 mark（bold、em、code 等）和注解 mark（link、ref、mention、tag 等）。

**Type / Tag / PropDef** 是 schema 与组织语义。`$xxx` 在 Note title 区域设置 Note 的 type，type 含义等同于 supertag；`#xxx` 在 title 区域给整个 Note 打 tag，出现在正文 block 中时给对应 block 打 tag。嵌套 tag 采用 Bear 风格的 tag tree 语义。

**投影视图** 是从 op-log replay 和 Note / block tree 派生的视图，包括搜索、backlinks、最近活动、每日视图、schema views、mirror 文件和 CLI 可读输出。

### 4.2 用户不需要理解的对象

`rev`、HLC、LWW register、canonical serialization、SQLite materialized state、mirror freshness token、SwiftUI / AppKit / UIKit view identity、editor framework key 都是内部对象。UI 可以展示状态和错误，但不把这些词作为普通编辑流程的主概念。其中**平台 selection / TextKit range / view identity 永不进入持久化**，是后续多处约束的统一归属点。

### 4.3 产品不变量

- 用户编辑的是结构化 Note 与 block 树，不是 Markdown 文本。
- 用户看到的引用目标来自稳定 `NoteId` / `BlockId` 的解析结果。
- Note 可以有 `parent_note_id`；有父 Note 的 Note 表现为 subpage，交互和普通 Note 一致。
- 领域模型、持久 schema、op target、DTO 和 CLI 契约的结构类型集合固定为 Note / Block。
- `Notes` 是所有顶层 Note 的导航投影，不是一个系统容器。
- `Calendar` 是 journal 的日期聚合投影；journal 是带 `calendar_date` 的普通 Note，其 `NoteId` 由 `calendar_date` 内容寻址派生（同 vault 同日恒为同一 Note，去重是身份不变量）；年 / 月 / 周只作为 UI 分组，不进入 `parent_note_id`。
- Note / block 的位置、内容和生命周期是不同寄存器。
- backlinks、搜索、最近活动和 mirror 都是派生视图。
- 所有写入通过 core `dispatch` 形成结构化 op；UI 层只表达意图，不直接修补持久化状态。
- 平台原生 UI 与后续任何客户端都不拥有业务规则。

---

## 5. 信息架构

主界面由四个稳定区域组成，具体呈现随平台变化：

1. **主导航**：进入主工作区的全局入口，由顶部固定入口、中间目录区和底部系统区组成。
2. **导航区**：当前入口下的可扫描列表或树，例如搜索结果、今日列表、顶层 Note 列表、tag tree 或 schema types。
3. **工作区**：主编辑 / 阅读 / 对比区域。默认显示一个 Note，也可显示搜索聚焦结果、今日视图、schema 编辑器或设置工作区。
4. **检查器**：当前 Note / block / 选择区的属性、引用、backlinks、type、schema、状态和动作。

平台映射：

- macOS 默认采用多栏工作台：主导航 + 导航区 + 工作区 + 可折叠检查器。
- iOS 默认采用层级导航：列表 / 搜索 / 工作区 / 检查器分层进入，避免把桌面多栏直接压进小屏。
- iPadOS 在 iOS 基础上打开多栏、键盘导航、拖拽、分屏和外接键盘工作流。

主导航结构：

```text
搜索
今日
Notes

---
Pinned notes
Recent
Tag tree

---
Schema
Trash
设置
```

顶部固定入口：

- **搜索**：全局搜索入口，面向 Note、block、引用、props、tags 和正文内容。
- **今日**：每日工作视图，打开或创建当天 journal Note；Calendar 视图按 `calendar_date` 派生年 / 月 / 周 / 日期分组。
- **Notes**：所有顶层 Note 的入口，即 `parent_note_id = null` 的普通 Note；支持按最近、名称、type、tag 或 relation 筛选。

中间目录区：

- **Pinned notes**：用户固定的 Note 入口，顺序由用户控制；固定是导航偏好，不改变 Note 的 parent / order。
- **Recent**：最近打开或编辑的 Note / block，是本地派生视图，不等于 op-log 变更审阅。
- **Tag tree**：完整 tag tree，由 tag / type / schema projection 派生，展示 tag 层级、计数和进入对应 Note / block 集合的入口。它不是文件夹树，也不拥有存储结构。

底部系统区：

- **Schema**：Schema 配置入口，主要管理 type / supertag、PropDef、relation 和显示规则。
- **Trash**：`life = trashed` 的 Note / block 子树入口，支持查看、恢复和最终删除；它不是普通导航目录，不改变原 parent / order 语义。
- **设置**：应用设置入口。

`变更` 不作为首期主导航入口。最近活动进入 Recent；同步冲突、replay、mirror freshness 和 op-log diagnostics 通过状态提示、检查器或 Settings / Diagnostics 暴露。

路由或原生 navigation path 的参数使用 core DTO 中的 stable id。前端局部选择区、展开态、检查器 tab 和 transient command state 不进入持久数据契约。

### 5.1 Settings 必须包含外观控制

Settings 工作区必须吸收外观控制语义，并至少包含：

- 主题切换：system / light / dark。
- 字体选择：正文、标题、代码三类字体。
- 排版数值调整：字号、行高、行宽、段后距、首行缩进。
- 一键重置字体与排版设置。
- 诊断、操作记录、CLI 安装和其他系统设置作为同一工作区下的独立分组。

设置语义的具体字段、范围、默认值和 normalize 规则见 §7.2。

---

## 6. 交互模型

### 6.1 选择模型

编辑器支持三层选择：

- **文本选择**：普通文本选择，作用于行内内容和 range marks。
- **Block 选择**：选中一个或多个完整 block，作用于 move、delete、duplicate、wrap、tag、type、props、copy link、transclude。
- **嵌入编辑器选择**：代码 block 内的局部编辑器选择，仅作用于 code payload；跨出代码 block 时回到外层 block 选择。

选择边界必须可预测：

- 点击正文进入文本选择。
- 点击 block handle / 原生选择控件进入 block 选择。
- `Esc` 从嵌入编辑器回到 block 选择，再回到工作区焦点。
- `Cmd+A` 在代码 block 内先只选择代码内容；再次触发才提升到 block 或工作区选择。
- 跨 block 文本选择允许形成一个编辑意图，但落盘前必须被 core normalizer 拆成合法 block op。

首期只承诺单块文本选择、block 选择和嵌入编辑器选择；跨 block 文本选择作为独立 spike，待 selection、IME、undo 和 accessibility 验证可控后再进入能力范围。

### 6.2 结构编辑

结构编辑以 block / Note op 为结果：

- `Enter` 拆分当前文本 block。
- `Shift+Enter` 产生行内软换行。
- 空 paragraph 上 `Backspace` 合并或删除当前 block，遵守 parent 和 sibling 规则。
- 空 `list-item` / `quote` 上 `Enter` 退出容器为普通 paragraph，而不是继续拆分。
- `Tab` / `Shift+Tab` 调整当前 block 的 parent / order（reparent / reorder，不是文本缩进）。
- ordered list 序号由 normalizer / projection 维护，不作为存储值。
- 拖拽 handle 产生 move op，不改内容寄存器。
- 命令菜单产生 insert / wrap / transform 意图，包括插入代码块。
- 粘贴先进入 importer / normalizer，再形成 block tree 片段。
- Transform（paragraph → heading、paragraph → callout 等）必须保留 block id 和可保留的行内 marks。

非法结构在最早可确定的位置被拒绝：UI 可提前禁用明显非法动作，平台编辑器 adapter 可提供即时反馈，core 校验是最终关卡。

### 6.3 嵌套容器

`list-item` 是容器。code、table、callout、embed、file、diff 等 block 可作为 `list-item` 的子 block 存在。列表缩进、代码缩进和容器嵌套由 block parent / order 表达，不由文本行首空格表达。

代码 block 内部使用平台专属代码编辑 adapter。Apple 首期只要求能稳定编辑 code payload、language、fold state 和局部选择，不要求引入特定前端代码编辑器；代码 block 不拥有外层 block tree。

Table / Row / Cell 是一阶可合并 block。表格操作包括插入 / 删除 / 移动行列、单元格内容编辑和表格选择。表格不以 Markdown pipe 文本作为编辑真理。

### 6.4 Note 行为

凡是 Note 都可以被打开、搜索、进入最近活动、被引用和被移动；`parent_note_id` 只决定层级归属，不决定它是否拥有完整 Note 交互。

顶层 Note 与子 Note 的差异只在导航归属：

- `parent_note_id = null` 的 Note 进入侧边栏 `Notes`。
- `parent_note_id = another NoteId` 的 Note 表现为父 Note 内的 subpage，也可被直接打开为工作区 root。
- journal Note 是带 `calendar_date` 的普通 Note，通过 `今日` 入口和 Calendar 日期聚合进入。

从父 Note 中打开子 Note 时，UI 显示来源上下文和 breadcrumb；用户可以回到原父 Note，也可以以该子 Note 为工作根继续编辑。

标题区是 Note metadata 的快速输入面：

- `$xxx` 设置 Note 的 type；type 存为结构化 `type_id`，不是 title 字符串里的脆弱正则。
- `#xxx` 在 title 区域给整个 Note 打 tag。
- `#xxx` 在正文 block 中给对应 block 打 tag。
- tag 支持嵌套路径，tag tree 从 tag registry 和 usages 派生。

### 6.5 引用与反向链接

所有引用保存稳定 target id。UI 展示解析后的标题、摘要、类型、状态和上下文；被引 Note 改名不改变引用方 rev。

引用类型保留语义差异：

- `[[note]]` 表达 Note 引用。
- `#tag` 表达 Note 或 block 的 tag discovery。
- `@mention` 表达 person / actor mention。
- relation prop 表达 typed edge。
- embed 表达 transclusion。

Backlinks 和 unlinked mentions 是派生视图；用户可从 backlink context 创建 structured ref op。

### 6.6 属性、type 与模式

检查器是 props / type 的主入口；inline chips 和命令菜单是快速入口。PropDef / Type 的定义由 schema 工作区管理。

Note 只保存 id-keyed prop values、primary `type_id` 和 tag refs。类型校验、relation 目标校验、默认值、显示标签和排序由 core schema projection 提供。

### 6.7 命令表面

命令系统分三层：

- **局部命令菜单**：当前编辑器选择区的局部结构命令。
- **全局命令面板**：跨工作区的打开、创建、搜索、切换和导出。
- **上下文菜单**：当前 Note / block / 选择区的可用动作。

无法形成合法 op 的命令不进入 dispatch。

### 6.8 失败状态

UI 必须一等呈现以下状态：

- unsupported block：可读、可移动、可复制 id，不允许破坏性编辑 payload。
- newer schema：提示当前客户端只支持部分操作。
- 校验错误：显示被拒绝动作、目标 Note / block 和可恢复路径。
- replay conflict：显示冲突 register、winning op、losing op 和用户可采取动作。
- stale mirror：显示 mirror 落后于 op-log 的状态，不影响真理层编辑。
- blob 缺失 / 超限：可读占位，不破坏引用 Note / block。
- sync / rebuild error：保留当前可读物化态，阻止危险写入，提供 rebuild / export diagnostic。
- sync pending：本地已提交但尚未上传到传输层（iCloud Drive 无强制上传 API，延迟从秒到约 1 小时）。
- not-yet-downloaded：远端 segment 仍是 `.icloud` placeholder，未下载到本机，可触发下载。
- over-quota：iCloud（或 bucket）配额耗尽导致同步静默停止；必须可见，不依赖传输层报错。
- iCloud unavailable / signed-out：打开 synced vault 时无 iCloud 账户或登出，降级为本地缓存只读并提示；切换 Apple ID 时按平台要求清除本地云同步缓存。

---

## 7. 界面系统

### 7.1 Apple 原生优先

首期 UI 基座是 Apple 原生能力：

- macOS：原生窗口、菜单、快捷键、拖拽、文件对话框、系统外观、Spotlight / Share / Services 等系统能力。
- iOS：原生导航、键盘、触控、选择、分享、文件能力和系统外观。
- iPadOS：复用 iOS 基础，为多栏、拖拽、键盘、Pencil、Stage Manager 和外接显示优化。

具体的“view 不拥有领域规则”边界统一由 §8.1 与 §13 风险约束。

### 7.2 外观设置语义

外观设置拆成主题偏好、字体偏好和排版数值三组；平台可用不同控件呈现，但字段含义、默认值、normalize 和 clamp 行为保持一致。

主题：

- 三段式 `ThemeMode = 'system' | 'light' | 'dark'`，默认 `system`；实际生效主题是 `Theme = 'light' | 'dark'`。
- Apple 客户端把同一语义映射到原生 appearance / color scheme；持久化 key 由平台 settings store 决定。

字体与排版：

- 三个字体选择器：正文 `textFont`、标题 `headingFont`、代码 `codeFont`，都必须包含“系统默认”。
- 五个数值控制：

  | 字段 | 范围 | 步进 | 单位标签 | 默认 |
  | --- | --- | --- | --- | --- |
  | `fontSize` | 10–30 | 1 | pt | 15 |
  | `lineHeight` | 1–2 | 0.1 | em | 1.5 |
  | `lineWidth` | 32–130 | 1 | em | 48 |
  | `paragraphSpacing` | 0–2 | 0.1 | em | 0 |
  | `paragraphIndent` | 0–3 | 0.1 | em | 0 |

- 单位标签是 UI 约定，原生映射需明确：`fontSize` = 点；`lineHeight` = 无单位行高倍数；`lineWidth` / `paragraphSpacing` / `paragraphIndent` = 编辑器字号的倍数。Apple TextKit 排版按此映射，避免与跨平台输出偏差。
- normalize 与 clamp 精度：非有限数值回到默认值；越界有限数值被 clamp 到字段上下限；类型不符的值（如字符串）被忽略并保留默认值；未安装 / 未知字体回退（代码字体回退内置 `JetBrains Mono`，正文 / 标题回退系统默认，正文 / 标题的回退因此为设备相关）。
- 字体和排版进入外观 store，一键重置恢复默认值。主题与排版可以是两个独立 store，Apple 侧可统一，但主题的 `system → light/dark` 解析保持独立关注点。
- 字体调整必须即时生效，不要求重启或重建文档模型。
- 字体来源：代码字体随包内置 `JetBrains Mono`（OFL，跨设备一致）；正文 / 标题默认系统字体，用户可在本机已安装系统字体中切换。字体属外观 settings、不进 op-log 真理层，故正文 / 标题字体可用性的设备相关只影响渲染，不破坏 op-log 确定性或 `snapshot_revision`。

---

## 8. 架构

### 8.1 责任边界

**`anchor-core` 负责真理层、共享模型与不变量：**

- Note / Block / Inline / PropDef / Type / Tag / BlobRef 模型。
- Note 与 Block 是 core 的一阶持久对象；tree item / cursor / projection row 等通用树遍历辅助结构只属于私有实现，公开模型、op target、DTO 字段和 CLI 词汇固定为 Note / Block。
- 规范序列化与 hash、校验与规范化。
- Append-only op-log、HLC / LWW merge、replay 与物化 Note / block tree。
- SQLite projections 或等价本地 projection（派生、可重建，不是真理归属方）。
- 导入 / 导出、mirror 生成队列与 mirror freshness。
- Dispatch、结构化 op 创建、本地 stale guard、同步 op ingestion 与合并逻辑。
- 传输无关的 `OpSyncPort` trait（list / pull / push segment + blob，仅 SegmentId / BlobId + 字节，不含任何云类型）；具体同步传输适配器在 core 之外按平台实现此接口。
- CLI DTO、Apple binding DTO、后续客户端 DTO 与 schema version envelope。

首选继续把 Rust core 作为平台无关核心。CP-0 推荐 Apple binding 路径为 UniFFI 生成 Swift API + XCFramework 打包 Rust static libraries + 本地 SwiftPM wrapper 消费，C ABI bytes 作 bulk segment / blob fast-path 退路；binding 方向（A2）与机制作为产品分发边界的最终冻结（B4）均 Stage-1-gated（待 Stage 1 binding spike 证据 + 用户签署）。平台无关不止于 Apple：`anchor-core`（含内部模块 `anchor-editor-core`）的 `wasm32` + android 可编译性是 CP-1 受保护不变量——core 依赖须 wasm + android 可编译、确定性 / merge 路径 `no_std`-friendly 且不碰 OS 线程 / 文件系统 / 时钟 / 浮点，diff3 / order-key 一致性向量集纳入 `wasm32` target，并设 client 零真理逻辑 CI 红线；受保护的是「core 现在就保持可复用」，web / android 客户端仍延后（见 §9）。

**客户端 ↔ core 传输：** Apple 客户端通过进程内 binding 直接调用 core，不经网络。`anchor serve` + `/rpc` op 信封作为可选的本地开发 / 测试传输保留，与 CLI、Apple binding 共享同一 op registry、DTO 词汇和同一 dispatch 入口——它是 localhost 开发工具，不是产品同步通道。所有传输面只是 dispatch 的外壳。

**Apple 客户端负责原生产品表面：**

- macOS / iOS / iPadOS 的窗口、导航、菜单、输入、拖拽、快捷键、分享、文件、安全权限和系统外观。
- 原生编辑器 surface、原生 Settings。
- 原生离线存储位置、文件访问；实现 core 定义的 `OpSyncPort`（纯字节 list / pull / push segment + blob）。首期为 iCloud Drive 适配器：`NSFileCoordinator` 协调读写、`.icloud` placeholder 下载、`NSMetadataQuery` 发现远端 segment，把已下载已协调的字节喂给 core；core 永不出现 CloudKit / iCloud 类型。
- 对 core DTO 的展示、错误呈现和交互状态。

Apple 客户端不复制 core 领域规则。它可以预检明显 UI 约束，但 core 校验始终是权威关卡。

**`anchor-editor-core` 是 `anchor-core` 内部的无 UI 编辑语义模块。** Swift 生态没有可直接承担 Anchor 结构化语义的编辑 runtime；方案不寻找完整替代品，也不自研通用编辑框架，而是要一个专用、无 UI、平台无关的编辑器模块，把用户编辑意图收敛到 `dispatch` 可验证的事务输入。持久化、schema 校验和 op 创建的唯一边界是 `anchor-core::dispatch`：

- `EditorSnapshot`：面向编辑器的 Note / block tree 投影。
- `BlockProjection`：block 到可编辑块 / 嵌入块 / 装饰块的投影。
- `InlineRun`：文本和 typed range marks 的显示与命中测试片段。
- `EditorSelection`：文本选择、block 选择、嵌入编辑器选择的可移植表示。
- `EditorIntent`：insert text、replace range、split block、merge backward、exit-container-on-empty、indent / outdent（reparent）、move block、transform block、apply mark、insert code block、paste fragment。
- `EditorPatch`：`dispatch` 接受事务后返回给平台 adapter 的最小视图更新。
- `TransactionResult`：changed ids、selection hint、validation error、new target/register revisions、projection freshness、mirror freshness，以及 stale snapshot conflict。

`anchor-editor-core` 拥有 portable selection、intent shaping、选择提升 / 降级规则、paste fragment shaping、跨 block 文本编辑拆分建议、platform patch 生成和 undo intent 映射。Tree invariant、schema-aware normalization、op creation、merge 和最终非法结构拒绝归 `anchor-core::dispatch`。

**Apple 编辑器 adapter 负责原生输入视图机制。** 把 NSTextView / UITextView / TextKit / 原生键盘事件转换为 `EditorIntent`，把 `EditorPatch` 转换为原生 view model 更新；负责 Note / block tree 渲染、文本 / block 选择、intent 提取、代码 block 局部编辑器、表格交互和编辑器专项测试。

TextKit、`NSTextView` / `UITextView`、`NSAttributedString` / `AttributedString`、`NSTextRange` / `NSRange`、平台 selection、view identity、滚动 / 焦点 / IME state 只作为输入、排版、显示和命中测试机制，不作为存储格式或文档模型；`anchor-editor-core` 同样不拥有它们。

首期 Apple 编辑器采用 block list 形态：paragraph、heading、quote、list-item 等文本块使用原生 text surface；code、table、embed、file、callout、diff 等 block 使用独立原生 block view。SwiftUI 负责外壳和状态组合，AppKit / UIKit 负责具体文本输入面；不用 SwiftUI `TextEditor` 作为主编辑器，不用一个巨大 `NSTextView` 加隐藏分隔符伪装 block tree，也不自研完整文本渲染引擎。Undo 接 `NSUndoManager`，但 undo 动作 dispatch inverse intent / op，不直接改 TextKit buffer。

**CLI 负责本地命令契约：**

- 带 `apiVersion` 信封的稳定命令。
- 全局 I/O 契约：vault 解析（`--vault` / `$ANCHOR_VAULT` / 向上发现）、`--format tsv|json`、`--fields`、`--limit`、`--count`，固定退出码（0 ok、1 usage、2 not_found、3 conflict、4 blocked、5 vault_not_open、6 io）。
- 结构化 Note / block 读取、通过 core op dispatch 的结构化写命令、面向 replay / mirror / schema / 校验状态的诊断命令。

### 8.2 数据模型

Note 是可独立打开的文档单元，也是导航、搜索、引用和同步冲突呈现的主要对象。Note 可以有父 Note；`parent_note_id = null` 表示顶层 Note，进入侧边栏 `Notes`。Note 正文由 block tree 表示；block 的树形结构来自 `parent_block_id` 和 `order`。底层持久模型按 Note / Block 分表、分 DTO 和分 op target 设计；Note 与 Block 的共享逻辑通过 trait / helper / projection row 等私有实现表达。

Note 字段：

- `id`：稳定 `NoteId`。普通 Note 在创建时一次铸造随机 nanoid；journal Note 例外，`id = blake3("journal:" ‖ vault_id ‖ calendar_date)` 由日期内容寻址派生，使「同 vault 同日恒为同一 journal」成为身份不变量。
- `parent_note_id`：可选父 `NoteId`。空值表示顶层 Note；有值表示 subpage / child Note。
- `order`：确定性的 fractional-index key。
- `title`：结构化标题 runs，可投影出 `$type` 和 `#tag` token。
- `type_id`：可选 primary type，语义等同于 supertag。
- `props`：id-keyed typed values，指向 PropDef。
- `tags`：Note 级 tag refs。
- `rev`：`blake3(canonical_serialize(self))`。
- `lww`：排除在 `rev` 外的寄存器元数据。

Block 字段：

- `id`：创建时一次铸造的随机 nanoid，即稳定 `BlockId`。
- `note_id`：所属 Note。
- `parent_block_id`：可选父 `BlockId`，用于 list-item、table、callout 等容器。
- `order`：确定性的 fractional-index key。
- `content`：以 `kind` 为 key 的标签联合。
- `tags`：block 级 tag refs。
- `rev`：`blake3(canonical_serialize(self))`。
- `lww`：排除在 `rev` 外的寄存器元数据。

系统管理对象：

- `Notes`：顶层 Note 的导航投影，不是系统对象，也不拥有 parent 语义。
- `Calendar`：journal 的日期聚合 projection。打开 / 创建 journal 时，系统按 content-addressed `note_id`（见 Note 字段）解析当天 journal——同 vault 同日恒命中同一 Note，并发离线创建退化为对同一 target 的幂等 create，trashed 后重开则 restore 同一 Note 而非铸造重复；年 / 月 / 周 / 日期分组由 projection 计算，用于日期跳转和列表展示。
- `calendar_date`：journal Note 的隐藏属性，既是 content-addressed `note_id` 的派生输入，也用于日期查询、跳转、today projection 和 Calendar 聚合；同日唯一性由身份派生保证（by construction），无需运行时去重检查或结构化 merge。它不拥有归属语义，journal 的 `parent_note_id` 仍按普通 Note 规则处理。

顶层 Note 的内部表示冻结为 `parent_note_id = null` 的普通 Note（非隐藏 root sentinel）；Calendar projection 的年 / 月 / 周 / 日期分组仅作 UI 分组、按 `calendar_date` 排序、不进 `parent_note_id`；journal 默认 parent 按普通 Note 规则；trash / restore 对 journal Note 的边界为「journal 被 trashed 后重开『今日』解析回同一 content-addressed id 并 restore，不产生重复」。journal 身份、`calendar_date` 唯一性、journal 创建与 rename / move 规则由 content-addressed `note_id` 决定：同日去重是身份不变量，rename 改 title runs、move 改 `location`，均不触身份。

行内内容是纯文本加排序、合并后的 typed range marks。行内 offset 对外以 UTF-16 code unit 表达（对齐 Apple TextKit / Swift String bridging 与后续客户端编辑器边界）；core 内部存储单位与对外 UTF-16 的确定性换算在 binding 边界完成，其在 emoji / ZWJ / combining mark / CRLF / IME marked text 下的稳定性由 Stage 1 fixture 验证，导入既有 byte-offset span 时一并转换。硬 block 边界创建新 block；`\n` 是行内文本中的软换行。

Block 内容类型：

- 行内容器：paragraph、heading、quote、callout、list-item。
- 叶子 / 装饰 block：code、math、embed、file、divider、diff。
- 表格：table、row、cell。
- Schema：prop-def、type。
- 兼容载体：带 `min_schema` 和无损 payload 的 unsupported。

附件是内容寻址 blobs。Note / block 只存 `BlobRef`；单附件上限 50MB（对齐 CloudKit `CKAsset` 上限），由 dispatch 在写入前校验并以独立失败态拒绝超限。

### 8.3 规范序列化与修订

`canonical_serialize` 是显式确定性编码器，遵循 JCS 风格规则：递归排序 key、固定字符串转义、无无意义空白。Hash 输入禁止 `f64`；数字值使用规范十进制字符串。

`rev` 覆盖自身规范字段，排除 `lww`，不是 Merkle hash。`Note.snapshot_revision` 是派生的 Note + block 子树 hash，用于读模型缓存、UI stale detection 和导出快照标识；本地写入的冲突保护以 touched target/register 的 base rev 为唯一 stale token，独立 target/register 的可合并写入保持可合并。

### 8.4 合并、同步与 op-log

真理层是 append-only op-log。物化本地 state、`.json` mirror 和 `.md` mirror 都是 replay 输出。

> 冲突处置的权威定义见配套方案 [2026-06-06-anchor-conflict-resolution-model.md](2026-06-06-anchor-conflict-resolution-model.md)：它在三 register 与 op-log 真理层之上给出确定、可 replay、无静默丢失的合并模型，并定义 journal 内容寻址身份。本节给出 merge register 与基础合并规则，冲突处置细节以配套方案为准。

每个 Note / block 有三个 merge registers：

- `location`：parent + order。
- `content`：content + props + tags；merge 时内部分解为具名 sub-field cell `{body, type_id, props[k], tags[t]}`（仍是恰好三个 dispatch register，非新增 register 轴）。
- `life`：生命周期枚举 `active / archived / trashed / deleted`，保留 archive 与 trash 的区分以及可逆 restore；`deleted` 是终态 tombstone。

每条 op 记录 `{target_id, target_kind, register, base_register_rev, new_register_rev, hlc, actor}`，op-shape 冻结时按配套方案 §7.1 预留完整信封（含 `op_id`、`op_envelope_version`、`sub_field_key` / `sub_rev`、`op_kind`、`dominates_frontier`、`observed_adds` 等），并预留 `provenance` / `approvalState`（承载导入来源，不复用于人工冲突复审，见 §9 排除）。本地 UI / CLI 写入携带 touched cell 的 `base_sub_rev` 作为 stale guard；同步 ingestion 接受远端 op 进入 merge pipeline，按全序键 `T = (hlc.wall, hlc.logical, hlc.device, actor, op_id)` 做幂等去重与排序。合并按 target + register 进行，content 内部逐 sub-field cell 调和：`body` 走确定性 3-way diff3 / keep-both（永不静默 LWW），`props` / `type_id` 走 causality-aware per-cell LWW，`tags` 走 OR-Set add-wins。Move-vs-edit 两边保留；`life` 走时钟无关优先级 lattice 且**非级联**（子树消失是派生 root-reachability 可见性规则，非命令式级联 tombstone）；edit-vs-delete **保留编辑 + 节点可逆 trashed**，终态 `deleted` 仅经显式 `trashed → deleted` 且因果支配编辑可达。冲突处置细节以配套方案为准。

**Compaction：** op-log 纯追加会无界增长，冷启动会从创世 replay。Compaction 策略冻结为：定期物化快照 + 截断 / 分段使 replay 从最近快照起算，由 **causal-stability watermark**（所有已知设备各自已确认 HLC frontier 的 `min`，非日历 epoch）门控截断；保留期为四 horizon（conflict / replay-safety / audit / time-travel），硬规则**绝不截断属于 open `ConflictRecord` 成员的 op**。GC 分两层：< watermark 且已被全 peer snapshot 覆盖的 op 只可 truncate-to-snapshot / archive，hard-delete 仅在 time-travel / audit horizon 之下且经显式 excise；离线超窗设备整快照重拉以使 watermark 可推进。承载快照与 segment 集合的 manifest 默认取 per-device immutable cursor（免 conflict），其在 iCloud 下的并发协调（`NSFileVersion`）runtime 由 Stage 1 实测；被 tombstone 子树遗弃的内容寻址 blob 的分布式安全 GC 同属 storage / transport 范畴。

**Vault 落盘布局：** 真理层 op-log 是被同步的核心产物（位置如 `.anchor/operations/`）；projection（SQLite，如 `.anchor/cache/index.sqlite`）是可从 op-log 重建的本地缓存，不进入同步；配置 `.anchor/config/vault.toml` 声明 `source_of_truth = "op-log"`、`sync`（adapter 选择，`none` 表示纯本地）与 projection 路径。`.md` / `.json` 镜像是导出产物，由 post-commit mirror job 写入并记录 freshness。同步 / 提交单元是 op-log 的不可变 op-segment 文件（如 `.anchor/operations/<device_id>/<seq>.seg`，每设备独占命名空间、一封一密、永不修改）；选不可变 segment 而非单个增长日志，是因为 iCloud Drive 无 delta 同步、任何改动都整文件重传，不可变 segment 只上传一次、永不重传。`.md` / `.json` 镜像不进入同步，镜像是有损派生物，同步它会制造第二真理。镜像目录组织采用人类可读路径、不纳入版本库（NoteId 寻址仅作实现期去歧义不可行时的备选）。

**Vault 同步形态与 local-only 落盘语义：** 每个 vault 的同步形态独立，三选一。Synced（iCloud）：vault 作为 file package 放进 ubiquity container 的 `Documents/`，OS 守护进程同步新增 segment，projection 留本地 Application Support、不进 container。Synced（中立 object-store）：vault 在本地任意目录，object-store 适配器把 segment + blob 推 / 拉到用户自有 bucket；该路线默认非零知识，零知识需 Anchor 自加客户端加密层。首期不实现零知识，阶段0 锁定 `OpSyncPort` 与持久化间的 encryption envelope 缝（首期 no-op，日后接客户端加密层不迁移 op-log）+ non-ZK 文案（绝不对中立 object-store 暗示零知识）；完整 ZK 与无自托管服务下向新设备分发密钥延后到 ZK 真被需要时评估。Local-only：`sync = "none"`，vault 放非 ubiquity 目录（OS 同步守护进程不可见，字节无法离开设备），并标记 `NSURLIsExcludedFromBackupKey` 排除备份；core 不为其挂载任何 adapter，唯一出网调用点 `OpSyncPort::push` 受 adapter 门控、可 grep 审计。vault-open 时断言路径不在任何 ubiquity container 下，否则拒绝打开并报警。`synced → local-only` 切换不可逆：已离开设备的字节无法收回，local-only 保证只对此后写入成立。

Apple 首期同步路线：不建设自有服务器；首期 transport 是 iCloud Drive 文件适配器，零配置、core 纯文件 I/O、无任何 CloudKit 代码。CloudKit / CKSyncEngine 后置为二期可选升级，为 Apple 用户提供更高质量同步，通过同一 `OpSyncPort` 接入，不成为真理归属方；单附件 50MB cap 与 CloudKit `CKAsset` 上限一致，二期 CloudKit 无需分片 / 降 cap / out-of-band，且 CloudKit record schema 一旦进入用户私有库即难迁移，op 形状须在任何 CloudKit 记录落地前冻结。iCloud Drive 同步的 vault 不跨出 Apple 生态，跨平台需该 vault 改用中立 object-store 适配器（同步形态逐 vault 选择，iCloud→中立需一次迁移）。任何适配器只负责传输 / 持久化，不拥有 merge 语义。

**设计依据（竞品取舍与 Rust 边界）：** 选型参考 Obsidian（本地文件即真理 + 可插拔传输，local-only = 不配同步）与 Litestream（不可变文件复制到对象存储）。竞品中 Bear 用 Core Data + CloudKit、是 Apple-only（无 Windows / Android），押注 CloudKit 锁死生态；Craft 自建中立后端覆盖全平台，但走的是本方案排除的自托管服务器。Anchor 取第三条路：op-log 文件 + 用户自有云 / 文件目录当传输，得跨平台覆盖又不付自托管代价。Rust core 不能直接调 CloudKit，但 iCloud Drive 路线下 core 只做文件 I/O、连 Swift 侧也无云 API，「Rust↔CloudKit」问题不存在；二期 CloudKit 由 Swift 薄 CKSyncEngine 适配器承接，core 不出现 CKRecord / zone / token。绑定方向见 §8.1（UniFFI 推荐路径 + XCFramework / SwiftPM wrapper，C ABI bytes fast-path 退路；机制冻结 Stage-1-gated）。

### 8.5 写入路径

所有写入进入单一 `dispatch`：

1. 接收 intent 或 CLI command。
2. 解析 ids 和 schema。
3. 规范化为 Note / block ops。
4. 校验 tree invariants。
5. 对本地 UI / CLI 写入比对 touched target/register 的 base rev，不匹配返回 `Conflict`（退出码 3）。
6. 对同步 ingestion 执行 schema envelope 校验、actor / HLC 校验和幂等去重，进入 merge pipeline。
7. 追加 op-log。
8. Replay / update materialized DB。
9. 安排 post-commit mirror job，并更新 mirror freshness。
10. 返回包含 changed ids、new target/register revisions、snapshot revisions、projection freshness 和 mirror freshness 的 DTO。

单一已校验 dispatch 是首期要建立并守住的不变量：每条持久写入路径都调用执行 append 前校验的 core 私有 helper，对 core 写入点 grep 必须能证明这一点。

**提交节奏：** 每个语义 `EditorIntent` 落一条 op（句 / 段边界、防抖，绝不 mid-keystroke）；op 粒度经 batching 与同步单元解耦（segment 非 per-op 文件），op:segment 比与稳态 segment 预算由 Stage 1 实测。这决定 op-log 粒度与 replay / mirror 开销。

### 8.6 导入、导出与镜像

Markdown 是导入 / 导出格式。Frontmatter `id` 在导入时定义 Note 身份；缺失时创建新 Note。规范 `.json` 导出携带 Note / block ids，支持幂等重导入；`.md` 导出是有损且 grep 友好的导出。

Mirror 生成发生在 dispatch append 和 materialization 成功之后的 post-commit job。Mirror 写入失败记录 freshness / diagnostics；op-log 保持已提交状态，后续真理层编辑继续使用当前 materialized state。搜索和 backlinks 使用结构化 projection，默认 SQLite FTS（与 `.anchor/cache/index.sqlite` projection 一致、可重建；replay 后内存索引为备选）；对 mirror 跑 ripgrep 是本地检查便利，不是真理归属方。

---

## 9. 实现范围

包含：

- 新的 core Note / block 模型、op-log、replay、projections、sync merge 和 dispatch。
- Apple binding 边界设计。
- macOS 原生客户端、iOS 原生客户端。
- 代码 block、表格、引用、props / type 和 Settings 的平台化交互契约。
- 本地命令、诊断、导入导出的 CLI commands。
- Markdown importer 与 `.json` / `.md` exporters。
- 覆盖确定性序列化、replay、merge、import / export、编辑器身份和 core 写入校验的正式测试。

排除：

- 首期非 Apple 客户端；独立 Web 客户端整体后置：若未来进入实施，作为独立客户端通过 WASM 或等价边界复用 core（可选 React / HeroUI / Lexical / CM6 作为界面与编辑 adapter），这些工具不拥有 Note、block、op、merge、schema、同步或存储语义。Web 落地时同步走中立 object-store 适配器（非 iCloud，iCloud 无 Web API），存储用 OPFS；因 Safari / WebKit ITP 会定期清除 OPFS，「绝不同步的 local-only」保证在 Web 上无法兑现，只在 Apple 原生 / 桌面成立，Web 端以同步作为耐久性后盾。
- 首期 iPadOS 专项优化；iPadOS 在 macOS + iOS 跑通后进入。
- 实时多人协作、CRDT / Loro 实现。
- 应用内图谱工作区、图谱路由、图谱导航和图谱可视化。
- **应用内 AI agent / proposed-change 子系统**：agent 连接、agent 任务、transcript / timeline、权限模式、proposed-change 审批收件箱、`change` / `proposal` CLI 命令、`agent-spec` 配置。这是首期不移植的能力；数据层在 op 信封预留 `actor` / `provenance` / `approvalState`，使真实 agent 能力日后可在不迁移 op-log 的前提下接入。
- Markdown 字节保真。
- note-centric routes / payloads / UI 行为 parity；产品原生模型是结构化 Note / block。
- 把 SwiftUI / AppKit / UIKit 或任何具体 UI / 编辑器框架作为 core 语义拥有者。
- Workspace / package 重组，除非阶段0明确需要并另行授权。
- 将 Rust CLI 改写为 `@plimeor/command-kit`。
- 发布 packages。

CLI 公开词汇使用 Note / block op。其中 show / search / tag / prop / diagnostics 以 Note / block 为对象；net-new 命令包括 MOVE（Note reparent 或 block reparent + fractional order）、EXPORT / IMPORT、TYPE（PropDef / Type schema）、PropDef-backed PROP 和真实 DELETE / tombstone。

---

## 10. 推荐路径

把 `anchor-core` 打造成平台无关核心，同时把首期产品客户端转向 macOS + iOS 原生。实现从产品与平台契约产物开始，因为平台路线决定 binding、存储、同步、编辑器 adapter 和 Settings 表面；随后先证明 core 的确定性行为，再构建 Apple 原生客户端。

主要权衡：Apple 原生首期会增加 Swift / Rust binding 与 Apple 工程成本，但它避免把产品体验锁进跨平台壳，也避免日后再从一个非平台无关的架构里反向拆出 core。考虑到 macOS + iOS → iPadOS → 其他平台的路线，这个代价值得。首期主要复杂度集中在 Apple 原生编辑器、core 绑定、`anchor-editor-core` 和同步适配器。

首期是全新构建：Note / block id（随机 nanoid）、`blake3` + `canonical_serialize`、parent / order tree、register / HLC op-log、replay 引擎、单一已校验 dispatch 和 schema 对象都从零写起，没有可沿用的既有实现。授权后的第一个实现单元是阶段0。

---

## 11. 工作序列

### 阶段 0：平台、产品与契约基线

产物：

- 平台路线确认：macOS + iOS 首期，iPadOS 后续，其他平台最后。
- Apple 工程边界建议：工程位置、target、bundle、共享代码方式、验证命令。
- Rust core 到 Apple 的 binding 方案比较与推荐。
- `OpSyncPort` 传输适配器接口 + iCloud Drive 文件适配器的可行性 spike 计划；明确 core 不依赖 CloudKit API。CloudKit / CKSyncEngine 列为二期评估，不进首期。
- `anchor-editor-core` 内部模块合约，明确它只拥有 selection / intent / patch 映射，tree invariant、schema-aware normalization 和 op creation 归 `anchor-core::dispatch`。
- `EditorSnapshot`、`BlockProjection`、`InlineRun`、`EditorSelection`、`EditorIntent`、`EditorPatch`、`TransactionResult` 草图。
- 覆盖选择、结构编辑、Note 行为、引用、props / type、命令、Settings 和失败状态的交互契约。
- macOS / iOS 信息架构草图。
- Note、block、op、projection、search result、validation error、mirror status、settings 和 sync status 的 core DTO 草图。
- **关键技术决策确认**：客户端 ↔ core 传输边界、vault 落盘布局与同步单元、顶层 Note 内部表示、journal content-addressed 身份与 `calendar_date` 唯一性、Calendar projection 排序、journal 默认 parent、`life` 枚举 vs 单 tombstone、target/register stale guard、同步 ingestion、提交节奏与 op-log 粒度、op-log compaction、mirror post-commit job、搜索 / backlinks 后端、blob 落盘与 cap 校验、UTF-16 / UTF-8 offset 换算边界、字体来源（内置 vs 原生枚举）、同步单元（op-segment 文件 vs 镜像）、segment 大小与提交节奏、compaction GC 保留窗口与 manifest / cursor 协调、local-only vault 位置语义与防误放断言、Web 同步适配器（中立 object-store）、加密与密钥所有权。
- Fixture set 至少覆盖：顶层 Note、子 Note / subpage、journal Note、Calendar 年 / 月 / 周 / 日期 projection、同日 journal 去重、journal Note 的 `calendar_date` 隐藏属性、title `$type`、title `#tag`、body block `#tag`、嵌套 tag tree、嵌套 list item 内含代码、带行内引用的表格、unsupported block、relation prop、embed、target/register conflict case、sync merge case、mirror stale case、settings case、单块文本选择、block 选择、嵌入编辑器选择和跨 block 编辑拒绝 / 拆分 case。

证明：

- 手动设计复查确认每个用户可见 primitive 都能映射到 core 拥有的概念。
- 手动设计复查确认每个首期编辑行为都能映射到 `EditorIntent`，并能由 core 校验为合法 op 或明确拒绝。
- 没有 UI 行为要求 Markdown 字节真理或仅前端持久状态。
- Apple binding 选择有明确验证命令和失败条件。

检查点 CP-0：平台路线、Apple binding 方案、`anchor-editor-core` 合约、交互契约、信息架构、DTO 草图、关键技术决策和 fixture set 已批准。

**CP-0 批准结论（2026-06-07，权威记录见 `docs/workbench/anchor/2026-06-06-phase-0/cp-0-approval.md`，索引见 `cp-0-final.md`）：**

- 项目布局冻结为 Primary = Option A `suites/anchor/*`（`core` / `cli` / `apple` / `fixtures` + 嵌套 Cargo workspace 与 Xcode workspace）；实现期 Bun glob 容忍度或 Xcode 嵌套成本过高时退路 = glob 外顶层 `anchor-apple/`、core 仍留 `suites/anchor/core`。绝不为适配 glob 添加 placeholder `package.json`。目录 / 工程的实际创建随实现授权执行。
- Apple binding 推荐路径 = UniFFI + XCFramework + SwiftPM wrapper（C ABI bytes fast-path 退路）；binding 方向（A2）与机制冻结（B4）均 Stage-1-gated（见 §8.1）。
- 受保护不变量：`anchor-core`（含 `anchor-editor-core`）的 `wasm32` + android 可编译性作为 CP-1 gate，client 零真理逻辑 CI 红线；web / android client 仍延后（见 §8.1、§9）。
- 公开 `ConflictRecord` / `resolve` CLI schema 延后二期；Phase 0 仅在 op 信封预留所需字段。其余 Apple 工程 / iCloud container / 字体来源 / mirror 组织等契约级决策的权威记录归 workbench packet（cp-0-approval.md、key-decisions.md）。
- 两项 Stage-1-gated 待定项：Apple binding 机制冻结；iCloud Drive 作首期默认 transport 的批准（gated on Stage 1 规模门——million-op replay/merge/compaction + steady-state segment budget + iCloud Drive 真机 go/compromise；no-go 转 CloudKit / 中立 object-store）。
- 通过 CP-0 后按 `stage-1-entry-brief.md` 进入 Stage 1；通过 CP-1 前不实现持久应用写入。

### 阶段 1：确定性 core 探索验证

产物：

- `canonical_serialize` spike，证明跨运行 bytes 和 hash 稳定。
- Note / block id 与 fractional order spike。
- Op-log replay spike。
- HLC LWW merge spike，覆盖 move-vs-edit、edit-vs-delete、本地 target/register stale guard 和同步 ingestion。
- Export mirror vs structured projection parity spike，使用真实查询样例，并证明 mirror 写入失败只影响 freshness / diagnostics。
- Apple binding 最小调用 spike：Apple 侧能调用 core 读取 fixture Note，并实测 segment 字节批量跨 FFI 的 marshaling 成本，作为冻结 op 形状前的性能验证。
- `anchor-editor-core` 选择 / 编辑事务 spike，覆盖 insert text、split block、merge backward、indent / outdent、transform block、apply mark、paste fragment、undo inverse intent 和 validation error。
- Apple text surface spike：证明 NSTextView / UITextView / TextKit 事件可转换为 `EditorIntent`，`EditorPatch` 可回放到原生 view model。

证明：

- `cargo test -p anchor-core` 把 spike case 落成正式测试。
- Apple binding spike 有可重复命令或 Xcode scheme。
- 编辑器 spike 报告列出单块文本选择、block 选择、嵌入编辑器选择和跨 block 选择的通过 / 失败证据。
- Spike 报告列出任何必须调整的模型点。

检查点 CP-1：确定性 core、Apple binding 和编辑器事务 spike 作为正式验证通过；通过前不实现持久应用写入。

### 阶段 2：`anchor-core` 地基

产物：

- Core Note / block model、validation 与 normalization。
- Append-only op-log、replay materialization。
- SQLite projection 或等价本地 projection。
- 单一 `dispatch` 写入路径、本地 target/register stale guard 和同步 ingestion。
- Post-commit `.json` / `.md` mirror job 与 freshness 记录。
- Importer 与 exporter。
- Apple binding DTO、CLI DTO。
- `anchor-editor-core` 的 snapshot / selection / intent / patch / transaction result 类型、intent shaping 和 patch reducer。
- 同步传输适配器接口。

证明：

- 每条持久写入路径都经过 validated dispatch。
- 从空状态 replay op-log 可重建同一棵 materialized tree。
- Import → export → import 保留 canonical JSON ids 和 hashes。
- 编辑器事务通过 `anchor-core::dispatch` 校验并创建 op；平台 selection、TextKit range 和 view identity 不进入持久化。
- Apple binding 可以读取、写入、replay fixture vault。

检查点 CP-2：core dispatch、op-log replay、projection、`anchor-editor-core`、同步适配器接口和 CLI DTO 契约稳定到足以支撑 macOS / iOS 集成。

### 阶段 3：macOS 原生客户端

产物：

- macOS 原生 app shell；主导航、导航区、工作区、检查器。
- Note / block 读取和基础编辑。
- Block list 编辑器 adapter，覆盖单块文本编辑、block 选择、结构命令、代码 block 和表格 block 的最小可用交互。
- Settings 工作区：主题切换、字体选择、排版滑杆和重置排版。
- 文件 / vault 打开流程；CLI 安装或诊断入口。

证明：

- macOS target 的构建命令通过。
- 截图或手动证据覆盖默认工作区、搜索、今日、Notes、Pinned notes、Recent、Tag tree、Schema、Trash 和设置。
- 编辑器证据覆盖 NSTextView / TextKit 输入进入 `EditorIntent`，`EditorPatch` 回放到原生视图。
- Settings 证据覆盖 system / light / dark 切换、字体选择、字号调整和重置排版。
- 没有 macOS UI 代码绕过 core dispatch 写入。

检查点 CP-3：macOS 客户端基于 shared core 读写 fixture vault。

### 阶段 4：iOS 原生客户端

产物：

- iOS 原生 app shell；小屏层级导航。
- Note / block 读取和基础编辑。
- iOS text surface adapter，语义与 macOS 对齐。
- Settings 工作区，语义与 macOS 对齐。
- 本地存储、权限、分享、文件导入导出路径。
- 接入 iCloud Drive 最小同步 adapter（`OpSyncPort` 实现）；CloudKit 留二期。

证明：

- iOS target 的构建命令通过。
- iPhone 尺寸截图或手动证据覆盖打开、搜索、编辑、设置、导入导出。
- iOS 编辑器证据覆盖 UITextView / TextKit 输入进入同一套 `EditorIntent`。
- iOS UI 不复制 core 领域规则。

检查点 CP-4：iOS 客户端基于 shared core 读写 fixture vault；macOS + iOS 都跑通后才进入 iPadOS。

### 阶段 5：iPadOS 适配

产物：

- 多栏布局、外接键盘快捷键、拖拽和 split view 行为。
- Pencil / selection 行为评估。
- 大屏检查器和 Note 导航优化。

证明：

- iPad 尺寸截图或手动证据覆盖多栏、编辑、拖拽、检查器和设置。
- iPadOS 只适配产品表面，不分叉 core 语义。

检查点 CP-5：iPadOS 专项适配通过。

### 阶段 6：CLI、导入导出与端到端验证

产物：

- CLI `apiVersion` 信封与全局 I/O 契约。
- 稳定命令，覆盖 note / block show、search、insert、update、move、delete、tag / type / prop changes、export 和 diagnostics。
- List / search 命令的固定 TSV column order。
- 结构化对象和 diagnostics 的 JSON 输出。
- Markdown importer 与 `.json` / `.md` exporters。

证明：

- CLI 契约测试覆盖代表性读写。
- macOS / iOS 客户端和 CLI 消费同一套 DTO 词汇。
- README 记录公开 CLI / API / schema / file format 契约。

检查点 CP-6：macOS + iOS + CLI + mirror 在 fixture vault 上通过端到端验证。

### 阶段 7：其他平台评估

产物：

- 非 Apple 平台可行性报告：core binding、UI 技术、文件访问、同步传输和分发边界。

证明：

- 不要求实现完整客户端，只要求证明 core ABI 和同步传输层是否足够支撑后续平台。

检查点 CP-7：其他平台可行性报告产出后，再决定是否进入下一平台。

---

## 12. 验收与验证

验收结果：

- `anchor-core` 可确定性地 create、replay、validate、merge、import 和 export Note / block trees。
- 每条持久写入路径都经过 validated dispatch，并在 materialization 前 append op-log。
- `anchor-editor-core` 可把首期编辑行为表示为 `EditorIntent`；`anchor-core::dispatch` 负责校验、创建 op，并返回可回放的 `EditorPatch`。
- macOS UI 和 iOS UI 暴露 Note / block 导航、编辑、检查器、设置和状态表面。
- macOS / iOS text surface 只保存 transient selection、focus、composition 和 view state（见 §4.2）。
- Settings UI 暴露主题切换、字体选择、排版调整和重置入口；平台实现不同，设置语义一致。
- Apple 客户端通过 shared core binding 读写 fixture vault。
- CLI 可通过文档化结构契约 read / search / update / move Note / block。
- Markdown / JSON mirror files 由 post-commit job 从真理层生成，并可重建；mirror 失败可见但不回滚 op-log。

验证命令：

- 在 `suites/anchor` 运行 `cargo test -p anchor-core`。
- 在 `suites/anchor` 运行 `cargo clippy -p anchor-core --all-targets`。
- macOS 和 iOS 的实际 `xcodebuild` 命令在 Apple 工程创建后确定；CP-0 已给出命令骨架（见 workbench `stage-1-spike-plan.md` / `apple-verification.md`）。

手动 / artifact 证据：

- 阶段0交互契约基于 fixture set 通过复查。
- Apple binding spike 记录。
- `anchor-editor-core` spike 记录，覆盖 selection、intent、patch、undo inverse intent 和 validation error。
- macOS 和 iOS 主要外壳状态截图与编辑器输入 / patch 回放证据。
- Settings 主题 / 字体 / 排版证据。
- CLI read / search / write commands 的输出快照。
- Mirror parity report，比较 structured search 与 exported `.md` 上的 ripgrep。

必须成立的不变量：

- Core 写入路径是单一 dispatch 入口（首期建立并守住）。
- 编辑器写入路径从 `EditorIntent` 进入 core dispatch。
- 本地 UI / CLI stale guard 使用 touched target/register base rev；同步 ingestion 进入 merge pipeline。
- 被触碰 workspace / target 的本地检查通过。
- Exported mirror 支持 CLI read / search workflows。
- 已有 Markdown vault 内容在 frontmatter id 存在或缺失时都可作为来源材料导入（缺失时创建新 Note）。

排除的兼容性目标：

- 与 note-centric route 的行为 parity。
- Markdown byte-for-byte 保真。
- 任何既有视觉主题的精确 parity。
- 与 Note / block DTO 冲突的既有 payload 兼容性。

---

## 13. 风险与暂停条件

风险与约束：

- **核心被 Apple UI 绑死**：SwiftUI / AppKit / UIKit 容易把状态、选择和操作规则吃进 view model。约束方式是所有持久更改通过 §8.5 的 core dispatch 生成 op，Apple view model 只表达 UI 状态和意图。
- **TextKit 被误当模型**：NSTextView / UITextView / TextKit 容易从输入和排版底座变成隐藏文档模型。约束方式是 TextKit 只承担输入、layout、selection 和 hit testing；持久语义来自 `EditorIntent`、core op 和 materialized projection（见 §4.2）。
- **文本壳架构漂移**：围绕“打开一篇 Markdown 文本”组织的交互惯性会把产品表面拉向 note-centric 形态。约束方式是首期产品表面以结构化 Note / block 为单位设计，非法树状态由 core 校验拒绝。
- **Binding 成本低估**：Rust core 到 Apple 的 ABI、错误类型、异步、内存和二进制分发是真实成本。约束方式是阶段1先做 binding spike，再进入客户端实现。
- **同步传输污染 core**：CloudKit / 文件协调 / object store 都容易把 record shape、zone、account state、file-coordination 语义泄漏进领域模型。约束方式是同步只经 core 定义的传输无关 `OpSyncPort`（仅 SegmentId / BlobId + 字节），具体适配器（首期 iCloud Drive，二期 CloudKit / 中立 object-store）在 core 之外实现，op-log 和 merge 语义不依赖任何一种传输。
- **平台编辑器分叉语义**：macOS / iOS / 后续客户端编辑器可能各自解释结构编辑。约束方式是平台 adapter 只产出 `EditorIntent`，结构合法化和 op creation 在 `anchor-core::dispatch` 收敛。
- **跨 block 选择低估**：跨 text surface 的连续选择、IME、undo 和 accessibility 可能远比单块编辑复杂。约束方式是首期先支持单块文本选择、block 选择和嵌入编辑器选择，跨 block 文本选择必须通过 spike 后再进入能力范围。
- **Mirror 可信度缺口**：grep-friendly export 可能落后真理层。约束方式是让 mirror freshness 可见且可测试。
- **DTO 抖动**：Apple 客户端可能跑在 core shape 前面。约束方式是在广泛 UI 工作前冻结阶段0 DTO 草图。

出现以下情况时暂停并让用户决策：

- 产品范围扩展到实时多人协作或 CRDT 存储模型（会改变 storage 和 editor 假设）。
- 出现真实（非 fixture）AI agent 集成或 proposed-change 能力需求（引入非 dispatch 写入路径与新的权限 / 策略 DTO）。
- Package / workspace / Apple project 边界需要改变。
- Rust core 无法以可接受成本进入 macOS / iOS。
- 同步路线需要在 iCloud / CloudKit、纯本地文件、用户自管目录或其他传输层之间做产品级选择。
- 某个 UI 要求无法映射到 core Note / block / op concepts，或某个目标编辑器行为要求持久化平台 editor state。
- 跨 block 文本选择无法在 Apple 原生 text surface 上稳定处理 selection、IME、undo 和 accessibility。
- 导入现有内容需要做超出已记录 Markdown 限制的数据丢失选择。
- CLI 契约需要暴露阶段0 DTO 草图未覆盖的新公开 schema。
- 其他平台被提前要求进入首期实现范围。

当本文档已经把 Anchor 定义为 Apple 原生优先、Note 原生、核心平台无关的产品，给出有序实现阶段、验证证据和暂停条件，并明确实现仍待单独授权时，本规划任务完成。
