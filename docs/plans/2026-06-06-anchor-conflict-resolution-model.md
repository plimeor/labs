# Anchor 冲突处置模型 — 最终设计（v1，§8.3–8.5 增强版）

> 本文档替代 / 增强现行 §8.3–8.5 中与冲突相关的内容。它保留三 register 产品不变量与 append-only op-log 真理层，但把「essentially register-level LWW」升级为一个对单用户多设备离线同步场景安全、确定、可 replay、无静默丢失的合并模型。文中对每一处经对抗验证暴露的缺陷，要么修正规则，要么显式记录为 phase-0 决策或已知限制，绝不回避。

---

## 1. 背景与判断

### 1.1 现行 register-level LWW 为什么不够

现行规则在 §8.4 被作者自我刻画为「essentially register-level Last-Writer-Wins」，叠加三条硬编码例外：move-vs-edit 两边保留、delete 级联整子树 tombstone、edit-vs-delete = delete-wins。对单用户多设备产品，这套规则有四类系统性失败：

- **`content` register 过粗导致制造冲突。** `content + props + tags` 共享一个 LWW slot。一个设备只加了一个 `#tag`、另一个设备只改了正文，二者在同一 register 上冲突，HLC 较晚的整份快照胜出，静默丢掉对方的 tag / prop / relation edge。语义上根本没有重叠的编辑被人为变成冲突。

- **行内文本 LWW 是最严重的日常数据丢失路径。** 两设备离线各改同一段落的不同句子，整个 `content` register 按 HLC 取较晚者，较早设备的整段编辑被无声丢弃。这是笔记应用最常见、最致命、且完全静默的丢失。

- **`life` 的 delete-wins 与终态不可逆是错误的默认。** delete-wins 凌驾 HLC：一个离线多日、时间更早的 delete 仍能击败用户当晚刚做的编辑；`deleted` 终态且无 restore，跨设备同步后不可撤销。对单用户产品，安全默认应是 delete 退让给 edit，而非销毁编辑。

- **子树 tombstone 级联与 reparent 竞态。** 删除容器会级联 tombstone「胜出 replay 态下」其下的一切，与并发「移出 / 移入」竞态：用户刚救出的子节点可能仍被 tombstone，刚移入的无辜节点会被一并删除。`life` 的爆炸半径是子树级，而用户心智模型是节点级。

此外，`location` 的并发 move-vs-move 是裸 HLC LWW（不像 move-vs-edit 两边保留），fractional-index `order` 按单节点 LWW 而不推理 sibling 集合，导致大纲 / 列表顺序可被打散；reparent 到并发被删的父节点会产生 dangling parent，且 §8.4 未规定修复行为；「field-level LWW」与「content 单 register」之间的粒度自相矛盾，实现者无法判断是整 register clobber 还是逐字段合并。

### 1.2 「单用户多设备离线同步、非实时协作」如何决定合理策略

这是本设计最重要的前提判断，它同时**放宽**和**收紧**了设计空间：

- **放宽：** 我们只需要调和**一个人**在自己设备间的意图，而不是多个互不信任的人的并发输入。这允许比 CRDT 协作**更强、更简单、更保守**的默认——例如「最保护性的状态胜出」「删除退让给编辑」「冲突时倾向保留」这类对单人合理、对多人协作未必合理的策略。

- **放宽：** 真正的字符级并发**极其罕见**，且**永不是实时的**。「在 Mac 上改首句、在 iPhone 上改末句」绝大多数落在不相交的 diff hunk 上，可被 3-way merge 自动合并；真正逐字符重叠的情况恰恰是人类愿意亲自看一眼的情况。这意味着我们**不需要** per-character 序列 CRDT（它落入 §13 暂停条件），就能解决 99% 的文本合并。

- **收紧：** 真理层是 append-only op-log，物化 state、`.json`、`.md` 全是 replay 输出。任何合并机制必须是 op 集合的**确定性函数**，在每个 replica 上 replay 出**逐字节相同**的物化态与 `snapshot_revision`。合并不能依赖到达顺序、本地 wall-clock，也不能依赖本地 compaction 历史。**这条是对抗验证击穿草案的核心标尺**：草案「在执行合并的那台设备上把结果写成一条 op」违反了纯 fold 语义，并让合并结果依赖 per-device watermark——最终设计必须修掉它（见 §3.1、§5.1）。

- **收紧：** 合并完全在 `anchor-core::dispatch` 内，不依赖 CloudKit record / zone / account 形状；op-log compaction（快照 + 截断）是 phase-0 决策，合并所依赖的任何信息必须在 replay-from-snapshot 后仍然成立。

**结论判断：** 正确的方向不是 CRDT，而是**在保守 register-LWW 之上做三件事**——(1) 把 `content` register 内部分解成 sub-field cell，让正交编辑不再互相 clobber；(2) 把「真实内容冲突」从 LWW 改为**确定性 3-way merge 或冲突并存（keep-both）**，永不静默取舍；(3) 把 `life` 从 delete-wins 改为**时钟无关的优先级 lattice**，删除可逆、终态仅由显式两步且因果支配编辑才可达。三件事都留在 §9 / §13 边界内（唯一一处 Kleppmann 祖先检查作为显式边界决策标注）。

---

## 2. 设计原则

1. **绝不静默丢失用户工作。** 任何「败方」只是失去**当前活跃值**的位置，其 payload 始终是 op-log 中一条可 replay 的 op，可通过追加一条支配性 op 恢复。唯一真正销毁内容的路径是「从 `trashed` 发起、因果支配所有编辑的显式 `delete`」叠加「compaction 越过 watermark」，且该路径被 §7 的 open-conflict pin 进一步约束。

2. **真实内容冲突优先「冲突并存 / 冲突副本」而非 LWW。** 对 `body` 这类有序文本，重叠编辑走 keep-both（Multi-Value），不相交编辑走确定性 3-way auto-merge；二者都不静默按 HLC 取舍。LWW 只用于**真正点值、语义不可合并**的 cell（scalar prop、type_id、单节点 location winner）。

3. **保持确定性与可 replay。** 物化态是 op 集合在全序 `T` 下的**纯 fold**。所有合并结果（包括 merge 后的文本字节、order key、冲突标记）要么是 op 集合的纯确定性函数，要么是一条**确定性铸造**的 op（其 `op_id` / `hlc` 由输入派生，使所有设备铸出**同一条** op、被 `op_id` dedup 收敛为一条）。合并结果**永不依赖到达顺序或本地 compaction watermark**。

4. **利用「字符级并发极罕见」这一事实。** 用确定性 diff3 自动吃掉常见的「改不同句子」，只把真正逐字符重叠的稀有情形留给 keep-both + 人工。不为最罕见的情形引入 per-character tombstone 的序列 CRDT（§13 暂停）。

5. **删除安全、可逆、节点级。** 并发只能把节点推到可逆的 `trashed`，永不并发推到终态 `deleted`。`life` 不级联；「子树消失」是**派生的可见性规则**（root-reachability over merged tree），而非命令式的级联 op，从而天然规避「救出 / 移入」竞态。

6. **正交编辑独立可合并。** `location` / `content.body` / `content.props[k]` / `content.tags[t]` / `life` 是独立 cell，互不 stale-guard、互不 clobber。move + tag-add + body-edit 三者全保留。

7. **冲突态是派生读模型，不是持久 sidecar。** `ConflictRecord` 在 replay 中派生，跨设备同样重算；解决冲突 = 追加一条 op。不复用 `provenance` / `approvalState`（避免与 §13 agent 审批暂停条件混淆）。

8. **诚实标注边界。** 凡触及 §9 / §13 暂停条件或模型变更的（Kleppmann 祖先检查、新增 conflict/resolve CLI schema；journal 内容寻址 id 触 §4.3 模型变更，已采纳为承诺模型并回填主计划 §4.3 / §8.2 / §11），一律显式标注，绝不当作「免费的胜利」静默采纳。

---

## 3. Register 模型

### 3.1 保持「恰好三个 register」作为产品不变量

`dispatch` 校验的、stale guard 路由的，仍是三个 register：`location` / `content` / `life`（§4.3 产品不变量）。**不**把 register 数量扩成 5——对抗与现状调研都指出「把 dispatch register 枚举加宽」为零新增能力而偏离已承诺的「恰好 3」不变量，是可避免的偏差。我们改为在 **`content` 内部分解出具名 sub-field cell**，每个 cell 自带 `sub_rev`，这是对现有 per-`(target, register)` guard 的**严格泛化**，不是新增 register 轴。

### 3.2 最终 register 集合与内部结构

| Register | 内部结构（Note / Block） | 合并机制 | 章节 |
|---|---|---|---|
| **`location`** | **一个原子复合值** `{parent, order}`。`parent` = parent_note_id / parent_block_id / 顶层 root sentinel；`order` = fractional-index key。**parent 与 order 永不拆分。** | 对整个 `{parent, order}` 按全序 `T` 做 LWW，叠加 apply-time tree guard | §5.2、§5.5 |
| **`content`** | 固定 sub-field map，每 cell 一个 `sub_rev`：`body`（行内文本 + marks，Note 为 title runs）、`type_id`（scalar）、`props[k]`（逐 key cell，含 relation edge）、`tags[t]`（逐 tag） | 逐 cell：`body` = 确定性 3-way merge / keep-both；`props`/`type_id` = causality-aware per-cell LWW；`tags` = OR-Set add-wins | §5.3 |
| **`life`** | 一个值 ∈ {active, archived, trashed, deleted} | 优先级 lattice join（时钟无关） | §5.4 |

### 3.3 为什么是这个粒度

- **不是 5 个顶层 register：** sub-field 分解已给出与 5-register 相同的「tag-add 与 body-edit 永不冲突」独立性，同时保住 dispatch「恰好 3」契约。
- **不是单个 content blob：** 现状把 content+props+tags 捆进一个 LWW slot 是调研第一名的静默丢失源。逐 cell 合并把这些被制造出来的冲突变成干净的独立合并，零新增 op 种类。
- **`body` 保持单个 cell（不逐字符）：** 逐字符 = 序列 CRDT = §13 暂停。`body` 是合并单元，我们让**这个单元变聪明**（§5.3、§6.1），而不是让 register 变粗。
- **`location` 保持原子：** 拆分 parent 与 order 会产生瞬态错位（Figma 的教训）。对抗验证 §6.5（成环 move）进一步证明：cycle-skip 必须**整体拒绝** `{parent, order}`，否则会留下一个为别的 sibling 空间铸造的 order key，造成 replica 间 `snapshot_revision` 分叉（见 §5.2 规则 1 与 §6.5）。

### 3.4 sub_rev 与 stale guard

- 每个 `content` sub-field cell 携 `sub_rev = blake3(canonical_serialize(cell_value))`（排除 lww）。
- 本地 `content` 写入携它**所触 cell** 的 `base_sub_rev`，仅当**该 cell** 在底下变化时返回 `Conflict`（CLI 退出码 3）。对**不同 cell** 的并发写入保持独立可合并。
- register 级 rev 仍存在，作为其 sub_rev 的**派生 hash**，供 `snapshot_revision` 与 UI staleness 使用——它**不是**写入 guard。
- `location` 与 `life` 无 sub-field，保持单一 register 级 rev。

### 3.5 不变项

三 register dispatch 不变量；`rev = blake3(canonical_serialize(self))` 排除 lww；`snapshot_revision` 为派生子树 hash；`order` 为确定性 fractional-index key 且有序编号派生不存储；合并全在 core；CloudKit 仅传输。

---

## 4. 全局收敛框架

同步 ingestion 把所有 op 按下面这个键做**全序**：

```
T = (hlc.wall, hlc.logical, hlc.device, actor, op_id)
```

每个分量机器可比，`op_id` 全局唯一，因此**两条不同 op 不可能 tie**——全序成立。Replay 是按 `T` 序对 op 集合的纯 fold。下文每条规则都是 `T` 序前缀的纯函数，产出确定性 rev，因此**持有同一 op 集合的任意两个 replica 物化出逐字节相同的 state 与相同的 `snapshot_revision`**。Ingestion 通过 `op_id` dedup + 每 actor 单调 high-water-mark（§7.3）做到顺序无关，到达顺序永不影响结果。

`snapshot_revision` / `canonical_serialize` 只 hash **物化输出**（最终文本 + 排序合并后的 marks + 最终 order key + 最终 scalar / life 值），**绝不** hash 任何 actor 相关的内部合并元数据；fractional-index 的 jitter / 随机性排除在 `canonical_serialize` 之外。

> **对抗修正（确定性基石）：** 草案曾说 body 合并「在执行合并的那台设备上写成一条 op」，这与纯 fold 矛盾，且让结果依赖 per-device watermark，被验证判为 `fails`（replica 分叉 + 静默丢失）。最终设计要求：**任何合并产物要么是 op 集合的纯确定性函数，要么是一条确定性铸造的 op**（`op_id` = `blake3` of inputs，使所有设备铸出同一条、被 dedup 收敛为一条）。auto-merge vs keep-both 的**选择**也必须是 op 集合的纯函数，**与本地 compaction watermark 无关**（详见 §5.3、§6.1、§7.2）。

---

## 5. 各 register 合并规则

### 5.1 通用：确定性产物的两种合法形态

1. **派生值（首选）：** 合并结果在每次 replay 中由 op 集合纯函数重算，不新增 op（例：location winner、props LWW、tag OR-Set 成员判定、可见性、dangling 重挂）。
2. **确定性铸造 op（仅当需要为 compaction 落定字节时）：** op 的 `op_id` 与 `hlc` 由输入派生（`op_id = blake3("merge" ‖ lower.op_id ‖ higher.op_id ‖ diff_algo_version)`，`hlc` 取两输入的确定性 join），`base_sub_rev` = 两输入的确定性 join，**仅由确定性 emitter 规则指定的单一 actor 铸造**（规则：最高-`T` 输入侧的 actor 铸造；其余设备等待并采纳）。所有设备铸出**逐字节相同**的 op，`op_id` dedup 收敛为一条。**绝不允许每台 ingest 设备各铸一条带不同 `op_id`/`actor` 的合并 op**（那是草案被击穿的根因）。

### 5.2 `location` — LWW + apply-time tree guard

1. **Winner：** 该节点最高-`T` 的 `location` op 设定**整个原子** `{parent, order}`。
2. **成环 guard（apply-time，确定性）：** 在 `T` 序 fold 中，若一条将要应用的 `location` op 会使 `target` 在**当前部分物化树**中成为自身祖先，则**整条** `{parent, order}` 被拒绝，节点**保留其先前完整的 winning location 值**（不部分应用 order key），并记录派生 `structural_skip` 标记。
   - **规范措辞（修正 3.5 与 2.1.2 的相反表述）：** 「按 `T` 序 fold；**后被 fold 的**那条会对当前物化树成环的 `location` op 是被拒绝的那条。」即**较高-`T` 的成环 op 被跳过**，较低-`T` 的先落定者胜出。这与「highest-`T` 整体 winner」并不矛盾：成环对中后到的那条必然撞上先落定的祖先链。
3. **Dangling-parent guard（read-time）：** 物化时，winning `parent` 为 `deleted` / 不存在的节点，确定性重挂到最近**仍存活**祖先（沿记录的 parent 链）→ 否则 Note root → 否则顶层 root sentinel。纯函数；父节点若后续 un-delete，下次 replay 自动归位。
   - **注意 `trashed` 父节点不触发重挂**（trashed 是合法隐藏节点），节点保持隐藏——这是有意的（见 §6.3）。
4. **缺失父到达规则（确定性，修正对抗 §6.2 缺口）：** 若一条 move 的目标 parent 在接收 replica 上尚未 ingest（CloudKit 乱序：先收到 move 后收到 create），该 move **被 hold-and-replay** 直到其 parent 的 create 被 ingest。仅当越过一个有界因果 frontier（该 actor 的 HWM 已超过 move 的 hlc 仍无 parent）后才落到 root-fallback。这使「瞬态 vs 永久 root 落点」不再依赖到达顺序。
5. **Order tie 与 key 生成：** 两 sibling 落成逐字节相等的 fractional key 时，按 `(hlc.device, actor, op_id)` 排序——**强制**，否则 sibling 顺序与子树 hash 永久分叉。key 是 base-N 任意精度字符串（绝不浮点）；normalizer rebalance 在 key 长度越界时作为普通可 replay 的 `renormalize` location op 发出（见 §6.4 并发 rebalance 规则）。

**收敛：** 物化 location = `T` 序 LWW → 确定性整体 cycle-reject → 确定性 root-reachability 重挂。同一 op 集合 ⇒ 同一棵树。∎

> **对抗修正（cycle-skip × compaction，§6.5/§6.2）：** 成环判定**永远对 `T` 序 op 前缀的逻辑 parent 图**进行，**禁止**把一条低于 watermark 的 move op force-rebase 到 compaction 快照树上。任何因果尚不稳定的 move op 被 **pin**（复用 §7 的 open-conflict pin 机制），使 skip 判定始终对完整因果前缀做出、跨 replica 与跨 compaction 时序一致。「跨 watermark 的成环 move」进入 §12 的 CI 一致性向量集。
>
> **物化流水线相位（修正对抗 §6.5 相位缺口）：** 单一确定性顺序——(a) 按 `T` 序 fold 所有 location/life op，对**经 life 解析后的树**做 apply-time 祖先 guard；(b) 计算 root-reachability / 重挂。该顺序被 pin 进一致性测试，使 cycle 检查与可达性救援永不在不同实现间分歧。

### 5.3 `content` — 逐 sub-field，混合 resolver

- **`type_id`、`props[k]`：causality-aware per-cell LWW。** 不同 key 永不交互；relation edge 是普通 `props` key，故无关 prop 编辑永不会丢 relation。**winner 选择优先因果：** 当一侧的 `base_sub_rev` 因果支配另一侧（它观察到了对方）时取该侧；仅当两写入**真并发**（互不支配）时才回退到 wall-clock `T`。这消除「手机时钟快 4 分钟所以旧的 Mac 编辑胜出」的反直觉结果，且仍是 `T` 序前缀的纯函数。同 key 真冲突：loser 值保留在 log 中并 surface（value chip），在下一条对该 key 的支配写入时坍缩。
  - **修正对抗 §6.6 自动坍缩静默：** 对一个**仍 open** 的 ConflictRecord 的 cell，一条**非解决性**写入**不**静默关闭它——要么把旧 loser 作为第二个 multi-value 条目 pin 到显式 `resolve` op 出现，要么要求坍缩写入携 `supersedes`/`resolve` 标记使关闭可审计。常规编辑不得 GC 掉一个用户从未看见的冲突。
- **`tags[t]`：真正的 add-wins OR-Set（复用 `op_id` 作为 add-identity）。**
  > **对抗修正（§6.7，判 `fails`）：** 草案的「scalar `base_tag_rev` + zero new storage」不能表达 OR-Set 语义——对「已存在 tag 的并发 add-vs-remove」「add/remove/re-add 生命周期」无法区分哪条 add 被哪条 remove 观察，导致 replica 间布尔值分叉、且无 `T` 序兜底。**最终采用真 OR-Set，复用已预留的 `op_id`，不需要新 envelope 字段：**
  > 1. 每条 `tag_add` 的 add-identity = 其 `op_id`（§8.1 已有）。
  > 2. `tag_remove` 携它**观察到的** add `op_id` 集合（其因果可见的 adds），而非 scalar rev。
  > 3. tag `t` 存在 iff **存在一条 add，其 `op_id` 未被任何 remove 的 observed-set 包含**。
  > 4. **「对已存在 tag 的 add」显式定义为铸造一个新 add-identity**（re-assert 视为真 add），消除「pre-existing tag」歧义。
  > 5. **`T` 序作为硬兜底**：任何 predicate 路径若仍欠定，按 `T` 落定。
  >
  > 存储有界：observed-add id 与 loser payload 一样在 §7 watermark 之下 GC。这是对 gate resolution #3「zero new storage」的**有意推翻**——OR-Set 语义需要 per-add identity，这点存储必须花（小且 watermark-bounded）。换来真正可交换 / 幂等 / 顺序无关的收敛。
- **`body`：确定性 3-way merge / keep-both。** 文本唯一会「两边保留」的地方，且**总是**保留，绝不静默 LWW（§5.3 详规则见 §6.1）。

**收敛：** 每个非-tag cell 是 `T` 序（含因果优先）LWW；tags OR-Set 成员判定顺序无关；`body` 由确定性 merge / keep-both 解析。∎

### 5.4 `life` — 优先级 lattice join（时钟无关）

```
deleted   (终态, top)
   │
trashed ─┴─ archived     (可逆 peers)
   │
active    (bottom)
```

- **规则：** 物化 `life` = 节点上所有 life op 的 **join（取最高）**，唯一例外：携 `supersedes_rev` 的 `restore` op 在其 `supersedes_rev` 因果支配被撤销 op 时，把节点沿 lattice **下移**。
- **`delete-wins` 成为 lattice 事实且时钟无关：** 前向跳变设备的陈旧 `active` 永不能压过真实 `deleted`，因为 join 对破坏性 winner 忽略 wall-clock。
- **`trashed` vs `archived`（不可比可逆 peers）：** 按 `T` 确定性落定，并 surface 为低优先级可恢复冲突。默认 **`archived` 胜出**（archive = 刻意保留；单用户疑则保留）。两者皆可逆，任一都不丢。
- **`deleted` 终态，仅可经「从 `trashed` 发起、其 op 因果支配任何并发编辑」的显式 `delete` 到达。dispatch 拒绝直接 `active → deleted`。** 陈旧离线 delete 因此永不能不可逆销毁新编辑——最坏只把节点 trash（可逆）并 surface 冲突。
  > **修正对抗 §6.3 跨 register 支配机制：** 「因果支配编辑」需要可实现的跨 register 机制。给终态 `delete` op 一个显式 `dominates_frontier`（删除设备已观察到的 actor HLC frontier）。终态 `trashed → deleted` 只能销毁「生成 op 的 hlc ≤ 该 frontier」的后代 / 自身 content；任何并发（尚未被观察）的 content 编辑**阻断**终态坍缩，强制回退到可逆 `trashed` 并 emit 跨级 ConflictRecord（§6.3）。
- **`life` 不级联。** 把容器设 `trashed` / `deleted` 只标记**该节点**。「子树消失」是**物化规则**：节点可见 iff 经一条全为存活（`active`/`archived`）祖先的链 root-reachable，over **merged** tree 重算。并发移出 deleted 父的子节点自动幸免；移入的自动隐藏——无竞态，因为它是派生的，不是命令式级联 op。

**收敛：** lattice join 可交换 / 结合 / 幂等；唯一 tie 由全序破除；`restore` 支配是 `supersedes_rev` 上的确定性因果检查。∎

---

## 6. 硬冲突场景处置规则表

下表逐一覆盖九类硬场景，每条给出确定规则与 tie-break。所有「surface」均为派生 `ConflictRecord`（§9），非持久 op。

### 6.1 并发同块文本编辑（第一数据丢失路径）

**检测信号：** 同 target 上两条 `body` op，其 `base_sub_rev` 指向**同一祖先**且互不可见（任一的 `base_sub_rev` ≠ 对方 `new_sub_rev`）。两侧自同一 base 分叉。

**过程：**
1. **恢复 base** = `base_sub_rev` 处的 `body` 值。**base 的可恢复性必须独立于 per-device watermark**：要求 base 可从**快照 + 保留 op** 在每个 replica 上重建；**若任一侧 `base_sub_rev` 不等于快照记录的 sub_rev，则确定性地降级到 keep-both（步 4）**。auto-merge vs keep-both 的**选择因此是 op 集合的纯函数，与本地 compaction 无关**（修正对抗 §3.1 的 watermark 分叉）。
2. **3-way merge** `(base, lowerT_side, higherT_side)`，用 **pinned、core-versioned、跨平台 bit-reproducible 的 diff3**（algorithm id + `diff_algo_version`；`zdiff3` 式 hunk 对齐；**真理路径禁用 fuzzy patch-apply**）。**macOS 与 iOS 必须产出逐字节相同的 merge 结果**——§12 的跨设备一致性向量集是**强制 CI gate，不是可选**。
3. **hunk 全不相交 → 合并文本是派生物化值**，在每个 replica 的每次 replay 中由 `(base, sides)` 纯函数重算，零新增 op（首选）。**若**为 compaction 经济性需要落定字节，则按 §5.1 形态 2 铸造**唯一一条确定性 op**（`op_id` = `blake3("merge" ‖ …)`，单一确定性 emitter）。两种形态都使合并字节跨 replica 逐字节一致，且 diff3 只需「运行一次得到确定结果」，但其**正确性仍由 §12 的 bit-reproducible 一致性 gate 保证**（接受「pinned diff3 须可复现」这一负担，它由一致性向量集封顶；这是确定性的代价，是对草案试图回避此负担的修正）。不 surface。
4. **hunk 重叠（或 base 不可恢复）→ keep-both。** winning 侧（最高-`T`）是活跃 `body`；losing 侧作为派生 Multi-Value body 保留（瞬态 `{value, losing_op_id}`），block 带派生 `has_body_conflict` 标记，下一条来自任一设备的支配性 `body` 写入把 MV 坍缩为所选单值。零丢弃。
   - **N-way（≥3）同 base body fan（修正对抗 §6.8 缺口）：** 显式定义为「base-vs-each-branch 折叠成单一 keep-both，一个活跃 winner + 一个**有序 MV 列表**」，**绝不 pairwise diff3**（diff3 非结合，pairwise 会顺序相关）。

**Mark 存活（强制伴随）：** 任何来自 merge 的 `body` 文本变化后，normalizer **对合并文本重新 clamp 每个 UTF-16 mark offset**：存活 span 重锚；越界 mark clamp 或丢弃；expand 类 mark（bold）在 seam 处长入插入文本，non-expand（link/comment/mention）不长入。纯函数，独立测试。

**为什么不用字符 CRDT：** 单用户异步下重叠同段编辑罕见且非实时；diff3 自动吃掉常见的「改不同句子」；真正重叠的情形正是人类愿意看一眼的。FugueMax / Peritext 为赢下最罕见情形而加入永久 per-char tombstone（§13 暂停）。

### 6.2 move-vs-edit

`location` 与相关 `content` cell 是不同 register / cell → **两条都应用，不冲突。** 即便 move + tag-add + body-edit 也是三个独立 cell 全保留。

> **对抗修正（§6.2 静默重定位）：** **当 move 的 winning parent ≠ 失败 register 的 base rev 所观察到的 parent 时，从 tier-1 invisible 升级为 tier-2 ambient。** emit `ConflictRecord kind=location_relocated`，使正在编辑的设备得到非阻塞「你编辑的块 X 在另一设备被移到 P_new — 留在这里 / 移回」提示。代价一个派生标记，零新 op 种类。move-into-dying-parent 复合（§5.2 规则 3 沿 post-move 链重挂）现在被这条升级覆盖。
>
> **Restore 重定位（§6.2c）：** restore 一个曾被并发 move 的节点时，surface 目的地（「在 P_new 下恢复——原位置是 P_old，移回？」），不静默尊崇 move-winner。§8 保证表新增「location intent」行。

### 6.3 edit-vs-delete

edit = `content` cell；delete = `life`。不同 register，**两条都保留在 log。** 物化结果：节点**可逆 trashed**（lattice join；并发永不到终态 `deleted`，§5.4）**且编辑保留在 `content`**。restore 节点 → 编辑完好。surface 低优先级（「你编辑的 Note X 在另一设备被 trashed — Restore / 保留 trashed」）。这**逆转了现行 delete-wins-销毁-编辑规则**。终态丢失仅经显式两步 `trashed → deleted` 且因果支配编辑（刻意、非并发动作）发生，且仍走 §7 的一次 interrupt 级提示。

> **对抗修正（§6.3，祖先 trashed / 后代 edited 跨级缺口，判 `partial-gap` + 静默丢失）：** **同节点** edit-vs-delete 处理良好；但**祖先 P 被 trashed/deleted、后代 X 被 edit** 时，因 `life` 不级联、二者不撞 register，旧检测层（只 key 同 target/register 碰撞）**不 emit 任何 ConflictRecord**，X 的编辑随子树静默从视图消失，且 §7 不 pin 它 → compaction 后真静默丢失。**最终新增派生冲突 kind `ancestor_life_vs_descendant_edit`：** replay 中算完可见性后，检测谓词「节点 N 有一条 content op，其 hlc 与 trashed/deleted 了 N 存活-parent 链上任一祖先的 life op **并发**（不被其因果支配）」；emit tier-2「你编辑的某段在另一设备被 trashed — Restore 子树 / 保留 trashed」，**并把每条此类后代 content op_id 登记为冲突成员，使 §7 pin 它对抗 compaction**——堵死静默丢失。纯派生读模型，零新 op，确定（`T` 序前缀纯函数）。

### 6.4 并发 reorder

每节点 `location` 按 `T` LWW；逐字节相等 fractional key 由 `(hlc.device, actor, op_id)` 破除（§5.2 规则 5）。**无物销毁**（所有块在场），两设备重排同列表收敛到一个确定顺序。

> **对抗修正（§6.4，判 `partial-gap` 意图丢失）：**
> 1. **Pin order-key 生成器**为一等跨设备一致性 gate（与 diff3 pin 并列，§12）。一致性向量集证明 macOS 与 iOS 对相同 `(observed-base, target-gap)` 输入铸出**逐字节相同**的 fractional key；禁止 jitter / 精度 / 字母表漂移。否则 §5.2 规则 5 的逐字节相等 tie-break 是纸面保证。
> 2. **新增 `ConflictRecord kind=reorder_blend`** 进入 §9 kind union，把「move 既有 sibling」案例（混合出第三顺序）路由到 tier-2 inspector，提供「恢复本设备顺序」批量动作——把失败设备的整组 `location.set` 作为一条 resolution macro-op 重发，把静默意图降级变成一键可恢复。
> 3. **并发整列表 renormalize（§5.2 规则 5）：** `renormalize` op 携它所 rebalance 的 sibling 集合的 base `snapshot_revision`；ingestion 时若一条 renormalize 的 base 已陈旧（另一 renormalize 或 reorder 先落定），将其视为 **no-op 并本地重新派生**，而非盲目 LWW 合并两套整列表重写——防止两次离线 rebalance 打散整列表。
> 4. **distinct-but-adjacent key（§5.2 规则 5 加宽）：** 定义近似 midpoint 的相邻 key 走一次 canonical re-spacing pass，使确定性不静默依赖严格逐字节相等。
>
> **已知限制（文档化非目标）：** 无关并发 insert 的罕见 interleaving 是**接受的、可由用户修复的**非破坏性结果，不由 list CRDT 解决（§13 暂停）。

### 6.5 成环 move（2-cycle 及 N-cycle）

设 X、Y 是 P 下独立 sibling。`op_A`：X 移到 Y 下；`op_B`：Y 移到 X 下。两 op 目标不同节点 / register，stale guard 不触发，均入 log。

**规则：** 按 `T` 序 fold（设 `T(op_A) < T(op_B)`）。先应用 `op_A`：树 = P{Y{X}}；再应用 `op_B`：祖先检查见 X 已是 Y 后代 → **整条 `{parent, order}` 被拒绝**（§5.2 规则 2），Y 保留先前完整 location 值（停在 P），记 `structural_skip`。**最终两 replica 同为 P{Y{X}}**（高-`T` 的 `op_B` 被跳过，低-`T` 的 `op_A` 胜出）。树恒无环、无 orphan、无 fork。

> **对抗修正（§6.5，三处）：**
> 1. **原子-location 矛盾消解：** cycle-reject **拒绝整个 `{parent, order}`**，节点保留先前完整 winning location 值，**不部分应用 order key**。写入 canonical_serialize / snapshot 一致性向量。
> 2. **措辞统一：** 采纳单一规范句（§5.2 规则 2）——「后被 fold 的成环 op 被拒绝」，废止旧 §3.5「lower-T skipped」的相反表述。
> 3. **相位固定：** 见 §5.2 物化流水线相位。
> 4. **surface 升级：** 当受影响节点可见时，cycle-skip 从 tier-2 ambient 升为**内联可消除的 per-node 提示**（reparent「没发生」很意外）。§8 保证措辞软化为「op-log payload 不丢；被取代的结构 move 被 surface 供 redo」。
> 5. 对称 2-cycle 与 N-node cycle 作为显式一致性 fixture，断言两 replica 以相反到达顺序 ingest 仍 `snapshot_revision` 逐字节相同（§12）。

### 6.6 并发 scalar prop

逐 key **causality-aware LWW** by `T`（§5.3）。不同 key → 两存。同 key 并发 → 高-`T` 值活跃；loser 值保留并 surface value chip（「priority: High [Mac] / Medium [iPhone]」，一键互换），下一条支配写入坍缩。relation edge 是普通 key → 无关编辑永不丢 relation。

> **对抗修正（§6.6）：** (a) **causality-aware**（一侧因果支配则取该侧，仅真并发才回退 wall-clock）消除前向跳变胜出；(b) **非解决性写入不静默关闭 open 冲突**（§5.3）；(c) **可恢复性诚实措辞**：loser 可恢复性止于「冲突解决 + compaction」，关闭冲突（手动或自动）须 emit `resolve` op 记录被弃值，使审计在原始 loser op 截断后仍存活；(d) **chip 契约统一**：始终展示 `{live, 全部并发 losing 值}`，base 若存在另行展示，废止含糊的「prior value」措辞；(e) **resolution chip race**：解决 op 是普通 `set` op，受同样 `T` 序 LWW（§5.3），无特权关闭。

### 6.7 tag add-vs-remove

**OR-Set add-wins by op_id（§5.3）。** 不同 tag → 交换。同 tag 并发 add vs remove → **add 胜**（remove 的 observed-set 不含该 add 的 `op_id`）。一条**确实观察到** add 的 remove（其 observed-set 含该 add）→ 真序删除。add/remove/re-add 生命周期确定、顺序无关；`T` 序硬兜底。匹配单用户意图（「我刚加的 tag 不该死于陈旧 remove」）。

> **对抗修正（§6.7，判 `fails`）：** 见 §5.3 OR-Set 全文——废弃 scalar `base_tag_rev`，复用 `op_id` 作 add-identity，remove 携 observed-add id 集合，越界存储 watermark-GC。**有意推翻 gate resolution #3 的「zero new storage」**。

### 6.8 并发 block split / merge

split / merge 是**在 dispatch 处分解为既有 primitive、作用于稳定 `target_id`** 的 macro-op，绝不 opaque delete+create（避开 Yjs「Ba/Ab」interleave 腐化）。

> **对抗修正（§6.8，判 `fails`——并发 split-vs-overlapping-edit 致重复文本 / 静默降级）：** 草案把 split 的 legs 独立 reconcile，当 head 截断 leg 进入 body 冲突而 tail leg（已在新 id bY）独立解析时，原始 tail 文本会**在文档里出现两次**（一次在 winning bX 内、一次作为独立 bY），且 bY 无 ConflictRecord → 可见腐化无人 flag；或 B 的不相交 head 编辑被整体降级进 bX 的隐藏 MV chip。**最终改为「intent rebase + 共享 group id」：**
>
> 1. **共享 `macro_op_id`：** split / merge 发出的每条 primitive 盖同一结构组 id。replay 把**任一 leg 上的并发 body 冲突视为整组冲突**：若 bX 截断 leg 与 opB1 进入 keep-both，**不**独立物化 bY 的 tail；而是 surface **一条**结构冲突（「块在 Mac 被 split 而在 iPhone 被编辑」），并取确定性 canonical 解析。
> 2. **rebase-of-intent（首选，优于 leg-LWW）：** 把 split 记录为单一 intent `{target=bX, offset=o, new_id=bY}`，merge 时**对 merge 后的 bX.body 重放**（offset `o` 经产出合并 body 的同一 diff 重 clamp），而非把 opA1/opA3 冻成字节快照。tail = `(winning text)[o..end]` **由构造保证**，既不重复也不陈旧。merge（Y→X）对称：append + 对 Y 设 `life=trashed`（可逆，绝不静默 delete）。
> 3. **派生块纳入无丢失检测：** §8 不丢失不变量与 ConflictRecord 检测**扩展到 macro-op 创建的派生块（如 bY）**，使其上的重复 / 陈旧被 flag 而非静默上线。
> 4. **net：** 每分支归约到三 register 规则；每路径要么 merge 要么 keep-both/surface，无重复文本、无静默降级。在 (1)(2) 落地前，该路径严格劣于 naive 整块 LWW（后者至少不重复文本）——故 (1)(2) 是**必须**，不是可选。

### 6.9 journal 同日去重

> **对抗修正（§6.9，判 `partial-gap` + 静默丢失 + replica 分叉）：** 草案的「live fallback = 随机 id + 结构化 merge（trash loser + reparent children）」要求 ingestion **作者新 op**，而 replay 被定义为纯 fold——纯 fold 不能凭空造 trash op；且两离线设备各自作者「对方为 loser」时产生**对称竞争 op**，life-lattice 按 target 不跨 target 调和，可致**两个 journal 都 trashed**、当天块挂在 trashed 父下被可见性规则隐藏 → 当天 journal 从默认视图消失。

**已采纳（确定性内容寻址身份；承诺模型，最干净路径，主计划 §4.3 / §8.2 / §11 已同步回填）：**

冻结 journal Note 的 `note_id = blake3("journal:" ‖ vault_id ‖ calendar_date)`。两设备离线创建「今天」铸出**同一 id** → 两 create 是**对同一 target 的幂等 create**，其 title / body / props / life 走普通逐 sub-field 规则（如 Mac 的晨记 + iPhone 的晚记 → 经 §6.1 不相交 auto-merge 两者皆在）。`calendar_date` 唯一性成为**身份不变量**——不再有 race-prone 运行时检查、不需要作者 trash/reparent op 的结构化 merge，同日冲突在「身份」这一层被根除，是所有候选里最干净的路径。

- **rename/move alias story（显式）：** 身份是派生 id（创建后稳定，即便 `calendar_date` 被编辑也**永不重派生**）；rename 只改 title runs（`content.body`）、move 只改 `location`，二者**均不触身份**；刻意改日期建模为 create-new-id + move-content，surface，**绝不**是 id 突变。
- **trash / restore 边界（显式）：** journal 是普通 Note，`life` 正常适用；因身份稳定，「journal 被 trashed 后重开『今日』」解析回**同一** `note_id` → dispatch **restore 该节点**（`life → active`）而非铸造重复 Note。
- **「一日一 journal」的取舍（显式接受）：** content-addressed 身份意味着同 vault 同日恒为同一 journal Note；若用户想为同一天再开一篇，建一篇普通 Note 即可（与 Apple Notes / Logseq 日记一致）。这是为最干净合并主动接受的约束。
- **§8 保证表 journal 行**现在为真（「by construction 一个 target → 两 body 合并 → 无 loser」）。

**已否决的替代（仅作记录，不采纳）：** 随机-id + 结构化 merge（trash loser + reparent children）——要求 ingestion 作者新 op，违反纯-fold replay，且两设备对称作者「对方为 loser」可致两 journal 皆 trashed、当天内容被隐藏（见上「对抗修正」）。若日后因 §4.3 约束被推翻而**必须**回退，唯一安全形态是「派生物化 dedup（低-`T` create 为 canonical，另一个渲染为合并进的 section）+ 绝不 trash 任一 journal + 检测谓词 pin 在冻结 `calendar_date` 唯一性上」，停留在纯-fold 内、作者零竞争 op；但这**非当前方案**。

**决策已定：** content-addressed 身份为承诺模型（§13.1 #9 已 resolve），§8 journal 行按内容寻址路径为真，主计划 §4.3 / §8.2 / §11 同步回填。

---

## 7. op 信封与 op 种类变更

现状信封：`{target_id, target_kind, register, base_register_rev, new_register_rev, hlc, actor}` + 预留 `provenance, approvalState`。

### 7.1 信封新增（必须在 op-shape 冻结时预留，否则需 op-log 迁移）

| 字段 | 用途 |
|---|---|
| **`op_id`** | 全局唯一稳定 id（ULID 或 `blake3(actor‖hlc‖payload)`）。全序最终 tie-break、幂等 dedup key、keep-both loser / 结构标记 / **tag OR-Set add-identity** 的身份。**最高优先级预留。** |
| **`op_envelope_version`** | 每条 op 的 schema 版本。不可协商：被同步且被截断的 log 中，无版本 op 永不可重解释（Actual Budget 教训）。 |
| **`macro_op_id`**（可空） | split / merge 等结构 macro-op 发出的 primitive 共享的组 id，使部分-leg 冲突作为整组冲突 reconcile（§6.8）。 |
| **`sub_field_key`**（可空） | 命名 `content` cell：`body \| type_id \| props:<k> \| tags:<t>`。`location`/`life` 为 null。启用逐 cell 合并 + 逐 cell stale guard。 |
| **`base_sub_rev` / `new_sub_rev`**（可空） | 逐 cell rev 对（泛化 `base_register_rev`）。register rev 成为 sub_rev 的派生 hash。 |
| **`op_kind`** | `set \| move \| tag_add \| tag_remove \| life_set \| restore \| create \| split \| merge \| renormalize`。 |
| **`supersedes_rev`**（可空） | 供 `restore`（撤销哪条 life rev）与显式冲突解决 op。 |
| **`dominates_frontier`**（终态 `delete` op 上） | 删除设备已观察到的 actor HLC frontier；终态坍缩只能销毁 hlc ≤ 该 frontier 的后代 / 自身 content，任何并发编辑阻断坍缩（§5.4、§6.3）。 |
| **`observed_adds`**（`tag_remove` op 上） | 该 remove 因果观察到的 add `op_id` 集合（OR-Set 语义，§5.3、§6.7）。watermark 之下 GC。 |
| **`diff_algo_version`**（merged `body` op 上） | pin 哪个 diff3 版本产出合并 body，使 replay 跨 core 升级可复现（与 §6.1 步 3 配合，字节已落定时此为标签而非重算依赖）。 |
| 每 actor **`seq`** | 单调 high-water-mark，供 O(1) 幂等 CloudKit ingestion。 |

> **零迁移未来-CRDT 钩子：** 以上预留无论 `body` 由 diff3 还是（未来 §13 签署后）由序列 CRDT 合并都相同——只有 `body` 的 op-kind 会不同且它们带版本。故文本引擎日后可换，**无 op-log 迁移**。

### 7.2 新 op 种类

`move`（触发祖先 guard）、`tag_add`/`tag_remove`（OR-Set add-wins）、`restore`（带 `supersedes_rev` 的 lattice 下移）、`create`、`split`/`merge`（带 `macro_op_id` 分解为 primitive 的 macro-op，§6.8）、`renormalize`（带 base snapshot_revision 的有界 order rebalance，§6.4）。`body` 编辑仍是带 `base_sub_rev` + 可选 `diff_algo_version` 的 `set` op。**确定性铸造的合并 op（§5.1 形态 2）的 `op_id`/`hlc` 由输入派生**，由单一确定性 emitter 铸造。

### 7.3 Ingestion（收敛骨干）

- 每 actor 单调 HWM（`max_seen_hlc[actor]` + `seq`）；按 `op_id` dedup → 重投递保证 no-op（CloudKit 可重投 / 乱序）。
- 合并是对 op **集合**在 `T` 序的 fold → ingestion 顺序永不影响结果。
- **确定性铸造的合并 op 由 dedup 在 `op_id` 上收敛为一条**，杜绝草案的「N 设备 N 条合并 op」非确定性。

### 7.4 不复用 agent 预留

`provenance`/`approvalState` **不**复用于人工冲突复审（会与 §13 agent-审批暂停条件混淆）。冲突态走**派生标记**，非 `approvalState`。`provenance` 可加审计值（`structural_skip`、`merge_synthetic`）仅供 auto-merge 轨迹。

---

## 8. 「无静默数据丢失」保证与可恢复路径

**保证：** *任何用户击键、tag、prop、relation 或结构意图永不被静默丢弃。「败方」仅失去其作为活跃值的位置——其 payload 始终是 log 中一条 op，可恢复。*

| 冲突 | 活跃侧 | 败方去向（可恢复） |
|---|---|---|
| `body` 不相交编辑 | 派生合并值 / 确定性铸造合并 op | 无败方——完全合并 |
| `body` 重叠编辑 | 最高-`T` 侧 | 败方 = 派生 Multi-Value body（`losing_op_id`）；独立于 watermark 由 op 集合纯函数判定 |
| scalar prop / type_id | 因果优先、否则高-`T` 值 | loser op 留 log；chip 显示并发值；一键恢复；关闭 emit `resolve` op 记录弃值 |
| tag add-vs-remove | add（在场） | OR-Set；remove op 保留；用户可重 remove |
| move-vs-move / cycle-skip | 高-`T` 放置 | 跳过的 move 保留 + **surface（可见时内联提示）**；手动 redo |
| **location intent（restore 重定位）** | move-winner 位置 | **surface 目的地 vs 原位置，供移回（§6.2c）** |
| `life` trash-vs-archive | archived（默认） | trash op 保留；两态皆经 restore 可达 |
| edit-vs-delete（同节点） | edit + 可逆 trashed | 编辑保留在 `content`；并发永不终态 |
| **祖先 trashed / 后代 edited** | 子树隐藏 + 编辑保留 | **emit `ancestor_life_vs_descendant_edit`，pin 后代 content op 对抗 compaction（§6.3）** |
| split/merge 部分-leg 冲突 | rebase 后的结构 | 整组单一冲突，无重复文本，无降级（§6.8） |
| journal 同日 | by construction 一个 target | 两 body 合并；无败方（§6.9） |

**为何成立：** append-only op-log 使每个败方都是可 replay 的 op。「恢复」= emit 一条支配性 `set`/`restore`/`resolve` op 提升败方。**唯一**真正销毁内容的路径是「从 `trashed` 发起、因果支配所有编辑（经 `dominates_frontier`）的显式 `delete`」**叠加** compaction 越过 watermark——而 compaction 被 §9 门控：**绝不截断任何属于 open ConflictRecord 成员的 op**（含 §6.3 登记的后代 content op），把无丢失直接绑到 compaction。

**诚实措辞（对抗 §6.5/§6.6）：** 保证表保护的是 **op-log payload 与被 surface 的意图**；被取代的结构 move / scalar 值不再是活跃值，但被 surface 供 redo / 恢复。可恢复性的**持久性**止于「冲突解决 + compaction」——关闭冲突须 emit `resolve` op 记录弃值，使审计在原始 loser op 截断后仍存活。

---

## 9. 冲突呈现 / UX（接入 §6.8 replay conflict，按打断预算）

接入现有 §6.8 失败态。检测在 core replay 中 emit 派生 **`ConflictRecord` DTO**（绝非持久 op），喂给 §6.8 的「冲突 register、winning op、losing op、用户可采取动作」。完全映射到 core Note/Block/op 概念；不持久化任何平台编辑器 state（故不触 §13 行 739）。

```
ConflictRecord {
  target_id, target_kind, register, sub_field_key, macro_op_id?,
  kind: body_overlap | scalar | tag | move_skipped | location_relocated
      | reorder_blend | life_tie | ancestor_life_vs_descendant_edit
      | split_merge_structural | journal_merge,
  live:   { value_summary, op_id, hlc, actor },
  losing: [{ value_summary, op_id, hlc, actor }],
  actions: [keep_live, take_other, keep_both(body), restore, restore_subtree, restore_order]
}
```

> kind union 相对草案新增：`location_relocated`（§6.2）、`reorder_blend`（§6.4）、`ancestor_life_vs_descendant_edit`（§6.3）、`split_merge_structural`（§6.8）——堵死对抗暴露的全部「不在枚举里所以静默」缺口。

**打断三档：**

1. **不可见（绝大多数）：** 不相交 `body` 合并、不同 cell 的 prop/tag/location 编辑、move-vs-edit（**parent 未变时**）、tag add-wins、journal 同日并集。用户只看到合并后的笔记。可选可消除的「已合并来自 \<device\> 的更改」toast。
2. **环境、非阻塞（inspector badge）：** 未打开笔记上的 body 重叠、scalar/type 冲突、move-skipped、**location_relocated**、**reorder_blend**、trash-vs-archive、dangling-parent 重挂、**ancestor_life_vs_descendant_edit**、journal 合并、merged-duplicate。小 badge（「N 项待复审」）打开 **Conflicts inspector**（复审收件箱）。编辑永不阻塞；活跃值已选定。
3. **打断——几乎从不，恰两种：**
   - **当前在编辑器中打开的笔记上的 body 重叠** → 在冲突块处内联 git 式 side-by-side band（Keep Mine / Keep Theirs / Keep Both 堆叠）。在编辑点，不是单独屏幕。
   - **显式永久删除撞上近期编辑**（唯一终态不可逆情形）→ modal：*永久删除 / 作为新 Note 恢复。*
   - **可见节点上的 cycle-skip** 升级为内联可消除 per-node 提示（§6.5）。

**解决是 core op，不是设备本地 state**（避开 Obsidian 的记录在案错误）：选动作 emit `set`/`restore`/`resolve` op 进 log；标记在每设备同步后坍缩。

**确定性 caveat（对抗 lens-4 红旗，已处理）：** *呈现*可因笔记是否打开而异，但底层物化 Multi-Value body 在每设备**相同**，且**解决 op 严格独立于打开/未打开**。只有呈现分支，解决不分支。

---

## 10. 与 replay、snapshot compaction、.md/.json mirror 的交互

**Replay：** 对 op 集合按 `T` 序的纯 fold。冲突标记、MV body、OR-Set tag 成员态、重挂、合并文本（派生形态）全在 replay 中**派生**，处处重算相同，绝不作为真理存储。解决 = 追加一条 op。

**Compaction — 一个新记账 primitive：causal-stability watermark** = 所有已知设备各自已确认 HLC frontier 的 `min`（per-device frontier 的 `min`，**非**日历 epoch）。它作为单一共享 primitive 门控：
- op-log 截断进快照；
- loser-payload / trashed 节点 / OR-Set observed-add id 的硬删（仅当可证无并发编辑能复活它们）；
- **硬规则：绝不截断属于 open `ConflictRecord` 成员的 op**（pin 其 `op_id` 直到解决）——含 §6.3 登记的后代 content op——把无静默丢失直接绑到 compaction。

**Compaction × 文本（对抗 §3.1 红旗，已修正并公开）：** §6.1 的 auto-merge vs keep-both **选择是 op 集合的纯函数**（任一侧 `base_sub_rev` ≠ 快照记录 sub_rev → 确定性降级 keep-both），**与 per-device watermark 无关**。**永不**让本地 compaction 改变合并**结果**。已合并文本（派生或确定性铸造 op）跨 compaction 字节一致。compaction 的唯一影响是：一个**全新**的、base 已老化出快照的重叠编辑会路由到 keep-both 而非 auto-merge——这是有界的质量下降（随时间更多 keep-both 提示），**绝非**数据丢失或 fork。明示，不掩埋。

**跨 compaction 的确定性：** 每个 tie-break 全序（`T`）；合并 body 是派生值或确定性铸造 op；jitter 排除在 `canonical_serialize` 外；hash over 物化输出 → 同一 op 集合下 `snapshot_revision` 跨设备字节相同。一条**低于** watermark 到达的 op 被 force-rebase 到当前快照；不能干净 rebase 则成 keep-both / surface（**move op 例外：被 pin 对完整因果前缀判定，§5.2**），绝不重开被截断历史。无 frontier 的全新设备在确认前不拉低 watermark。

**Mirrors（.md/.json）：** 角色不变——post-commit 派生导出，**绝非** merge 输入。block 的**活跃** body 导出为干净 Markdown。一个**打开的** body 冲突在 `.md` 渲染为可见 git 式 fence（`<<<<<<< this device` / `=======` / `>>>>>>> other device`），使纯文件用户也看到两侧；`.json` 携 `ConflictRecord`。解决始终经 op 流，绝不靠编辑 mirror。

---

## 11. 与现行 §8.4 的逐点差异对照

| 现行 §8.4 规则 | 最终设计 | 保留 / 改 / 为什么 |
|---|---|---|
| 三 register `location`/`content`/`life` | **保留**三 register 产品不变量；`content` 内部分解为 `body`/`type_id`/`props[k]`/`tags[t]` cell | **改（粒度）**：消除 content+props+tags 共享 LWW slot 制造的静默丢失；不加宽 dispatch register 数 |
| 合并按 (target, register) 字段级 LWW by HLC | **保留**全序 LWW 框架，全序键升级为 `T=(hlc.wall, hlc.logical, hlc.device, actor, op_id)` | **改**：`op_id` 保证无 tie，全序确定；明确「字段级」= 逐 cell sub_rev |
| Move-vs-edit 两边保留 | **保留**，并经 cell 分解推广到 move+tag+body 全保留 | **保留 + 推广**；新增 parent 变化时 `location_relocated` surface（不再静默重定位） |
| 删除级联 tombstone 整子树 | **改为非级联** + 派生 root-reachability 可见性 | **改**：消除「救出 / 移入」竞态；爆炸半径回到节点级 |
| edit-vs-delete = delete-wins | **改为 edit + 可逆 trashed**，编辑保留 | **改（逆转）**：单用户安全默认是 delete 退让 edit；终态仅显式两步且因果支配编辑 |
| `deleted` 终态无 restore | **保留终态**，但**仅经 `trashed → deleted` 且 `dominates_frontier` 支配编辑可达**；dispatch 拒绝直接 `active → deleted` | **改（可达性）**：陈旧 / 意外 delete 永不并发不可逆销毁编辑 |
| 行内文本随 register LWW | **改为确定性 3-way merge / keep-both** + mark re-clamp | **改**：堵死第一数据丢失路径；非 CRDT |
| props/tags 随 content LWW | **改为**：props/type_id causality-aware per-cell LWW；tags OR-Set add-wins by op_id | **改**：relation 永不被无关编辑丢；tag add/remove/re-add 确定 |
| 本地 stale guard = touched target/register base rev | **保留**，泛化为 touched **cell** 的 `base_sub_rev` | **保留 + 泛化**：独立 cell 独立可合并 |
| op 信封 `{…, base_register_rev, new_register_rev, …}` + 预留 provenance/approvalState | **保留**，新增 §7.1 字段（`op_id`/`op_envelope_version`/`sub_field_key`/`sub_rev`/`op_kind`/`supersedes_rev`/`dominates_frontier`/`observed_adds`/`macro_op_id`/`diff_algo_version`/`seq`） | **改（必须 phase-0 预留）**：否则后续 op-log 迁移；不复用 agent 预留 |
| 同步 ingestion 幂等 + HLC/actor 排序 | **保留** + 每 actor 单调 HWM + `op_id` dedup + 确定性铸造合并 op 收敛 | **保留 + 加固**：顺序无关、重投递 no-op |
| §6.8 replay conflict 显示 winning/losing/用户动作 | **接入**派生 `ConflictRecord` + 打断三档 + resolve 经 op | **保留接口、补全数据路径**：新增 5 个 kind 堵静默缺口 |
| compaction 快照 + 截断（phase-0） | **保留** + causal-stability watermark 门控 + open-conflict pin | **保留 + 加固**：合并产物与冲突 pin 跨 compaction 确定 |
| CloudKit 仅传输无 merge 语义 | **保留** | **保留**：watermark 是 HLC frontier，传输无关 |

---

## 12. 触及的非目标 / §13 暂停条件（诚实标注）

**在范围内、**不**触 §9/§13**（确定性 replay 规则 / 有界有限 register over 既有 op-log——无复制数据类型、无 per-character id、无 tombstone 集合、无收敛文档类型）：sub-field 分解、per-cell causality-aware LWW、OR-Set tag（复用 op_id、watermark-bounded）、`life` lattice、非级联 delete、fractional-index tie-break、确定性 diff3 body merge、watermark compaction、派生 conflict DTO、split/merge intent rebase。

**唯一一处有意识的边界决策（标注，不隐藏）：** §5.2 的 **Kleppmann 祖先 / 成环检查**取自标「CRDT」的论文。如所采纳它**不加任何数据类型、不加元数据、不保留 move 历史**——是对 `T` 序前缀 + 当前物化树的纯 tree-invariant 校验，dispatch 本就在做。**建议：采纳为在范围内，但在设计文档中记为一个有意识的 §13 边界决策，而非静默发布。** 实现时须验证 skip 只需有序前缀 + 当前物化树（无保留 per-move 元数据）——若它哪天需要 move 历史，就滑向完整收敛 move，那是**暂停**。

**有意不做（会触 §9/§13——暂停条件）：**
- 字符级文本 CRDT（Peritext/Fugue/RGA/Yjs/Loro-text）。*若团队哪天采纳此暂停，本设计已预留信封使其成为干净替换（§7.1），且唯一可接受选择是 **FugueMax**——它是唯一不对 Anchor「Mac 起头、iPhone 离线续写」案例 backward-interleave 的序列 CRDT；更便宜的会比它替代的 LWW 更糟。*
- 完整 undo-do-redo 收敛 move；可移动列表 order CRDT；任何完整 CRDT 引擎（Loro/Yjs/Automerge）；任何中央权威服务器 / 全局 sequencer。

**触 §13 行 742（新公开 CLI schema）——标注，phase-0 预留：** `ConflictRecord` 与 `resolve`/`restore`/`restore_order`/`restore_subtree` 的 CLI/DTO 面是超出 phase-0 草图的新公开 schema。**现在预留其形状**使日后暴露 keep-both/恢复是增量而非迁移；*实现*可落在 dispatch 后，但**公开 CLI 命令需要 §13 所要求的用户决策。**

**触 §4.3 模型变更（已采纳并回填主计划，不是免费胜利）：** journal 内容寻址 id（§6.9）使 journal 身份**日期绑定**，是真实模型变更——已采纳为承诺模型，主计划 §4.3 / §8.2 / §11 同步更新（普通 Note 仍随机 nanoid，journal 例外；同日去重成为身份不变量）；随机-id 结构化-merge 回退已否决。

**不触发：** 实时多人（仍单用户异步）；传输暂停（watermark 是 HLC frontier，传输无关，无 CloudKit 形状依赖）；package 边界暂停（全在 `anchor-core`）；agent-审批暂停（`approvalState` 不被复用，§7.4）。

---

## 13. 新增 phase-0 决策清单 + 建议补入 §11 的冲突 fixture

### 13.1 phase-0 决策（硬截止 = op-shape 冻结）

1. **预留全部 §7.1 信封字段**——`op_id`、`op_envelope_version` 不可协商；缺任一即 op-log 迁移。
2. 批准 `content` sub-field 集合 `{body, type_id, props, tags}` 为完整。
3. **提交节奏与 body merge 共定：** 建议**每个语义 EditorIntent 一条 op**（句/段边界，防抖）——**绝不 mid-keystroke**（Logseq+Syncthing 冲突爆炸反模式）。粗提交加宽 diff、制造重叠；这决定 §6.1 触发频率。
4. **pin diff3 实现 + 版本 + 跨设备一致性向量集**为一等 CI gate（macOS + iOS 须逐字节一致）——**强制，非可选**。
5. **pin fractional-index order-key 生成器**为一等跨设备一致性 gate（与 diff3 并列）；禁 jitter/精度/字母表漂移。
6. causal-stability watermark 策略：per-device frontier 跟踪；低于 watermark 到达 = force-rebase（move op 例外，pin）否则 keep-both；无 frontier 新设备处理。
7. 确认 trash-vs-archive tie 取 `archived`-wins（keep-biased 单用户默认）。
8. **tag OR-Set：** 批准复用 `op_id` 作 add-identity + remove 携 `observed_adds`（**推翻** gate resolution #3 的 zero-new-storage）；observed-add id 的 watermark-GC 规则。
9. **journal 身份（已 resolve）：** 采纳 `blake3("journal:"‖vault‖date)` + rename/move alias + trashed-后重开-restore 边界（§6.9）；随机-id 回退已否决；§8 journal 行按内容寻址为真；主计划 §4.3 / §8.2 / §11 已回填。*§4.3 模型变更（标注）。* 剩余确认项仅为「一日一 journal」取舍是否接受。
10. **`life` 终态可达性：** dispatch 拒绝直接 `active → deleted`；终态 `delete` 携 `dominates_frontier` 的跨 register 支配检查规则（§5.4、§6.3）。
11. **split/merge macro-op：** 批准 `macro_op_id` + intent-rebase 语义（§6.8）。
12. `snapshot_revision` canonicalization：over 物化输出，排除 jitter，含全序 tie-break 输入——附跨设备 snapshot-equality 一致性测试。
13. **§13 行 742 DTO 预留**：conflict/resolve CLI schema。
14. **边界决策签署**：Kleppmann 祖先检查为在范围内（§12）。

### 13.2 建议补入 §11 fixture set 的冲突 fixture（现状只有 target/register conflict、sync merge、mirror stale、同日 journal 去重）

- **并发同段 body 编辑** — 不相交 hunk auto-merge（断言两 replica 物化 body **与** `snapshot_revision` 逐字节相同，under (a) 两种 ingestion 顺序 (b) **不匹配的 per-device watermark**）；重叠 hunk keep-both；base 低于 watermark 降级 keep-both。
- **move-vs-edit with parent change** — 断言 `location_relocated` 被 emit（非静默）。
- **祖先 trashed + 后代 edited** — 断言收敛**且** `ancestor_life_vs_descendant_edit` 被 emit **且**后代 content op 被 pin 对抗 compaction。
- **并发 reorder + reorder_blend** — 断言 order-key 跨平台逐字节相同；reorder_blend kind；并发整列表 renormalize 不打散。
- **2-cycle 与 N-cycle move（含跨 watermark）** — 断言无环、整体 cycle-reject、两 replica 相反到达顺序 `snapshot_revision` 逐字节相同。
- **并发 scalar prop（含时钟跳变）** — 断言 causality-aware winner、open 冲突不被常规写入静默关闭、`resolve` op 记录弃值。
- **tag add-vs-remove（含 pre-existing tag、add/remove/re-add）** — 断言 OR-Set add-wins 跨 replica 确定。
- **并发 split-vs-overlapping-edit / merge-vs-edit** — 断言无重复 tail 文本、不相交 head 编辑不被降级、派生块 bY 纳入无丢失检测。
- **edit-vs-delete 同节点** — 断言可逆 trashed + 编辑保留 + restore 完好。
- **journal 同日** — 断言两设备并发创建当天 journal 铸出同一 `note_id` → 一个 target + 两 body 经 §6.1 不相交合并 + 无隐藏内容 + 无败方；含「journal 被 trashed 后重开『今日』解析回同一 id 并 restore，不产生重复」case。

---

## 文末总结

**推荐采用的核心方案：** 保留三 register 产品不变量与 HLC append-only op-log 真理层，把「essentially register-level LWW」升级为——`content` 内部分解为 `body`/`type_id`/`props[k]`/`tags[t]` cell（正交编辑不再 clobber）；`body` 走**确定性 3-way merge / keep-both**（合并产物是 op 集合的纯函数或确定性铸造的单一 op，**与 per-device compaction watermark 无关**，配 mark re-clamp）；`tags` 走复用 `op_id` 的 **OR-Set add-wins**；`props`/`type_id` 走 **causality-aware per-cell LWW**；`life` 走**时钟无关优先级 lattice** + 非级联、派生子树隐藏、终态仅显式两步且因果支配编辑可达；`location` 走**整体原子 LWW + apply-time 成环 guard（对完整因果前缀、跨 compaction 一致）**；每个败方都是可恢复 op，冲突态是派生读模型按打断预算 surface（不可见 → 环境 inspector → 两种罕见打断）。

**相对现状最大的改进：** 堵死了笔记应用最致命的两条静默数据丢失路径——并发同段文本编辑（从「整 register LWW 丢一整侧」变为「不相交 auto-merge / 重叠 keep-both，永不静默取舍」）与 delete-wins 销毁编辑（从「陈旧 delete 不可逆销毁当晚编辑」变为「并发只能可逆 trash 且编辑保留」）；同时把对抗验证暴露的全部缺陷（commit-merge 的 watermark 分叉、scalar tag rev 的 replica 分叉、split/merge 重复文本、祖先删除/后代编辑的跨级静默丢失、journal 同日的对称竞争 op）逐一修成确定性可 replay 的规则。

**journal 取最干净路径（已定）：** journal 同日去重的身份模型采纳**内容寻址 id**（`note_id = blake3("journal:"‖vault‖date)`），使同日 dedup 成为**身份不变量**——两设备并发创建当天 journal 铸出同一 target，body 经 §6.1 不相交合并，无败方、无结构化 merge、无竞争 op，是最干净的路径。这是 §4.3 的真实模型变更，已回填主计划 §4.3 / §8.2 / §11（普通 Note 仍随机 nanoid，journal 例外），并接受「同 vault 一日一 journal」的取舍；随机-id 结构化-merge 回退已否决（§6.9）。

**余下 phase-0 签署项（见 §13.1）：** Kleppmann 祖先检查作为有意识的 §13 边界决策的签署、tag OR-Set 推翻「zero new storage」的存储取舍、以及 `ConflictRecord` / `resolve` 新公开 CLI schema（§13 行 742）的预留。
