# Anchor 新项目方案：Apple 原生优先的实体 / 节点知识工作台

创建日期：2026-06-05
重写日期：2026-06-06
平台路线修订：2026-06-06
状态：新项目方案（Apple 原生客户端优先；核心平台无关；实现待用户单独放行）

> 规划记录（历史记录，非当前接口契约）。实现后，权威且稳定的 CLI / API / schema / file format 契约归 `anchor-core` 包 README。
>
> 本方案把 Anchor 当作新项目定义：产品对象、交互行为、平台路线、编辑器、存储真理层、同步边界和 CLI 契约一起设计。现有 repo 只提供可复用的工程容器、Rust core 线索和验证入口，不作为首期产品形态、UI 行为或数据契约的约束。

---

## 1. 澄清状态

当前目标明确：Anchor 以实体 / 节点为原生产品模型重启，平台路线参考用户给出的 Bear 思路：**原生继续原生，核心能力抽出来共享，后续客户端单独实现**。

首期平台顺序：

1. macOS + iOS。
2. iPadOS 适配。
3. 其他平台最后再评估。

关键授权：

- 产品表面按实体 / 节点重新设计。
- 旧的 note-centric 信息架构不作为约束。
- 首期 UI 是 Apple 原生 UI，不是跨平台外壳。
- 存储真理层采用只追加操作日志（append-only op-log）。
- 核心模型、操作语义、规范化、校验、replay、导入导出和同步逻辑必须平台无关。
- Apple 客户端可以使用 SwiftUI / AppKit / UIKit / 原生系统能力，但不能把 core 逻辑绑定进 SwiftUI / AppKit / UIKit。
- CLI 是本地命令、诊断和导入导出的外部契约。

当前保守边界：

- 不承诺实时多人协作。
- 不以 Markdown 字节保真为目标。
- 不让 UI、编辑器框架、SwiftUI、AppKit、UIKit 或任何平台组件成为业务真理源。
- 不把未来其他平台的需求提前压到首期 Apple UI 上。
- 不建设 Anchor 自己的云服务；同步传输层优先验证用户自有 iCloud / CloudKit 路线，core 不直接依赖 CloudKit API。

---

## 2. 平台路线

这次平台选择不是 UI 技术栈细节，而是整体架构约束。

正确路线是：

```text
共享核心：实体 / 节点模型、操作语义、规范化、校验、op-log、replay、导入导出、投影、同步合并
macOS / iOS：原生 UI + 原生系统能力
iPadOS：在 iOS 基础上适配多栏、键盘、拖拽、外接显示和 Pencil 等平板工作流
其他平台：最后评估，依赖 core ABI 和同步传输边界是否已经稳定
```

核心判断：

- UI 可以平台化；核心必须平台无关。
- Apple 首期不等于把业务逻辑写进 SwiftUI / AppKit。
- 如果选择 iCloud / CloudKit 作为 Apple 传输层，op-log 仍是 Anchor 真理层，CloudKit 只是同步传输 / 存储适配器。

未来 Web 客户端整体后置：它不是首期产品壳，也不是所有平台的最低共同 UI；如果进入实施，应作为独立客户端，通过 WASM 或等价边界复用 core，可选择 React / HeroUI / Lexical / CM6 等浏览器生态工具，但这些工具只负责界面与编辑 adapter，不拥有实体、节点、op、merge、schema、同步或存储语义。CloudKit Web API 或其他同步传输层只在 core 语义稳定后评估，不反向污染 core。

---

## 3. 背景与问题

Anchor 的核心对象不是文件，也不是 Markdown 文本，而是可引用、可移动、可嵌套、可投影、可合并的知识节点树。

决定性约束是容器嵌套与结构化语义：代码节点、表格、callout、embed、diff、schema 字段和引用关系都需要作为一阶节点存在。列表缩进与代码缩进不能共享 Markdown 行首空格这一条通道；行内引用也不能被压回文本 token 后再由多个层各自解释。

用户面对的产品也必须跟着改变。一个子节点被打 tag 后可以成为实体，引用指向稳定 `NodeId`，props / class 是 schema 节点，backlinks 是派生视图，mirror 文件是导出结果。若 UI 仍围绕“打开一篇 note 文本”组织，核心模型会被旧交互反向挤压。

平台也必须跟着改变。既然首期路线是 macOS + iOS，方案不能继续把旧客户端当作第一产品壳；首期产品应围绕 Apple 原生交互和共享 core 设计。

---

## 4. 目标

交付一个实体 / 节点原生的 Apple 本地知识工作台：用户先在 macOS 和 iOS 原生客户端中浏览、编辑、重组、引用和投影节点树；`anchor-core` 以 append-only op-log 作为真理层；Apple UI 只负责原生呈现和输入；CLI 提供稳定、结构化的本地命令契约；Markdown / JSON 文件作为导入、导出和 grep 友好的派生镜像存在。

长期目标是在不重写 core 语义的前提下扩展到 iPadOS 和其他平台。

---

## 5. 产品模型

### 5.1 用户可理解对象

**实体** 是可被打开、搜索、补全、出现在最近活动和被引用的对象。根节点天然是实体；任意节点只要满足实体派生谓词，也以实体行为进入产品表面。

**节点** 是编辑、移动、引用、合并和投影的原子结构单元。用户可以选中一个节点、移动一个节点、把一个节点嵌套到另一个节点下、给一个节点加 tag / class / props，也可以把一个节点 transclude 到别处。

**块** 是节点在编辑器里的可视单位。常见块包括 `paragraph`、`heading`、`list-item`、`quote`、`callout`、`code`、`math`、`table`、`row`、`cell`、`embed`、`file`、`divider`、`diff` 和 `unsupported`。

**行内内容** 是节点内容中的文本与 mark 集合。行内 mark 包括装饰 mark（bold、em、code 等）和注解 mark（link、ref、mention、tag 等）。

**PropDef / Class** 是一阶 schema 节点。字段定义、类型约束、class 归属和 relation 值由 core 管理，不以文本约定或前端局部状态存在。

**投影视图** 是从 op-log replay 和节点树派生的视图，包括搜索、backlinks、最近活动、每日视图、schema views、mirror 文件和 CLI 可读输出。

### 5.2 用户不需要理解的对象

`rev`、HLC、LWW register、canonical serialization、SQLite materialized state、mirror freshness token、SwiftUI identity、AppKit view identity、UIKit reuse identity、editor framework key 都是内部对象。UI 可以展示状态和错误，但不把这些词作为普通编辑流程的主概念。

### 5.3 产品不变量

- 用户编辑的是结构化节点树，不是 Markdown 文本。
- 用户看到的引用目标来自稳定 `NodeId` 的解析结果。
- 节点的位置、内容和生命周期是不同寄存器。
- backlinks、搜索、最近活动和 mirror 都是派生视图。
- 所有写入通过 core `dispatch` 形成结构化 op。
- UI 层只表达意图，不直接修补持久化状态。
- 平台原生 UI 不拥有业务规则；其他客户端以后也不拥有业务规则。

---

## 6. 信息架构

Anchor 的主界面由四个稳定区域 / 概念组成。具体呈现随平台变化：

1. **主导航**：进入主工作区的全局入口。默认入口包括今日、实体、搜索、Schema、变更、设置。
2. **导航区**：当前入口下的可扫描列表或树。例如实体列表、搜索结果、schema classes、pending changes。
3. **工作区**：主编辑 / 阅读 / 对比区域。默认显示一个实体的节点树，也可以显示搜索聚焦结果、schema 编辑器或变更审阅。
4. **检查器**：当前实体 / 节点 / 选择区的属性、引用、backlinks、class、schema、状态和动作。

平台映射：

- macOS 默认采用多栏工作台：主导航 + 导航区 + 工作区 + 可折叠检查器。
- iOS 默认采用层级导航：列表 / 搜索 / 工作区 / 检查器分层进入，避免把桌面多栏直接压进小屏。
- iPadOS 在 iOS 基础上打开多栏、键盘导航、拖拽、分屏和外接键盘工作流。

稳定导航目的地：

- 今日。
- 实体列表。
- 单个实体。
- 单个节点。
- 搜索。
- Schema。
- 变更。
- 设置。

路由或原生 navigation path 的参数使用 core DTO 中的 stable id。前端局部选择区、展开态、检查器 tab 和 transient command state 不进入持久数据契约。

### 6.1 Settings 必须包含外观控制

Settings 不再只是诊断与操作记录页。新 Settings 工作区必须吸收现有外观控制语义，并至少包含：

- 主题切换：system / light / dark。
- 字体选择：正文、标题、代码三类字体。
- 排版数值调整：字号、行高、行宽、段后距、首行缩进。
- 一键重置字体与排版设置。
- 诊断、操作记录、CLI 安装和其他系统设置可以作为同一 Settings 工作区下的独立分组存在。

Apple 客户端可以用原生控件呈现这些设置。设置语义必须共享，控件实现可以平台化。

---

## 7. 交互模型

### 7.1 选择模型

编辑器支持三层选择：

- **文本选择**：普通文本选择，作用于行内内容和 range marks。
- **节点选择**：选中一个或多个完整节点，作用于 move、delete、duplicate、wrap、tag、class、props、copy link、transclude。
- **嵌入编辑器选择**：代码节点内的局部编辑器选择，仅作用于 code payload；跨出代码节点时回到外层节点选择。

选择边界必须可预测：

- 点击正文进入文本选择。
- 点击块 handle / 原生选择控件进入节点选择。
- `Esc` 从嵌入编辑器回到节点选择，再回到工作区焦点。
- `Cmd+A` 在代码节点内只先选择代码内容；再次触发才提升到节点或工作区选择。
- 跨节点文本选择允许形成一个编辑意图，但落盘前必须被 core normalizer 拆成合法 node op。

### 7.2 结构编辑

结构编辑以 node op 为结果：

- `Enter` 拆分当前文本节点。
- `Shift+Enter` 产生行内软换行。
- 空 paragraph 上 `Backspace` 合并或删除当前节点，遵守 parent 和 sibling 规则。
- `Tab` / `Shift+Tab` 调整当前节点的 parent / order。
- 拖拽 handle 产生 move op，不改内容寄存器。
- 命令菜单产生 insert / wrap / transform 意图。
- 粘贴先进入 importer / normalizer，再形成节点树片段。
- Transform（paragraph -> heading、paragraph -> callout 等）必须保留 node id 和可保留的行内 marks。

非法结构在最早可确定的位置被拒绝：UI 可以提前禁用明显非法动作，平台编辑器 adapter 可以提供即时反馈，core 校验是最终关卡。

### 7.3 嵌套容器

`list-item` 是容器。code、table、callout、embed、file、diff 等块可以作为 `list-item` 的子节点存在。列表缩进、代码缩进和容器嵌套由 node parent / order 表达，不由文本行首空格表达。

代码节点内部使用平台专属代码编辑 adapter。Apple 首期只要求能稳定编辑 code payload、language、fold state 和局部选择，不要求引入特定前端生态代码编辑器；代码节点不拥有外层节点树。

Table / Row / Cell 是一阶可合并节点。表格操作包括插入行、插入列、删除行、删除列、移动行、移动列、单元格内容编辑和表格选择。表格不以 Markdown pipe 文本作为编辑真理。

### 7.4 实体行为

`is_entity(n) = !n.tags.is_empty() || n.parent.is_none()`。

满足实体谓词的节点：

- 在全局搜索和实体补全中可见。
- 可被打开为工作区 root。
- 可进入最近活动。
- 可被 `[[ ]]`、`@mention`、relation prop 或 embed 引用。

从父实体中打开子实体时，UI 显示来源上下文和 breadcrumb。用户可以回到原父树，也可以以该子实体为工作根继续编辑。

### 7.5 引用与反向链接

所有引用保存稳定 target id。UI 展示解析后的标题、摘要、类型、状态和上下文；被引节点改名不改变引用方 rev。

引用类型保留语义差异：

- `[[entity]]` 表达实体 / 节点引用。
- `#tag` 表达 tag / class-like discovery。
- `@mention` 表达 person / actor mention。
- relation prop 表达 typed edge。
- embed 表达 transclusion。

Backlinks 和 unlinked mentions 都是派生视图。用户可以从 backlink context 创建 structured ref op。

### 7.6 属性、class 与模式

检查器是 props / class 的主入口；inline chips 和命令菜单是快速入口。PropDef / Class 的定义由 schema 工作区管理。

实例只保存 id-keyed prop values 和 class refs。类型校验、relation 目标校验、默认值、显示标签和排序由 core schema projection 提供。

### 7.7 命令表面

Anchor 的命令系统分三层：

- **局部命令菜单**：当前编辑器选择区的局部结构命令。
- **全局命令面板**：跨工作区的打开、创建、搜索、切换和导出。
- **上下文菜单**：当前节点 / 实体 / 选择区的可用动作。

命令输出必须落到 core DTO，而不是只改变平台 UI 局部状态。无法形成合法 op 的命令不进入 dispatch。

### 7.8 失败状态

UI 必须一等呈现以下状态：

- unsupported node：可读、可移动、可复制 id，不允许破坏性编辑 payload。
- newer schema：提示当前客户端只支持部分操作。
- 校验错误：显示被拒绝动作、目标节点和可恢复路径。
- replay conflict：显示冲突 register、winning op、losing op 和用户可采取动作。
- stale mirror：显示 mirror 落后于 op-log 的状态，不影响真理层编辑。
- sync / rebuild error：保留当前可读物化态，阻止危险写入，提供 rebuild / export diagnostic。

---

## 8. 界面系统

### 8.1 Apple 原生优先

首期 UI 基座是 Apple 原生能力：

- macOS：使用原生窗口、菜单、快捷键、拖拽、文件对话框、系统外观、Spotlight / Share / Services 等系统能力时，不把业务逻辑放进 AppKit / SwiftUI view。
- iOS：使用原生导航、键盘、触控、选择、分享、文件能力和系统外观，不把 core 模型压缩成跨平台容器。
- iPadOS：复用 iOS 基础，但为多栏、拖拽、键盘、Pencil、Stage Manager 和外接显示优化。

### 8.2 Settings 外观逻辑

新 Settings 工作区应把外观设置拆成主题偏好、字体偏好和排版数值三组语义；平台可以用不同控件呈现，但字段含义、默认值、normalize 和 clamp 行为保持一致。

主题切换逻辑：

- 设置入口提供三段式主题切换：`system`、`light`、`dark`。
- 用户偏好类型是 `ThemeMode = 'system' | 'light' | 'dark'`；实际生效主题是 `Theme = 'light' | 'dark'`。
- 默认值是 `system`。
- Apple 客户端应把同一语义映射到原生 appearance / color scheme；具体持久化 key 由平台 settings store 决定，但 DTO 语义保持一致。

字体与排版逻辑：

- 外观设置包含三个字体选择器：正文 `textFont`、标题 `headingFont`、代码 `codeFont`。
- 字体选项首期可以平台化，但必须包含“系统默认”并明确哪些字体随包提供、哪些来自系统。
- Settings UI 使用五个数值控制：
  - `fontSize`：10-30，步进 1，单位 pt，默认 15。
  - `lineHeight`：1-2，步进 0.1，单位 em，默认 1.5。
  - `lineWidth`：32-130，步进 1，单位 em，默认 48。
  - `paragraphSpacing`：0-2，步进 0.1，单位 em，默认 0。
  - `paragraphIndent`：0-3，步进 0.1，单位 em，默认 0。
- 字体选择和数值控制都应进入一个单一外观 store；一键重置恢复默认值。
- 存储值必须 normalize 与 clamp：未知字体被丢弃，非法数值回到默认值或被限制在字段上下限内。
- Apple 客户端应把同一设置映射到原生编辑器 typography state。
- 字体和排版调整必须即时生效，不要求重启应用或重建文档模型。

---

## 9. 架构

### 9.1 责任边界

**`anchor-core` 负责真理层、共享模型与不变量。**

- Node / Entity / Inline / PropDef / Class / BlobRef 模型。
- 规范序列化与 hash。
- 校验与规范化。
- Append-only op-log。
- HLC / LWW merge。
- Replay 与物化节点树。
- SQLite projections 或等价本地 projection。
- 导入 / 导出 / mirror 生成。
- Dispatch 与结构化 op 创建。
- 同步合并逻辑。
- CLI DTO、Apple binding DTO、后续客户端 DTO 与 schema version envelope。

`anchor-core` 必须能被 Apple 原生客户端、CLI 和后续客户端复用。首选继续把 Rust core 作为平台无关核心；具体 Apple binding 机制（C ABI、UniFFI、Swift Package、XCFramework 或其他）在阶段 0 决定。

**Apple 客户端负责原生产品表面。**

- macOS / iOS / iPadOS 的窗口、导航、菜单、输入、拖拽、快捷键、分享、文件、安全权限和系统外观。
- 原生编辑器 surface。
- 原生 Settings。
- 原生离线存储位置、文件访问、iCloud / CloudKit 传输适配器。
- 对 core DTO 的展示、错误呈现和交互状态。

Apple 客户端不复制 core 领域规则。它可以预检明显 UI 约束，但 core 校验始终是权威关卡。

**`anchor-editor-core` 负责无 UI 的编辑语义层。**

Swift 生态没有成熟、可直接承担 Anchor 结构化语义的编辑 runtime；方案不在 Swift 里寻找一个完整替代品，也不自研通用编辑框架。Anchor 需要的是专用、无 UI、平台无关的编辑器核心，负责把用户编辑意图收敛成 core 可验证的结构化 op。

`anchor-editor-core` 可以是 `anchor-core` 内部模块，也可以是紧邻 core 的独立 crate；阶段 0 决定具体边界。无论放在哪里，它都不拥有持久化真理层，只负责编辑事务与结构化 intent：

- `EditorSnapshot`：面向编辑器的节点树投影。
- `BlockProjection`：节点到可编辑块 / 嵌入块 / 装饰块的投影。
- `InlineRun`：文本和 typed range marks 的显示与命中测试片段。
- `EditorSelection`：文本选择、节点选择、嵌入编辑器选择的可移植表示。
- `EditorIntent`：insert text、replace range、split block、merge backward、indent / outdent、move node、transform block、apply mark、paste fragment 等编辑意图。
- `EditorPatch`：core 接受事务后返回给平台 adapter 的最小视图更新。
- `TransactionResult`：changed ids、selection hint、validation error、new revisions 和 projection freshness。

`anchor-editor-core` 拥有结构 transform、选择提升 / 降级规则、paste fragment normalizer、跨节点文本编辑拆分、非法结构拒绝和 undo 语义映射。它不拥有 AppKit / UIKit selection object、TextKit range、SwiftUI state、平台 view identity、滚动位置、focus ring、输入法 composition state 或剪贴板 UI。

**Apple 编辑器 adapter 负责原生输入视图机制。**

- 节点树渲染。
- 文本选择与节点选择。
- transform 意图提取。
- 代码节点内的局部编辑器。
- 表格交互。
- 编辑器专项测试。

Apple adapter 把 NSTextView / UITextView / TextKit / 原生键盘事件转换为 `EditorIntent`，把 `EditorPatch` 转换为原生 view model 更新。TextKit、`NSAttributedString`、`AttributedString`、`NSTextRange`、`NSRange` 和平台 selection 只作为输入、排版、显示和命中测试机制存在，不能成为存储格式或文档模型。

首期 Apple 编辑器采用 block list 形态：paragraph、heading、quote、list-item 等文本块使用原生 text surface；code、table、embed、file、callout、diff 等节点使用独立原生节点 view。SwiftUI 负责外壳和状态组合，AppKit / UIKit 负责具体文本输入面；不要用 SwiftUI `TextEditor` 作为主编辑器，不要用一个巨大 `NSTextView` 加隐藏分隔符伪装节点树，也不要自研完整文本渲染引擎。

跨块选择是首期风险点。第一阶段只承诺单块文本选择、节点选择和嵌入编辑器选择；跨节点文本选择必须作为独立 spike 验证系统 selection、IME、undo、accessibility 和 patch 映射都可控后再进入首期编辑能力。Undo 接 `NSUndoManager`，但 undo 动作必须 dispatch inverse intent / op，不能直接改 TextKit buffer。

**CLI 负责本地命令契约。**

- 带 `apiVersion` 信封的稳定命令。
- 固定 TSV / JSON 输出契约。
- 结构化节点 / 实体读取。
- 通过 core op dispatch 的结构化写命令。
- 面向 replay、mirror、schema 和校验状态的诊断命令。

### 9.2 数据模型

实体是文档分区，由一个根节点和一个节点森林表示。内部节点存放在扁平 `BTreeMap<NodeId, Node>` 中；树形结构来自 `parent` 和 `order`。

节点字段：

- `id`：创建时一次铸造的 21 字符随机 nanoid。
- `parent`：可选父 `NodeId`。
- `order`：确定性的 fractional-index key。
- `content`：以 `kind` 为 key 的标签联合。
- `props`：id-keyed typed values，指向 PropDef 节点。
- `tags`：class / tag refs。
- `rev`：`blake3(canonical_serialize(self))`。
- `lww`：排除在 `rev` 外的寄存器元数据。

行内内容是纯文本加排序、合并后的 typed range marks。Offset 使用 UTF-16 code units，以对齐 Apple TextKit / Swift String bridging 和后续客户端编辑器边界。硬节点边界创建新节点；`\n` 是行内文本中的软换行。

内容类型：

- 行内容器：paragraph、heading、quote、callout、list-item。
- 叶子 / 装饰节点：code、math、embed、file、divider、diff。
- 表格：table、row、cell。
- Schema：prop-def、class。
- 兼容载体：带 `min_schema` 和无损 payload 的 unsupported。

附件是内容寻址 blobs。节点只存 `BlobRef`；单附件上限为 64MB。

### 9.3 规范序列化与修订

`canonical_serialize` 是显式确定性编码器，遵循 JCS 风格规则：递归排序 key、固定字符串转义、无无意义空白。Hash 输入禁止 `f64`；数字值使用规范十进制字符串。

`rev` 覆盖 `{id, parent, order, content, props, tags}`，排除 `lww`。`rev` 只覆盖自身，不是 Merkle hash。`Entity.revision` 是派生的子树 hash，用作乐观并发 token。

### 9.4 合并、同步与 op-log

真理层是 append-only op-log。物化本地 state、`.json` mirror 和 `.md` mirror 都是 replay 输出。

每个节点有三个 merge registers：

- `location`：parent + order。
- `content`：content + props + tags。
- `life`：tombstone。

每条 op 记录 `{node_id, register, base_rev, new_rev, hlc, actor}`。合并按 node id 进行，并用 HLC `(wall, logical, device)` 做字段级 LWW。Move-vs-edit 同时保留两边更改。删除会级联 tombstone 整个子树；edit-vs-delete 采用 delete-wins。

Apple 首期同步路线：

- 不建设 Anchor 自有服务器。
- 优先验证 iCloud / CloudKit 作为用户自有同步传输层。
- CloudKit adapter 只负责传输 / 持久化，不拥有 merge 语义。

### 9.5 写入路径

所有写入进入 `dispatch`：

1. 接收 intent 或 CLI command。
2. 解析 ids 和 schema。
3. 规范化为 node ops。
4. 校验 tree invariants。
5. 追加 op-log。
6. Replay / update materialized DB。
7. 原子写入派生 `.json` 和 `.md` mirror。
8. 返回包含 changed ids、new revisions 和 projection freshness 的 DTO。

每条持久写入路径都必须调用执行 append 前校验的 core 私有 helper。对 core 写入点做一次 grep 必须能证明这个不变量。

### 9.6 导入、导出与镜像

Markdown 是导入 / 导出格式。Frontmatter `file_id` 在导入时定义实体身份；缺失 `file_id` 时创建新实体。规范 `.json` 导出携带 node ids，并支持幂等重导入。`.md` 导出是有损且 grep 友好的导出。

Mirror 生成发生在与 projection updates 相同的 post-dispatch 点。搜索和 backlinks 使用结构化 projection；对 mirror 跑 ripgrep 是本地检查便利，不是真理归属方。

---

## 10. 实现范围

包含：

- 新的 core 节点模型、op-log、replay、projections、sync merge 和 dispatch。
- Apple binding 边界设计。
- macOS 原生客户端。
- iOS 原生客户端。
- 代码节点、表格、引用、props / class 和 Settings 的平台化交互契约。
- 本地命令、诊断、导入导出的 CLI commands。
- Markdown importer 与 `.json` / `.md` exporters。
- 覆盖确定性序列化、replay、merge、import / export、编辑器身份和 core 写入校验的正式测试。

排除：

- 首期非 Apple 客户端。
- 首期 iPadOS 专项优化；iPadOS 在 macOS + iOS 跑通后进入。
- 实时多人协作。
- CRDT / Loro 实现。
- 应用内图谱工作区、图谱路由、图谱导航和图谱可视化。
- Markdown 字节保真。
- 旧 note-centric routes、payloads 或 UI behavior 的兼容 parity。
- 把 SwiftUI / AppKit / UIKit 或任何具体 UI / 编辑器框架作为 core 语义拥有者。
- Workspace / package 重组，除非阶段 0 明确需要并另行授权。
- 将 Rust CLI 改写为 `@plimeor/command-kit`。
- 发布 packages。

---

## 11. 实现前必读上下文

阶段 0 实现前先读：

- `docs/plans/2026-06-05-anchor-block-tree-lexical-pivot.md`
- `suites/anchor/core/src/lib.rs`
- `suites/anchor/core/src/operations.rs`
- `suites/anchor/core/src/vault.rs`
- `suites/anchor/editor/package.json`
- `suites/anchor/editor/src/editor/Editor.tsx`

读完后必须产出一份短清单：

- 哪些 core 逻辑可复用。
- 哪些旧 UI / domain 表面只作为参考。
- 现有验证命令是什么。
- 当前 repo 是否已经有 Apple app target；若没有，阶段 0 必须定义 Apple 工程放置位置和验证命令，但不在未授权时创建工程。
- 哪些文件仍拥有 note-centric public behavior。

---

## 12. 规划迭代

本地设计复查结论：

- 本方案不应继续默认旧客户端是第一产品壳。用户明确选择 Bear 式路线后，首期必须变成 Apple 原生客户端优先。
- UI 可以平台化，核心不能平台化。核心模型、操作语义、同步合并、导入导出和投影必须脱离 SwiftUI / AppKit / UIKit 和具体编辑器框架。
- 首期复杂度在 Apple 原生编辑器、共享 core 绑定、`anchor-editor-core` 和同步适配器。
- CLI / API / Apple binding DTO shape 要早于最终 UI 打磨稳定。Apple 客户端、CLI 和后续客户端都需要同一套实体 / 节点词汇。
- 必须保留 core 的不变量归属方身份：非法树状态由 core 校验防住，而不是只靠平台 editor adapter 或 UI 操作提示。

---

## 13. 推荐路径

在现有 repo 中把 `anchor-core` 打造成平台无关核心，同时把首期产品客户端转向 macOS + iOS 原生。

实现从产品与平台契约产物开始，因为平台路线决定 binding、存储、同步、编辑器 adapter 和 Settings 表面。随后先证明 core 的确定性行为，再构建 Apple 原生客户端。旧客户端代码只作为局部参考，不再作为首期 UI 实现目标。

主要权衡是：Apple 原生首期会增加 Swift / Rust binding 与 Apple 工程成本，但它避免把产品体验锁进跨平台壳，也避免未来再从旧客户端优先架构里拆 core。这个代价是值得的，因为你明确希望走 macOS + iOS -> iPadOS -> 其他平台的路线。

---

## 14. 工作序列

### 阶段 0：平台、产品与契约基线

产物：

- 平台路线确认：macOS + iOS 首期，iPadOS 后续，其他平台最后。
- Apple 工程边界建议：工程位置、target、bundle、共享代码方式、验证命令。
- Rust core 到 Apple 的 binding 方案比较与推荐：C ABI、UniFFI、Swift Package、XCFramework 或其他。
- iCloud / CloudKit 作为传输适配器的可行性 spike 计划；明确 core 不依赖 CloudKit API。
- `anchor-editor-core` 边界建议：作为 `anchor-core` 内部模块或独立 crate，并明确它不拥有持久化真理层。
- `EditorSnapshot`、`BlockProjection`、`InlineRun`、`EditorSelection`、`EditorIntent`、`EditorPatch` 和 `TransactionResult` 草图。
- 覆盖选择、结构编辑、实体行为、引用、props / class、命令、Settings 和失败状态的交互契约。
- macOS / iOS 信息架构草图。
- Entity、node、op、projection、search result、validation error、mirror status、settings 和 sync status 的 core DTO 草图。
- Fixture set 至少覆盖：嵌套 list item 内含代码、带行内引用的表格、打 tag 的子实体、unsupported node、relation prop、embed、conflict case、mirror stale case、settings case、sync case、单块文本选择、节点选择、嵌入编辑器选择和跨节点编辑拒绝 / 拆分 case。

证明：

- 手动设计复查确认每个用户可见 primitive 都能映射到 core 拥有的概念。
- 手动设计复查确认每个首期编辑行为都能映射到 `EditorIntent`，并能由 core 校验为合法 op 或明确拒绝。
- 没有 UI 行为要求 Markdown 字节真理或仅前端持久状态。
- Apple binding 选择有明确验证命令和失败条件。

### 阶段 1：确定性 core 探索验证

产物：

- `canonical_serialize` spike，证明跨运行 bytes 和 hash 稳定。
- Node id / fractional order spike。
- Op-log replay spike。
- HLC LWW merge spike，覆盖 move-vs-edit 和 edit-vs-delete。
- Export mirror vs structured projection parity spike，使用真实查询样例。
- Apple binding 最小调用 spike：Apple 侧能调用 core 读取 fixture entity。
- `anchor-editor-core` 选择 / 编辑事务 spike，覆盖 insert text、split block、merge backward、indent / outdent、transform block、apply mark、paste fragment、undo inverse intent 和 validation error。
- Apple text surface spike：证明 NSTextView / UITextView / TextKit 事件可以转换为 `EditorIntent`，`EditorPatch` 可以回放到原生 view model。

证明：

- `cargo test -p anchor-core` 把 spike case 落成正式测试。
- Apple binding spike 有可重复命令或 Xcode scheme。
- 编辑器 spike 报告列出单块文本选择、节点选择、嵌入编辑器选择和跨节点选择的通过 / 失败证据。
- Spike 报告列出通过 / 失败证据和任何必须调整的模型点。

检查点 CP-A：阶段 1 通过前，不实现持久应用写入。

### 阶段 2：`anchor-core` 地基

产物：

- Core node model。
- Validation 与 normalization。
- Append-only op-log。
- Replay materialization。
- SQLite projection 或等价本地 projection。
- `dispatch` 写入路径。
- 原子 `.json` / `.md` mirror writer。
- Importer 与 exporter。
- Apple binding DTO。
- CLI DTO。
- `anchor-editor-core` 的 snapshot / selection / intent / patch / transaction result 类型。
- 编辑事务 normalizer 和 transform reducer。
- 同步传输适配器接口。

证明：

- 每条持久写入路径都经过 validated dispatch。
- 从空状态 replay op-log 可以重建同一棵 materialized tree。
- Import -> export -> import 保留 canonical JSON ids 和 hashes。
- 编辑器事务通过 core 校验生成 op；平台 selection、TextKit range 和 view identity 不进入持久化。
- Apple binding 可以读取、写入、replay fixture vault。

### 阶段 3：macOS 原生客户端

产物：

- macOS 原生 app shell。
- 主导航、导航区、工作区、检查器。
- 实体 / 节点读取和基础编辑。
- Block list 编辑器 adapter，覆盖单块文本编辑、节点选择、结构命令、代码节点和表格节点的最小可用交互。
- Settings 工作区，包含主题切换、字体选择、排版滑杆和重置排版。
- 文件 / vault 打开流程。
- CLI 安装或诊断入口。

证明：

- macOS target 的构建命令通过。
- 截图或手动证据覆盖默认工作区、搜索、schema、变更、设置。
- 编辑器证据覆盖 NSTextView / TextKit 输入进入 `EditorIntent`，`EditorPatch` 回放到原生视图。
- Settings 证据覆盖 system / light / dark 切换、字体选择、字号调整和重置排版。
- 没有 macOS UI 代码绕过 core dispatch 写入。

### 阶段 4：iOS 原生客户端

产物：

- iOS 原生 app shell。
- 小屏层级导航。
- 实体 / 节点读取和基础编辑。
- iOS text surface adapter，语义与 macOS 对齐。
- Settings 工作区，语义与 macOS 对齐。
- 本地存储、权限、分享、文件导入导出路径。
- 若阶段 0 选择 CloudKit，则接入最小同步 adapter。

证明：

- iOS target 的构建命令通过。
- iPhone 尺寸截图或手动证据覆盖打开、搜索、编辑、设置、导入导出。
- iOS 编辑器证据覆盖 UITextView / TextKit 输入进入同一套 `EditorIntent`。
- iOS UI 不复制 core 领域规则。

检查点 CP-B：macOS + iOS 都能通过 core binding 读写 fixture vault 后，才能进入 iPadOS 专项优化。

### 阶段 5：iPadOS 适配

产物：

- 多栏布局。
- 外接键盘快捷键。
- 拖拽和 split view 行为。
- Pencil / selection 行为评估。
- 大屏检查器和实体导航优化。

证明：

- iPad 尺寸截图或手动证据覆盖多栏、编辑、拖拽、检查器和设置。
- iPadOS 只适配产品表面，不分叉 core 语义。

### 阶段 6：CLI、导入导出与端到端验证

产物：

- CLI `apiVersion` 信封。
- 稳定命令，覆盖 entity / node show、search、insert、update、move、delete、tag / class / prop changes、export 和 diagnostics。
- List / search 命令的固定 TSV column order。
- 结构化对象和 diagnostics 的 JSON 输出。
- Markdown importer 与 `.json` / `.md` exporters。

证明：

- CLI 契约测试覆盖代表性读写。
- macOS / iOS 客户端和 CLI 消费同一套 DTO 词汇。
- README 记录公开 CLI / API / schema / file format 契约。

### 阶段 7：其他平台评估

产物：

- 非 Apple 平台可行性报告：core binding、UI 技术、文件访问、同步传输和分发边界。

证明：

- 不要求实现完整客户端。
- 只要求证明 core ABI 和同步传输层是否足够支撑后续平台。

---

## 15. 验收、回归证据和验证

验收结果：

- `anchor-core` 可以确定性地 create、replay、validate、merge、import 和 export entity / node trees。
- 每条持久写入路径都经过 validated dispatch，并在 materialization 前 append op-log。
- `anchor-editor-core` 可以把首期编辑行为表示为 `EditorIntent`，通过 core 校验生成 op，并返回可回放的 `EditorPatch`。
- macOS UI 和 iOS UI 暴露实体 / 节点导航、编辑、检查器、设置和状态表面，不依赖 note-centric contracts。
- macOS / iOS text surface 只保存 transient selection、focus、composition 和 view state；TextKit range、平台 selection object 和 view identity 不进入持久化。
- Settings UI 暴露主题切换、字体选择、排版调整和重置入口；平台实现不同，但设置语义一致。
- Apple 客户端通过 shared core binding 读写 fixture vault。
- CLI 可以通过文档化结构契约 read / search / update / move nodes。
- Markdown / JSON mirror files 从真理层生成，并可重建。

验证命令：

- 在 `suites/anchor` 运行：`cargo test -p anchor-core`
- 在 `suites/anchor` 运行：`cargo clippy -p anchor-core --all-targets`
- Apple 工程创建后，阶段 0 必须补充 macOS 和 iOS 的实际 `xcodebuild` 命令。

手动 / artifact 证据：

- 阶段 0 交互契约基于 fixture set 通过复查。
- Apple binding spike 记录。
- `anchor-editor-core` spike 记录，覆盖 selection、intent、patch、undo inverse intent 和 validation error。
- macOS 和 iOS 主要外壳状态截图。
- macOS / iOS 编辑器输入与 patch 回放证据。
- Settings 主题 / 字体 / 排版证据。
- CLI read / search / write commands 的输出快照。
- Mirror parity report，比较 structured search 与 exported `.md` 上的 ripgrep。

仍需保留的回归证据：

- Core 写入路径仍是单一 dispatch 入口。
- 编辑器写入路径仍从 `EditorIntent` 进入 core dispatch。
- 被触碰 workspace / target 的本地检查通过。
- Exported mirror 支持 CLI read / search workflows。
- Existing Markdown vault content 在 `file_id` 存在或缺失时都可作为来源材料导入。

不要求保留的回归证据：

- Note-centric route parity。
- Markdown byte-for-byte preservation。
- Previous visual theme parity。
- Previous payload compatibility，若它与 entity / node DTOs 冲突。
- 旧 UI parity。

---

## 16. 风险和偏航点

- **核心被 Apple UI 绑死**：SwiftUI / AppKit / UIKit 很容易把状态、选择和操作规则吃进 view model。约束方式是所有持久更改都通过 core dispatch 生成 op，Apple view model 只表达 UI 状态和意图。
- **TextKit 被误当模型**：NSTextView / UITextView / TextKit 很容易从输入和排版底座变成隐藏文档模型。约束方式是 TextKit 只承担输入、layout、selection 和 hit testing；持久语义必须来自 `EditorIntent`、core op 和 materialized projection。
- **旧客户端惯性回流**：现有旧客户端代码可能让实现重新沿着既有壳走。约束方式是阶段 0 明确旧客户端只是局部参考，不是首期客户端。
- **Binding 成本低估**：Rust core 到 Apple 的 ABI、错误类型、异步、内存和二进制分发会成为真实成本。约束方式是阶段 0 先做 binding spike，再进入客户端实现。
- **同步传输污染 core**：CloudKit 很容易把 record shape、zone、account state 泄漏进领域模型。约束方式是 CloudKit 只做 adapter，core op-log 和 merge 语义不依赖 CloudKit。
- **平台编辑器分叉语义**：macOS / iOS / 后续客户端编辑器可能各自解释结构编辑。约束方式是结构编辑意图和 normalizer 在 core 或共享编辑器核心边界收敛。
- **跨节点选择低估**：跨 text surface 的连续选择、IME、undo 和 accessibility 可能远比单块编辑复杂。约束方式是首期先支持单块文本选择、节点选择和嵌入编辑器选择；跨节点文本选择必须通过 spike 后再进入能力范围。
- **Mirror 可信度缺口**：grep-friendly export 可能落后真理层。约束方式是让 mirror freshness 可见且可测试。
- **DTO 抖动**：Apple 客户端可能跑在 core shape 前面。约束方式是在广泛 UI 工作前冻结阶段 0 DTO 草图。
- **CRDT 诱惑**：实时协作会改变 storage 和 editor 假设。若 realtime multi-user 成为目标，暂停重评。

---

## 17. 检查点

CP-0：平台路线、Apple binding 方案、`anchor-editor-core` 合约、产品交互契约、信息架构、DTO 草图和 fixture set 已批准。

CP-A：确定性 core 探索验证、Apple binding spike 和编辑器事务 spike 作为正式验证通过。

CP-B：Core dispatch、op-log replay、projection、`anchor-editor-core`、同步适配器接口和 CLI DTO 契约稳定到足以支撑 macOS / iOS 集成。

CP-C：macOS 客户端基于 shared core 读写 fixture vault。

CP-D：iOS 客户端基于 shared core 读写 fixture vault。

CP-E：macOS + iOS + CLI + mirror 在 fixture vault 上通过端到端验证。

CP-F：iPadOS 专项适配通过后，再评估其他平台。

---

## 18. 暂停条件

出现以下情况时暂停并让用户决策：

- 产品范围扩展到实时多人协作。
- Package / workspace / Apple project 边界需要改变。
- Rust core 无法以可接受成本进入 macOS / iOS。
- 同步路线需要在 iCloud / CloudKit、纯本地文件、用户自管目录或其他传输层之间做产品级选择。
- 某个 UI 要求无法映射到 core entity / node / op concepts。
- 某个目标编辑器行为要求持久化平台 editor state。
- 跨节点文本选择无法在 Apple 原生 text surface 上稳定处理 selection、IME、undo 和 accessibility。
- 导入现有内容需要做超出已记录 Markdown 限制的数据丢失选择。
- CLI 契约需要暴露阶段 0 DTO 草图未覆盖的新公开 schema。
- 其他平台被提前要求进入首期实现范围。

---

## 19. 停止条件

当本文档已经把 Anchor 定义为 Apple 原生优先、实体 / 节点原生、核心平台无关的产品，包含 macOS + iOS -> iPadOS -> 其他平台的路线，保留 core 所有权边界，给出有序实现阶段，列出验证证据，并明确实现仍待单独授权时，本规划任务完成。

授权后的第一个实现单元是阶段 0：平台路线确认、Apple binding 方案、产品交互契约、导航 / 信息架构契约、DTO 草图和 fixture set。
