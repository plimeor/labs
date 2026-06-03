---
id: note_crdt_reading
kind: note
title: "CRDT 与协同编辑"
created: 2026-05-28T09:00:00+08:00
updated: 2026-05-31T22:10:00+08:00
type: Note
aliases:
  - "协同编辑笔记"
  - "CRDT notes"
tags:
  - crdt
  - reading
properties:
  status: "active"
  source: "[[Local-first notes]]"
---

# CRDT 与协同编辑

这篇笔记整理我对**无冲突复制数据类型**（CRDT）的理解，主线是：*为什么协同编辑最终选择了 CRDT 而不是 OT*。素材来自 Martin Kleppmann 的 [Local-first software](https://www.inkandswitch.com/local-first/ "Ink & Switch, 2019") 一文，以及 [Automerge](https://automerge.org) 和 [Yjs](https://github.com/yjs/yjs) 的源码。相关背景见 [[Local-first notes]] 与 [[Anchor V1]]。

> CRDT 的承诺很简单：**任意顺序、任意次数**地合并来自不同副本的修改，最终都会收敛到同一个状态。难的从来不是定义，而是让它在真实文档上既正确又够快。

整篇笔记围绕三个问题展开 —— #crdt 的数学骨架、序列类型怎么落地、以及它在 [[Anchor V1]] 这种本地优先应用里的取舍。

## 一、为什么不是 OT

操作变换（*Operational Transformation*，`OT`）是 Google Docs 一代的方案。它的核心是一个变换函数 `transform(op_a, op_b)`：当两个并发操作到达时，把它们改写成"好像按某个顺序先后发生"的等价形式。

它能用，但有两个让我放弃它的理由：

1. **正确性依赖中心服务器**。多数生产级 OT 系统都假设有一个权威节点来给操作定序；真正的 *点对点* OT 需要满足 `TP2` 这条变换性质，而它出了名的难写对。
2. **变换矩阵随操作类型平方膨胀**。每多一种操作，就要补一行 `transform`。这在 [[Anchor V1]] 里不可接受 —— 我想要的是**离线优先**、没有权威服务器的合并。

> 我读到的一句话特别准：
>
> > OT 把复杂度放进了*算法*；CRDT 把复杂度放进了*数据结构*。
>
> 对一个想长期维护的代码库来说，复杂的数据结构比复杂的算法更好养。

## 二、CRDT 的数学骨架

一个**状态型** CRDT（state-based，又叫 `CvRDT`）需要满足：合并函数是一个*交换、结合、幂等*的二元运算 —— 也就是说，所有状态构成一个**半格**（join-semilattice），合并就是取上确界 `⊔`。

只要满足这三条，收敛就是免费的：

- **交换律** —— `merge(a, b) == merge(b, a)`，所以网络乱序无所谓。
- **结合律** —— 怎么分组合并都一样，所以可以增量地 `merge`。
- **幂等性** —— `merge(a, a) == a`，所以同一条消息重发多少次都安全。

最小的例子是一个 *Grow-only Counter*（`G-Counter`）：每个副本维护自己那一格，合并时按下标取 `max`。

```rust
/// 每个副本只递增自己的槽位；合并时逐槽取 max。
#[derive(Clone, Default)]
struct GCounter {
    slots: Vec<u64>,
    replica: usize,
}

impl GCounter {
    fn increment(&mut self) {
        self.slots[self.replica] += 1;
    }

    fn value(&self) -> u64 {
        self.slots.iter().sum()
    }

    /// 交换、结合、幂等 —— 半格的上确界。
    fn merge(&mut self, other: &GCounter) {
        for (mine, theirs) in self.slots.iter_mut().zip(&other.slots) {
            *mine = (*mine).max(*theirs);
        }
    }
}
```

注意 `merge` 里那一行 `(*mine).max(*theirs)` —— 整个收敛保证就压在这个 `max` 上。它显然满足上面三条性质，**这正是 CRDT 把复杂度搬进数据结构的样子**。

### 2.1 LWW 与因果序

计数器之外，最常用的是 **Last-Write-Wins 寄存器**（`LWW-Register`）：每次写带一个时间戳，合并取时间戳更大的那个。问题在于"时间"——物理时钟会回拨，所以真实系统用的是 [Lamport 时间戳](https://lamport.azurewebsites.net/pubs/time-clocks.pdf "Time, Clocks, and the Ordering of Events")，必要时再退化为按 `replica_id` 打破平局。

> **注意**：用墙上时钟（wall-clock）做 LWW 会**静默丢数据** —— 一次 NTP 回拨就能让"较新"的写被判成"较旧"。这条我踩过，记在 [[同步引擎踩坑]] 里。

## 三、序列 CRDT：让文本可合并

寄存器和计数器都好说，真正的硬骨头是**有序序列**——也就是一段可协同编辑的文本。难点是：当两个人在*同一个位置*并发插入字符时，怎么稳定地定序？

主流答案是给每个字符一个**全局唯一、稠密、不可变**的位置标识：

- **Logoot / LSEQ** —— 用一棵隐式 `位置树` 生成可比较的标识符路径。
- **RGA**（Replicated Growable Array）—— 每个元素记住它"插在谁后面"，并用 `(timestamp, replica)` 打破并发平局。Yjs 与 Automerge 走的都是这一系。

下面是 RGA 插入逻辑的骨架，能看出它如何把"插在某元素之后"这件事变成纯数据：

```ts
type Id = { lamport: number; replica: string }

interface RgaNode {
  id: Id
  value: string
  /** 它声称要插在哪个节点之后；根用 null。 */
  origin: Id | null
  deleted: boolean // 墓碑标记，永不物理删除
}

function compareId(a: Id, b: Id): number {
  // 先比 Lamport 时钟，相等再用 replica 这个稳定 tie-breaker。
  return a.lamport - b.lamport || a.replica.localeCompare(b.replica)
}

/** 在同一 origin 下，按 id 降序找到正确插入点 —— 这保证了所有副本收敛到同一顺序。 */
function insertAfter(nodes: RgaNode[], origin: Id | null, fresh: RgaNode): RgaNode[] {
  let i = nodes.findIndex((n) => sameId(n.origin, origin))
  while (i + 1 < nodes.length && compareId(nodes[i + 1].id, fresh.id) > 0) {
    i += 1
  }
  return [...nodes.slice(0, i + 1), fresh, ...nodes.slice(i + 1)]
}
```

这里有两处值得反复琢磨：

1. `deleted` 是个**墓碑**（tombstone）而不是真删——删除在 CRDT 里只是"标记为不可见"，因为别的副本可能还在引用这个位置。代价是空间会涨。
2. `compareId` 必须是**全序**且对所有副本一致，否则 `insertAfter` 在不同机器上会给出不同结果，收敛就破了。

### 3.1 墓碑与因果稳定

墓碑会无限堆积，所以需要 **GC**。安全删除墓碑的前提是*因果稳定*（causal stability）：当一个删除操作已经被**所有**副本观察到、且不会再有更早的并发操作引用它时，才可以真正回收。

判断"所有副本都看到了"要用**版本向量**（version vector）：

```python
# 版本向量：每个 replica -> 已知的最大 Lamport 计数。
# 当某条操作的依赖被向量完全覆盖，它就因果就绪（causally ready）。
def causally_ready(op, vv: dict[str, int]) -> bool:
    for replica, counter in op.deps.items():
        if vv.get(replica, 0) < counter:
            return False  # 还缺前驱，先缓冲住
    return True
```

> 我的经验法则：**先把收敛跑对，再谈 GC**。墓碑膨胀是性能问题，顺序错乱是正确性问题——后者贵得多。

## 四、落到 [[Anchor V1]] 上

[[Anchor V1]] 的取舍其实更克制，详见 [[Local-first notes]]。它的真理之源是**磁盘上的 Markdown 文件**，CRDT 只在*协同会话*期间作为内存层存在，会话结束就序列化回 `.md`。这条边界很关键：

- [x] 单机离线编辑：根本不需要 CRDT，直接读写文件即可
- [x] `verbatim-save` 不变量：保存必须**逐字节**保留尾随空格与空行（见 [[Anchor architecture]]）
- [ ] 实时协同：才引入 RGA 内存层，落盘时再拍平为纯文本
- [ ] 把 `[[wikilink]]` 与 `#tag` 也纳入可合并的关系层

为什么不一上来就全用 CRDT？因为它和"文件是真理之源"会打架：

> 一旦 CRDT 成了真理之源，磁盘上的 `.md` 就退化成*导出格式*。
> 那我就丢掉了本地优先最珍贵的东西 —— 用任何编辑器（`vim`、`vscode`、Obsidian）打开文件、它依然是它自己。

所以 [[Anchor V1]] 的顺序是：**文件优先，CRDT 是会话期的临时形态**。这条决策我也写进了产品笔记 #product/decision。

### 4.1 待办与后续阅读

按优先级排一下接下来要读 / 要做的：

1. 读 Yjs 的 `YText` 实现，重点看它怎么用 **双向链表 + 索引** 把 `insertAfter` 做到接近 `O(1)` 摊还
   - 对照 `lib0` 里的二进制编码，理解它的 update 为什么那么小
   - 记录到 [[Yjs 结构解剖]]
2. 把上面的 `RgaNode` 原型补上 **删除 / 合并 / 序列化** 三条路径，写成可测的 `crdt-core` 包
3. 设计 [[Anchor V1]] 的会话协议：用 `WebSocket` 增量同步，断线用版本向量补齐
   - [ ] 定义 `sync-step-1` / `sync-step-2` 报文
   - [ ] 压测 1 万次并发插入下的合并延迟

几个还没想清楚、留给未来的我的问题 #open-question：

- 富文本（加粗、链接）该用**独立的格式 CRDT**，还是把格式当作可合并的*区间标记*？Peritext 给了一个思路。
- 在纯文本落盘的约束下，`[[wikilink]]` 的重命名怎么做成可合并、又不破坏 `verbatim-save`？

## 参考

- Shapiro 等，*A comprehensive study of CRDTs*（INRIA, 2011）—— 半格那套形式化的源头
- Kleppmann & Beresford，*A Conflict-Free Replicated JSON Datatype*
- 工程向源码：`yjs`、`automerge`、`diamond-types`
- 本仓内：[[Local-first notes]]、[[Anchor V1]]、[[Kent Beck]]

> 一句话总结：**CRDT 不是为了"更聪明的合并"，而是为了"不需要协调就能合并"**。把这件事想透，剩下的都是工程。
