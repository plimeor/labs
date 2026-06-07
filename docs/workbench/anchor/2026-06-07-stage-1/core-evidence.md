# Anchor Stage 1 — Core Evidence（验证命令与输出）

日期：2026-06-07
状态：**workbench artifact** —— 非公开接口契约。本文件记录 CP-1 Claude / core side 的可重复验证命令与其实跑输出（Observed），供 CP-1 gate 审阅。命令骨架与 owner 模型见同目录 `core-spike-report.md`；给 Codex 的被调 surface 见 `codex-apple-input.md`。

> 标注：**Observed** = 本机实跑输出；**Recommended** = 目标态命令骨架（未实跑）。本机环境：macOS（Darwin 25.5.0，aarch64），`cargo 1.95.0`、`rustc 1.95.0`。Rust targets：`aarch64-apple-darwin`（host，预装）+ 本轮 `rustup target add` 安装的 `wasm32-unknown-unknown`、`aarch64-linux-android`。

---

## 0. 前置：Rust target 安装（Observed）

CP-0 记录 host 仅装 `aarch64-apple-darwin`。本 prompt 授权安装多目标 gate 所需 target：

```fish
rustup target add wasm32-unknown-unknown aarch64-linux-android
```

输出（Observed）：

```
info: downloading component rust-std
info: downloading component rust-std
$ rustup target list --installed
aarch64-apple-darwin
aarch64-linux-android
wasm32-unknown-unknown
```

> Apple Rust targets（`aarch64-apple-ios` / `aarch64-apple-ios-sim`）**未**在本轮安装——它们是 Codex/Apple binding spike 的前置（D33），不属 core deterministic gate。

---

## 1. `cargo test -p anchor-core`（Observed — 全绿）

```fish
cd suites/anchor
cargo test -p anchor-core
```

结果：**74 passed; 0 failed**（ignored 1 = `scale_bench::replay_cost_curve`，默认门控不跑）。各测试二进制：

| test 文件 | passed | 覆盖 fixture / 决策 |
|---|---|---|
| `blake3_vectors` | 2 | 官方 BLAKE3 向量（含多 chunk 树）+ 增量=一次性一致 |
| `canonical` | 6 | D30 canonical：key 递归排序、固定转义、禁 f64、rev 稳定 |
| `identity` | 4 | D08 journal 内容寻址身份、merge_op_id、纯 nanoid |
| `order` | 6 | D26 fractional order-key：严格 between、有序、确定、无尾零 |
| `diff3_body` | 7 | F23 diff3 auto-merge / keep-both / 不可恢复 base / mark re-clamp |
| `orset_tags` | 4 | F29 OR-Set add-wins、observed-remove、add/remove/re-add |
| `life_lattice` | 5 | F25/F27/F31 lattice、edit-vs-delete、终态支配、trash-vs-archive、祖先 trashed |
| `journal_restore` | 3 | F05/F08/F35 同日去重、同日 body 合并、trash 重开 restore |
| `location_merge` | 4 | F24/F26/F27 move-vs-edit、cycle reject、reorder blend、dangling reattach |
| `replay_fold` | 3 | 多特征 + 500-node smoke 的到达顺序无关 + 重投递幂等 |
| `ingestion` | 3 | F34 dedup、per-actor HWM、ingestion 顺序无关 |
| `stale_guard` | 2 | F33/F32 sub_rev stale guard、异 cell 独立可合并 |
| `mirror_parity` | 3 | F36 structured search == ripgrep(md)、mirror 失败隔离、冲突 git fence |
| `segment_budget` | 3 | F42 N op 不产 ~N segment（failure shape 识别） |
| `retention` | 7 | F43 四-horizon 真值表、watermark=min、stale-peer 退出、restore 前向、upcast hook |
| `determinism_vectors` | 6 | F23/F26 跨目标一致性向量集（CI gate golden） |
| `dto_surface` | 6 | open_fixture_vault / dispatch round-trip / 拒 active→deleted / segment bytes / blob |

每个涉多 replica / 多 ingestion 顺序的 fixture 经 `assert_order_independent`（原序 + 逆序 + 旋转三次 replay）断言物化态、`snapshot_revision`、冲突集三者逐字节相同（贯穿断言）。

---

## 2. `cargo clippy -p anchor-core --all-targets`（Observed — 干净）

```fish
cargo clippy -p anchor-core --all-targets
```

输出：`Finished` 无 warning/error（含 lib、全部 test、scale_bench；grep `warning|error` 计数 = 0）。

---

## 3. 多目标编译 gate（Observed — World A 受保护不变量 D36）

```fish
cargo build -p anchor-core --target wasm32-unknown-unknown   # Finished — OK
cargo build -p anchor-core --target aarch64-linux-android    # Finished — OK
```

两目标均 `Finished` 成功。`anchor-core` 是 `#![no_std]` + `alloc`、**零外部运行时依赖**（`[dependencies]` 为空），故多目标可编译性 by construction：没有任何 transitive crate 能打破 gate。BLAKE3、diff3、fractional-index、HLC 全部 in-crate vendored。

> 注：android target 的 `cargo build`（lib crate → rlib）**不触发 C 链接器**，故无需 Android NDK 即可通过编译 gate。这正是放弃 `blake3` crate（其 `cc` build script 会引 C 编译）、改 vendored 纯 Rust BLAKE3 的原因之一。

---

## 4. Client 零真理逻辑 / core 云符号审计（Observed — D37）

**审计 1：core 零云符号**（强制红线，期望 0 命中）

```fish
rg -n "CloudKit|CKRecord|CKAsset|CKContainer|CKSyncEngine|NSFileCoordinator|NSMetadataQuery|ubiquit|iCloud|NSURLIsExcludedFromBackupKey" suites/anchor/core
# exit 1（no matches）
```

**0 命中**，含注释。`anchor-core` 全树（src + tests）无任何 Apple / 云 / 文件协调符号——边界描述性文案亦已改写为不含被审 token（`cloud file transport` / `metadata-query` 等），使该 grep 可直接作 CI 红线。

**审计 2：`OpSyncPort` 传输面存在且仅 id+字节**（期望命中）

```fish
rg -n "OpSyncPort|push_segment|pull_segment|SegmentId|BlobId" suites/anchor/core
```

命中 `src/sync_port.rs`（`trait OpSyncPort` + `SegmentId` / `BlobId` + `list/pull/push_segment` / `pull/push_blob`，全部 `id + &[u8]`，无云类型）与 `src/dto.rs`（segment 序列化面）。

---

## 5. 跨目标一致性向量集（CI gate golden，Observed）

`tests/determinism_vectors.rs` 固化以下 golden（在 `aarch64-apple-darwin` 捕获）。同源编到 `wasm32` / android 须复现逐字节相同——因 diff3 / order-key / canonical / snapshot_revision 全为整数、无浮点、无平台分支，相同 by construction；本向量集是强制门控（跨目标**执行**的 CI 接线见 `core-spike-report.md` §限制）。

| 向量 | golden |
|---|---|
| `blake3("null")` | `03f88b99c3d8073bba8948d6e762aac443b265f606cc05abd4d172f03a4def6a` |
| `rev("anchor:cell:body")` | `6dad5f63c254be772e58682c56c48a1c8a8b6f355b1c101aed8c6b4a5e467390` |
| `journal_note_id("vault_demo_0001","2026-06-07")` | `jnl_f99080f823e0815a8e1440955eb896d1c82d4ec371e19b2e0df89ad581f96b89` |
| `key_between(None,None)` | `V` |
| diff3(`l1\nl2\nl3`, `A1\n…`, `…\nB3`) | `A1\nl2\nB3` |
| fixture vault `snapshot_revision` | `3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63` |
| conflict（keep-both）vault `snapshot_revision` | `1552bb641e71fcd8dcfe51da8dcdf3e4dbaaa0cccc5d00a182ee0d1df417ea9f` |
| merged（auto-merge+tag+life）vault `snapshot_revision` | `97e065ff7f09edb2f44854b376705be3c4b8b747079ce2fbbfb10d0c3ec4b6f7` |

BLAKE3 向量本身的 expected 值由参考 `blake3` crate（v1.8.5，scratch crate `/tmp/b3check`）生成，覆盖单 block / chunk 边界（64、1024）/ 多 chunk 树（2048、4096、5000）；vendored 实现全部命中 + 增量更新一致。

---

## 6. Replay 规模成本曲线（Observed，release，`--ignored`）

```fish
cargo test -p anchor-core --release --test scale_bench -- --ignored --nocapture
```

| logical ops | nodes | replay 时间 |
|---|---|---|
| 12,500 | 2,500 | 22.0 ms |
| 125,000 | 25,000 | 229.3 ms |
| 625,000 | 125,000 | 1,330.4 ms |
| 1,250,000 | 250,000 | 2,614.6 ms |

线性（≈ 2.1 µs/op），无超线性退化——core-side **million-op replay** 证据。`snapshot_revision` 每档稳定输出。
（说明：本曲线证 **core 面** replay 成本 = O(ops)；**synced-segment-file-count** 规模（1K/10K/50K/100K iCloud 真机枚举）是 Codex/Apple 的 scale gate，no-go 转 CloudKit/object-store——见 `codex-apple-input.md` 与 cp-0 B14。）

---

## 7. 不在本轮运行 / 不授权的项（Not run，诚实标注）

- 任何 Apple `xcodebuild` / iOS slice / XCFramework / UniFFI bindgen / iCloud runtime —— Codex/Apple owner，本轮未跑。
- 跨目标**执行**一致性向量（wasm via wasmtime / android via emulator）—— 编译 gate 已过，执行接线留 CI。
- `bun install` / `bun run check` —— 未跑（不授权改 bun 配置 / lockfile；`suites/anchor/**` 无 `package.json`，对 `suites/*/*` glob 的影响为 CP-0 D02 的 Unknown，留实现期 / Codex 实测）。
- 持久应用写入 —— CP-1 通过前不实现（plan §11）。
