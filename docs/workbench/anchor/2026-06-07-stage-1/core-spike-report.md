# Anchor Stage 1 — Core Spike Report（Claude / core owner）

日期：2026-06-07
状态：**workbench artifact** —— 非公开接口契约。本文件是 CP-1 / Stage 1 spike 的 **Claude / core owner** 报告：在 CP-0 批准的 Option A 布局下，把平台无关 Rust core 的确定性产物落成 `cargo test -p anchor-core` 正式测试，并跑通多目标编译 gate 与 client 零真理逻辑红线。命令与输出见同目录 `core-evidence.md`；给 Codex 的被调 surface 见 `codex-apple-input.md`。

> 边界：本 spike 只创建 `suites/anchor/**`（core crate / fixtures / tests + 必需的 `suites/anchor/Cargo.lock`），**未**改 root `package.json` / `bun.lock` / root `tsconfig` / Bun workspace 配置，**未**创建 Apple 工程 / entitlements / iCloud container，**未**实现持久应用写入 / 公开 CLI schema（plan §11 CP-1）。

---

## 1. Objective 与结论

把 CP-0 冻结的冲突模型与确定性契约（contract-baseline / key-decisions D01–D38 / conflict §3–§10）推进为**可 replay、跨运行/跨设备逐字节一致、经正式测试通过**的平台无关 `anchor-core`。

**结论：CP-1 core side = complete。** spike 组 1（core deterministic）与组 5（mirror/search parity）的全部 case 落成 74 个正式测试并通过；`cargo clippy --all-targets` 干净；多目标编译 gate（`wasm32-unknown-unknown` + `aarch64-linux-android`）通过；client 零真理逻辑 / core 零云符号 grep 红线通过；跨目标一致性向量集 golden 固化；million-op replay 成本曲线线性。Codex 的 Apple 验证（组 2/3/4）所需被调 surface 与真值已就绪并交接。剩余 Stage-1-gated 项（A2/B4 binding 机制、B14 iCloud 作首期默认 transport 的 synced-segment-file scale）按 owner 二分属 Codex/Apple + 用户签署，不在 core side。

---

## 2. 创建的结构（Option A，仅 `suites/anchor/**`）

```
suites/anchor/
  Cargo.toml            # Rust workspace（members=["core"]；cli/apple 留待，未创建）
  Cargo.lock            # 生成（授权）；零外部依赖 → lock 仅含 anchor-core 自身
  core/
    Cargo.toml          # anchor-core：#![no_std]+alloc，[dependencies] 空
    src/  (21 模块, ~3490 行)
    tests/ (18 文件 + common/, ~1623 行)
  # fixtures/ 未单列目录：fixture 真值以 Rust fixture functions（dto::open_fixture_vault）
  #            + tests/common/mod.rs 的 op 构造器形式内联，避免额外解析层（见 §6 决策）
```

**绝不为适配 `suites/*/*` glob 添加 placeholder `package.json`**（D02 硬约束已守）。`suites/anchor/core` / `cli` / `apple` 等无 `package.json` 目录对 `bun install` / `bun run check` 的影响仍是 CP-0 的 Unknown（本轮未跑 bun，不授权改 bun 配置）——留实现期 / Codex 实测，见 `core-evidence.md` §7。

### 2.1 模块清单（src）

| 模块 | 角色 | 关联决策 |
|---|---|---|
| `hash` | vendored 纯 Rust no_std BLAKE3（256-bit）+ hex | D30；零依赖保 D36 |
| `canonical` | JCS 风格 canonical serialize + `rev`；类型层禁 f64 | D30 |
| `hlc` | HLC + 全序 `T` 比较 + join | conflict §4 |
| `id` | journal 内容寻址身份、merge_op_id、纯熵 nanoid | D08 |
| `order` | fractional-index base-62 order-key（无浮点、无尾零） | D26 |
| `marks` | UTF-16 mark + reclamp（expand/non-expand 缝、collapse 丢弃） | conflict §6.1；D18 |
| `op` | op 信封（D24 全字段预留）+ builder + 全序 key | D24 |
| `model` | 物化 Note/Block/Vault + canonical 投影 + snapshot_revision + ConflictRecord | D30 |
| `diff3` | 单一 pinned 3-way diff3（line LCS）+ UTF-16 splice 派生 | D19 |
| `orset` | tag OR-Set add-wins 成员判定 | D28 |
| `lattice` | life 优先级 lattice join + dominates_frontier 终态判定 | D10/D20/D27 |
| `stale` | per-cell `base_sub_rev` stale guard（dispatch-time） | D11 |
| `replay` | **op-log replay 纯 fold**：dedup→排序→逐 register 调和→派生可见性/冲突 | D12；conflict §4–§10 |
| `ingest` | 同步 ingestion：per-actor HWM + op_id dedup（幂等再投递） | D12 |
| `mirror` | post-commit mirror 导出 + structured search vs ripgrep parity + 失败隔离 | D15/D16 |
| `segment` | segment batching budget shape（N op ≠ ~N segment） | D06/D13 |
| `retention` | 四-horizon retention 真值表 + watermark + stale-peer + upcast hook | D14/D38 |
| `sync_port` | `OpSyncPort` trait + `SegmentId`/`BlobId`（仅 id+字节，无云类型） | plan §8.1；D37 |
| `dto` | FFI surface：`Session`/`EditorIntent`/`TransactionResult`/fixture/segment 字节 | plan §8.1；D01 |

---

## 3. Spike 组 1 — Core deterministic（owner: Claude/core，全部落成测试）

| 子 spike | 实现 | 测试证据 |
|---|---|---|
| canonical serialize 确定 bytes/hash | `canonical` JCS 风格、递归排序、固定转义、类型层禁 f64 | `canonical`(6) |
| nanoid / journal 内容寻址身份 | `id`：journal=`jnl_`+blake3(seed)；merge_op_id；纯熵 nanoid（core 不取 RNG） | `identity`(4)、`determinism_vectors` |
| fractional order-key，禁 float | `order`：base-62 between，无浮点、无尾零、严格有序 | `order`(6)、`determinism_vectors` |
| op-log replay 纯 fold | `replay`：dedup by op_id → 全序 `T` 排序 → 逐 register fold；到达顺序无关 | `replay_fold`(3)：原序/逆序/旋转 + 500-node smoke 逐字节一致 |
| HLC / 全序 ingestion | `ingest`：per-actor 单调 HWM + op_id dedup；幂等再投递 | `ingestion`(3) |
| target/register sub-field stale guard | `stale`：per-cell `base_sub_rev` guard；异 cell 独立可合并 | `stale_guard`(2)：F33/F32 |
| body diff3 / keep-both + mark re-clamp | `diff3`+`replay`：不相交 auto-merge、重叠/不可恢复 base→keep-both（winner=高-T、loser 带 op_id、pin）、mark reclamp | `diff3_body`(7)：F23 |
| tags OR-Set add-wins | `orset`+`replay`：add-identity=op_id、observed_adds、add/remove/re-add | `orset_tags`(4)：F29 |
| life lattice | `lattice`+`replay`：clock-independent join、archived-wins tie、非级联派生可见性、dominates_frontier 终态、拒 active→deleted（dispatch） | `life_lattice`(5)：F25/F27/F31 |
| journal trash/reopen restore | `replay`+`id`：同日去重身份不变量、同日 body 不相交合并、trash 重开 restore 不铸重复 | `journal_restore`(3)：F05/F08/F35 |
| location merge | `replay`：move-vs-edit 全保留 + location_relocated、apply-time 整体 cycle reject、reorder_blend、dangling reattach | `location_merge`(4)：F24/F26/F27 |
| **diff3+order-key 跨设备逐字节一致向量集（CI gate）** | `determinism_vectors` 固化 golden（含 wasm/android 同源 by construction） | `determinism_vectors`(6)：F23/F26 |
| **core 多目标编译 gate** | `#![no_std]`+alloc + 零依赖；`cargo build --target wasm32 / android` 均过 | `core-evidence.md` §3 |
| **client 零真理逻辑红线** | core 全树零云符号；merge/diff3/order-key 唯一在 core | `core-evidence.md` §4 |
| op-count scale（→1M+） | `replay` 线性；release 1.25M ops≈2.6s | `scale_bench`（ignored）；`core-evidence.md` §6 |
| segment batching budget | `segment`：N op ≠ ~N segment 的 failure-shape 识别 | `segment_budget`(3)：F42 |
| 四-horizon retention | `retention`：五安全条件+excise 真值表、watermark=min、stale-peer、restore 前向、upcast | `retention`(7)：F43 |

**贯穿断言（已强制）：** 凡多 replica / 多 ingestion 顺序的 fixture，经 `assert_order_independent`（原序+逆序+旋转）断言物化态、`snapshot_revision`、冲突集逐字节相同。这直接落实 conflict §4「同一 op 集合任意两 replica 逐字节相同」。

---

## 4. Spike 组 5 — Mirror / search parity（owner: Claude/core）

`mirror`：post-commit `.md`/`.json` 导出、freshness、mirror 写失败隔离（op-log 不回滚）、structured search 与对导出 `.md` 跑 ripgrep 的 parity、打开 body 冲突渲染 git 式 fence。测试 `mirror_parity`(3)：F36。

---

## 5. World A 受保护不变量（D36/D37）—— 如何被守住

- **零外部运行时依赖**：`anchor-core` 的 `[dependencies]` 为空。BLAKE3 / diff3 / fractional-index / HLC 全 vendored。任何 transitive crate 都无法打破多目标 gate；这也使 diff3/order-key 成为**唯一 pinned 实现**（D19/D26），不存在第二份。
- **`#![no_std]` + `alloc`**：直接证「确定性/merge 路径 no_std-friendly」；用 `BTreeMap`/`BTreeSet`（有序迭代）而非 `HashMap`，消除迭代顺序不确定源。`#![forbid(unsafe_code)]`。
- **禁浮点 by construction**：`CanonicalValue` 无 f64 变体；order-key 是 base-62 字符串整数算术；hash 全整数。
- **不碰 OS 线程/fs/时钟/RNG**：HLC/op_id/熵全部由调用方（平台）传入；core 纯函数。
- **零云符号**：审计 grep 0 命中（含注释，边界文案已改写为不含被审 token）→ 可直接作 CI 红线。
- **vendored BLAKE3 正确性**：以参考 `blake3` crate 生成的官方向量（单 block / chunk 边界 / 多 chunk 树）+ 增量一致性 gate 锁定。

---

## 6. Stage 1 证据导致的 CP-0 模型澄清（已回填）

Stage 1 落实中，以下抽象点被**具体化**（非模型反转，是把 `‖` 等抽象记号落成确定字节）；按 prompt 要求保留 D/F 编号并标 Stage-1 evidence 回填到 `key-decisions.md` / `fixture-set.md`：

1. **D08 / F03 journal 身份字节格式**：抽象 `blake3("journal:" ‖ vault_id ‖ calendar_date)` 具体化为 `note_id = "jnl_" + hex(blake3("journal:" + vault_id + ":" + calendar_date))`——冒号分隔消除 `‖` 歧义（vault_id 是无冒号 nanoid、date 是 ISO `YYYY-MM-DD`），`jnl_` 前缀使 journal id 与随机 nanoid 可区分；身份不变量（同 vault 同日恒同 id）不变。ground truth 见 `core-evidence.md` §5。
2. **F23 / F26 一致性向量集已存在**：CP-0 标 “Not run，待 Stage 1 建立” 的跨目标 golden 已建立并固化（`determinism_vectors.rs`），多目标编译 gate 已通过；跨目标**执行**接线留 CI（见 §8）。

这些不改任何冻结结论（三 register、no-silent-loss、lattice、OR-Set、全序 `T`、op-envelope 字段集均按 CP-0 实现）。`contract-baseline.md` 无需修正。

---

## 7. Fixtures 形态决策（诚实记录）

CP-0 layout 列了 `suites/anchor/fixtures/`。本 spike 选择把 fixture 真值实现为**Rust fixture functions**（`dto::open_fixture_vault`）+ `tests/common/mod.rs` 的 op 构造器，**未**单建 `fixtures/` 数据目录。理由：core deterministic 测试需要的是**可构造、可断言、参与 replay** 的 op 集合，Rust 内联构造比 JSON fixture 多一层解析更直接、更不易引入第二真值表示；且 Codex 的被调真值经 `open_fixture_vault` 已可跨 FFI 取用。若后续 Apple/CLI 需要磁盘 fixture 资产，再加 `suites/anchor/fixtures/`（不在 CP-1 core 证据所需范围）。

---

## 8. 限制与诚实标注（Not run / 简化 / 延后）

- **跨目标执行**：`wasm32`/`android` **编译** gate 已过；一致性向量的跨目标**执行**（wasmtime / android emulator 跑同一 golden）留 CI 接线。当前 golden 在 `aarch64-apple-darwin` 捕获；因 core 整数无浮点无平台分支，跨目标值相同 by construction，但「执行级」证明未跑。
- **ConflictRecord 检测器为确定性启发式**：`location_relocated` / `reorder_blend` / `ancestor_life_vs_descendant_edit` / `life_tie` 的检测谓词用「不同 actor + 结构条件」近似并发，是 op 集合的纯函数（确定、order-independent），但非完整因果图判定。merge **结果**（物化态/keep-both/lattice/pin）严格按 spec；冲突 surfacing 的精度是 spike 简化，不影响 no-silent-loss（loser 永远 pin/保留）。
- **renormalize base-staleness（F26c）**：op 信封已带 `base_snapshot_revision`，但「陈旧 renormalize 视为 no-op 本地重派生」的坍缩未在 Stage 1 落地（需 snapshot pin）——order-key 确定性与 reorder_blend 已证，此项标 deferred-within-Stage-1，不阻 CP-1 core 确定性。
- **split/merge macro-op（D29）**：`OpKind::Split/Merge`/`macro_op_id` 已在信封预留；intent-rebase 的完整 dispatch 延后 CP-2（`dto` dispatch 对 Split/MergeBackward 返回 validation_error）。
- **persistent 写入 / CLI 公开 schema / CloudKit / Apple 工程**：按 plan §11 / CP-0 未实现 / 未创建。

---

## 9. Stop conditions 检查（均未触发）

- 未需改 root workspace / package 边界（只动 `suites/anchor/**`）。
- 未创建 Apple project / entitlements。
- 未暴露 CP-0 未批准的公开 CLI schema（ConflictRecord 仅内部派生读模型，非 CLI 面）。
- core 全部依赖（零个）+ 全部 in-crate 代码均编到 wasm32/android——无「core 依赖无法编译且无法替换」。
- 无任何 merge/normalization/op-creation 逻辑移到 client（D37 红线 0 命中）。

---

## 10. CP-1 core side 判定

**Complete（core side）。** 组 1 + 组 5 全绿成正式测试，三道 gate（多目标编译、零真理逻辑红线、一致性向量集）通过，million-op replay 线性，被调 surface + 真值交接 Codex。CP-1 整体退出仍需 Codex/Apple 的组 2/3/4 证据 + B14 synced-segment-file scale 真机 go/compromise + A2/B4 binding 机制用户签署——这些按 owner 二分不在 core side，输入已由 `codex-apple-input.md` 提供。
