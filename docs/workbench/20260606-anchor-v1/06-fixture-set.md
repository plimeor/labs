# Anchor Phase 0 — Fixture Set

日期：2026-06-07
状态：Phase 0 → CP-0 整合稿。本文件是 `docs/workbench/20260606-anchor-v1/` 下的 **workbench 工件**，**不是**公开接口契约。创建本 workbench 目录**不授权**创建 `suites/anchor`、`apps/anchor-*`、`packages/anchor-*`、任何顶层 `anchor-apple/`，也不授权修改任何 `package.json` / `bun.lock` / 任何 `tsconfig` / workspace 配置或生成的 lockfile。本文件不写 Rust / Swift / TS 代码、不实现 `anchor-core`、不创建 Apple 工程、不跑 Apple build。

> **本文件的角色：** 这是 Phase 0 packet 的一份，对应主计划 §11「阶段 0」产物清单中「Fixture set 至少覆盖……」与冲突方案 §13.2「建议补入 §11 fixture set 的冲突 fixture」。Fixture 在 Phase 0 是**设计产物**：每条只给 `id / name / 它锻炼什么 / 它支撑的验收断言`，**不写任何测试代码**。测试只在后续阶段被授权（主计划 §11 阶段 1「`cargo test -p anchor-core` 把 spike case 落成正式测试」，§9 包含项「覆盖确定性序列化、replay、merge、import / export、编辑器身份和 core 写入校验的正式测试」）。CP-0 的「证明」是手动设计复查（主计划 §11 阶段 0「证明」与 §12「手动 / artifact 证据：阶段0交互契约基于 fixture set 通过复查」）。
>
> 计划文件引用：plan = `01-apple-native-note-workbench.md`；conflict = `02-conflict-resolution-model.md`。Codex Step 2 Apple 现实核验 = `09-apple-verification.md`（本表的双端确定性 / TextKit / UTF-16 / 同步现实结论均吸收自该文件 §8.4 fixture patch list；细节与命令证据见该文件，不在本表复述）。同目录姐妹文件以相对名引用：`05-key-decisions.md`、`04-contract-baseline.md`、`07-project-layout-options.md`、`12-stage-1-spike-plan.md`。

## 怎么读本表

每个 fixture 是一行设计单元，字段含义固定：

- **id**：稳定标识 `Fnn`，本 packet 内永不复用；后续阶段把它落成测试时引用同一 id。F01–F40 编号沿用 Phase 0 草稿建立的集合（不重排）；F41 为 CP-0 整合期新增的边界 fixture（local-only 误放入 iCloud，D21a）；F42–F43 覆盖 iCloud segment 文件数预算 / batching（F42）与四-horizon retention（F43）。
- **name**：人类可读名。
- **Exercises（锻炼什么）**：触碰哪条 core / editor-core / 同步 / 设置语义，引用绑定它的计划章节。
- **Acceptance assertion（验收断言）**：复查者或日后测试会检查什么。措辞写成「可被一个 reviewer 在手动复查时判定通过 / 失败」的形态。

**证据态标注（与 packet 其余文件一致）：** `Observed`（Codex 本机实跑或官方文档直接支持）、`Recommended`（建议的目标状态 / 命令骨架）、`Needs user approval`（触 workspace/package/Apple project 边界、新公开 CLI schema、加密所有权、付费 Apple Developer Program、entitlement/容器、plan §13 暂停条件）、`Needs Stage 1 spike`（机制可行性已验证、Anchor 专属构建 / 运行未证，留待 Stage 1）、`Blocked`（当前环境硬门控、无法验证）、`Not run`（未执行项，不得当已验证事实）。本表所有 fixture 是平台无关 core / editor-core 设计产物，断言本身不依赖任何 workspace 布局；只有「Apple 双端确定性产物逐字节一致」「TextKit 行为」类**可达成性**依赖 Apple 现实，按下方标注分类。

**贯穿断言（DEFAULT，除非该行另行收紧或放宽）：** 凡涉及多 replica / 多 ingestion 顺序的 fixture，验收断言默认包含「物化态 **与** `Note.snapshot_revision` 在所有 replica、所有 ingestion 顺序下逐字节相同」（冲突方案 §4「持有同一 op 集合的任意两个 replica 物化出逐字节相同的 state 与相同的 `snapshot_revision`」、§13.2 每条均要求「deterministic replay + byte-identical snapshot_revision」）。涉及跨平台确定性产物（diff3 合并字节、fractional order key）的 fixture，额外断言「跨 target 逐字节一致」是强制 CI gate；该一致性来自**同一 Rust core 编译产物经 binding 调用**（by construction），**不**来自 TextKit / Swift 各自实现，验证向量集落在 Stage 1。**World A 取向下，一致性向量集纳入 `wasm32` 非-Apple target，不止 macOS + iOS**（冲突方案 §6.1 步 2、§6.4 修正 1、§12、§13.1 #4 #5；05-key-decisions.md D19、D26、D36；Codex 09-apple-verification.md §1、§8.4）。

**身份说明（贯穿）：** 普通 Note 创建时铸造随机 nanoid（主计划 §8.2 Note `id`）；journal Note 例外，`note_id = blake3("journal:" ‖ vault_id ‖ calendar_date)` 内容寻址派生，同 vault 同日恒为同一 Note，去重是身份不变量（主计划 §4.3、§8.2、§11；冲突方案 §6.9、§13.1 #9，已采纳为承诺模型）。Block id 为创建时铸造的随机 nanoid（主计划 §8.2 Block `id`）。
>
> **Stage 1 evidence（2026-06-07，concretization，F03/F05/F06/F07/F08/F35）：** 抽象 `‖` 在 `suites/anchor/core` 具体化为 `note_id = "jnl_" + hex(blake3("journal:" + vault_id + ":" + calendar_date))`（冒号分隔，`jnl_` 前缀区分随机 nanoid）；身份不变量不变。已落成测试 `identity` / `journal_restore` / `determinism_vectors`（Observed）。详见 `05-key-decisions.md` D08 Stage 1 evidence 与 `docs/workbench/20260606-anchor-v1/`。

**Apple 现实标注（贯穿）：** 涉 Apple TextKit / Swift bridging / 双端确定性产物的 fixture 行，其编译 / runtime 机制面为 `Observed`——scratch demo 已证 macOS `NSTextView` runtime probe、`UITextView` 编译面、UTF-16 selection、semantic undo closure（证据见 09-apple-verification.md §6）；Stage 1 已补足 macOS IME marked-text commit、hit-testing insertion index、direct-buffer undo suppression、accessibility selected range readback、adapter view-model projection patch replay、AppKit `keyDown` capture、真实 AppKit `NSView` / `NSTextView` hierarchy insert/move/remove lifecycle、AppKit first-responder keyboard routing、AppKit accessibility hierarchy labels + selected ranges across two text surfaces、AppKit selector / menu item sender routing split / merge-backward intent、AppKit responder-chain `undo:` selector routing to semantic undo with buffer unchanged、AppKit split/scroll hierarchy focus lifecycle、iOS Simulator `UITextView` runtime 的 UTF-16 selection、marked-text commit、`UIKeyInput` split/merge-backward capture、scroll-hosted identity + accessibility labels、iOS Simulator `UIScrollView` / `UITextView` hierarchy insert/move/remove lifecycle，以及 iOS Simulator `UIKeyCommand` + `UITextView` responder target-action routing split / merge-backward command 机制证据（27-textkit-runtime-floor-report.md；47-textkit-accessibility-range-report.md；48-textkit-patch-replay-projection-report.md；49-textkit-keyboard-intent-capture-report.md；50-textkit-appkit-view-lifecycle-report.md；51-textkit-first-responder-keyboard-routing-report.md；52-textkit-accessibility-hierarchy-report.md；53-textkit-menu-command-routing-report.md；54-textkit-responder-undo-suppression-report.md；55-textkit-focus-lifecycle-report.md；56-uikit-textview-runtime-report.md；57-uikit-view-lifecycle-report.md；58-uikit-menu-command-routing-report.md）。Polished cross-block continuous native selection / product accessibility mapping / product AppKit view integration / UIKit product app-hosted patch replay / product menu system / full product focus lifecycle / product undo grouping / 双端 bit-reproducible 向量集仍为 `Needs Stage 1 spike` 或 open gate。

---

## A. Structure / Navigation（结构与导航）

锻炼 Note / Block tree、`parent_note_id` / `parent_block_id`、`Notes` 投影、journal 内容寻址身份与 Calendar 派生投影（主计划 §4.1、§4.3、§5、§8.2）。

| id | name | Exercises | Acceptance assertion |
|---|---|---|---|
| F01 | 顶层 Note | `parent_note_id = null` 的普通 Note 进入侧边栏 `Notes` 投影；`Notes` 是导航投影不是系统容器（主计划 §4.1、§4.3、§8.2） | 创建 `parent_note_id = null` Note 后，`Notes` 投影列出它且不要求额外打开资格；`Notes` 本身不作为 op target、不拥有 parent 语义 |
| F02 | 子 Note / subpage | `parent_note_id = another NoteId` 的 Note 表现为父 Note 内 subpage，也可作为工作区 root 直接打开；交互与普通 Note 一致（主计划 §4.3、§6.4、§8.2） | 设 `parent_note_id` 指向另一 Note 后，子 Note 不出现在顶层 `Notes`、出现为父 Note 的 subpage；可被打开为工作区 root 并显示 breadcrumb 来源上下文 |
| F03 | journal Note | journal 是带 `calendar_date` 隐藏属性的普通 Note，`note_id` 由 `calendar_date` 内容寻址派生；通过「今日」入口与 Calendar 进入（主计划 §4.3、§5、§8.2；冲突方案 §6.9） | 「今日」入口创建当天 journal 后，其 `note_id == blake3("journal:" ‖ vault_id ‖ calendar_date)`；`calendar_date` 是隐藏属性，不进入 `parent_note_id`，journal 的 `parent_note_id` 按普通 Note 规则处理 |
| F04 | Calendar 年 / 月 / 周 / 日期投影 | Calendar 是 journal 的日期聚合 projection；年 / 月 / 周只作 UI 分组，不进入 `parent_note_id`（主计划 §4.3、§5、§8.2 `Calendar`） | 给定一组带不同 `calendar_date` 的 journal Note，Calendar projection 按 `calendar_date` 派生出确定的年 / 月 / 周 / 日期分组与排序（Phase 0 须冻结 Calendar projection 排序，主计划 §8.2、§11）；分组不写入任何 Note 的 `parent_note_id` |
| F05 | 同日 journal 去重（内容寻址身份） | 两次离线创建「同一天」退化为对同一 target 的幂等 create；身份不变量根除同日 race（主计划 §4.3、§8.2 `Calendar`；冲突方案 §6.9、§13.2「journal 同日」） | 两设备离线各创建当天 journal → 铸出**同一** `note_id` → 两条 create 是对同一 target 的幂等 create；最终为一个 target，无第二 Note、无 loser；ingestion 顺序无关、两 replica `snapshot_revision` 逐字节相同（详见冲突区 F35） |
| F06 | journal `calendar_date` 隐藏属性 | `calendar_date` 既是 content-addressed `note_id` 派生输入，也用于日期查询 / 跳转 / today projection / Calendar 聚合；同日唯一性 by construction，无运行时去重检查（主计划 §4.3、§8.2 `calendar_date`） | `calendar_date` 不作为可见 title / body 内容暴露，不拥有归属语义；以它做日期查询 / 跳转命中正确 journal；同日唯一性由身份派生保证，无需运行时去重或结构化 merge |
| F07 | journal rename / move 不触身份 | 身份是创建后稳定的派生 id，即便 `calendar_date` 被编辑也永不重派生；rename 改 title runs（`content.body`）、move 改 `location`，均不触身份（主计划 §4.3、§8.2、§11；冲突方案 §6.9 alias story） | rename journal 只改 title runs、move 只改 `location`，`note_id` 不变；刻意改日期建模为 create-new-id + move-content 并 surface，绝非 id 突变 |
| F08 | journal trashed 后重开 restore | journal 被 trashed 后重开「今日」解析回同一 content-addressed id 并 restore，不产生重复（主计划 §8.2、§11；冲突方案 §6.9、§13.1 #9、§13.2） | trash 当天 journal 后再开「今日」→ 解析回**同一** `note_id` → dispatch `restore`（`life → active`）该节点，而非铸造重复 journal |

---

## B. Schema / Semantics（模式与语义）

锻炼 title `$type` / `#tag`、body block `#tag`、嵌套 tag tree、嵌套容器、表格行内引用、unsupported 无损载体、relation prop、embed/transclusion、type / PropDef（主计划 §4.1、§6.3、§6.5、§6.6、§8.2）。

| id | name | Exercises | Acceptance assertion |
|---|---|---|---|
| F09 | title `$type` | `$xxx` 在 title 区域设置 Note 的 `type_id`（语义等同 supertag），存为结构化 `type_id` 而非 title 字符串正则（主计划 §4.1、§6.4、§8.2 `type_id`） | title 输入 `$book` 后，Note 的 `type_id` 解析为结构化 type 引用；title runs 可投影出 `$type` token；`type_id` 是独立寄存器 / cell，不靠脆弱正则从 title 字符串重解析 |
| F10 | title `#tag` | `#xxx` 在 title 区域给整个 Note 打 tag，进入 Note 级 `tags` refs（主计划 §4.1、§6.4、§8.2 Note `tags`） | title 输入 `#research` 后，进入 Note 级 `tags`；tag tree 从 tag registry + usages 派生；不污染 block 级 tag |
| F11 | body block `#tag` | `#xxx` 出现在正文 block 中给对应 block 打 tag，进入 block 级 `tags` refs（主计划 §4.1、§6.4、§8.2 Block `tags`） | 正文 block 内 `#todo` 进入该 block 的 `tags`，不进入 Note 级 `tags`；与 F10 的 Note 级 tag 是不同归属 |
| F12 | 嵌套 tag tree | Bear 风格嵌套 tag 路径；tag tree 从 tag registry 与 usages 派生，是投影非文件夹树（主计划 §4.1 Type/Tag/PropDef、§5 Tag tree、§6.4） | `#parent/child/leaf` 形成嵌套路径；Tag tree 投影展示层级、计数与进入对应 Note / block 集合入口；它不拥有存储结构、不等于 `parent` 关系 |
| F13 | 嵌套 list-item 内含 code block | `list-item` 是容器，code 等 block 可作其子 block；缩进由 block parent / order 表达，不由行首空格（主计划 §6.3、§8.2 行内容器 / 叶子 block） | `list-item` 通过 `parent_block_id` 持有一个 `code` 子 block；嵌套关系存在 block tree 而非文本缩进；code block 不拥有外层 block tree |
| F14 | 带行内引用的表格 | table / row / cell 是一阶可合并 block；cell 内含行内 ref；表格不以 Markdown pipe 文本为编辑真理（主计划 §6.3、§8.2 表格） | table → row → cell 形成 block 子树；cell 内行内 ref 保存稳定 target id；表格结构不依赖 pipe 文本；插入 / 删除 / 移动行列是 block op |
| F15 | unsupported block（无损载体 + min_schema） | 带 `min_schema` 与无损 payload 的 unsupported block：可读 / 可移动 / 可复制 id，不允许破坏性编辑 payload（主计划 §6.8、§8.2 兼容载体） | unsupported block 保留完整无损 payload 与 `min_schema`；UI 一等呈现为可读 / 可移动 / 可复制 id；不允许破坏 payload；newer schema 时提示只支持部分操作 |
| F16 | relation prop | relation prop 表达 typed edge；relation 目标是普通 `props` key，保存 id-keyed value 指向 PropDef（主计划 §4.1、§6.5、§6.6、§8.2 Note `props`） | relation prop 保存为 `props[k]` 的 typed value（指向稳定 target id）；类型校验 / relation 目标校验 / 默认值由 core schema projection 提供；无关 prop 编辑永不丢 relation（与 F32 一致） |
| F17 | embed / transclusion | embed 表达 transclusion，是派生展示（主计划 §4.1、§6.5、§8.2 叶子 block） | embed block 保存被引 target 的稳定 id；transclusion 是派生视图，被引 Note 改名不改引用方 rev（主计划 §6.5） |
| F18 | type / PropDef | `type`（supertag）与 `PropDef` 是 schema block；由 Schema 工作区管理；校验 / 默认值 / 显示标签 / 排序由 core schema projection 提供（主计划 §4.1、§6.6、§8.2 Schema block） | 定义一个 type 与若干 PropDef 后，Note 的 `props` / `type_id` 按 PropDef 校验；type 语义等同 supertag；显示标签与排序来自 schema projection 而非 Note 本体 |

---

## C. Selection / Editing（选择与编辑）

锻炼 `anchor-editor-core` 的 portable selection / `EditorIntent` / 跨 block 拆分建议，以及 `anchor-core::dispatch` 的 tree invariant 与最终非法结构拒绝（主计划 §6.1、§6.2、§8.1、§8.5）。

> **边界提醒（贯穿 C 区）：** `anchor-editor-core` 是 `anchor-core` **内部无 UI 模块**（非独立 crate/package），**只**拥有 portable selection / intent shaping / 选择提升降级 / paste fragment shaping / 跨 block 拆分**建议** / platform patch 生成 / undo intent 映射；tree invariant、schema-aware normalization、op creation、merge 与**最终非法结构拒绝**归 `anchor-core::dispatch`（主计划 §8.1）。平台 selection / TextKit range / view identity **永不进入持久化**（主计划 §4.2、§8.1、§13）。**跨 block 连续文本选择能力本身仅 Stage 1 spike，非 first-release UI 承诺**（主计划 §6.1；Codex 09-apple-verification.md §8.4「F22 cross-block continuous selection 只是 spike-only」、§8.7「移出首期范围」）；首期跨 block 文本选择**只产出拆分建议**，落盘前必须被 core normalizer 拆成合法 block op 或明确拒绝。
>
> **Apple 机制证据（贯穿 C 区，`Observed`）：** macOS `NSTextView` / iOS `UITextView` adapter 编译面已在 macOS + iOS simulator 编译通过；macOS `NSTextView` runtime probe 已实跑设置 UTF-16 selection、layout manager / text container 可用、`UndoManager` semantic undo closure 可执行（Codex 09-apple-verification.md §2.4）。Stage 1 已观察 macOS IME marked-text commit 到 `EditorIntent.insertText`、hit-testing insertion index、controlled direct-buffer undo suppression、`accessibilitySelectedTextRange()` 回读当前 selected range、adapter view-model projection 对 insert/move/remove text surface patch 的回放、AppKit `keyDown` capture 到 split/merge-backward intents、真实 AppKit `NSView` / `NSTextView` hierarchy insert/move/remove lifecycle replay、AppKit first-responder keyboard routing across two text surfaces、AppKit accessibility hierarchy labels + selected ranges across two text surfaces、AppKit selector / menu item sender routing split / merge-backward intents、AppKit responder-chain `undo:` selector routing to semantic undo with buffer unchanged、AppKit split/scroll hierarchy focus lifecycle across two text surfaces、iOS Simulator `UITextView` runtime 的 selection / marked-text commit / `UIKeyInput` split-merge capture / scroll-hosted identity + accessibility label、iOS Simulator `UIScrollView` / `UITextView` insert/move/remove lifecycle replay，以及 iOS Simulator `UIKeyCommand` + `UITextView` responder target-action routing split / merge-backward command（27-textkit-runtime-floor-report.md；47-textkit-accessibility-range-report.md；48-textkit-patch-replay-projection-report.md；49-textkit-keyboard-intent-capture-report.md；50-textkit-appkit-view-lifecycle-report.md；51-textkit-first-responder-keyboard-routing-report.md；52-textkit-accessibility-hierarchy-report.md；53-textkit-menu-command-routing-report.md；54-textkit-responder-undo-suppression-report.md；55-textkit-focus-lifecycle-report.md；56-uikit-textview-runtime-report.md；57-uikit-view-lifecycle-report.md；58-uikit-menu-command-routing-report.md）。Polished cross-block continuous native selection / product accessibility mapping / VoiceOver/UI runtime / product AppKit view integration / UIKit product app-hosted view hierarchy patch replay / product menu system / full product focus lifecycle / product undo grouping 仍为 open gate。

| id | name | Exercises | Acceptance assertion |
|---|---|---|---|
| F19 | 单块文本选择（含 composed character + IME commit） | 普通文本选择作用于行内内容与 range marks；`EditorSelection` 文本选择表示；对外 offset 以 UTF-16 code unit 计；composed character 与 IME marked-text commit 的 offset 边界须确定（主计划 §6.1、§8.1、§8.2 行内 offset；Codex 09-apple-verification.md §8.2 D18 / §8.4 F19） | 三子断言：(a) 单块内文本选择映射为 `EditorSelection` 文本选择，行内 offset 以 UTF-16 code unit 表达，选择不持久化、只作输入 / 命中测试；(b) **composed characters**——对单 emoji、ZWJ 序列（如 family emoji）、combining mark、surrogate-pair 字符，选择 / 光标 offset 落在合法 UTF-16 边界、不切开一个 grapheme 的 surrogate / combining 单元；(c) **IME commit**——marked（预编辑）文本提交后，最终 `EditorSelection` 与插入区间以提交后 UTF-16 offset 表达，预编辑临时态不进入持久化。对外 UTF-16 是合理 Apple 边界（`Observed`：macOS runtime probe 可设 UTF-16 selection）；core 内部单位与 Swift/Rust 换算用 emoji / ZWJ / combining mark / CRLF / IME marked-text fixture 验证 = `Needs Stage 1 spike`（09-apple-verification.md §8.6） |
| F20 | block 选择 | 选中一个或多个完整 block，作用于 move / delete / duplicate / wrap / tag / type / props / copy link / transclude（主计划 §6.1、§8.1） | block 选择映射为 `EditorSelection` block 选择；其上的结构动作产出对应 `EditorIntent`（move / wrap / tag 等），经 dispatch 校验为合法 op；点击 block handle / 原生选择控件进入 block 选择 |
| F21 | 嵌入编辑器（code payload）选择 promote / demote | code block 内局部编辑器选择仅作用于 code payload；跨出 code block 回到外层 block 选择；`Esc` / `Cmd+A` 提升降级规则由 `anchor-editor-core` 拥有（主计划 §6.1、§6.3、§8.1） | 四子断言：(a) code block 内选择只作用于 code payload（含 language / fold state / 局部选择）；(b) `Esc` 从嵌入编辑器回 block 选择再回工作区焦点；(c) `Cmd+A` 先只选代码内容、再次触发才提升到外层 block 选择；(d) 提升 / 降级规则归 `anchor-editor-core`（平台无关）。**Native adapter 证据要求：** promote / demote 须由 native text-view adapter（macOS `NSTextView` / iOS `UITextView`）驱动 `EditorIntent` 边界——锚点为 macOS `NSTextView` runtime probe 已 `Observed` 可设 UTF-16 selection / layout / semantic undo（09-apple-verification.md §2.4）；嵌入 code editor 的真实 promote/demote 事件流 = `Needs Stage 1 spike`（09-apple-verification.md §8.6 embedded editor selection / undo） |
| F22 | 跨 block 编辑拒绝 / normalizer 拆分 | 跨 block 文本选择允许形成**一个编辑意图**，但落盘前必须被 core normalizer 拆成合法 block op；非法结构在最早可确定位置被拒绝，core 校验是最终关卡（主计划 §6.1、§6.2、§8.1、§8.5 步 3–4） | 跨 block 选择产出一个 `EditorIntent`，`anchor-editor-core` 给出拆分**建议**；`anchor-core::dispatch` 把它规范化为合法 block op 或**明确拒绝**（返回 `Conflict` / validation error，CLI 退出码语义见主计划 §8.1）；不存在仅前端持久状态、不要求 Markdown 字节真理。**范围声明：** 跨 block **连续原生文本选择**（多 text surface 跨视图连续选区）**仅 spike-only，非 first-release UI 承诺**；首期只产出拆分建议 + core normalizer 拆分 / 拒绝，不承诺 polished 跨视图选区 UI（Codex 09-apple-verification.md §8.4 F22、§8.7） |

---

## D. Conflict（冲突 — 源自冲突方案 §13.2）

每条 fixture **均**断言：确定性 replay + 在所有 replica、所有 ingestion 顺序下物化态与 `snapshot_revision` 逐字节相同（冲突方案 §4、§13.2 总述）。全序键固定为 `T = (hlc.wall, hlc.logical, hlc.device, actor, op_id)`（冲突方案 §4）。三 dispatch register 固定为 `location / content / life`（产品不变量，冲突方案 §3.1）；`content` 内部分解为具名 sub-field cell `{body, type_id, props[k], tags[t]}` 各带 `sub_rev`（冲突方案 §3.2）。

> **双端确定性产物（贯穿 D 区涉 macOS / iOS 逐字节一致的行，`Needs Stage 1 spike`）：** F23（diff3 合并字节）、F26（fractional order key）的「macOS / iOS 逐字节一致」断言来自**同一 Rust core 编译产物经 binding 调用**——diff3 与 fractional order-key 推荐**只在 Rust core 内执行**，不由 Swift / TextKit 各自实现，则跨 target 逐字节一致 by construction（Codex 已确认此结论，09-apple-verification.md §1、§5、§8.4 F23/F26）。deterministic bytes 来自 Rust core vectors，**不**来自 TextKit / Swift 专属实现；CI 一致性向量集仍是强制 gate，**World A 取向下纳入 `wasm32` 非-Apple target（不止 macOS / iOS，05-key-decisions.md D19/D26/D36）**，其 pinned bit-reproducible 实现与向量集落在 Stage 1（冲突方案 §6.1 步 2、§6.4 修正 1、§13.1 #4 #5）。任何独立于 Rust core 的 Swift 侧 diff3 / order-key 语义实现明确移出首期范围（09-apple-verification.md §8.7）。

| id | name | Exercises | Acceptance assertion |
|---|---|---|---|
| F23 | 并发同段 body 编辑 | `body` cell 的确定性 3-way diff3 / keep-both，绝不静默 LWW；auto-merge vs keep-both 的**选择**是 op 集合纯函数、与 per-device compaction watermark 无关（冲突方案 §5.3、§6.1、§10「Compaction × 文本」、§13.2 第1条） | 三个子断言全须成立：(a) **不相交 hunk** → 确定性 auto-merge，两 replica 物化 body **与** `snapshot_revision` 逐字节相同，且在「两种 ingestion 顺序」**与**「不匹配的 per-device watermark」下均相同；(b) **重叠 hunk** → keep-both（高-`T` 侧活跃，loser 作派生 Multi-Value body 带 `losing_op_id`，零丢弃），下一条支配写入坍缩；(c) **base 低于 watermark / `base_sub_rev` ≠ 快照记录 sub_rev** → 确定性降级 keep-both（非数据丢失、非 fork）。伴随：合并文本变化后 normalizer 对每个 UTF-16 mark offset 重新 clamp（expand mark 长入 seam、non-expand 不长入），mark 存活独立可判。**双端一致（`Needs Stage 1 spike`）：** diff3 合并字节的 macOS / iOS 逐字节一致来自 Rust core vectors（非 TextKit/Swift 专属实现），为强制 CI gate，pinned 实现与向量集落 Stage 1。7-day UI conflict horizon 不改本 fixture 的 keep-both 判定；>7d 且 < watermark 的重叠不再 open-surface，但 loser payload 仍按 audit horizon 保留、其 ops 按 time-travel horizon archive 而非硬删（D14/D38）。 |
| F24 | move-vs-edit with parent change | `location` 与 `content` cell 不同 → 两条都应用；当 move 的 winning parent ≠ 失败 register base rev 观察到的 parent 时升级 surface（冲突方案 §5.3、§6.2、§13.2 第2条） | move 与 edit 都保留（move + tag-add + body-edit 三独立 cell 全保留）；当 winning parent 改变时 emit `ConflictRecord kind=location_relocated`（**非静默重定位**），提供非阻塞「留在这里 / 移回」动作；零新 op 种类 |
| F25 | 祖先 trashed + 后代 edited | `life` 不级联 + 派生 root-reachability 可见性 + 跨级冲突检测 + open-conflict pin 对抗 compaction（冲突方案 §5.4、§6.3、§8、§10、§13.2 第3条） | 收敛**且** emit `ConflictRecord kind=ancestor_life_vs_descendant_edit`（祖先被 trashed/deleted 且后代 content op 与之并发时）；**且**每条此类后代 content `op_id` 被登记为冲突成员、被 §7 pin，使 compaction **绝不**截断它（无静默丢失）；纯派生读模型、零新 op、`T` 序前缀纯函数。open-conflict pin 仅由解决（open→resolved）+ 因果稳定解除，绝不由 7-day wall-clock horizon 解除（conflict §10；D14/D38）。 |
| F26 | 并发 reorder + reorder_blend | 每节点 `location` 按 `T` LWW；逐字节相等 fractional key 由 `(hlc.device, actor, op_id)` 破除；order-key 生成器跨平台逐字节一致；并发整列表 renormalize 不打散（冲突方案 §5.2 规则5、§6.4、§13.2 第4条） | 四子断言：(a) order-key 生成器对相同 `(observed-base, target-gap)` 铸出逐字节相同 fractional key——该一致性来自 Rust core 单一实现，macOS / iOS by construction 相同（强制 CI gate，禁 jitter / 精度 / 字母表漂移，**`Needs Stage 1 spike`** 验证向量集，deterministic bytes 来自 Rust core vectors 非 TextKit/Swift 实现）；(b) move 既有 sibling 混出第三顺序时 emit `ConflictRecord kind=reorder_blend`，提供「恢复本设备顺序」批量动作；(c) 并发整列表 `renormalize` 携 base `snapshot_revision`，base 陈旧者视为 no-op 本地重派生、**不**盲目 LWW 合并两套整列表重写；(d) 无物销毁、所有块在场、两 replica 收敛同一确定顺序 |
| F27 | 2-cycle 与 N-cycle move（含跨 watermark） | apply-time 祖先 guard 整体拒绝 `{parent, order}`；成环 op 永远对完整因果前缀判定、跨 compaction 一致（冲突方案 §5.2 规则1–2、§6.5、§10、§13.2 第5条） | 四子断言：(a) 最终无环、无 orphan、无 fork；(b) cycle-skip **整体拒绝** `{parent, order}`（节点保留先前完整 winning location，**不**部分应用 order key）；(c) 「后被 fold 的成环 op 被拒绝」（高-`T` 成环 op 被跳过，低-`T` 先落定者胜出）；(d) 对称 2-cycle 与 N-node cycle 在两 replica **相反到达顺序** ingest 下 `snapshot_revision` 逐字节相同；跨 watermark 的成环 move 由 pin 对完整因果前缀判定 |
| F28 | 并发 scalar prop（含时钟跳变） | `props[k]` / `type_id` causality-aware per-cell LWW；open 冲突不被常规写入静默关闭；resolve op 记录弃值（冲突方案 §5.3、§6.6、§13.2 第6条） | 四子断言：(a) **causality-aware winner**——一侧 `base_sub_rev` 因果支配另一侧则取该侧，仅真并发才回退 wall-clock `T`（消除「手机时钟快 4 分钟旧 Mac 编辑胜出」）；(b) 同 key 真冲突时 loser 值保留并 surface value chip；(c) 对仍 open 的 ConflictRecord 的非解决性写入**不**静默关闭它；(d) 关闭冲突须 emit `resolve` op 记录被弃值（审计在原始 loser op 截断后仍存活）；不同 key 永不交互、relation 永不被无关 prop 编辑丢 |
| F29 | tag add-vs-remove（含 pre-existing tag、add/remove/re-add） | `tags[t]` OR-Set add-wins by `op_id`；remove 携 observed-add id 集合；add/remove/re-add 生命周期确定顺序无关（冲突方案 §5.3、§6.7、§13.2 第7条） | 五子断言：(a) 不同 tag → 交换；(b) 同 tag 并发 add-vs-remove → **add 胜**（remove 的 observed-set 不含该 add 的 `op_id`）；(c) 确实观察到 add 的 remove（observed-set 含该 add）→ 真序删除；(d) 「对已存在 tag 的 add」铸造新 add-identity（消除 pre-existing tag 歧义），add/remove/re-add 跨 replica 确定；(e) `T` 序作硬兜底；存储有界（observed-add id watermark-GC） |
| F30 | 并发 split-vs-overlapping-edit / merge-vs-edit | split / merge 是带 `macro_op_id` 分解为 primitive 的 macro-op；intent-rebase + 共享 group id；派生块纳入无丢失检测（冲突方案 §6.8、§13.2 第8条） | 三子断言：(a) **无重复 tail 文本**——tail = `(winning text)[o..end]` 由 intent rebase 构造保证，不重复也不陈旧；(b) **不相交 head 编辑不被降级**进隐藏 MV chip；(c) 派生块（如 bY）**纳入无丢失检测**与 ConflictRecord（其上重复 / 陈旧被 flag 而非静默上线），整组冲突 surface 为**一条** `kind=split_merge_structural`；merge（Y→X）对称：append + 对 Y 设 `life=trashed`（可逆、绝不静默 delete） |
| F31 | edit-vs-delete 同节点 | edit = `content` cell，delete = `life`，不同 register 两条都保留；物化为可逆 trashed + 编辑保留（冲突方案 §5.4、§6.3、§8 保证表、§13.2 第9条） | 三子断言：(a) 节点物化为**可逆 trashed**（lattice join，并发永不到终态 `deleted`）；(b) 编辑**保留在 `content`**；(c) restore 节点后**编辑完好**；surface 低优先级「Restore / 保留 trashed」；逆转现行 delete-wins-销毁-编辑规则 |
| F32 | 并发同段编辑——正交内容独立合并（辅助断言入口） | `location` / `content.body` / `content.props[k]` / `content.tags[t]` / `life` 是独立 cell，互不 stale-guard、互不 clobber（冲突方案 §5.3 原则6、§3.4） | move + tag-add + body-edit 同时发生 → 三者全保留；对不同 cell 的并发写入保持独立可合并，不返回 `Conflict`；同 cell 才触 `base_sub_rev` stale guard（此 fixture 锁住「sub-field 分解消除被制造出来的冲突」这一不变量，支撑 F23/F24/F28/F29） |

---

## E. Sync / Mirror / Settings（同步、镜像、设置）

锻炼 target/register stale guard、transport-agnostic `OpSyncPort` ingestion、post-commit mirror freshness、外观设置 normalize / clamp（主计划 §5.1、§7.2、§8.1、§8.4、§8.6、§13）。

> **同步边界提醒（贯穿 E 区）：** 同步单元是不可变 op-segment 文件（每设备独占命名空间 `.anchor/operations/<device_id>/<seq>.seg`，一封一密、永不修改，主计划 §8.4）。`.md` / `.json` 镜像是有损派生导出、**不进入同步**；SQLite projection 是可重建本地缓存、**不进入同步**（主计划 §8.4、§8.6）。同步走 core 定义的传输无关 `OpSyncPort`（list / pull / push segment + blob，仅 `SegmentId` / `BlobId` + 字节，无云类型，主计划 §8.1、§13）。首期 transport = iCloud Drive 文件适配器（core 永不出现 CloudKit / iCloud / `NSFileCoordinator` / `NSMetadataQuery` / ubiquity 类型）；CloudKit / CKSyncEngine 二期可选、**不作首期 fixture**。Apple 客户端 in-process binding 直接调 core（无网络）；`anchor serve` + `/rpc` 是可选 localhost 开发 / 测试传输，**非**产品同步通道（主计划 §8.1）。
>
> **iCloud 现实标注：** iCloud adapter 的 Foundation API 编译面对 macOS / iOS sim 可行（`Observed`：`ICloudAdapterProbe` 编译通过、`NSMetadataQuery` / `NSFileCoordinator` 可用，09-apple-verification.md §2.4）。运行期 ubiquity container / file package / placeholder download / conflict version 行为：**付费 ADP（Individual）team 已开通**，demo 已 `Observed` entitlement provisioning + 真机 ubiquity container lookup non-nil（09-apple-verification.md §2.6）；Anchor 自身 file-package runtime 归 `Needs Stage 1 spike`（须 Anchor signed app 在真实 account 观测）。**iCloud 契约（`Recommended`）：** Anchor vault file package 必须声明符合 `com.apple.package` 的 exported document type / `UTType`，否则 iCloud 会把 file wrapper 当普通目录枚举、`NSMetadataQuery` 可能返回 package 内部文件（09-apple-verification.md §8.1）。

| id | name | Exercises | Acceptance assertion |
|---|---|---|---|
| F33 | target/register conflict case | 本地 UI / CLI 写入携 touched cell 的 `base_sub_rev`（泛化自 base register rev）作 stale guard；不匹配返回 `Conflict`（CLI 退出码 3）（主计划 §8.3、§8.5 步 5、§8.1 退出码；冲突方案 §3.4） | 同一 cell 的并发本地写入，第二条 `base_sub_rev` 已陈旧 → dispatch 返回 `Conflict`（退出码 3）；对**不同 cell** / 独立 target/register 的写入保持独立可合并、不报冲突；register 级 rev 是 sub_rev 的派生 hash，**不**作写入 guard |
| F34 | sync merge case | 同步 ingestion 接受远端 op 进入 merge pipeline，按 `op_id` dedup + 每 actor 单调 HWM 做幂等与排序；合并是对 op 集合的 `T` 序纯 fold（主计划 §8.4、§8.5 步 6；冲突方案 §4、§7.3、§13.2 sync merge） | 三子断言：(a) **ingestion 顺序无关**——任意到达顺序 fold 出逐字节相同物化态与 `snapshot_revision`；(b) **幂等重投递（首期 iCloud Drive 面）**——同一不可变 op-segment 文件被 iCloud Drive re-deliver / 重复枚举（NSMetadataQuery 重报、placeholder 反复出现）时，经 `op_id` dedup + per-actor HWM 收敛为 no-op，确定性铸造的合并 op 由 dedup 在 `op_id` 上收敛为一条（杜绝「N 设备 N 条合并 op」）；(c) **CloudKit-specific re-delivery 不作首期 fixture**——CKSyncEngine 重投递 / change-token 语义属二期路线，本 fixture 首期只覆盖 iCloud Drive duplicate segment / re-delivery（Codex 09-apple-verification.md §8.4 F34；CloudKit 保持二期，§8.7）。增子断言 (d)：离线超 7 天 / 超保留窗设备回归，若 replay 基底 segment 已被 compaction 移出保留窗，则 fallback 整快照重拉 + replay-after-snapshot 仍逐字节收敛；conflict horizon 不改变该收敛义务（依赖 stale-peer 退出规则，D14/D38）。 |
| F35 | journal 同日 sync 合并（F05 的同步面） | 两设备并发创建当天 journal 铸出同一 `note_id` → 一个 target + 两 body 经 §6.1 不相交合并；纯 fold，不作者竞争 op（主计划 §4.3；冲突方案 §6.9、§13.2 journal 同日） | 两设备离线分别写当天 journal（如 Mac 晨记 + iPhone 晚记）→ 同一 target，两 body 经不相交 auto-merge 两者皆在、无隐藏内容、无败方；ingestion 顺序无关；含「journal 被 trashed 后重开『今日』解析回同一 id 并 restore、不产生重复」case（与 F08 一致） |
| F36 | mirror stale case | post-commit mirror job 写入失败只影响 freshness / diagnostics，op-log 保持已提交、后续真理层编辑继续用当前 materialized state（主计划 §6.8、§8.4、§8.6、§13；冲突方案 §10 Mirrors） | mirror 写入失败 → 记录 freshness / diagnostics 并 UI 一等呈现 stale mirror 状态；op-log **仍为已提交**、不回滚；`.md` / `.json` 镜像不进入同步（同步它会制造第二真理）；打开的 body 冲突在 `.md` 渲染为 git 式 fence、`.json` 携 `ConflictRecord`（解决仍经 op 流，绝不靠编辑 mirror） |
| F41 | local-only vault 误放入 iCloud（blocked open） | `sync="none"` vault 被手动挪进 ubiquity container → Anchor 识别 blocked misplacement、拒开、不挂 adapter、不 merge；typed `local_only_vault_in_ubiquity`（主计划 §8.4；05-key-decisions.md D21、D21a） | core 侧：vault config `sync="none"` + Apple adapter 判定 raw path / resolved path / raw `isUbiquitousItem` / resolved `isUbiquitousItem` 任一为 ubiquity → dispatch 返回 blocked（CLI 退出码 `4`、error `local_only_vault_in_ubiquity`、payload 含 `vaultPath` / `sync` / `detectedContainerKind` / `recommendedActions`）；**不挂载 `OpSyncPort`、不上传 / 拉取 / merge、不改 op-log**；提供 Move Back / Convert to iCloud Sync 两动作；隐私边界——不声称「字节绝不离开设备」。**Stage 1 observed floor（46-local-only-path-classifier-report.md）：** local sandbox vault allowed + backup excluded；direct iCloud vault、local symlink→iCloud、iCloud symlink→local 均 blocked。**Still open：** external volume / security-scoped bookmark / Finder UI move surface / `.icloud` placeholder / signed-out-unavailable account |
| F37 | settings case — 主题 | `ThemeMode = system \| light \| dark`（默认 `system`），实际生效 `Theme = light \| dark`；Apple 映射原生 appearance（主计划 §5.1、§7.2 主题） | 切换 `system` / `light` / `dark` 三段式均生效且默认 `system`；`system → light/dark` 解析保持独立关注点；持久化 key 由平台 settings store 决定（不进 op-log 真理层） |
| F38 | settings case — 字体选择 | 三字体选择器正文 / 标题 / 代码（`textFont` / `headingFont` / `codeFont`）；代码字体默认内置 `JetBrains Mono`，正文 / 标题默认系统字体，用户可在已安装系统字体中切换（主计划 §7.2；05-key-decisions.md D18a） | 代码字体默认 = 内置 `JetBrains Mono`，正文 / 标题默认 = 系统字体；用户可在本机已安装系统字体中切换三者；选择后即时生效不要求重启或重建文档模型；**未知字体被丢弃**——代码回退内置 `JetBrains Mono`，正文 / 标题对「不在本机已安装系统字体集」的值回退系统默认（**设备相关、主动接受**）。**已定（D18a，B7 批准 2026-06-07）：** 字体属外观 settings store、**不进 op-log 真理层**，故设备相关字体可用性只影响渲染、不破坏 `snapshot_revision`；原生系统字体枚举 / 切换实现待 Stage 1 验证（09-apple-verification.md §8.5） |
| F39 | settings case — 排版 clamp / normalize | 五数值字段按 §7.2 表 clamp / normalize；非有限值回默认、越界 clamp 到上下限、类型不符忽略保留默认（主计划 §7.2 表与 normalize 精度） | 按 §7.2 表逐字段断言 clamp 上下限与默认：`fontSize` 10–30（默认 15）、`lineHeight` 1–2（默认 1.5）、`lineWidth` 32–130（默认 48）、`paragraphSpacing` 0–2（默认 0）、`paragraphIndent` 0–3（默认 0）；非有限数值 → 默认；越界有限数值 → clamp 到上下限；类型不符（如字符串）→ 忽略并保留默认 |
| F40 | settings case — 重置 | 一键重置字体与排版恢复默认值；字体调整即时生效（主计划 §5.1、§7.2） | 一键重置把全部字体与排版字段恢复 §7.2 默认值；重置即时生效；主题与排版可为独立 store，重置语义对二者分别成立 |
| F42 | segment batching / file-count budget | op:segment 批比、最坏 burst、compaction 后稳态 segment 文件数；同步层压力是 segment 文件总数（synced filesystem objects）非 logical op 数（主计划 §8.4；05-key-decisions.md D06/D13） | **正常编辑下 N 个 logical op 不得产生 ~N 个 synced segment 文件**（batching 失效 = 不可接受 failure shape）；op:segment 比、burst、compaction 后稳态 segment count 可实测；50K ops 仅 smoke，million-op + steady-state budget 才足进 CP-1。**Needs Stage 1 spike**：segment-file-count scale 1K/10K/50K/100K 真机实测（12-stage-1-spike-plan.md §4；op-count 面 §1） |
| F43 | 四-horizon retention 正确性（time travel × compaction × GC） | conflict / replay-safety / audit / time-travel 四 horizon 边界；time travel（D38）一等能力反向约束硬删（主计划 §8.4；05-key-decisions.md D14/D38） | 七子断言：(a) 7-day conflict horizon 不解 open-conflict pin；(b) >time-travel-horizon 之内 op 只 archive（压缩 immutable segment / snapshot-delta chain）不 hard-delete；(c) 离线超窗设备整快照重拉收敛；(d) loser payload / resolve / tombstone 在 audit horizon 内可恢复；(e) restore = 前向 dominating op（非倒带/重写 log）；(f) 旧 `op_envelope_version` ops 经 read-time upcasting 重建出记录的 `snapshot_revision`（并入 D19/D30 一致性向量集）；(g) hard-delete 仅经显式 excise（非 compaction 副作用）。**Needs Stage 1 spike**（core，12-stage-1-spike-plan.md §1） |

---

## 覆盖矩阵（self-check，供 reviewer 核对）

主计划 fixture 清单要求 → fixture id：

- 顶层 Note → F01；子 Note / subpage → F02；journal Note → F03；Calendar 年/月/周/日期 projection → F04；同日 journal 去重 → F05（同步面 F35）；journal `calendar_date` 隐藏属性 → F06。
- title `$type` → F09；title `#tag` → F10；body block `#tag` → F11；嵌套 tag tree → F12；嵌套 list-item 内含代码 → F13；带行内引用的表格 → F14；unsupported block → F15；relation prop → F16；embed → F17；type / PropDef → F18。
- 单块文本选择（含 composed character + IME commit）→ F19；block 选择 → F20；嵌入编辑器选择（含 promote/demote）→ F21；跨 block 编辑拒绝 / 拆分 → F22。
- target/register conflict case → F33；sync merge case → F34；mirror stale case → F36；settings case → F37–F40。

冲突方案 §13.2 conflict fixture 要求 → fixture id：

- 并发同段 body 编辑（不相交 auto-merge / 重叠 keep-both / base 低于 watermark → keep-both）→ F23。
- move-vs-edit with parent change → location_relocated → F24。
- 祖先 trashed + 后代 edited → ancestor_life_vs_descendant_edit + pin 对抗 compaction → F25。
- 并发 reorder + reorder_blend + 整列表 renormalize 不打散 + 跨平台 order key 逐字节一致 → F26。
- 2-cycle 与 N-cycle move（含跨 watermark）→ 无环 / 整体拒绝 / 反向 ingestion `snapshot_revision` 逐字节相同 → F27。
- 并发 scalar prop（含时钟跳变）→ causality-aware winner + open 冲突不静默关闭 + resolve op 记录弃值 → F28。
- tag add-vs-remove（含 pre-existing、add/remove/re-add）→ OR-Set add-wins 确定 → F29。
- 并发 split-vs-overlapping-edit / merge-vs-edit → 无重复 tail + 不相交 head 不降级 + 派生块纳入无丢失检测 → F30。
- edit-vs-delete 同节点 → 可逆 trashed + 编辑保留 + restore 完好 → F31。
- journal 同日（含 trashed 重开 restore）→ F35（结构面 F05 / F08）。
- 辅助：正交内容独立合并不变量 → F32。

边界补充（非主计划 / 冲突方案原列表，源自 CP-0 整合期新增决策）：

- local-only vault 误放入 iCloud（手动挪入 ubiquity → blocked open + typed `local_only_vault_in_ubiquity`，不挂 adapter / 不 merge）→ F41（05-key-decisions.md D21、D21a）。
- segment batching / 文件数预算（op-count 与 synced-segment-file-count 两轴分离，排除每 op 一 segment）→ F42；四-horizon retention 正确性（time travel × compaction × GC，硬删须独立论证）→ F43（05-key-decisions.md D06/D13/D14/D38；12-stage-1-spike-plan.md §4）。

**首期排除能力 self-check（确认未被混入 first-release fixture）：** 跨 block 连续原生文本选择仅 F22 标注为 spike-only（非首期 UI 承诺，不作为可达成断言）；CloudKit-specific re-delivery 在 F34(c) 明确划归二期、不作首期 fixture；Web / Windows / Android iCloud 同步未出现任何 fixture；独立于 Rust core 的 Swift 侧 diff3 / order-key 语义在 F23 / F26 明确排除。本表无任何首期排除能力被当作可达成 first-release 断言。

---

## Open questions / 待 CP-0 解决（Phase 0 决策依赖，非本表自决）

以下 fixture 的精确边界取决于 Phase 0 待冻结决策（主计划 §11 关键技术决策、冲突方案 §13.1）；本稿据计划当前措辞写断言，**标注**依赖项供 CP-0 整合：

- **F04 Calendar projection 排序、F03/F08 journal 默认 parent 与 trash/restore 边界：** 依赖主计划 §8.2 / §11「冻结顶层 Note 内部表示、Calendar projection 排序、journal 默认 parent、trash/restore 边界」。
- **F19 UTF-16 offset 边界与 composed character / IME 换算：** 对外 UTF-16 是已确认的 Apple 边界（Codex `Observed`）；core 内部单位与 Swift/Rust 换算的 emoji / ZWJ / combining mark / CRLF / IME marked-text 向量验证落 Stage 1（`Needs Stage 1 spike`，09-apple-verification.md §8.2 D18 / §8.6）；具体内部单位冻结依赖主计划 §11。
- **F23 / F26 双端逐字节一致：** 依赖 pinned、跨平台 bit-reproducible 的 diff3 + order-key 生成器一致性向量集（冲突方案 §13.1 #4 #5）。Codex 已确认：deterministic bytes 应**只在 Rust core 内**生成（非 TextKit/Swift 实现），跨 macOS / iOS by construction 一致；向量集本身为强制 CI gate，落 Stage 1（09-apple-verification.md §1、§8.4）。**Stage 1 evidence（2026-06-07 / 2026-06-10）：** 一致性向量集已建立并固化为 golden（`suites/anchor/core/tests/determinism_vectors.rs`，含 diff3 合并字节、fractional order-key、canonical rev、vault `snapshot_revision`），`DIFF_ALGO_VERSION = 1` 已 pin；diff3/order-key 为 core 内唯一 vendored 实现；wasm32 + android 编译 gate 通过；repo-local runner executes native + wasm + iOS Simulator vectors; GitHub Actions workflow wiring exists for Linux native+wasm and macOS iOS Simulator jobs. Hosted GitHub run and Android execution remain open. Golden 值见 `15-core-evidence.md` §5，runner evidence 见 `25-cross-target-runner-report.md` / `31-cross-target-ci-wiring-report.md`。
- **F23(c)/F25/F34 watermark 与 compaction 交互：** 依赖主计划 §11「op-log compaction、GC 保留窗口与 manifest / cursor 协调」与冲突方案 §10 / §13.1 #6。retention 已扩为四 horizon（conflict / replay-safety / audit / time-travel）+ 两层 GC + stale-peer 退出规则（D14/D38），F42/F43 覆盖 segment 文件数预算与 retention 正确性。
- **F34 同步 transport 现实：** 首期 iCloud Drive duplicate segment / re-delivery 为本 fixture 范围；CloudKit-specific re-delivery 属二期、不作首期 fixture。iCloud 运行期 ubiquity 行为：付费 ADP team 已开通（基础 entitlement + 真机 ubiquity lookup 已 `Observed`，09-apple-verification.md §2.6），Anchor 自身 file-package runtime 留 `Needs Stage 1 spike`（09-apple-verification.md §2.6、§7.4）。vault file package 须声明 `com.apple.package` UTType（`Recommended`，09-apple-verification.md §8.1）。
- **F38 字体来源（已定，D18a / B7，2026-06-07）：** 内置 `JetBrains Mono`（代码）+ 正文 / 标题系统字体、用户可切换已安装系统字体；「未知字体被丢弃」对正文 / 标题成设备相关（主动接受，字体不进 op-log 真理层）。原生系统字体枚举 / 切换的实现行为本身 = `Not run`，留 Stage 1 由 Codex 验证。
- **F29 / F28 信封字段（`op_id` / `observed_adds` / `sub_field_key` / `base_sub_rev` 等）：** 依赖冲突方案 §7.1 / §13.1 #1「op-shape 冻结前预留全部信封字段」。

> **布局 caveat（非本表自决）：** 本表所有 fixture 是平台无关 core / editor-core 设计产物，不依赖任何具体 workspace 布局。布局：**用户已批准 Option A `suites/anchor/*`（2026-06-07）**（fallback Option C 顶层 `anchor-apple/` 仅实现期退路），详见 `07-project-layout-options.md`；Bun 对 `suites/*/*` 下无 `package.json` 目录的行为为 `Unknown`（未 scratch 实测，Stage 1 收口），**绝不**为适配 glob 添加 placeholder `package.json`。这些均**不**在本 fixture 表内决断。
