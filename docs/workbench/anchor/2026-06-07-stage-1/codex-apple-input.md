# Anchor Stage 1 — Codex / Apple Input（被调 surface 与交接）

日期：2026-06-07
状态：**workbench artifact** —— 非公开接口契约。本文件是 Claude / core owner 交给 Codex / Apple verifier 的输入：可调用的 `anchor-core` surface、被调 DTO/fixture 真值、planned FFI surface，以及 scale-gate 交接。Codex 据此启动 binding spike（spike 组 2）、text surface spike（组 3）、iCloud Drive spike（组 4），**无需重写任何 merge / normalization / op-creation / diff3 / order-key**（D37：这些唯一在 Rust core，Codex 只调用，不另写 Swift 实现）。

> 边界：本文件不创建 Apple 工程 / entitlements / container（Codex/用户授权范围）。core 已落在 `suites/anchor/core`（CP-0 Option A）。core 全树零云符号（见 `core-evidence.md` §4）。

---

## 0. 可立即调用的 Rust surface（已实现，Observed）

crate `anchor-core`（`#![no_std]` + `alloc`，零外部依赖）。Codex 的 Swift binding 包裹以下入口（模块路径 `anchor_core::dto` 除非另注）：

### 0.1 Session / 事务（binding round-trip 主面）

```rust
// 打开 fixture vault（被调真值）
dto::open_fixture_vault() -> dto::FixtureSummary
dto::Session::open_fixture() -> Session
Session::summary(&self) -> FixtureSummary           // { vault_id, note_count, snapshot_revision, note_ids }
Session::dispatch(&mut self, EditorIntent, OpStamp) -> TransactionResult
Session::read_segment(&self) -> Vec<u8>             // op-log 的 canonical 字节（segment 字节面）
Session::segment_id(&self) -> sync_port::SegmentId  // 内容寻址
Session::vault(&self) -> &model::Vault
```

`OpStamp { op_id, hlc: Hlc{wall,logical,device}, actor, seq }` —— **时钟与熵由平台（Swift）提供**，core 不取时钟/RNG。这是 D36 边界：Swift 侧生成 op_id（nanoid/ULID）与 HLC，传入 core。

### 0.2 `EditorIntent`（Stage-1 子集，UniFFI-friendly flat enum）

`InsertText{target_id,at,text}`、`ApplyMark{target_id,start,end,kind,expand}`、`SetType{target_id,type_id}`、`SetProp{target_id,key,value}`、`AddTag{target_id,tag}`、`RemoveTag{target_id,tag}`、`Move{target_id,parent,order}`、`SetLife{target_id,life}`。`SplitBlock`/`MergeBackward` 当前返回 `validation_error`（结构化 split/merge dispatch 延后 CP-2）。

`offset` 单位 = **UTF-16 code unit**（D18 对外边界）。`order` 由 `anchor_core::order::key_between` 生成（Swift 不另算）。

### 0.3 `TransactionResult`（structured，不退化 strings）

```
{ changed_ids: [String], validation_error: Option<ValidationError>,
  new_revisions: Map<String,String>,   // node id -> snapshot_revision
  selection_hint: Option<Selection>,   // Text{block_id,start,end} | Block{block_id}
  conflicts: [ConflictRecord], projection_fresh: bool, mirror_fresh: bool }

ValidationError = { code: enum, message: String }
code ∈ invalid_utf16_offset | direct_active_to_deleted | structural_dispatch_deferred
```

`ConflictRecord`（派生读模型，**非**公开 CLI schema——D31 延后二期）：`{ target_id, kind, sub_field_key?, live_op_id?, losing_op_ids[], pinned_op_ids[] }`，`kind ∈ body_overlap|scalar|tag|move_skipped|location_relocated|reorder_blend|life_tie|ancestor_life_vs_descendant_edit|split_merge_structural|journal_merge`。

### 0.4 字节 / blob 传输面（1/4/16/64MB benchmark）

```rust
dto::segment_bytes(&[Op]) -> Vec<u8>     // 一段 op 的 canonical 字节
dto::fixture_blob(size: usize) -> Vec<u8>// 确定性 size 字节 blob（喂 bytes->Data benchmark）
dto::blob_id(&[u8]) -> String            // "blob_" + blake3 hex
sync_port::SegmentId::of_bytes(&[u8])    // "seg_" + blake3 hex
sync_port::BlobId::of_bytes(&[u8])
```

`fixture_blob(1<<20 / 1<<22 / 1<<24 / 1<<26)` 给 Codex 测 1/4/16/64MB `bytes -> Data` transfer time + peak RSS（对照 CP-0 已 Observed 的 UniFFI 64MB≈2.35s/267MB），据此判 **UniFFI primary vs UniFFI DTO + C ABI bytes fast path**（D01 / A2 / B4 的 Stage-1 gate）。

### 0.5 `OpSyncPort`（Codex 在 core 之外实现，仅 id+字节）

```rust
trait sync_port::OpSyncPort {
    type Error;
    fn list_segments(&self) -> Result<Vec<SegmentId>, Self::Error>;
    fn pull_segment(&self, &SegmentId) -> Result<Vec<u8>, Self::Error>;
    fn push_segment(&mut self, &SegmentId, &[u8]) -> Result<(), Self::Error>;
    fn pull_blob(&self, &BlobId) -> Result<Vec<u8>, Self::Error>;
    fn push_blob(&mut self, &BlobId, &[u8]) -> Result<(), Self::Error>;
}
```

iCloud Drive adapter = Codex 在 Swift 侧实现此 trait（`NSFileCoordinator` / `NSMetadataQuery` / `.icloud` placeholder / ubiquity container 全在 adapter，**绝不进 core**）。`associated type Error` 让 adapter 用自有 typed error 而不向 core 泄漏类型。

---

## 1. Planned FFI surface（binding 决策输入）

- **Primary 候选 = UniFFI**：上述 DTO 均为 flat versioned records/enums（无高递归/泛型），适合 UniFFI 生成 Swift。`Vault`/`Node` 是内部物化态，**不**跨 FFI 暴露——FFI 只走 `FixtureSummary` / `EditorIntent` / `TransactionResult` / `Vec<u8>`（bytes）。
- **Fast-path 候选 = C ABI bytes**：`read_segment` / `segment_bytes` / `fixture_blob` 返回 `Vec<u8>`，bulk blob 是否走 UniFFI `Data` 还是 C ABI 显式 fast path 由 §0.4 benchmark 定。
- core 已 `panic = "abort"`（release profile），简化 FFI 边界（无跨 FFI unwind）。

Codex 决定 binding 机制冻结（B4）须以本 surface 的 round-trip + bytes benchmark + Swift 6 strict concurrency 实测为据，最终由用户签署。

---

## 2. 关键真值约定（Codex 必须沿用，否则跨端字节分叉）

- **canonical / hash**：`rev = blake3(canonical_serialize(value))`，canonical = JCS 风格（递归排序 key、固定转义、禁 f64、整数十进制）。diff3 / order-key **只在 Rust core 执行**，Swift 永不另实现（D19/D26）。
- **journal 身份（D08 concretization）**：`note_id = "jnl_" + hex(blake3("journal:" + vault_id + ":" + calendar_date))`。`‖` 的 Stage-1 具体化用冒号分隔（vault_id 是 nanoid 无冒号、date 是 ISO `YYYY-MM-DD` 无冒号，无歧义）。ground truth：`journal_note_id("vault_demo_0001","2026-06-07") = jnl_f99080f823e0815a8e1440955eb896d1c82d4ec371e19b2e0df89ad581f96b89`。
- **UTF-16 offset**：对外 UTF-16 code unit。Codex text surface spike 须用 emoji / ZWJ / combining / CRLF / IME marked-text fixture 验证 Swift `String` ↔ core 换算（D18，组 3）。core 侧 `marks::reclamp` 已实现 expand/non-expand 缝行为 + collapse 丢弃，Swift adapter 只回放 patch、不另算 mark。
- **fixture vault 形状**：`open_fixture_vault()` = 1 journal note + 2 block（`blk_a`="Morning note."、`blk_b`="Evening note."），`snapshot_revision = 3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63`。Codex round-trip 读到此即证 binding 真值一致。

---

## 3. Codex Stage 1 前置与命令骨架（Recommended，Codex 跑）

```fish
set -x DEVELOPER_DIR /Applications/Xcode.app/Contents/Developer
rustup target add aarch64-apple-ios aarch64-apple-ios-sim   # D33 硬前置，本轮未装
cd suites/anchor
cargo build -p anchor-core --release --target aarch64-apple-ios
cargo build -p anchor-core --release --target aarch64-apple-ios-sim
# UniFFI Swift bindgen / 三 slice XCFramework / SwiftPM wrapper —— 见 stage-1-spike-plan.md §2
```

> 注：core 是 `[lib]` 默认 crate-type（rlib）。要给 UniFFI/XCFramework 做 staticlib，Codex 需在 Apple binding 工程侧加 `crate-type = ["staticlib","cdylib"]` 的 wrapper crate（**不改 anchor-core 的 lib 类型**，避免污染 wasm/android rlib gate），或在 anchor-core 加 `[lib] crate-type` 时同时验证多目标 gate 仍过。建议：binding wrapper crate 单独持 staticlib + UniFFI scaffolding，depend on anchor-core。

---

## 4. Scale-gate 交接（B14，分两轴）

- **core 面 op-count 已证**：million-op replay = O(ops)，1.25M ops ≈ 2.6s release（`core-evidence.md` §6）；segment batching budget shape 证 N op 不产 ~N segment（F42，`segment.rs`）。
- **Codex 面 synced-segment-file-count 待证**：1K/10K/50K/100K iCloud Drive 真机 `NSMetadataQuery` 枚举 / live-update 延迟 / placeholder / coordinated read-write / manifest 并发（`NSFileVersion`，默认 per-device immutable cursor）。给出每档 go/compromise/no-go。**no-go 转 CloudKit / 中立 object-store**（B14）。
- core 提供 `segment_bytes` 让 Codex 造任意档位的 segment 文件集；blob-in-package 50MB 用 `fixture_blob(50<<20)`。

---

## 5. Codex 可以开始吗？

**可以。** binding spike（组 2）的全部被调真值已就绪：`open_fixture_vault` / `dispatch(EditorIntent)->TransactionResult` / `read_segment`/`segment_bytes`/`fixture_blob`，DTO 为 UniFFI-friendly flat 形状，structured error 保持 typed，journal/canonical/order/UTF-16 真值约定已固化。唯一 Codex 本机前置 = `rustup target add aarch64-apple-ios{,-sim}`（D33）。text surface（组 3）与 iCloud（组 4）的 core 侧合约（EditorIntent/EditorPatch 语义、OpSyncPort、segment 字节）亦已就绪。
