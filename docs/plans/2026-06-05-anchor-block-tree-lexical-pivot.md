# Anchor 新项目方案：实体 / 节点原生知识工作台

创建日期：2026-06-05
重写日期：2026-06-06
状态：新项目方案（产品交互、UI、主题、导航、编辑器、core、CLI 一并重新设计；实现待用户单独放行）

> 规划记录（历史记录，非当前接口契约）。实现后，权威且稳定的 CLI / API / schema / file format 契约归 `anchor-core` 包 README。
>
> 本方案把 Anchor 当作新项目定义：产品对象、交互行为、视觉系统、导航结构、编辑器、存储真理层和 CLI 契约一起设计。现有 repo 只提供可复用的工程容器、依赖和验证入口，不作为产品形态、UI 行为或数据契约的约束。

---

## 1. 澄清状态

当前目标明确：Anchor 以实体 / 节点为原生产品模型重启，完整重设视觉表面、HeroUI 主题、窗口导航和编辑器交互。实现授权尚未开始；本文只定义可执行方案、边界、阶段、验证和停点。

关键授权：

- 产品表面按实体 / 节点重新设计。
- 旧的 note-centric 信息架构不作为约束。
- 视觉组件使用 HeroUI 体系。
- 主题使用 HeroUI 配套主题机制。
- 窗口导航围绕新笔记类型和新交互重新设计。
- 存储真理层采用只追加操作日志（append-only op-log）。
- 编辑器采用 Lexical 作为节点树的渲染 / 输入视图，代码节点内嵌 CM6。
- CLI 是本地命令、诊断和导入导出的外部契约。

当前保守边界：

- 不改 workspace tier 和 package 边界，除非后续单独授权。
- 不承诺实时多人协作。
- 不以 Markdown 字节保真为目标。
- 不让 UI、Lexical 或 Tauri command 成为业务真理源。

---

## 2. 背景与问题

Anchor 的核心对象不是文件，也不是 Markdown 文本，而是可引用、可移动、可嵌套、可投影、可合并的知识节点树。

决定性约束是容器嵌套与结构化语义：代码节点、表格、callout、embed、diff、schema 字段和引用关系都需要作为一阶节点存在。列表缩进与代码缩进不能共享 Markdown 行首空格这一条通道；行内引用也不能被压回文本 token 后再由多个层各自解释。

用户面对的产品也必须跟着改变。一个子节点被打 tag 后可以成为实体，引用指向稳定 `NodeId`，props / class 是 schema 节点，backlinks 是派生视图，mirror 文件是导出结果。若 UI 仍围绕“打开一篇 note 文本”组织，核心模型会被旧交互反向挤压。

本方案的目标是定义一个完整的新 Anchor：数据真理、编辑体验、导航、视觉体系、CLI 契约和验证门槛彼此一致。

---

## 3. 目标

交付一个实体 / 节点原生的本地知识工作台：用户在 HeroUI 驱动的桌面界面中浏览、编辑、重组、引用和投影节点树；`anchor-core` 以 append-only op-log 作为真理层；Lexical 只负责输入和渲染；CLI 提供稳定、结构化的本地命令契约；Markdown / JSON 文件作为导入、导出和 grep 友好的派生镜像存在。

---

## 4. 产品模型

### 4.1 用户可理解对象

**实体** 是可被打开、搜索、补全、出现在最近活动和被引用的对象。根节点天然是实体；任意节点只要满足实体派生谓词，也以实体行为进入产品表面。

**节点** 是编辑、移动、引用、合并和投影的原子结构单元。用户可以选中一个节点、移动一个节点、把一个节点嵌套到另一个节点下、给一个节点加 tag / class / props，也可以把一个节点 transclude 到别处。

**块** 是节点在编辑器里的可视单位。常见块包括 `paragraph`、`heading`、`list-item`、`quote`、`callout`、`code`、`math`、`table`、`row`、`cell`、`embed`、`file`、`divider`、`diff` 和 `unsupported`。

**行内内容** 是节点内容中的文本与 mark 集合。行内 mark 包括装饰 mark（bold、em、code 等）和注解 mark（link、ref、mention、tag 等）。

**PropDef / Class** 是一阶 schema 节点。字段定义、类型约束、class 归属和 relation 值由 core 管理，不以文本约定或前端局部状态存在。

**投影视图** 是从 op-log replay 和节点树派生的视图，包括搜索、backlinks、最近活动、每日视图、schema views、mirror 文件和 CLI 可读输出。

### 4.2 用户不需要理解的对象

`rev`、HLC、LWW register、canonical serialization、SQLite materialized state、mirror freshness token 和 Lexical node key 都是内部对象。UI 可以展示状态和错误，但不把这些词作为普通编辑流程的主概念。

### 4.3 产品不变量

- 用户编辑的是结构化节点树，不是 Markdown 文本。
- 用户看到的引用目标来自稳定 `NodeId` 的解析结果。
- 节点的位置、内容和生命周期是不同寄存器。
- backlinks、搜索、最近活动和 mirror 都是派生视图。
- 所有写入通过 core `dispatch` 形成结构化 op。
- UI 层只表达意图，不直接修补持久化状态。

---

## 5. 信息架构

Anchor 的窗口由四个稳定区域组成：

1. **主导航栏**：进入主工作区的全局入口。默认入口包括今日、实体、搜索、Schema、变更、设置。
2. **导航区**：当前入口下的可扫描列表或树。例如实体列表、搜索结果、schema classes、pending changes。
3. **工作区**：主编辑 / 阅读 / 对比区域。默认显示一个实体的节点树，也可以显示搜索聚焦结果、schema 编辑器或变更审阅。
4. **检查器**：当前实体 / 节点 / 选择区的属性、引用、backlinks、class、schema、状态和动作。

窗口导航不以 note folder 为中心。导航以用户任务为中心：

- 快速回到今天和最近活动。
- 找到一个实体。
- 搜索文本、字段、tag、class、relation 或 node id。
- 维护 schema 与 class。
- 管理设置、vault、export mirror、CLI 和 sync 状态。

路由是产品状态的持久地址，不是文件路径的薄包装。推荐稳定路由形态：

- `/today`
- `/entities`
- `/entities/$entityId`
- `/nodes/$nodeId`
- `/search`
- `/schema`
- `/changes`
- `/settings`

路由参数使用 core DTO 中的 stable id。前端局部选择区、展开态、检查器 tab 和 transient command state 不进入持久数据契约。

`/settings` 不再只是诊断与操作记录页。新 Settings 工作区必须吸收当前 `SettingsDialog` 的外观控制逻辑，并至少包含：

- 主题切换：system / light / dark。
- 字体选择：正文、标题、代码三类字体。
- 排版数值调整：字号、行高、行宽、段后距、首行缩进。
- 一键重置字体与排版设置。
- 诊断、操作记录、CLI 安装和其他系统设置可以作为同一 Settings 工作区下的独立分组存在。

---

## 6. 交互模型

### 6.1 选择模型

编辑器支持三层选择：

- **文本选择**：普通文本选择，作用于行内内容和 range marks。
- **节点选择**：选中一个或多个完整节点，作用于 move、delete、duplicate、wrap、tag、class、props、copy link、transclude。
- **嵌入编辑器选择**：代码节点内 CM6 选择，仅作用于 code payload；跨出代码节点时回到 Lexical / 节点选择。

选择边界必须可预测：

- 点击正文进入文本选择。
- 点击块 handle 进入节点选择。
- `Esc` 从嵌入编辑器回到节点选择，再回到工作区焦点。
- `Cmd+A` 在代码节点内只先选择代码内容；再次触发才提升到节点或工作区选择。
- 跨节点文本选择允许形成一个编辑意图，但落盘前必须被 core normalizer 拆成合法 node op。

### 6.2 结构编辑

结构编辑以 node op 为结果：

- `Enter` 拆分当前文本节点。
- `Shift+Enter` 产生行内软换行。
- 空 paragraph 上 `Backspace` 合并或删除当前节点，遵守 parent 和 sibling 规则。
- `Tab` / `Shift+Tab` 调整当前节点的 parent / order。
- 拖拽 handle 产生 move op，不改内容寄存器。
- 斜杠菜单产生 insert / wrap / transform 意图。
- 粘贴先进入 importer / normalizer，再形成节点树片段。
- Transform（paragraph -> heading、paragraph -> callout 等）必须保留 node id 和可保留的行内 marks。

非法结构在最早可确定的位置被拒绝：UI 可以提前禁用明显非法动作，Lexical transform 可以提供即时反馈，core 校验是最终关卡。

### 6.3 嵌套容器

`list-item` 是容器。code、table、callout、embed、file、diff 等块可以作为 `list-item` 的子节点存在。列表缩进、代码缩进和容器嵌套由 node parent / order 表达，不由文本行首空格表达。

代码节点内部使用 CM6。CM6 不拥有外层节点树；它只编辑 code payload、language、fold state 和局部选择。跨代码节点的 copy、paste、undo、redo、IME 和选择提升必须有专门测试。

Table / Row / Cell 是一阶可合并节点。表格操作包括插入行、插入列、删除行、删除列、移动行、移动列、单元格内容编辑和表格选择。表格不以 Markdown pipe 文本作为编辑真理。

### 6.4 实体行为

`is_entity(n) = !n.tags.is_empty() || n.parent.is_none()`。

满足实体谓词的节点：

- 在全局搜索和实体补全中可见。
- 可被打开为工作区 root。
- 可进入最近活动。
- 可被 `[[ ]]`、`@mention`、relation prop 或 embed 引用。

从父实体中打开子实体时，UI 显示来源上下文和 breadcrumb。用户可以回到原父树，也可以以该子实体为工作根继续编辑。

### 6.5 引用与反向链接

所有引用保存稳定 target id。UI 展示解析后的标题、摘要、类型、状态和上下文；被引节点改名不改变引用方 rev。

引用类型保留语义差异：

- `[[entity]]` 表达实体 / 节点引用。
- `#tag` 表达 tag / class-like discovery。
- `@mention` 表达 person / actor mention。
- relation prop 表达 typed edge。
- embed 表达 transclusion。

Backlinks 和 unlinked mentions 都是派生视图。用户可以从 backlink context 创建 structured ref op。

### 6.6 属性、class 与模式

检查器是 props / class 的主入口；inline chips 和斜杠菜单是快速入口。PropDef / Class 的定义由 schema 工作区管理。

实例只保存 id-keyed prop values 和 class refs。类型校验、relation 目标校验、默认值、显示标签和排序由 core schema projection 提供。

### 6.7 命令表面

Anchor 的命令系统分三层：

- **斜杠菜单**：当前编辑器选择区的局部结构命令。
- **命令面板**：跨工作区的打开、创建、搜索、切换和导出。
- **上下文菜单**：当前节点 / 实体 / 选择区的可用动作。

命令输出必须落到 core DTO，而不是只改变前端局部状态。无法形成合法 op 的命令不进入 dispatch。

### 6.8 失败状态

UI 必须一等呈现以下状态：

- unsupported node：可读、可移动、可复制 id，不允许破坏性编辑 payload。
- newer schema：提示当前客户端只支持部分操作。
- 校验错误：显示被拒绝动作、目标节点和可恢复路径。
- replay conflict：显示冲突 register、winning op、losing op 和用户可采取动作。
- stale mirror：显示 mirror 落后于 op-log 的状态，不影响真理层编辑。
- sync / rebuild error：保留当前可读物化态，阻止危险写入，提供 rebuild / export diagnostic。

---

## 7. 界面系统

HeroUI 是基础组件、主题、交互可访问性和默认视觉风格的归属方。Anchor 使用薄包装层稳定面向应用调用方的 prop API、集中导入、表达 Anchor 词汇，不重新实现 HeroUI 已经拥有的行为。当前 `components/ui` 文件、prop shape、variant 命名和旧主题 token 都不是兼容契约；新 UI 组件层按新产品表面重新建立。

自定义 UI 只用于三类表面：

- 编辑器画布：Lexical nodes、块 handle、选择覆盖层、行内 chips、嵌入 CM6、表格操作提示。
- 密集工作台布局：主导航栏、导航区、工作区、检查器的尺寸、分栏和响应式行为。
- 状态可视化：conflict、unsupported、mirror freshness、schema validation。

主题由 HeroUI theme 驱动。产品级 CSS token 只覆盖编辑器排版、代码主题、密集工作台间距和状态颜色。Tauri window theme、`color-scheme`、meta theme color 和 web root theme state 必须由单一外观边界管理。

视觉设计目标是安静、密集、可扫描、适合长时间编辑。避免营销页式 hero、装饰性卡片堆叠、大面积单色渐变和只服务展示的视觉层。卡片只用于重复列表项、modal、检查器子面板和确实需要边界的工具区域。

### 7.1 Settings 外观逻辑

当前真实代码里的外观设置由 `SettingsDialog`、`theme.tsx` 和 `appearance.tsx` 共同完成；新 Settings 工作区应保留这套职责切分，但把它从弹窗形态升级为设置页面 / 面板形态。

主题切换逻辑：

- 设置入口提供三段式主题切换：`system`、`light`、`dark`。
- 用户偏好类型是 `ThemeMode = 'system' | 'light' | 'dark'`；实际生效主题是 `Theme = 'light' | 'dark'`。
- 默认值是 `system`，持久化 key 是 `anchor-theme`。
- `system` 通过 `(prefers-color-scheme: dark)` 解析为实际 light / dark。
- 应用启动前通过 `THEME_INIT_SCRIPT` 预先写入 `<html data-theme>` 和 `color-scheme`，避免首帧主题闪烁。
- `setThemeMode(next)` 是 UI 写入入口；它同时更新快照、写 `localStorage`、设置 `<html data-theme>`、同步 `color-scheme`、用 `--surface-app` 更新 `theme-color` meta，并在 Tauri 环境下同步原生窗口主题。
- `ThemeProvider` 负责挂载后重新读取存储、监听系统主题变化、监听跨 tab storage 变化。

字体与排版逻辑：

- 外观设置的字体与排版归 `appearance.tsx` 单一 store 管理，持久化 key 是 `anchor-typography`。
- Settings UI 使用三个字体选择器：正文 `textFont`、标题 `headingFont`、代码 `codeFont`。
- 字体选项固定来自随包字体，不从系统字体动态枚举：System default、Inter、Lora、Literata、JetBrains Mono。对应字体通过 `@fontsource-variable/*` 在 `main.tsx` 本地导入，保证离线可用。
- Settings UI 使用五个数值滑杆：
  - `fontSize`：10-30，步进 1，单位 pt，默认 15。
  - `lineHeight`：1-2，步进 0.1，单位 em，默认 1.5。
  - `lineWidth`：32-130，步进 1，单位 em，默认 48。
  - `paragraphSpacing`：0-2，步进 0.1，单位 em，默认 0。
  - `paragraphIndent`：0-3，步进 0.1，单位 em，默认 0。
- 字体选择和滑杆都写入 `setTypography(patch)`；一键重置调用 `resetTypography()`。
- `appearance.tsx` 对存储值做 normalize 与 clamp：未知字体被丢弃，非法数值回到默认值或被限制在字段上下限内。
- 生效值同步写到 `:root` 的 CSS 变量：`--editor-font-family`、`--editor-heading-font`、`--editor-code-font`、`--editor-font-size`、`--editor-line-height`、`--editor-line-width`、`--editor-paragraph-spacing`、`--editor-paragraph-indent`。
- 编辑器样式通过 `.editor-surface .cm-content`、`.cm-line`、`[data-editor-role="heading"]` 和代码相关 data role 消费这些 CSS 变量，所以字体和排版调整应即时生效，不需要重建编辑器实例。
- 字体选择控件使用 HeroUI Select，选中项和列表项都用对应字体预览；数值调整控件使用 HeroUI Slider。

---

## 8. 架构

### 8.1 责任边界

**`anchor-core` 负责真理层与不变量。**

- Node / Entity / Inline / PropDef / Class / BlobRef 模型。
- 规范序列化与 hash。
- 校验与规范化。
- Append-only op-log。
- HLC / LWW merge。
- Replay 与物化节点树。
- SQLite projections。
- 导入 / 导出 / mirror 生成。
- Dispatch 与结构化 op 创建。
- CLI DTO 与 schema version envelope。

**`anchor-editor` 负责编辑视图机制。**

- Lexical 节点注册。
- NodeState id / rev 携带。
- nodeTreeToLexical 渲染。
- lexicalToIntent / lexicalToNodeOps 提取。
- 代码节点内嵌 CM6 的生命周期。
- 选择、transform、块 handle、表格交互。
- 面向身份、选择和嵌套容器的编辑器专项测试。

`anchor-editor` 永不负责持久化、冲突策略、schema 校验、backlinks 或 Markdown 真理。

**`anchor-web` 负责产品表面和交互状态。**

- HeroUI 应用外壳。
- 路由与导航。
- Query / mutation 编排。
- 工作区、导航区和检查器。
- 命令面板、斜杠菜单 UI 和上下文菜单 UI。
- DTO 客户端与错误展示。
- 手动和浏览器 QA fixtures。

`anchor-web` 不复制 core 领域规则。它可以预检明显的 UI 约束，但 core 校验始终是权威关卡。

**`anchor-desktop` 负责桌面壳集成。**

- Tauri 启动接入。
- 薄命令包装层。
- 文件对话框和原生集成。
- 窗口主题桥接。
- 必要时的 sidecar 进程接入。

Tauri commands 是 core functions 之上的传输包装层，不定义产品行为。

**CLI 负责本地命令契约。**

- 带 `apiVersion` 信封的稳定命令。
- 固定 TSV / JSON 输出契约。
- 结构化节点 / 实体读取。
- 通过 core op dispatch 的结构化写命令。
- 面向 replay、mirror、schema 和校验状态的诊断命令。

### 8.2 数据模型

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

行内内容是纯文本加排序、合并后的 typed range marks。Offset 使用 UTF-16 code units，以对齐 JS 编辑器行为。硬节点边界创建新节点；`\n` 是行内文本中的软换行。

内容类型：

- 行内容器：paragraph、heading、quote、callout、list-item。
- 叶子 / 装饰节点：code、math、embed、file、divider、diff。
- 表格：table、row、cell。
- Schema：prop-def、class。
- 兼容载体：带 `min_schema` 和无损 payload 的 unsupported。

附件是内容寻址 blobs。节点只存 `BlobRef`；单附件上限为 64MB。

### 8.3 规范序列化与修订

`canonical_serialize` 是显式确定性编码器，遵循 JCS 风格规则：递归排序 key、固定字符串转义、无无意义空白。Hash 输入禁止 `f64`；数字值使用规范十进制字符串。

`rev` 覆盖 `{id, parent, order, content, props, tags}`，排除 `lww`。`rev` 只覆盖自身，不是 Merkle hash。`Entity.revision` 是派生的子树 hash，用作乐观并发 token。

### 8.4 合并与 op-log

真理层是 append-only op-log。物化 SQLite state、`.json` mirror 和 `.md` mirror 都是 replay 输出。

每个节点有三个 merge registers：

- `location`：parent + order。
- `content`：content + props + tags。
- `life`：tombstone。

每条 op 记录 `{node_id, register, base_rev, new_rev, hlc, actor}`。合并按 node id 进行，并用 HLC `(wall, logical, device)` 做字段级 LWW。Move-vs-edit 同时保留两边更改。删除会级联 tombstone 整个子树；edit-vs-delete 采用 delete-wins。

### 8.5 写入路径

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

### 8.6 导入、导出与镜像

Markdown 是导入 / 导出格式。Frontmatter `file_id` 在导入时定义实体身份；缺失 `file_id` 时创建新实体。规范 `.json` 导出携带 node ids，并支持幂等重导入。`.md` 导出是有损且 grep 友好的导出。

Mirror 生成发生在与 projection updates 相同的 post-dispatch 点。搜索和 backlinks 使用结构化 projection；对 mirror 跑 ripgrep 是本地检查便利，不是真理归属方。

---

## 9. 实现范围

包含：

- 新的 core 节点模型、op-log、replay、projections 和 dispatch。
- 基于 Lexical 节点树映射的新编辑器路径。
- 代码节点 payload 内嵌 CM6。
- 新的 HeroUI app shell、导航、主题和交互表面。
- 基于实体 / 节点 / op / projection 的新前端 DTO 和 query / mutation 流程。
- 面向实体 / 节点读写、搜索、导出和诊断的新 CLI commands。
- Markdown importer 与 `.json` / `.md` exporters。
- 覆盖确定性序列化、replay、merge、import / export、编辑器身份和 core 写入校验的正式测试。

排除：

- 实时多人协作。
- CRDT / Loro 实现。
- 应用内图谱工作区、图谱路由、图谱导航和图谱可视化。
- Markdown 字节保真。
- 旧 note-centric routes、payloads 或 UI behavior 的兼容 parity。
- 超出搜索和 mirror parity 所需 projection 的 FTS ranking 工作。
- Workspace / package 重组。
- 将 Rust CLI 改写为 `@plimeor/command-kit`。
- 发布 packages。

---

## 10. 实现前必读上下文

阶段 0 实现前先读：

- `docs/plans/2026-06-05-anchor-block-tree-lexical-pivot.md`
- `suites/anchor/core/src/lib.rs`
- `suites/anchor/core/src/operations.rs`
- `suites/anchor/core/src/vault.rs`
- `suites/anchor/desktop/src-tauri/src/main.rs`
- `suites/anchor/web/package.json`
- `suites/anchor/web/src/routes/__root.tsx`
- `suites/anchor/web/src/backend/index.ts`
- `suites/anchor/web/src/domain/types.ts`
- `suites/anchor/web/src/components/ui/README.md`
- `suites/anchor/editor/package.json`
- `suites/anchor/editor/src/editor/Editor.tsx`

读完后必须产出一份短清单：哪些基础设施可复用、哪些 UI / domain 表面可丢弃、现有验证命令是什么、哪些文件仍拥有 note-centric public behavior。

---

## 11. 规划迭代

本地设计复查结论：

- 本方案不应拆成“存储迁移计划”和“后置 UI 重新设计计划”。实体 / 节点会改变用户可见的对象身份、导航、选择和命令行为，所以产品交互是架构的一部分。
- 本方案不应让 HeroUI wrapper 设计成为主抽象。HeroUI 负责基础组件行为和外观；Anchor 自己拥有的复杂度是编辑器画布、产品布局和有状态领域表面。
- 首轮实现应保持 package 边界稳定。Workspace 重组会增加协调风险，却不能提高 core 正确性证明。
- CLI / API DTO shape 要早于最终 UI 打磨稳定。Web 表面和 CLI 表面需要同一套实体 / 节点词汇。
- 必须保留 core 的不变量归属方身份：非法树状态由 core 校验防住，而不是只靠 Lexical transforms 或 UI 操作提示。

---

## 12. 推荐路径

在现有 `suites/anchor` workspaces 内把 Anchor 建成一个新产品。

实现从产品与契约产物开始，因为实体 / 节点语义是用户可见的。随后先证明 core 的确定性行为，再构建完整 UI。Web 和 editor 应尽早消费 core DTO；临时 local mocks 只允许作为与计划 DTO schema 匹配的 fixtures。

主要权衡是接受更大的产品重设计边界，以换取删除兼容层。这会降低变更放大：core、editor、UI 和 CLI 使用同一套词汇，而不是在 note text、Markdown preservation、synthetic block identity 和 node-tree operations 之间互相翻译。

---

## 13. 工作序列

### 阶段 0：产品与契约基线

产物：

- 覆盖选择、结构编辑、实体行为、引用、props / class、命令和失败状态的交互契约。
- 路由图，以及主导航栏 / 导航区 / 工作区 / 检查器的职责。
- Entity、node、op、projection、搜索结果、校验错误和 mirror status 的 core DTO 草图。
- Fixture set 至少覆盖：嵌套 list item 内含代码、带行内引用的表格、打 tag 的子实体、unsupported node、relation prop、embed、conflict case 和 mirror stale case。

证明：

- 手动设计复查确认每个用户可见 primitive 都能映射到 core-owned concept。
- 没有 UI 行为要求 Markdown 字节真理或仅前端持久状态。

### 阶段 1：确定性 core 探索验证

产物：

- `canonical_serialize` spike，证明跨运行 bytes 和 hash 稳定。
- Node id / fractional order spike。
- Op-log replay spike。
- HLC LWW merge spike，覆盖 move-vs-edit 和 edit-vs-delete。
- Export mirror vs structured projection parity spike，使用真实查询样例。

证明：

- `cargo test -p anchor-core` 把 spike case 落成正式测试。
- Spike 报告列出通过 / 失败证据和任何必须调整的模型点。

检查点 CP-A：阶段 1 通过前，不实现持久应用写入。

### 阶段 2：`anchor-core` 地基

产物：

- Core node model。
- Validation 与 normalization。
- Append-only op-log。
- Replay materialization。
- SQLite projection。
- `dispatch` 写入路径。
- 原子 `.json` / `.md` mirror writer。
- Importer 与 exporter。

证明：

- 每条持久写入路径都经过 validated dispatch。
- 从空状态 replay op-log 可以重建同一棵 materialized tree。
- Import -> export -> import 保留 canonical JSON ids 和 hashes。

### 阶段 3：CLI 与传输契约

产物：

- CLI `apiVersion` 信封。
- 稳定命令，覆盖 entity / node show、search、insert、update、move、delete、tag / class / prop changes、export 和 diagnostics。
- List / search 命令的固定 TSV column order。
- 结构化对象和 diagnostics 的 JSON 输出。
- 调用 core functions 且不拥有行为的 Tauri command wrappers。

证明：

- CLI 契约测试覆盖代表性读写。
- Web backend client 消费同一套 DTO 词汇。
- README 记录公开 CLI / API / schema / file format 契约。

检查点 CP-B：CLI 与 DTO 契约必须稳定到足以支撑 web / editor 集成，才能进入阶段 4 的广泛 UI 工作。

### 阶段 4：HeroUI 应用外壳与导航

产物：

- 新 HeroUI 应用外壳，包含主导航栏、导航区、工作区和检查器。
- HeroUI theme integration 和单一 appearance boundary。
- 基于 entity / node / search / schema / changes / settings 的路由树。
- 使用 core DTO 的 query / mutation layer。
- 空态、加载态、错误态、校验态和 stale mirror states。
- Settings 工作区包含主题切换按钮、字体选择器、排版滑杆和重置排版按钮，并复用 `theme.tsx` / `appearance.tsx` 的单一状态归属。

证明：

- 在 `suites/anchor/web` 运行 `bun run check` 通过。
- 浏览器截图覆盖默认工作区、搜索、schema、变更和设置。
- 没有 route 或 component 依赖 note-centric DTO。
- Settings 截图或手动证据覆盖 system / light / dark 切换、字体选择、字号调整和重置排版。

### 阶段 5：Lexical 节点编辑器

产物：

- 面向 core content kinds 的 Lexical 节点注册。
- NodeState id / rev preservation。
- nodeTreeToLexical 渲染。
- 经 normalizer 和 core diff 的 lexicalToNodeOps 提取。
- 代码节点内嵌 CM6。
- Block handles、节点选择、文本选择、表格交互和斜杠菜单集成。
- 面向选中实体 / 节点 props、class、references 和状态的检查器集成。

证明：

- Editor tests 覆盖 transforms 期间的身份保留。
- 嵌套 list-item 内的 code node 保持结构合法。
- Code node selection、`Cmd+A`、copy / paste、undo / redo 和 IME 有 targeted tests 或手动证据。
- Lexical EditorState 永不作为真理持久化。

### 阶段 6：投影视图与端到端验证

产物：

- 由 projections 支撑的搜索、backlinks、最近活动和 schema views。
- Export watch / mirror freshness UI。
- 面向 replay、校验、mirror 和 schema state 的 diagnostics。
- 将现有 Markdown vaults 作为来源材料的 migration / import flow。

证明：

- 端到端测试覆盖 create / edit / move / reference / export / search / open flows。
- CLI 可以 inspect 和 update nodes，且不依赖 UI-only state。
- Mirror files 支持代表性查询的 ripgrep。

### 阶段 7：视觉打磨与交互加固

产物：

- 最终 spacing、typography、state colors 和 responsive constraints。
- 键盘快捷键审计。
- HeroUI surfaces 和自定义 editor controls 的无障碍检查。
- 大 entity 和搜索结果导航的性能检查。

证明：

- 桌面和窄 viewport screenshots 按交互契约审阅。
- 纯键盘冒烟路径覆盖 open、search、edit、move、inspect 和 command palette。
- 大型 fixture 在约定阈值内保持响应。

---

## 14. 验收、回归证据和验证

验收结果：

- `anchor-core` 可以确定性地 create、replay、validate、merge、import 和 export entity / node trees。
- 每条持久写入路径都经过 validated dispatch，并在 materialization 前 append op-log。
- Web UI 暴露实体 / 节点导航、编辑、检查器和状态表面，不依赖 note-centric contracts。
- Settings UI 暴露主题切换、字体选择、排版调整和重置入口；主题写入 `data-theme`，排版写入 `--editor-*` CSS 变量。
- Lexical editor 在 transforms 和嵌套容器中保留稳定 node identity。
- CLI 可以通过文档化结构契约 read / search / update / move nodes。
- Markdown / JSON mirror files 从真理层生成，并可重建。

验证命令：

- 在 `suites/anchor` 运行：`cargo test -p anchor-core`
- 在 `suites/anchor` 运行：`cargo clippy -p anchor-core --all-targets`
- 在 `suites/anchor/editor` 运行：`bun run check`
- 在 `suites/anchor/editor` 运行：`bun run test`
- 在 `suites/anchor/web` 运行：`bun run check`
- 在 `suites/anchor/web` 运行：`bun run test`
- 在 `suites/anchor/web` 运行：`bun run test:e2e`

手动 / artifact 证据：

- 阶段 0 交互契约基于 fixture set 通过复查。
- CLI read / search / write commands 的输出快照。
- 主要 shell states 的浏览器截图。
- 覆盖 selection、nested code、table 和 inspector behavior 的编辑器手动矩阵。
- Mirror parity report，比较 structured search 与 exported `.md` 上的 ripgrep。

仍需保留的回归证据：

- Tauri command wrappers 仍是 core 之上的薄传输层。
- 被触碰 workspace 的 package-local checks 通过。
- Exported mirror 支持 CLI read / search workflows。
- Existing Markdown vault content 在 `file_id` 存在或缺失时都可作为来源材料导入。

不要求保留的回归证据：

- Note-centric route parity。
- Markdown byte-for-byte preservation。
- Previous visual theme parity。
- Previous payload compatibility，若它与 entity / node DTOs 冲突。

---

## 15. 风险和偏航点

- **UI 拥有语义**：block handles、inspector controls 或 slash commands 可能意外成为领域归属方。约束方式是要求所有持久更改都 dispatch core ops。
- **Lexical 身份丢失**：transforms 可能丢失 node id / rev。约束方式是在每个 transform 上测试 NodeState copy。
- **嵌入 CM6 边界 bug**：selection、undo、copy / paste 和 IME 可能在两个编辑器之间分裂。约束方式是把 code node behavior 隔离到专项测试。
- **Schema UI 过度扩张**：props / class 工具可能在 core schema 稳定前膨胀成完整数据库 UI。约束方式是停在当前 node operations 所需的 PropDef / Class 行为。
- **Mirror 可信度缺口**：grep-friendly export 可能落后真理层。约束方式是让 mirror freshness 可见且可测试。
- **DTO 抖动**：frontend 可能跑在 core shape 前面。约束方式是在广泛 UI 工作前冻结阶段 0 DTO sketches。
- **Package 重组分心**：移动 workspaces 看起来更干净，但不能证明产品或存储正确性。推迟到新产品形态跑起来之后。
- **CRDT 诱惑**：实时协作会改变 storage 和 editor 假设。若 realtime multi-user 成为目标，暂停重评。

---

## 16. 检查点

CP-0：产品交互契约、IA、DTO sketches 和 fixture set 已批准。

CP-A：确定性 core 探索验证作为正式测试通过。

CP-B：Core dispatch、op-log replay、projection 和 CLI DTO 契约稳定到足以支撑 web / editor 集成。

CP-C：HeroUI shell、route map 和 query layer 基于 entity / node DTOs 运行。

CP-D：Lexical editor 保留 node identity，并支持 nested code / table fixtures。

CP-E：CLI、web、editor、projections 和 mirror 在 fixture vault 上通过端到端验证。

---

## 17. 暂停条件

出现以下情况时暂停并让用户决策：

- 产品范围扩展到实时多人协作。
- Package / workspace 边界需要改变。
- 某个 UI 要求无法映射到 core entity / node / op concepts。
- 某个目标编辑器行为要求持久化 Lexical EditorState。
- 导入现有内容需要做超出已记录 Markdown 限制的数据丢失选择。
- HeroUI constraints 与必需的 editor / workspace behavior 冲突。
- CLI 契约需要暴露阶段 0 DTO sketches 未覆盖的新公开 schema。

---

## 18. 停止条件

当本文档已经把 Anchor 定义为新的实体 / 节点原生产品，包含交互架构和完整 UI 重新设计范围，保留 core ownership boundaries，给出有序实现阶段，列出验证证据，并明确实现仍待单独授权时，本规划任务完成。

授权后的第一个实现单元是阶段 0：产品交互契约、route / IA contract、DTO sketches 和 fixture set。
