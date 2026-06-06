# Anchor 节点树架构：op-log 真理 + node-tree 物化态 + Lexical 视图

创建日期：2026-06-05
状态：设计（实现前方案；§5 关键决策已锁定，实现待用户放行）

> Planning record（历史记录，非当前接口契约）。实现后，权威且稳定的 CLI / API / schema / file format 契约归 `anchor-core` 包 README。本文固定的是动工前已商定的方向、关键设计与排序。
>
> 关联历史计划：`2026-05-24-anchor-lexical-markdown-editor.md`、`2026-05-24-anchor-v1-entity-model-and-editor.md`、`2026-06-01-editor-semantic-feature-renderer-plan.md`。`2026-05-30-anchor-operation-core-cli.md` 的 op-core / CLI 契约是本方案底座。

---

## 1. 方向

当前架构约束来自一个具体的表达力上限：**容器嵌套**——代码节点要能坐在嵌套列表项之下，而列表缩进与代码内容缩进都是行首空格、不可分离。这是 Markdown 存储不作为真理源的决定性约束，不是审美选择。历史证据也明确：旧 SolidJS 的 Lexical 富文本树静默重写了约 45% 真实实体；CM6 赢在字节保真，却把表现力封死（测试守着 `doc.toString() === body`）。

目标架构由五条方向组成：

- **真理 = append-only op-log**（event-sourcing，用户 2026-06-06 锁定）。每条 op 是某节点某寄存器的一次变更；SQLite 物化态与 `.md` / `.json` 文件都是 op-log 的纯函数 replay，可全量重建。同步归 Anchor 自管，以 op-log replay 为基础，不依赖 Dropbox / iCloud / git 文件夹的文件级同步作为真理层。
- **物化态是一棵 `anchor-core` 校验的节点树**：稳定 node id + 每节点 revision，结构与内容分离。
- **Lexical 只作渲染 / 输入视图**，绝不持久化 EditorState；编辑经 `dispatch` 翻成结构化节点 op 再 append op-log。
- **CLI 是唯一对外 agent / 自动化契约**：可组合、通用、比 MCP 省 token；现有 Rust clap CLI 是契约入口，MCP 留作以后薄 adapter。
- **CRDT 推迟**。保守假设是单人 offline-first + 多设备非实时同步——稳定 id 节点树 + 每节点 revision + merge-by-node-id 已够；CRDT 只在实时多人或离线改同段无损合并时回本，二者均未承诺。若改为实时多人，CRDT 与编辑器选型都要重评。

选 **Lexical** 而非 ProseMirror：permissive 嵌套是默认（无需 restrictive schema），节点 DX / React 贴合好；而“编辑器是 core 节点树的视图”这一架构，本就把 ProseMirror 的文档模型优势架空了——权威模型与所有结构运算都在 core。Code-block 边界采用 Lexical `DecoratorBlockNode` 内挂独立 CM6 `EditorView` 的形态，覆盖跨界 copy / undo / IME 的实现风险。

---

## 2. 节点数据模型（关键设计）

一条铁律贯穿全部：**磁盘 JSON 不是 canonical 形态**。文件可读、可 pretty-print；`rev` 永远算在 `canonical_serialize` 的输出字节上。校验完整性必须 parse 后重新编码，绝不比较文件字节。

**Entity = 文档分区 = 一棵 node 森林**，内部是扁平 `BTreeMap<NodeId, Node>`，树形由 `parent` 指针 + `order` key 重建——子节点从不存在父节点上（避免双真理源的合并冒险）。Entity id == 其 root node id；entity 级元数据（title / created / aliases / tags / extras / sourceRefs）住在 root node，因此与普通节点一样参与 merge。

**Node 是原子结构单元，也是合并单元**，关键字段：

- `id`：21 字符随机 nanoid，**创建时一次铸造**，与内容、位置解耦。拒绝 content-addressed（每次击键重铸）、path+ordinal（插入重编号、move 被读作 delete+create）、timestamp-counter（跨重导入不确定、泄露 wall-clock）、ULID（首位嵌 wall-clock，同样泄露）。
- `parent` + `order`：单父 ownership + per-child fractional-index 排序 key（base-62 字典序，确定性生成、无随机 jitter）。插入只触碰一个节点的 `order`；并发同 gap 撞 key 时由 `(order, id)` 的 id 分量确定性 tiebreak。
- `content`：tagged union，`kind` 即 payload key。容器类（paragraph / heading / quote / callout / list-item）承载行内；叶 / 装饰类（code / math / embed / file / divider / diff）；表格容器（table / row / cell）；schema 节点（PropDef / Class）本身也是节点，自带 id / rev / merge；外加 `Unsupported` 前向兼容载体（带 `min_schema`，旧客户端无损往返新版本节点）。
- `props` + `tags`：typed 字段（id-keyed，指向 PropDef 节点）与 class 应用（指向 Class 节点）。
- `rev`：`blake3(canonical_serialize(节点自身内容))`，**self-only**，不折后代 hash。
- `lww`：字段级 LWW 元数据，不进 `rev` 输入。

**行内富文本 = flat plain-text 串 + 排序、coalesced 的 typed range-mark 集**（`Inline { text, marks }`），既不是 markdown 串，也不是 inline 节点树。决定性理由是确定性：无序 mark 集排序后有唯一 canonical 形态，而嵌套 inline 树视觉相同却有多种字节、hash 不稳，`rev = hash(canonical)` 就不成立。mark 分两类——decorator（bold / em / code…，无 payload）与 annotation（link / ref / mention / tag，payload 是裸 `NodeId` 或 URL）；重叠无需嵌套，bold 与 link 区间可共存。offset 用 UTF-16 code unit（对齐 JS 视图）；`\n` 是合法软换行字符，只有硬节点边界才新建节点。

**引用全是指向稳定 `NodeId` 的 typed 边**，backlinks 永远派生、从不存储；保留 token 类型（`[[ ]]` / `#` / `(( ))` / link / @mention 不混为一谈）。行内 ref 存裸 target id、绝不存解引用文本，故被引节点改文本时引用方 hash 不变。Transclusion 是单 node 粒度的 `Embed { target, mode }`（Live，或 Pinned 到某子树 hash）。

**typed 字段是一阶 schema 节点**：PropDef / Class 各是一个节点，类型住在定义上，实例只 id-key 引用其值；relation 值是图边而非文本。这是 Notion / Tana / Logseq-DB 模型，拒绝 Logseq file-graph 的不透明 map 与 Roam 的 `::` 文本约定。

### canonical_serialize 与合并

`canonical_serialize` 是**显式确定性编码器**（RFC 8785 / JCS 规则），不是 `serde_json::to_string(Value)`：递归排序 key、固定字符串转义、无 token 间空白。关键约束是 **hash 输入里禁止 f64**——数字存 canonical 十进制串，从类型上消除 ECMAScript `Number::toString` 的 Rust / JS 漂移。`rev` 覆盖 `{id, parent, order, content, props, tags}`，排除整个 `lww`——这样两设备产出相同内容时能判 `rev` 相等、跳过合并。

`rev` 是 self-only 而非 merkle：merkle per-node hash 会在任意后代编辑时 churn 到 root 的每个祖先，使祖先 rev 不再是稳定指纹、不能兼作合并键。代价是 `Entity.revision = subtree_hash(root)`（write 返回的乐观并发 token）每次 save 仍要重算从被改节点到 root 的祖先链——可接受（实体节点数有限，且只祖先链、按子节点增量）。

**合并是 merge-by-node-id + 字段级 LWW**，不是整节点 clobber。每个节点拆三个独立 LWW 寄存器——`location`（parent + order）、`content`（content + props + tags）、`life`（tombstone）——各自比 HLC。这样 move-vs-edit 不互相覆盖：A 移动、B 改文本，合并同时保留两者。tiebreak 用 **HLC** `(wall, logical, device)` 而非裸 wall-clock——file-sync 没有消息通道去 bump Lamport，裸 wall-clock 会“字母靠后的设备永远胜”。删除是级联打 tombstone 到整个子树（不留孤儿），edit-vs-delete 取 delete-wins。op 日志每条记 `{node_id, register, base_rev, new_rev, hlc}`，离线无损 replay。

### entity 是派生谓词

“entity”（决定一个节点能否被搜索、进 Recents、在 `[[ ]]` / `@` 补全里浮现的粒度）是 Tana 原义的**派生谓词**：`is_entity(n) = !n.tags.is_empty() || n.parent.is_none()`，零持久化、与存储解耦。给子节点打 `#tag` 会让它立刻具备 entity 行为，无需离开所在文档。本轮范围只包含这个派生谓词；手动 override 与存储容器命名迁移不进入目标范围。

---

## 3. 编辑器视图与 anchor-core 衔接

**Lexical 映射**：容器 = permissive `ElementNode`（谓词只用于禁止非法嵌套，从不用于允许）；code / embed / file / diff = `DecoratorBlockNode`（code 节点内挂一个独立 CM6 `EditorView`，已确认可行），故可坐在 `ListItem` 之下——这正是 markdown 视图做不到的嵌套；inline = `TextNode` + format bitfield，annotation 包成 `LinkNode` / inline decorator。node id / rev 走 **NodeState API**（`$getState` / `$setState`），忽略 ephemeral `__key`。两个方向：`nodeTreeToLexical`（渲染）与 `lexicalToNodeOps`（回折为 canonical `Inline` → 跑 normalizer → 按寄存器 diff 出 op）——非 canonical 编辑经 normalizer 回流后**不改 hash**。

两条硬规则必须落实：替换型 transform（如 paragraph→heading）要显式 `$setState` 复制 id / rev，否则丢身份；Lexical 内建 list plugin 默认解包 `ListItem` 的非列表子节点，要让代码节点真正嵌进列表项必须覆盖其 normalization——这是实现期的已知硬点，视图侧需专门工作。

**写路径是直接重写、单一所有者**（迁移决策见 §5）。`dispatch()` 为唯一写关卡，所有写经私有助手 `write_validated_entity`：`validate(tree)` → append op 到 op-log（真理）→ replay 物化 DB → 原子写派生 `.json` / `.md` mirror。“每个写路径都校验”可被一次 grep 证明。Lexical 的结构规则只是冗余第一道防线；diff 在 core 算，编辑器只渲染。

**Markdown 是导入 / 导出边界，非真理**。(重)导入用 frontmatter 里的 `file_id` 定 entity 身份：`file_id` 缺失即新建 entity，命中即更新该 entity。导出 canonical `.json`（携带 node id，无损、可幂等重导入）+ 有损 `.md`（供 grep）。

---

## 4. 走向：分阶段与验证

迁移决策是**直接重写、不考虑任何兼容性**（§5）：目标系统直接建立在 node-tree + op-log 上。范围排除 transitional dual-write、compatibility parity gate、drain / re-base，以及任何 Markdown-truth coexistence mode。

**Phase 0 — 确定性 spike（在 copy 上跑，不绿就修到绿，不退回文件真理）**。CM6-in-Lexical 边界已确认可行，是 Phase 0 的前提。

- **canonical_serialize 确定性**：import → serialize → hash 往返字节稳定。
- **export mirror vs ripgrep parity**：镜像 + ripgrep 跑真实查询，与 core 在“缺失 / 陈旧 / 代码围栏内假边”处一致——逃生舱可信度的硬前提。
- **op-log replay 确定性**：N 条 op 从空 replay 与直接构造的节点树字节一致，乱序到达经字段级 HLC LWW 收敛同一态。

**Phase 1 — 核心地基**：`core/src/node.rs`（model / canonical_serialize+hash / validate / mint_node_id）；单写关卡 `write_validated_entity`；op-log append → replay 物化 → 原子写 mirror。

**Phase 2 — 导入 / 导出 / 投影**：markdown→树 importer（`file_id` 定 entity 身份，缺失即创建、命中即更新）；exporter（canonical `.json` + 有损 `.md`，`anchor export --watch` 与 projection 同一写后点、锁步）；SQLite projection 以树叶遍历提供边抽取，代码围栏假边由结构类型排除。

**Phase 3 — Lexical 编辑器**：节点树 ↔ Lexical 双向映射，code-block 内嵌 CM6；proposed-change diff 载荷使用节点 op；目标编辑器表面是 Lexical/node-tree 路径，并复用 code-block 语言 / 主题。

**Phase 4 — CLI 契约**：DTO 防火墙 + `apiVersion` 信封 + 每命令固定 TSV 列序 + node-id 读写接缝 + arm body 走 `dispatch`；契约文档写进 core 包 README。

**测试与回归门**：三个 spike 与各阶段验证落成**正式测试**（已授权）。Rust 片用 `cargo test -p anchor-core` + `cargo clippy`——`bun run check` / `lint` 是 tsc + biome，根本不编译 Rust，只管编辑器 / CLI-TS 片。Checkpoint CP-A：Phase 0 三个 spike 指标上报后才进 Phase 1+。

**Non-goals**：CRDT / Loro 实现、MCP server、实时多人、字节保真、fts5 排序搜索（export-mirror + ripgrep 已满足契约）、把 Rust clap CLI 改写成 command-kit、新 workspace、改 package boundaries / lockfile。

---

## 5. 已定决策

| 决策 | 选择 |
|---|---|
| CM6-in-Lexical 边界 | 已确认可行，作为 Phase 0 前提 |
| Code-node 路线 | Lexical + 内嵌 CM6（`DecoratorBlockNode` 挂独立 CM6 `EditorView`）|
| 测试落地 | 正式测试（cargo + 前端），已授权 |
| 迁移执行 | 直接重写，不考虑任何兼容性——无 parity gate / drain / 双写 |
| Heading | flat leaf sibling（1:1 映射 Lexical `HeadingNode` 与 markdown）|
| markdown (重)导入身份 | frontmatter `file_id`：缺失 = 创建，命中 = 更新 |
| edit-vs-delete | delete-wins |
| 表格 | 一期即落地 Table / Row / Cell 一阶可合并节点 |
| 附件字节 | content-addressed blob（节点只存 `BlobRef`），单附件 ≤ 64MB |
| 真理层 | append-only op-log（用户 2026-06-06 锁定）|
| entity | 派生谓词 `!tags.is_empty() \|\| parent.is_none()` |
| schema_version | per-entity + `Unsupported` 自带 `min_schema`（采纳推荐默认）|

**触发器**：若改为实时多人协作，CRDT + 编辑器选型需整体重评，本方案不覆盖。

---

## 6. Stop condition

关键决策已锁定（§5），方案就绪。**实现仍仅在用户明确放行后开始**，第一执行单元 = Phase 0 的三个确定性 spike（在 copy 上，落成正式测试）。在放行前不写代码、不改文件。
