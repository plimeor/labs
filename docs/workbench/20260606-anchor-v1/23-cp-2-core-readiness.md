# Anchor — CP-2 Core Readiness (dispatch / replay / op-shape)

任务：推进并收口 CP-2 的 Claude/core-owned 工作（单一已校验 dispatch、op-log replay、op-shape 冻结），把 core 推到纯 Claude agent 可达的最远处。
日期：2026-06-10
状态：**workbench evidence（consolidated）—— 非公开接口契约**

> **边界声明（AGENTS 工作台规则，强制）：** 本文件**不授权**任何 package / workspace / 产品 app / 生成 lockfile 改动；不改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置，不创建产品 app shell / Xcode project / entitlement / bundle id / iCloud container，不把 Swift/TextKit 变成任何确定性语义 owner，不向 `anchor-core` 引入任何 Apple / cloud / file-coordination / account / ubiquity 类型。代码变更限于 `anchor-core` 的 Rust 实现与 Rust 测试。本文件取代分散的 core 迭代报告（原 `72`–`75`）。权威接口契约在实现后归 `anchor-core` README。

---

## 1. 结论（CP-2 core readiness）

**CP-2 的 core-owned 不变量已建立并以测试守住；CP-2 whole-exit 仍未退出（gated on CP-1 whole-exit + human sign-off）。** 本轮把 CP-2 的 7 项 core-executable 工作落地 5 项、并把 2 项（确定性 intent-rebase、renormalize 陈旧坍缩）以精确的 remaining-work 记录，因为二者的「正确实现」体量大且若做错会引入确定性回归，宁可记录也不交付半成品。（**后记：两项均已在 round 2 落地，见 `25`** —— intent-rebase 取保守单侧规则、renormalize 取 all-or-nothing CAS 坍缩，surface+pin floor 语义不变。）

CP-2 的**单一已校验 dispatch（single-validated-dispatch）**这一标志性交付已完成并可 grep 证明：每条本地持久写入只经一个 append-front 校验的 chokepoint。

> CP-2 **不能由纯 Claude agent 形式退出**：driver §4 要求「CP-1 whole-exit 先过」，而 CP-1 whole-exit 需 Apple 真机 runtime + 付费 ADP + 真实 iCloud + human sign-off（见 `22-cp-1-exit-report.md`）。本文件交付的是 CP-2 的全部 core/确定性证据；checkpoint 形式退出仍是 human gate。

---

## 2. Scope-fence check（本轮）

| Fence | 结果 |
|---|---|
| root workspace / package / lockfile | 未改 |
| 公开 CLI schema | 未改（CLI 包未创建；D31 ConflictRecord/resolve CLI 仍 Phase 2 延后） |
| 产品 app shell / Xcode project / entitlement / iCloud container | 未创建 |
| Swift/TextKit 确定性语义 | 未加（`apple/` 零确定性语义 grep = 0 matches） |
| `anchor-core` 云/文件协调/account/ubiquity 类型 | 未加（audit = 0 matches, exit 1） |
| 持久应用写入 | 未加（spike/测试，无产品落盘） |
| checkpoint 形式退出 | 未触（CP-2 whole-exit 仍 gated） |

---

## 3. CP-2 core 交付矩阵

| # | CP-2 core 项 | 状态 | 证据 |
|---|---|---|---|
| 1 | **单一已校验 dispatch chokepoint** + grep 不变量 | **closed / tested** | §4.1 |
| 2 | **macro 原子消费**（split/merge/undo 全有或全无，D29） | **closed / tested** | §4.2 |
| 3 | **`split_merge_structural` 冲突物化**（no silent loss） | **closed / tested** | §4.3 |
| 5 | **D24 op-shape 全信封冻结** + golden 向量 | **closed / tested** | §4.4 |
| 7 | **跨目标 EXECUTION**（native + wasm 逐字节一致） | **closed / observed** | §4.5 |
| 4 | 确定性 split/merge **intent-rebase** | **closed（round 2，见 `25`）** | §6 |
| 6 | **renormalize 陈旧坍缩**（F26c） | **closed（round 2，见 `25`）** | §6 |

折叠进本文件的 core 迭代下限（原 `72`–`75`）：core split/merge-backward 结构 dispatch、core-sourced `EditorPatch` projection 下限、core-owned undo-group 下限、core-only undo replay 下限——均仍 green，详见 §5。

---

## 4. Observed 证据（command + output）

所有命令在仓库相对路径下可复跑（与本机绝对路径无关）；golden 值复用、不重派生。

### 4.1 单一已校验 dispatch chokepoint（CP-2 标志性交付）

每条本地持久写入只经 `Session::commit`——crate 内**唯一**向 session op-log append 的点，且先过 `validate_batch`（D10/D20 终态可达守卫在此集中，不再散落于 op 构造）。sync ingestion 路径是独立 op-log owner（`IngestState::ingest`），同样恰有一个 append，且被 op_id-dedup + per-actor HWM 单调性 gate。

```sh
rg -n 'self\.log\.(extend|push)' suites/anchor/core/src
```
```text
suites/anchor/core/src/dto.rs:408:        self.log.extend(ops);     # Session::commit（validate_batch 守卫）
suites/anchor/core/src/ingest.rs:59:        self.log.push(op);       # IngestState::ingest（dedup + HWM 守卫）
```

行为证据（被拒 dispatch 不产生部分写入）：

```text
tests/dispatch_invariant.rs:
  rejected_dispatch_leaves_log_and_snapshot_untouched ... ok   # active→deleted 被 chokepoint 拒，log 长度与 snapshot_revision 不变
  structural_macro_ops_are_stamped_with_group_size ... ok      # commit 为每个 macro op 盖 macro_size
```

### 4.2 macro 原子消费（D29）

`commit` 为同批 `macro_op_id` 的 ops 盖 `macro_size`（一次 dispatch = 一个 macro）；`replay` 的 `drop_incomplete_macros` 只在 present-count == `macro_size` 时保留该组，否则整组丢弃——半应用的结构编辑永不物化。

```text
tests/structural_dispatch.rs:
  incomplete_structural_macro_is_not_partially_applied ... ok  # 丢任意一腿（3 种）整组消失，blk_a 保持原 body，右块不创建；arrival-order 无关
```

### 4.3 `split_merge_structural` 冲突物化（no silent loss）

`derive_split_merge_structural` 让原本 dead 的 `ConflictKind::SplitMergeStructural` 变 live：结构 macro 与另一 actor 在同节点的并发普通编辑共存时，surface 冲突并 pin 双方全部 op_id（compaction 永不丢侧）。当前阶段**surface 不 auto-rebase**（auto-rebase 见 §6 item 4；round 2 已落地保守单侧 rebase，floor 保留给 straddle/链式/纯 mark 情形，见 `25`）。

```text
tests/structural_dispatch.rs:
  concurrent_split_and_edit_surface_structural_conflict_no_silent_loss ... ok  # 并发 split+edit → split_merge_structural 冲突，双方 pin，conflict set order-independent
```

### 4.4 D24 op-shape 全信封冻结

`op::op_envelope_canonical` 规范序列化**完整** op 信封（每个字段 + payload by `kind` tag），`segment_bytes` 改用它（segment 字节面如实反映 on-disk op-shape）。golden 向量 pin 一个全字段 op 的 `rev`，并证明**改任一字段都改字节**（任何字段 omit/rename/re-type 都将强制 op-log migration）。

```text
tests/op_shape_freeze.rs:
  op_envelope_shape_is_frozen ... ok
# 冻结 golden：op_envelope_rev(golden_op) =
#   18582d532ebf171df3af8f801eb688e40ed78c82cb8c13de083b0a448e75dfe0
# 25 个字段逐一 mutate，rev 均改变。
```
op 信封新增 `macro_size: Option<u32>`（D29 原子性所需），并在冻结前一并纳入；其余 reserved 字段（`base/new_register_rev`、`supersedes_rev`、`diff_algo_version`、`provenance`、`approval_state`）显式标注为 D24 保留并纳入冻结序列化（op.rs 注释）。`OP_ENVELOPE_VERSION = 1` 未变（无持久数据，无 migration 负担）。

> **D24 freeze 的 human gate：** Claude 已产出 byte-frozen golden + freeze 测试作为证据；正式「冻结签字」（授权任何后续 cloud record schema）仍是 human approval（见 §6）。

### 4.5 跨目标 EXECUTION（native + wasm 逐字节一致）

CP-2 改动后重跑跨目标向量执行（非仅编译）：

```sh
ANCHOR_SKIP_IOS=1 bash suites/anchor/core/tests/run-cross-target-vectors.sh
```
```text
test result: ok. 6 passed; 0 failed; 0 ignored          # native determinism_vectors
anchor_wasm_vector_status=0                              # wasm（Node WebAssembly）逐字节一致
anchor_ios_vector_status=skipped                         # iOS slice 仍 Apple-gated
```
6 个 determinism 向量（diff3、order-key、canonical rev、fixture/conflict/merged snapshot）native↔wasm 逐字节一致；fixture `snapshot_revision 3ef88671…a877b63` 未变（CP-2 改动不触物化态）。

### 4.6 整体门控

```sh
cargo test   --manifest-path suites/anchor/Cargo.toml       # 83 passed; 0 failed; 1 ignored（scale_bench 默认门控）
cargo clippy --manifest-path suites/anchor/Cargo.toml --all-targets -- -D warnings   # Finished（clean）
cargo build  --manifest-path suites/anchor/Cargo.toml --target wasm32-unknown-unknown        # Finished
cargo build  --manifest-path suites/anchor/Cargo.toml --target aarch64-linux-android         # Finished
rg "CloudKit|CKRecord|CKAsset|CKContainer|CKSyncEngine|NSFileCoordinator|NSMetadataQuery|ubiquit|iCloud|NSURLIsExcludedFromBackupKey" suites/anchor/core   # 0 matches, exit 1
```
起点 74（Stage-1）→ 78（折叠 72–75 后）→ **83**（CP-2 新增 5 个测试：`dispatch_invariant`×2、`structural_dispatch` 原子+冲突×2、`op_shape_freeze`×1）。

---

## 5. 折叠的 core 迭代下限（原 72–75）

| 下限 | 状态 | 现归处 |
|---|---|---|
| core split/merge-backward 结构 dispatch（macro_op_id、order-key 经 `crate::order`、first-sibling merge typed error） | green | dto.rs `dispatch_split_block` / `dispatch_merge_backward`；tests/structural_dispatch.rs |
| core-sourced `EditorPatch` projection DTO 下限 | green | dto.rs `EditorPatch` / `editor_patches_for_single_op` |
| core-owned undo-group DTO 下限 | green | dto.rs `UndoGroup` / `undo_group_for_single_op` |
| core-only undo replay（insert/split/merge undo 降为已提交 core ops 并物化） | green | dto.rs `dispatch_undo_group` / `ops_for_undo_group`；tests |

本轮在此之上：把上述路径全部收敛到单一 `commit` chokepoint、加 `validate_batch`、加 macro 原子性、加结构冲突物化、冻结 op-shape。dispatch 的可靠性也加固：split order-key 失败现返回 `StructuralDispatchDeferred` 而非伪造 `<order>z` key（保持 order-key 只在 `crate::order` 内派生）。

---

## 6. Remaining work / open gates

| Open gate | 状态 | Owner | 说明 |
|---|---|---|---|
| **确定性 split/merge intent-rebase**（item 4） | **closed（round 2，见 `25`）** | — | 落地为保守单侧规则：hunks 全在 split 一侧 ⇒ replay 时意图重放（log 不改写、到达序无关）；straddle / 链式 / 纯 mark / macro 形状未通过字节验证 ⇒ 维持 §4.3「surface + pin」floor（no silent loss 语义不变）。 |
| **renormalize 陈旧坍缩**（item 6 / F26c） | **closed（round 2，见 `25`）** | — | producer `dispatch_renormalize_children` + replay 端 per-op location-rev CAS、macro all-or-nothing 坍缩（并发 move 恒胜，部分重铺不致 sibling 乱序）；无 base 的 legacy 信封保持无条件应用。 |
| Swift/FFI undo-group input 契约 | Not run | binding owner | core-only undo replay 已证；Swift 侧 JSON 入参契约未建。 |
| 产品 `NSUndoManager` grouping / redo | Not run | Apple product owner | core undo 下限 only。 |
| op-shape **formal freeze 签字** | **signed（2026-06-10，用户授权，见 `26` §5）** | — | golden `18582d53…` 自 CP-2 起 pin 住；round 3 的 `supersedes_rev` 消费证明预留字段可被启用而信封零改动。其「授权后续 cloud record schema」的消费端仍属二期 CloudKit（Apple-gated）。 |
| **CP-2 whole-exit** | Open — **human sign-off 非 Apple 部分已签（2026-06-10，`26` §5）**；剩余 gated on CP-1 的 Apple runtime 链 | Apple operator | driver §4：CP-1 whole-exit 先过；CP-1 剩余 = Apple operator round（见 `22` §5）。 |

---

## 7. Backfill 指针

模型调整已回填既有 D/F 号（不新增 doc）：
- **D24**（op-envelope 冻结）：`05-key-decisions.md` 记 op_envelope_canonical 全信封冻结 + golden + `macro_size` 纳入。
- **D29**（split/merge macro）：`05-key-decisions.md` 记 macro 原子消费（`macro_size` + `drop_incomplete_macros`）。
- **单一已校验 dispatch**（plan §8.5）：`04-contract-baseline.md` core responsibility baseline 记 chokepoint grep 不变量已落地可证。
- **F26c**：`06-fixture-set.md` 记 renormalize 陈旧坍缩当时仍 reserved（无 producer）；round 2 已落地 producer + CAS 坍缩（见 `25`）。
