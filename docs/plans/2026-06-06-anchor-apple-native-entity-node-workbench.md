# Anchor 方案：Apple 原生优先的实体 / 节点知识工作台

日期：2026-06-06
状态：新项目方案（Apple 原生客户端优先；核心平台无关；实现待单独授权）

> 规划记录（历史记录，非当前接口契约）。实现后，权威且稳定的 CLI / API / schema / file format 契约归 `anchor-core` 包 README。
>
> 本方案把 Anchor 定义为新项目：产品对象、交互行为、平台路线、编辑器、存储真理层、同步边界和 CLI 契约一起设计。首期产品形态、UI 行为、数据契约和实现都以本方案为准。

---

## 1. 背景与问题

Anchor 的核心对象不是文件，也不是 Markdown 文本，而是可引用、可移动、可嵌套、可投影、可合并的知识节点树。

决定性约束是容器嵌套与结构化语义：代码节点、表格、callout、embed、diff、schema 字段和引用关系都需要作为一阶节点存在。列表缩进与代码缩进不能共享 Markdown 行首空格这一条通道；行内引用也不能被压回文本 token 后再由多个层各自解释。

产品也必须跟着改变。一个子节点被打 tag 后可以成为实体，引用指向稳定 `NodeId`，props / class 是 schema 节点，backlinks 与 mirror 是派生结果。若 UI 仍围绕“打开一篇 note 文本”组织，核心模型会被旧交互反向挤压。

平台同样必须改变。既然首期路线是 macOS + iOS，首期产品应围绕 Apple 原生交互和共享 core 设计，而不是套一个跨平台壳。

---

## 2. 目标与核心决策

交付一个实体 / 节点原生的 Apple 本地知识工作台：用户在 macOS 和 iOS 原生客户端浏览、编辑、重组、引用和投影节点树；`anchor-core` 以 append-only op-log 作为真理层；Apple UI 只负责原生呈现和输入；CLI 提供稳定、结构化的本地命令契约；Markdown / JSON 文件作为导入、导出和 grep 友好的派生镜像。长期目标是在不重写 core 语义的前提下扩展到 iPadOS 和其他平台。

平台顺序：

1. macOS + iOS。
2. iPadOS 适配。
3. 其他平台最后再评估。

核心决策：

- 产品表面按实体 / 节点设计，首期 UI 是 Apple 原生 UI。
- 存储真理层采用 append-only op-log。
- 核心模型、操作语义、规范化、校验、replay、导入导出和同步逻辑必须平台无关。
- Apple 客户端可使用 SwiftUI / AppKit / UIKit 和原生系统能力，但 core 逻辑不绑定其中任何一个。
- CLI 是本地命令、诊断和导入导出的外部契约。
- 不建设 Anchor 自有云服务；同步传输优先验证用户自有 iCloud / CloudKit 路线，core 不直接依赖 CloudKit API。

高层非目标（细粒度排除见 §9）：

- 平台原生 UI 与任何后续客户端都不拥有业务真理；非法树状态由 core 校验防住，而不是靠 UI 提示。
- 不把未来其他平台的需求提前压到首期 Apple UI 上。

---

## 3. 平台路线

```text
共享核心：实体 / 节点模型、操作语义、规范化、校验、op-log、replay、导入导出、投影、同步合并
macOS / iOS：原生 UI + 原生系统能力
iPadOS：在 iOS 基础上适配多栏、键盘、拖拽、外接显示和 Pencil 等平板工作流
其他平台：最后评估，依赖 core ABI 和同步传输边界是否已经稳定
```

核心判断：

- UI 可以平台化；核心必须平台无关。
- 若选择 iCloud / CloudKit 作为 Apple 传输层，op-log 仍是真理层，CloudKit 只是同步传输 / 存储适配器。

---

## 4. 产品模型

### 4.1 用户可理解对象

**实体** 是可被打开、搜索、补全、出现在最近活动和被引用的对象。任意 node 只要满足实体派生谓词，或被系统 projection 作为工作根暴露，就以实体行为进入产品表面。

**节点** 是编辑、移动、引用、合并和投影的原子结构单元。用户可以选中、移动、嵌套一个节点，给它加 tag / class / props，也可以把它 transclude 到别处。

**块** 是节点在编辑器里的可视单位。常见块包括 `paragraph`、`heading`、`list-item`、`quote`、`callout`、`code`、`math`、`table`、`row`、`cell`、`embed`、`file`、`divider`、`diff` 和 `unsupported`。

**行内内容** 是节点内容中的文本与 mark 集合。行内 mark 包括装饰 mark（bold、em、code 等）和注解 mark（link、ref、mention、tag 等）。

**PropDef / Class** 是一阶 schema 节点。字段定义、类型约束、class 归属和 relation 值由 core 管理，不以文本约定或前端局部状态存在。

**投影视图** 是从 op-log replay 和节点树派生的视图，包括搜索、backlinks、最近活动、每日视图、schema views、mirror 文件和 CLI 可读输出。

### 4.2 用户不需要理解的对象

`rev`、HLC、LWW register、canonical serialization、SQLite materialized state、mirror freshness token、SwiftUI / AppKit / UIKit view identity、editor framework key 都是内部对象。UI 可以展示状态和错误，但不把这些词作为普通编辑流程的主概念。其中**平台 selection / TextKit range / view identity 永不进入持久化**，是后续多处约束的统一归属点。

### 4.3 产品不变量

- 用户编辑的是结构化节点树，不是 Markdown 文本。
- 用户看到的引用目标来自稳定 `NodeId` 的解析结果。
- 普通 node 都有 `parent`；归属关系统一用 `parent / order` 表达。
- `Library` 和 `Calendar` 是系统内置 node，不是特殊 location 类型。
- 节点的位置、内容和生命周期是不同寄存器。
- backlinks、搜索、最近活动和 mirror 都是派生视图。
- 所有写入通过 core `dispatch` 形成结构化 op；UI 层只表达意图，不直接修补持久化状态。
- 平台原生 UI 与后续任何客户端都不拥有业务规则。

---

## 5. 信息架构

主界面由四个稳定区域组成，具体呈现随平台变化：

1. **主导航**：进入主工作区的全局入口，由顶部固定入口、中间目录区和底部系统区组成。
2. **导航区**：当前入口下的可扫描列表或树，例如搜索结果、今日列表、实体列表、tag tree、Library children 或 schema classes。
3. **工作区**：主编辑 / 阅读 / 对比区域。默认显示一个实体的节点树，也可显示搜索聚焦结果、今日视图、schema 编辑器或设置工作区。
4. **检查器**：当前实体 / 节点 / 选择区的属性、引用、backlinks、class、schema、状态和动作。

平台映射：

- macOS 默认采用多栏工作台：主导航 + 导航区 + 工作区 + 可折叠检查器。
- iOS 默认采用层级导航：列表 / 搜索 / 工作区 / 检查器分层进入，避免把桌面多栏直接压进小屏。
- iPadOS 在 iOS 基础上打开多栏、键盘导航、拖拽、分屏和外接键盘工作流。

主导航结构：

```text
搜索
今日
实体

---
Pinned nodes
Recent
Tag tree

---
Library
Schema
Trash
设置
```

顶部固定入口：

- **搜索**：全局搜索入口，面向实体、节点、引用、props、tags 和正文内容。
- **今日**：每日工作视图，打开或创建当天 journal node；journal 归属在系统 `Calendar` node 下的 year / month / week / date 层级中。
- **实体**：全局实体入口，用于按最近、名称、类型、tag、class 或 relation 查找所有满足实体谓词的节点。

中间目录区：

- **Pinned nodes**：用户固定的实体 / 节点入口，顺序由用户控制；固定是导航偏好，不改变节点 parent / order。
- **Recent**：最近打开或编辑的实体 / 节点，是本地派生视图，不等于 op-log 变更审阅。
- **Tag tree**：完整 tag tree，由 tag / supertag / class schema projection 派生，展示 tag 层级、计数和进入对应实体 / 节点集合的入口。它不是文件夹树，也不拥有存储结构。

底部系统区：

- **Library**：系统 `Library` node 的直接 children；它是普通内容默认归属路径，不要求每个 child 都满足实体谓词。
- **Schema**：Schema 配置入口，主要管理 supertag、class、PropDef、relation 和显示规则。
- **Trash**：`life = trashed` 的节点 / 子树入口，支持查看、恢复和最终删除；它不是普通导航目录，不改变原 parent / order 语义。
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
- **节点选择**：选中一个或多个完整节点，作用于 move、delete、duplicate、wrap、tag、class、props、copy link、transclude。
- **嵌入编辑器选择**：代码节点内的局部编辑器选择，仅作用于 code payload；跨出代码节点时回到外层节点选择。

选择边界必须可预测：

- 点击正文进入文本选择。
- 点击块 handle / 原生选择控件进入节点选择。
- `Esc` 从嵌入编辑器回到节点选择，再回到工作区焦点。
- `Cmd+A` 在代码节点内先只选择代码内容；再次触发才提升到节点或工作区选择。
- 跨节点文本选择允许形成一个编辑意图，但落盘前必须被 core normalizer 拆成合法 node op。

首期只承诺单块文本选择、节点选择和嵌入编辑器选择；跨节点文本选择作为独立 spike，待 selection、IME、undo 和 accessibility 验证可控后再进入能力范围。

### 6.2 结构编辑

结构编辑以 node op 为结果：

- `Enter` 拆分当前文本节点。
- `Shift+Enter` 产生行内软换行。
- 空 paragraph 上 `Backspace` 合并或删除当前节点，遵守 parent 和 sibling 规则。
- 空 `list-item` / `quote` 上 `Enter` 退出容器为普通 paragraph，而不是继续拆分。
- `Tab` / `Shift+Tab` 调整当前节点的 parent / order（reparent / reorder，不是文本缩进）。
- ordered list 序号由 normalizer / projection 维护，不作为存储值。
- 拖拽 handle 产生 move op，不改内容寄存器。
- 命令菜单产生 insert / wrap / transform 意图，包括插入代码块。
- 粘贴先进入 importer / normalizer，再形成节点树片段。
- Transform（paragraph → heading、paragraph → callout 等）必须保留 node id 和可保留的行内 marks。

非法结构在最早可确定的位置被拒绝：UI 可提前禁用明显非法动作，平台编辑器 adapter 可提供即时反馈，core 校验是最终关卡。

### 6.3 嵌套容器

`list-item` 是容器。code、table、callout、embed、file、diff 等块可作为 `list-item` 的子节点存在。列表缩进、代码缩进和容器嵌套由 node parent / order 表达，不由文本行首空格表达。

代码节点内部使用平台专属代码编辑 adapter。Apple 首期只要求能稳定编辑 code payload、language、fold state 和局部选择，不要求引入特定前端代码编辑器；代码节点不拥有外层节点树。

Table / Row / Cell 是一阶可合并节点。表格操作包括插入 / 删除 / 移动行列、单元格内容编辑和表格选择。表格不以 Markdown pipe 文本作为编辑真理。

### 6.4 实体行为

实体谓词不由 `parent.is_none()` 推导。普通 node 都挂在某个父节点下；是否以实体行为进入产品表面由 tags / class / 显式实体标记 / 系统 projection 决定，阶段0冻结具体谓词。

满足实体谓词的节点：

- 在全局搜索和实体补全中可见。
- 可被打开为工作区 root。
- 可进入最近活动。
- 可被 `[[ ]]`、`@mention`、relation prop 或 embed 引用。

从父实体中打开子实体时，UI 显示来源上下文和 breadcrumb；用户可以回到原父树，也可以以该子实体为工作根继续编辑。

### 6.5 引用与反向链接

所有引用保存稳定 target id。UI 展示解析后的标题、摘要、类型、状态和上下文；被引节点改名不改变引用方 rev。

引用类型保留语义差异：

- `[[entity]]` 表达实体 / 节点引用。
- `#tag` 表达 tag / class-like discovery。
- `@mention` 表达 person / actor mention。
- relation prop 表达 typed edge。
- embed 表达 transclusion。

Backlinks 和 unlinked mentions 是派生视图；用户可从 backlink context 创建 structured ref op。

### 6.6 属性、class 与模式

检查器是 props / class 的主入口；inline chips 和命令菜单是快速入口。PropDef / Class 的定义由 schema 工作区管理。

实例只保存 id-keyed prop values 和 class refs。类型校验、relation 目标校验、默认值、显示标签和排序由 core schema projection 提供。

### 6.7 命令表面

命令系统分三层：

- **局部命令菜单**：当前编辑器选择区的局部结构命令。
- **全局命令面板**：跨工作区的打开、创建、搜索、切换和导出。
- **上下文菜单**：当前节点 / 实体 / 选择区的可用动作。

无法形成合法 op 的命令不进入 dispatch。

### 6.8 失败状态

UI 必须一等呈现以下状态：

- unsupported node：可读、可移动、可复制 id，不允许破坏性编辑 payload。
- newer schema：提示当前客户端只支持部分操作。
- 校验错误：显示被拒绝动作、目标节点和可恢复路径。
- replay conflict：显示冲突 register、winning op、losing op 和用户可采取动作。
- stale mirror：显示 mirror 落后于 op-log 的状态，不影响真理层编辑。
- blob 缺失 / 超限：可读占位，不破坏引用节点。
- sync / rebuild error：保留当前可读物化态，阻止危险写入，提供 rebuild / export diagnostic。

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
- normalize 与 clamp 精度：非有限数值回到默认值；越界有限数值被 clamp 到字段上下限；类型不符的值（如字符串）被忽略并保留默认值；未知字体被丢弃。
- 字体和排版进入外观 store，一键重置恢复默认值。主题与排版可以是两个独立 store，Apple 侧可统一，但主题的 `system → light/dark` 解析保持独立关注点。
- 字体调整必须即时生效，不要求重启或重建文档模型。
- 阶段0 决定字体来源：随包内置一组跨平台一致字体，还是枚举原生 OS 字体（后者会改变“未知字体被丢弃”的含义）。

---

## 8. 架构

### 8.1 责任边界

**`anchor-core` 负责真理层、共享模型与不变量：**

- Node / Entity / Inline / PropDef / Class / BlobRef 模型。
- 规范序列化与 hash、校验与规范化。
- Append-only op-log、HLC / LWW merge、replay 与物化节点树。
- SQLite projections 或等价本地 projection（派生、可重建，不是真理归属方）。
- 导入 / 导出 / mirror 生成。
- Dispatch 与结构化 op 创建、同步合并逻辑。
- CLI DTO、Apple binding DTO、后续客户端 DTO 与 schema version envelope。

首选继续把 Rust core 作为平台无关核心；Apple binding 机制（C ABI、UniFFI、Swift Package、XCFramework 或其他）在阶段0决定。

**客户端 ↔ core 传输：** Apple 客户端通过进程内 binding 直接调用 core，不经网络。`anchor serve` + `/rpc` op 信封作为可选的本地开发 / 测试传输保留，与 CLI、Apple binding 共享同一 op registry、DTO 词汇和同一 dispatch 入口——它是 localhost 开发工具，不是产品同步通道。所有传输面只是 dispatch 的外壳。

**Apple 客户端负责原生产品表面：**

- macOS / iOS / iPadOS 的窗口、导航、菜单、输入、拖拽、快捷键、分享、文件、安全权限和系统外观。
- 原生编辑器 surface、原生 Settings。
- 原生离线存储位置、文件访问、iCloud / CloudKit 传输适配器。
- 对 core DTO 的展示、错误呈现和交互状态。

Apple 客户端不复制 core 领域规则。它可以预检明显 UI 约束，但 core 校验始终是权威关卡。

**`anchor-editor-core` 负责无 UI 的编辑语义层。** Swift 生态没有可直接承担 Anchor 结构化语义的编辑 runtime；方案不寻找完整替代品，也不自研通用编辑框架，而是要一个专用、无 UI、平台无关的编辑器核心，把用户编辑意图收敛成 core 可验证的结构化 op。它可以是 `anchor-core` 内部模块或紧邻 core 的独立 crate（阶段0决定），不拥有持久化真理层：

- `EditorSnapshot`：面向编辑器的节点树投影。
- `BlockProjection`：节点到可编辑块 / 嵌入块 / 装饰块的投影。
- `InlineRun`：文本和 typed range marks 的显示与命中测试片段。
- `EditorSelection`：文本选择、节点选择、嵌入编辑器选择的可移植表示。
- `EditorIntent`：insert text、replace range、split block、merge backward、exit-container-on-empty、indent / outdent（reparent）、move node、transform block、apply mark、insert code block、paste fragment。
- `EditorPatch`：core 接受事务后返回给平台 adapter 的最小视图更新。
- `TransactionResult`：changed ids、selection hint、validation error、new revisions、projection freshness，以及 base-revision 冲突和 server-canonicalized body 替换两种结果。

`anchor-editor-core` 拥有结构 transform、选择提升 / 降级规则、paste fragment normalizer、跨节点文本编辑拆分、非法结构拒绝和 undo 语义映射。

**Apple 编辑器 adapter 负责原生输入视图机制。** 把 NSTextView / UITextView / TextKit / 原生键盘事件转换为 `EditorIntent`，把 `EditorPatch` 转换为原生 view model 更新；负责节点树渲染、文本 / 节点选择、transform 意图提取、代码节点局部编辑器、表格交互和编辑器专项测试。

TextKit、`NSTextView` / `UITextView`、`NSAttributedString` / `AttributedString`、`NSTextRange` / `NSRange`、平台 selection、view identity、滚动 / 焦点 / IME state 只作为输入、排版、显示和命中测试机制，不作为存储格式或文档模型；`anchor-editor-core` 同样不拥有它们。

首期 Apple 编辑器采用 block list 形态：paragraph、heading、quote、list-item 等文本块使用原生 text surface；code、table、embed、file、callout、diff 等节点使用独立原生节点 view。SwiftUI 负责外壳和状态组合，AppKit / UIKit 负责具体文本输入面；不用 SwiftUI `TextEditor` 作为主编辑器，不用一个巨大 `NSTextView` 加隐藏分隔符伪装节点树，也不自研完整文本渲染引擎。Undo 接 `NSUndoManager`，但 undo 动作 dispatch inverse intent / op，不直接改 TextKit buffer。

**CLI 负责本地命令契约：**

- 带 `apiVersion` 信封的稳定命令。
- 全局 I/O 契约：vault 解析（`--vault` / `$ANCHOR_VAULT` / 向上发现）、`--format tsv|json`、`--fields`、`--limit`、`--count`，固定退出码（0 ok、1 usage、2 not_found、3 conflict、4 blocked、5 vault_not_open、6 io）。
- 结构化节点 / 实体读取、通过 core op dispatch 的结构化写命令、面向 replay / mirror / schema / 校验状态的诊断命令。

### 8.2 数据模型

实体是文档分区，由一个入口节点和它可见的节点森林表示。内部节点存放在扁平 `BTreeMap<NodeId, Node>` 中；树形结构来自 `parent` 和 `order`。普通 node 不使用特殊 location 类型；归属统一表现为父节点关系。

节点字段：

- `id`：创建时一次铸造的随机 nanoid。
- `parent`：父 `NodeId`。普通 node 必须有父节点；系统 root anchoring 由阶段0决定，但产品模型只暴露受保护的系统 node。
- `order`：确定性的 fractional-index key。
- `content`：以 `kind` 为 key 的标签联合。
- `props`：id-keyed typed values，指向 PropDef 节点。
- `tags`：class / tag refs。
- `rev`：`blake3(canonical_serialize(self))`。
- `lww`：排除在 `rev` 外的寄存器元数据。

系统内置 node：

- `Library`：普通内容的默认系统父节点。用户把节点“挪到 Library”时，本质是把该节点 reparent 到系统 `Library` node 下。
- `Calendar`：journal 的默认系统父节点。创建 journal 时，系统保证 `Calendar -> year -> month -> week -> date` 层级存在；这些层级也是普通 node，可以复用相同的 `parent / order`、projection、权限和恢复规则。
- `calendar_date`：journal date node 的隐藏属性，用于日期查询、跳转、去重和 today projection。它不拥有归属语义，归属仍来自 `parent / order`。

阶段0必须冻结系统 node 的稳定 id / slug、创建顺序、保护规则、是否允许用户重命名、是否允许移动，以及 restore / trash 对系统 node 子树的边界。

行内内容是纯文本加排序、合并后的 typed range marks。行内 offset 对外以 UTF-16 code unit 表达（对齐 Apple TextKit / Swift String bridging 与后续客户端编辑器边界）；core 内部存储单位与换算边界在阶段0定下，导入既有 byte-offset span 时一并转换。硬节点边界创建新节点；`\n` 是行内文本中的软换行。

内容类型：

- 行内容器：paragraph、heading、quote、callout、list-item。
- 叶子 / 装饰节点：code、math、embed、file、divider、diff。
- 表格：table、row、cell。
- Schema：prop-def、class。
- 兼容载体：带 `min_schema` 和无损 payload 的 unsupported。

附件是内容寻址 blobs。节点只存 `BlobRef`；单附件上限 64MB，由 dispatch 在写入前校验并以独立失败态拒绝超限。

### 8.3 规范序列化与修订

`canonical_serialize` 是显式确定性编码器，遵循 JCS 风格规则：递归排序 key、固定字符串转义、无无意义空白。Hash 输入禁止 `f64`；数字值使用规范十进制字符串。

`rev` 覆盖 `{id, parent, order, content, props, tags}`，排除 `lww`，只覆盖自身，不是 Merkle hash。`Entity.revision` 是派生的子树 hash，用作乐观并发 token。

### 8.4 合并、同步与 op-log

真理层是 append-only op-log。物化本地 state、`.json` mirror 和 `.md` mirror 都是 replay 输出。

每个节点有三个 merge registers：

- `location`：parent + order。
- `content`：content + props + tags。
- `life`：生命周期枚举 `active / archived / trashed / deleted`，保留 archive 与 trash 的区分以及可逆 restore；`deleted` 是终态 tombstone。

每条 op 记录 `{node_id, register, base_rev, new_rev, hlc, actor}`，并预留 `provenance` 与 `approvalState` 字段以承载导入来源和日后 agent 审批语义（见 §9 排除）。合并按 node id 进行，用 HLC `(wall, logical, device)` 做字段级 LWW。Move-vs-edit 同时保留两边更改；删除会级联 tombstone 整个子树；edit-vs-delete 采用 delete-wins。

**Compaction：** op-log 纯追加会无界增长，冷启动会从创世 replay。阶段0定下定期物化快照 + 截断 / 分段策略，使 replay 从最近快照起算，并明确它与 HLC / merge 的交互。

**Vault 落盘布局：** 真理层 op-log 是被同步 / 版本化的核心产物（位置如 `.anchor/operations/`）；projection（SQLite，如 `.anchor/cache/index.sqlite`）是可从 op-log 重建的本地缓存，不进入同步；配置 `.anchor/config/vault.toml` 声明 `source_of_truth = "op-log"` 与 projection 路径。`.md` / `.json` 镜像是导出产物。阶段0确定：镜像的目录组织（实体 id 寻址 vs 人类可读路径）、镜像是否纳入版本库，以及被同步 / 提交的单元到底是 op-log 还是镜像。

Apple 首期同步路线：不建设自有服务器；优先验证 iCloud / CloudKit 作为用户自有同步传输层；CloudKit adapter 只负责传输 / 持久化，不拥有 merge 语义。

### 8.5 写入路径

所有写入进入单一 `dispatch`：

1. 接收 intent 或 CLI command。
2. 解析 ids 和 schema。
3. 规范化为 node ops。
4. 校验 tree invariants。
5. 比对 if-match：调用方传 `Entity.revision`（子树 hash）作为 token，不匹配返回 `Conflict`（退出码 3）。
6. 追加 op-log。
7. Replay / update materialized DB。
8. 原子写入派生 `.json` 和 `.md` mirror。
9. 返回包含 changed ids、new revisions 和 projection freshness 的 DTO。

单一已校验 dispatch 是首期要建立并守住的不变量：每条持久写入路径都调用执行 append 前校验的 core 私有 helper，对 core 写入点 grep 必须能证明这一点。

**提交节奏：** 阶段0决定每个 `EditorIntent` 是同步落一条 op，还是防抖 / 批量合并为 commit op——这决定 op-log 粒度与 replay / mirror 开销，必须在冻结 op 形状前定下。

### 8.6 导入、导出与镜像

Markdown 是导入 / 导出格式。Frontmatter `id` 在导入时定义实体身份；缺失时创建新实体。规范 `.json` 导出携带 node ids，支持幂等重导入；`.md` 导出是有损且 grep 友好的导出。

Mirror 生成发生在与 projection updates 相同的 post-dispatch 点。搜索和 backlinks 使用结构化 projection（SQLite FTS 或 replay 后内存索引，阶段0定）；对 mirror 跑 ripgrep 是本地检查便利，不是真理归属方。

---

## 9. 实现范围

包含：

- 新的 core 节点模型、op-log、replay、projections、sync merge 和 dispatch。
- Apple binding 边界设计。
- macOS 原生客户端、iOS 原生客户端。
- 代码节点、表格、引用、props / class 和 Settings 的平台化交互契约。
- 本地命令、诊断、导入导出的 CLI commands。
- Markdown importer 与 `.json` / `.md` exporters。
- 覆盖确定性序列化、replay、merge、import / export、编辑器身份和 core 写入校验的正式测试。

排除：

- 首期非 Apple 客户端；独立 Web 客户端整体后置：若未来进入实施，作为独立客户端通过 WASM 或等价边界复用 core（可选 React / HeroUI / Lexical / CM6 作为界面与编辑 adapter），这些工具不拥有实体、节点、op、merge、schema、同步或存储语义。
- 首期 iPadOS 专项优化；iPadOS 在 macOS + iOS 跑通后进入。
- 实时多人协作、CRDT / Loro 实现。
- 应用内图谱工作区、图谱路由、图谱导航和图谱可视化。
- **应用内 AI agent / proposed-change 子系统**：agent 连接、agent 任务、transcript / timeline、权限模式、proposed-change 审批收件箱、`change` / `proposal` CLI 命令、`agent-spec` 配置。这是首期不移植的能力；数据层在 op 信封预留 `actor` / `provenance` / `approvalState`，使真实 agent 能力日后可在不迁移 op-log 的前提下接入。
- Markdown 字节保真。
- 与 note-centric routes / payloads / UI 行为保持兼容 parity（产品以实体 / 节点为原生模型，不承担向 note-centric 表面对齐的义务）。
- 把 SwiftUI / AppKit / UIKit 或任何具体 UI / 编辑器框架作为 core 语义拥有者。
- Workspace / package 重组，除非阶段0明确需要并另行授权。
- 将 Rust CLI 改写为 `@plimeor/command-kit`。
- 发布 packages。

CLI 词汇迁移：实体 / 节点 op 词汇替换现有 op registry。其中 show / search / tag / prop / diagnostics 可干净重词汇化；net-new 命令包括 MOVE（节点 reparent + fractional order）、EXPORT / IMPORT、CLASS（PropDef / Class schema）、PropDef-backed PROP 和真实 DELETE / tombstone。

---

## 10. 推荐路径

把 `anchor-core` 打造成平台无关核心，同时把首期产品客户端转向 macOS + iOS 原生。实现从产品与平台契约产物开始，因为平台路线决定 binding、存储、同步、编辑器 adapter 和 Settings 表面；随后先证明 core 的确定性行为，再构建 Apple 原生客户端。

主要权衡：Apple 原生首期会增加 Swift / Rust binding 与 Apple 工程成本，但它避免把产品体验锁进跨平台壳，也避免日后再从一个非平台无关的架构里反向拆出 core。考虑到 macOS + iOS → iPadOS → 其他平台的路线，这个代价值得。首期主要复杂度集中在 Apple 原生编辑器、core 绑定、`anchor-editor-core` 和同步适配器。

首期是全新构建：节点 id（随机 nanoid）、`blake3` + `canonical_serialize`、parent / order 节点树、register / HLC op-log、replay 引擎、单一已校验 dispatch 和 schema 节点都从零写起，没有可沿用的既有实现。授权后的第一个实现单元是阶段0。

---

## 11. 工作序列

### 阶段 0：平台、产品与契约基线

产物：

- 平台路线确认：macOS + iOS 首期，iPadOS 后续，其他平台最后。
- Apple 工程边界建议：工程位置、target、bundle、共享代码方式、验证命令。
- Rust core 到 Apple 的 binding 方案比较与推荐。
- iCloud / CloudKit 作为传输适配器的可行性 spike 计划；明确 core 不依赖 CloudKit API。
- `anchor-editor-core` 边界建议（内部模块或独立 crate），明确它不拥有持久化真理层。
- `EditorSnapshot`、`BlockProjection`、`InlineRun`、`EditorSelection`、`EditorIntent`、`EditorPatch`、`TransactionResult` 草图。
- 覆盖选择、结构编辑、实体行为、引用、props / class、命令、Settings 和失败状态的交互契约。
- macOS / iOS 信息架构草图。
- Entity、node、op、projection、search result、validation error、mirror status、settings 和 sync status 的 core DTO 草图。
- **关键技术决策确认**：客户端 ↔ core 传输边界、vault 落盘布局与同步单元、系统 node 稳定 id / slug、Library / Calendar 保护规则、journal Calendar 层级、`calendar_date` 隐藏属性、`life` 枚举 vs 单 tombstone、提交节奏与 op-log 粒度、op-log compaction、搜索 / backlinks 后端、blob 落盘与 cap 校验、UTF-16 / UTF-8 offset 换算边界、字体来源（内置 vs 原生枚举）。
- Fixture set 至少覆盖：系统 `Library` node、系统 `Calendar` node、journal 自动创建 `year / month / week / date` 层级、journal date node 的 `calendar_date` 隐藏属性、reparent 到 Library、嵌套 list item 内含代码、带行内引用的表格、打 tag 的子实体、unsupported node、relation prop、embed、conflict case、mirror stale case、settings case、sync case、单块文本选择、节点选择、嵌入编辑器选择和跨节点编辑拒绝 / 拆分 case。

证明：

- 手动设计复查确认每个用户可见 primitive 都能映射到 core 拥有的概念。
- 手动设计复查确认每个首期编辑行为都能映射到 `EditorIntent`，并能由 core 校验为合法 op 或明确拒绝。
- 没有 UI 行为要求 Markdown 字节真理或仅前端持久状态。
- Apple binding 选择有明确验证命令和失败条件。

检查点 CP-0：平台路线、Apple binding 方案、`anchor-editor-core` 合约、交互契约、信息架构、DTO 草图、关键技术决策和 fixture set 已批准。

### 阶段 1：确定性 core 探索验证

产物：

- `canonical_serialize` spike，证明跨运行 bytes 和 hash 稳定。
- Node id / fractional order spike。
- Op-log replay spike。
- HLC LWW merge spike，覆盖 move-vs-edit 和 edit-vs-delete。
- Export mirror vs structured projection parity spike，使用真实查询样例。
- Apple binding 最小调用 spike：Apple 侧能调用 core 读取 fixture entity。
- `anchor-editor-core` 选择 / 编辑事务 spike，覆盖 insert text、split block、merge backward、indent / outdent、transform block、apply mark、paste fragment、undo inverse intent 和 validation error。
- Apple text surface spike：证明 NSTextView / UITextView / TextKit 事件可转换为 `EditorIntent`，`EditorPatch` 可回放到原生 view model。

证明：

- `cargo test -p anchor-core` 把 spike case 落成正式测试。
- Apple binding spike 有可重复命令或 Xcode scheme。
- 编辑器 spike 报告列出单块文本选择、节点选择、嵌入编辑器选择和跨节点选择的通过 / 失败证据。
- Spike 报告列出任何必须调整的模型点。

检查点 CP-1：确定性 core、Apple binding 和编辑器事务 spike 作为正式验证通过；通过前不实现持久应用写入。

### 阶段 2：`anchor-core` 地基

产物：

- Core node model、validation 与 normalization。
- Append-only op-log、replay materialization。
- SQLite projection 或等价本地 projection。
- 单一 `dispatch` 写入路径与 if-match 校验。
- 原子 `.json` / `.md` mirror writer。
- Importer 与 exporter。
- Apple binding DTO、CLI DTO。
- `anchor-editor-core` 的 snapshot / selection / intent / patch / transaction result 类型、编辑事务 normalizer 和 transform reducer。
- 同步传输适配器接口。

证明：

- 每条持久写入路径都经过 validated dispatch。
- 从空状态 replay op-log 可重建同一棵 materialized tree。
- Import → export → import 保留 canonical JSON ids 和 hashes。
- 编辑器事务通过 core 校验生成 op；平台 selection、TextKit range 和 view identity 不进入持久化。
- Apple binding 可以读取、写入、replay fixture vault。

检查点 CP-2：core dispatch、op-log replay、projection、`anchor-editor-core`、同步适配器接口和 CLI DTO 契约稳定到足以支撑 macOS / iOS 集成。

### 阶段 3：macOS 原生客户端

产物：

- macOS 原生 app shell；主导航、导航区、工作区、检查器。
- 实体 / 节点读取和基础编辑。
- Block list 编辑器 adapter，覆盖单块文本编辑、节点选择、结构命令、代码节点和表格节点的最小可用交互。
- Settings 工作区：主题切换、字体选择、排版滑杆和重置排版。
- 文件 / vault 打开流程；CLI 安装或诊断入口。

证明：

- macOS target 的构建命令通过。
- 截图或手动证据覆盖默认工作区、搜索、今日、实体、Pinned nodes、Recent、Tag tree、Library、Schema、Trash 和设置。
- 编辑器证据覆盖 NSTextView / TextKit 输入进入 `EditorIntent`，`EditorPatch` 回放到原生视图。
- Settings 证据覆盖 system / light / dark 切换、字体选择、字号调整和重置排版。
- 没有 macOS UI 代码绕过 core dispatch 写入。

检查点 CP-3：macOS 客户端基于 shared core 读写 fixture vault。

### 阶段 4：iOS 原生客户端

产物：

- iOS 原生 app shell；小屏层级导航。
- 实体 / 节点读取和基础编辑。
- iOS text surface adapter，语义与 macOS 对齐。
- Settings 工作区，语义与 macOS 对齐。
- 本地存储、权限、分享、文件导入导出路径。
- 若阶段0选择 CloudKit，则接入最小同步 adapter。

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
- 大屏检查器和实体导航优化。

证明：

- iPad 尺寸截图或手动证据覆盖多栏、编辑、拖拽、检查器和设置。
- iPadOS 只适配产品表面，不分叉 core 语义。

检查点 CP-5：iPadOS 专项适配通过。

### 阶段 6：CLI、导入导出与端到端验证

产物：

- CLI `apiVersion` 信封与全局 I/O 契约。
- 稳定命令，覆盖 entity / node show、search、insert、update、move、delete、tag / class / prop changes、export 和 diagnostics。
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

- `anchor-core` 可确定性地 create、replay、validate、merge、import 和 export entity / node trees。
- 每条持久写入路径都经过 validated dispatch，并在 materialization 前 append op-log。
- `anchor-editor-core` 可把首期编辑行为表示为 `EditorIntent`，通过 core 校验生成 op，并返回可回放的 `EditorPatch`。
- macOS UI 和 iOS UI 暴露实体 / 节点导航、编辑、检查器、设置和状态表面。
- macOS / iOS text surface 只保存 transient selection、focus、composition 和 view state（见 §4.2）。
- Settings UI 暴露主题切换、字体选择、排版调整和重置入口；平台实现不同，设置语义一致。
- Apple 客户端通过 shared core binding 读写 fixture vault。
- CLI 可通过文档化结构契约 read / search / update / move nodes。
- Markdown / JSON mirror files 从真理层生成，并可重建。

验证命令：

- 在 `suites/anchor` 运行 `cargo test -p anchor-core`。
- 在 `suites/anchor` 运行 `cargo clippy -p anchor-core --all-targets`。
- Apple 工程创建后，阶段0补充 macOS 和 iOS 的实际 `xcodebuild` 命令。

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
- 被触碰 workspace / target 的本地检查通过。
- Exported mirror 支持 CLI read / search workflows。
- 已有 Markdown vault 内容在 frontmatter id 存在或缺失时都可作为来源材料导入（缺失时创建新实体）。

不要求保留：

- 与 note-centric route 的行为 parity。
- Markdown byte-for-byte 保真。
- 任何既有视觉主题的精确 parity。
- 与 entity / node DTO 冲突的既有 payload 兼容性。

---

## 13. 风险与暂停条件

风险与约束：

- **核心被 Apple UI 绑死**：SwiftUI / AppKit / UIKit 容易把状态、选择和操作规则吃进 view model。约束方式是所有持久更改通过 §8.5 的 core dispatch 生成 op，Apple view model 只表达 UI 状态和意图。
- **TextKit 被误当模型**：NSTextView / UITextView / TextKit 容易从输入和排版底座变成隐藏文档模型。约束方式是 TextKit 只承担输入、layout、selection 和 hit testing；持久语义来自 `EditorIntent`、core op 和 materialized projection（见 §4.2）。
- **回退到 note-centric 文本壳**：围绕“打开一篇文本”组织的交互惯性可能把实现拉回 note-centric 形态。约束方式是首期产品表面以实体 / 节点为单位设计，非法树状态由 core 校验拒绝。
- **Binding 成本低估**：Rust core 到 Apple 的 ABI、错误类型、异步、内存和二进制分发是真实成本。约束方式是阶段1先做 binding spike，再进入客户端实现。
- **同步传输污染 core**：CloudKit 容易把 record shape、zone、account state 泄漏进领域模型。约束方式是 CloudKit 只做 adapter，op-log 和 merge 语义不依赖它。
- **平台编辑器分叉语义**：macOS / iOS / 后续客户端编辑器可能各自解释结构编辑。约束方式是结构编辑意图和 normalizer 在 `anchor-editor-core` 边界收敛。
- **跨节点选择低估**：跨 text surface 的连续选择、IME、undo 和 accessibility 可能远比单块编辑复杂。约束方式是首期先支持单块文本选择、节点选择和嵌入编辑器选择，跨节点文本选择必须通过 spike 后再进入能力范围。
- **Mirror 可信度缺口**：grep-friendly export 可能落后真理层。约束方式是让 mirror freshness 可见且可测试。
- **DTO 抖动**：Apple 客户端可能跑在 core shape 前面。约束方式是在广泛 UI 工作前冻结阶段0 DTO 草图。

出现以下情况时暂停并让用户决策：

- 产品范围扩展到实时多人协作或 CRDT 存储模型（会改变 storage 和 editor 假设）。
- 出现真实（非 fixture）AI agent 集成或 proposed-change 能力需求（引入非 dispatch 写入路径与新的权限 / 策略 DTO）。
- Package / workspace / Apple project 边界需要改变。
- Rust core 无法以可接受成本进入 macOS / iOS。
- 同步路线需要在 iCloud / CloudKit、纯本地文件、用户自管目录或其他传输层之间做产品级选择。
- 某个 UI 要求无法映射到 core entity / node / op concepts，或某个目标编辑器行为要求持久化平台 editor state。
- 跨节点文本选择无法在 Apple 原生 text surface 上稳定处理 selection、IME、undo 和 accessibility。
- 导入现有内容需要做超出已记录 Markdown 限制的数据丢失选择。
- CLI 契约需要暴露阶段0 DTO 草图未覆盖的新公开 schema。
- 其他平台被提前要求进入首期实现范围。

当本文档已经把 Anchor 定义为 Apple 原生优先、实体 / 节点原生、核心平台无关的产品，给出有序实现阶段、验证证据和暂停条件，并明确实现仍待单独授权时，本规划任务完成。
