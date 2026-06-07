# Anchor Stage 1 — Entry Brief（CP-1 启动 briefing）

日期：2026-06-07
状态：**workbench artifact** —— 非公开接口契约。本文件是给下一轮 agent 的 CP-1 / Stage 1 spike 启动 briefing：足以直接启动，无需重做 Phase 0 调研。CP-0 已批准（见 `cp-0-approval.md` §0）。

> **边界声明：** 本文件不创建任何目录 / 工程，不授权 package / workspace / app / lockfile 改动。所有创建动作须先获实现授权（B1 / B2 已批准布局与工程创建，实际落地随用户实现指令）。权威接口契约在实现后归 `anchor-core` 包 README。

---

## 1. Objective

把 CP-0 冻结的契约方向，通过 Stage 1 五组 spike 推进到「确定性 core + Apple binding + 编辑器事务 + iCloud Drive runtime + mirror parity 作为正式验证通过」的 CP-1 状态。CP-1 退出后才进入 CP-2 的 `anchor-core` 地基实现。**通过 CP-1 前不实现持久应用写入**（plan §11 CP-1；stage-1-spike-plan.md §6）。

## 2. Authorized scope

- 在已批准的 Option A `suites/anchor/*` 布局下，**经实现授权后**创建目录 / 工程，执行 `stage-1-spike-plan.md` 的五组 spike。
- core 确定性算法（canonical_serialize、id、order-key、op-log replay、merge、lattice、journal 身份、diff3、OR-Set、mirror parity）落成 `cargo test -p anchor-core` 正式测试。
- Apple 现实验证（binding、TextKit 适配、iCloud Drive runtime）留可重复命令 / Xcode scheme + spike 报告。
- 把任何「必须调整的模型点」回填 `contract-baseline.md` / `key-decisions.md` / `fixture-set.md`（沿用 D01–D38 / F01–F43 编号）。

## 3. Non-goals（仍延后 / 排除，触及即暂停）

持久应用写入（CP-1 前）；CloudKit / CKSyncEngine 实现（二期）；任何 CloudKit record schema 进入 core；独立 Web / android 客户端、iPadOS 专项优化；公开 `ConflictRecord` / `resolve` / `restore_order` / `restore_subtree` CLI schema（二期）；字符级文本 CRDT / 完整收敛 move / order CRDT / 中央 sequencer；跨 block 连续原生文本选择作首期 UI 承诺（spike-only）；client（Swift / TextKit）侧任何 merge / normalization / op-creation / tree-invariant / diff3 / order-key；AI agent / proposed-change 子系统；为适配 glob 添加 placeholder `package.json`。完整禁止清单见 `cp-0-final.md` §5。

## 4. Approved directory / project layout

- **Primary = Option A `suites/anchor/*`：** `core/`（Rust crate `anchor-core`，含内部 module `anchor-editor-core`）、`cli/`（Rust bin）、`apple/`（Xcode workspace，macOS + iOS targets，预留 iPadOS）、`fixtures/`、嵌套 `suites/anchor/Cargo.toml`。Apple tree 内 shared Swift wrapper/package 承载共享代码，macOS（AppKit）/ iOS（UIKit）adapter 分开。
- **Fallback = Option C：** 实现期 Bun glob 容忍度 / Xcode 嵌套成本过高时，Apple 工程移到 glob 外顶层 `anchor-apple/`，core 仍留 `suites/anchor/core` 以保住 `cd suites/anchor; cargo test -p anchor-core` 验证路径。
- **硬约束：** 绝不为适配 glob 在 `suites/*/*` 下添加 placeholder `package.json`（会成为 Bun workspace member 并触发 AGENTS package 义务）。详见 `project-layout-options.md`、`key-decisions.md` D02。

## 5. Claude / core owner work items

平台无关 Rust core 的确定性工作（spike 组 1、5；algorithm 只在 Rust core 执行，跨平台一致 by construction）：

- canonical_serialize 跨运行 / 跨设备 bytes + hash 稳定（JCS 风格、禁 `f64`）。
- nanoid id + fractional-index base-N order-key（绝不浮点）。
- op-log replay 纯 fold（到达顺序无关）；同步 ingestion（per-actor 单调 HWM + `op_id` dedup + 确定性铸造合并 op 收敛）。
- 冲突 merge：move-vs-edit（独立 cell 全保留 + `location_relocated`）、edit-vs-delete（可逆 trashed + 编辑保留）、body diff3 / keep-both + mark re-clamp、props/type_id causality-aware LWW、tags OR-Set add-wins、life 时钟无关 lattice、cycle-reject、journal 内容寻址身份。
- **强制 CI gate：** diff3 + order-key 跨设备（macOS / iOS / `wasm32`）逐字节一致向量集；**core 多目标编译 gate**（`wasm32-unknown-unknown` + `aarch64-linux-android`）；**client 零真理逻辑 grep 红线**。
- op-count scale（50K smoke → 500K / 1M / 5M / 10M+）、segment batching ratio & steady-state budget、四-horizon retention 正确性。
- mirror / search parity：post-commit mirror + freshness、mirror 写失败隔离（op-log 不回滚）、structured search vs ripgrep parity、打开的 body 冲突渲染。
- 为 Codex 的 Apple spike 提供被调 DTO / fixture / `TransactionResult` 真值与 `anchor-editor-core` 合约。

## 6. Codex / Apple verifier work items

Apple / Xcode / Swift / TextKit / iCloud 现实验证（spike 组 2、3、4；验证「机制可行」，被调真值由 Claude / core 提供）：

- **前置：** Apple 命令用 `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` 前缀 + `-derivedDataPath` 避免 DerivedData 落 repo。Stage 1 本机已安装 `aarch64-apple-ios` / `aarch64-apple-ios-sim`；后续机器/CI 仍需显式检查并按需运行 `rustup target add aarch64-apple-ios aarch64-apple-ios-sim`。
- **Binding spike：** Stage 1 证据支持 **UniFFI DTO / ordinary dispatch + C ABI bytes fast path**。已跑项包括 Rust 三 slice 构建、UniFFI generated Swift full round-trip、C ABI/UniFFI XCFramework、SwiftPM wrapper import、synchronous Swift 6 strict-concurrency release smoke、1/4/16/64MB bytes benchmark。开放项是最终 DTO/error vocabulary、UniFFI async `Sendable` surface、product wrapper/CI 复现、产品分发签署。
- **Text surface adapter spike：** 事件 → `EditorIntent`、`EditorPatch` 回放、single-block / block / embedded 选择、undo via `NSUndoManager` semantic inverse intent（suppress direct buffer undo）、IME marked text / accessibility / hit-testing、跨 block 连续选择（spike-only）、UTF-16 offset 换算正确性。
- **iCloud Drive adapter spike：** Stage 1 状态 = **compromise**。已跑项包括 signed iPhone/macOS runtime、ubiquity container、vault package UTType、package-level metadata discovery、`NSFileCoordinator` read/write、package-internal direct enumeration、macOS 10K/50K/100K scale direct enumeration、online convergence、offline `NSFileVersion` conflict materialization、core 云符号审计。开放项是 product conflict-resolution policy、remote placeholder download、signed-out / over-quota、iOS large-scale delivery、steady-state segment budget、local-only 路径判定边界（D21/D21a）、repo-local product app target entitlement。

> Owner 非重叠：spike 组 3 中 Codex 拥有 Apple runtime（NSTextView 事件、patch replay、IME、accessibility），Claude 拥有 `anchor-editor-core` 合约（intent / selection / patch 类型 + 提升降级规则）。所有 core 确定性算法（diff3 / order-key）唯一在 Rust core，Codex 不另写 Swift 实现。

## 7. Required files to read

- `cp-0-final.md`（CP-0 索引 + 冻结结论 + 禁止扩展）、`cp-0-approval.md` §0 / §8（批准摘要 + 勾选）。
- `stage-1-spike-plan.md`（五组 spike 的 owner / commands / expected artifact / evidence / failure condition + §6 CP-1 退出条件）。
- `contract-baseline.md`（责任基线 + boundary matrix）、`key-decisions.md`（D01–D38）、`fixture-set.md`（F01–F43）。
- `apple-verification.md`（Codex 已 Observed / Not run 边界，避免重证已证项、避免把 Not run 当事实）。
- `../2026-06-07-stage-1/apple-binding-report.md`、`textkit-adapter-report.md`、`icloud-drive-report.md`、`core-evidence.md`、`core-spike-report.md`（Stage 1 实测证据）。
- `[plan]` `docs/plans/2026-06-06-anchor-apple-native-note-workbench.md`（§8 架构 / §11 阶段 + CP-0 指针）、`[conflict]` `docs/plans/2026-06-06-anchor-conflict-resolution-model.md`（冲突模型权威定义）。

## 8. Commands to run only after creating approved structure

工程创建前所有命令均为目标态命令骨架（scheme / workspace / header / library 名待工程存在后定）。**仅在已批准布局的目录 / 工程经实现授权创建后执行：**

```fish
# core 确定性 + 多目标编译 gate
cd suites/anchor
cargo test -p anchor-core
cargo clippy -p anchor-core --all-targets
cargo build -p anchor-core --target wasm32-unknown-unknown
cargo build -p anchor-core --target aarch64-linux-android

# Apple 前置 + binding
set -x DEVELOPER_DIR /Applications/Xcode.app/Contents/Developer
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
cargo build -p anchor-core --release --target aarch64-apple-ios
cargo build -p anchor-core --release --target aarch64-apple-ios-sim

# client 零真理逻辑 + core 云符号审计
rg -n "CloudKit|CKRecord|CKAsset|NSFileCoordinator|NSMetadataQuery|ubiquit|iCloud" suites/anchor/core
rg -n "OpSyncPort|push_segment|pull_segment|SegmentId|BlobId" suites/anchor/core
```

完整命令骨架（XCFramework、UniFFI bindgen、Apple target build）见 `stage-1-spike-plan.md` §1–§4 与 `apple-verification.md` §4.2。

## 9. Evidence required for CP-1

- spike 组 1、5 全部 case 经 `cargo test -p anchor-core` 落成正式测试通过，`cargo clippy --all-targets` 干净。
- diff3 + order-key 跨设备一致性向量集（含 `wasm32`）作为强制 CI gate 通过；每个确定性断言在「两种 ingestion 顺序」与「不匹配 per-device watermark」下逐字节相同物化态 + `snapshot_revision`。
- core 多目标编译 gate（`wasm32` + android）通过；client 零真理逻辑 grep 红线通过。
- spike 组 2、3 有可重复命令 / Xcode scheme + 报告，列出 binding round-trip / bytes benchmark 与 single-block / block / embedded / 跨 block 选择的通过 / 失败证据；Stage 1 Apple reports 已覆盖 binding round-trip、bytes benchmark 和 TextKit macOS smoke/iOS compile。
- spike 组 4 保留 iCloud runtime evidence matrix：signed container、package UTType、metadata behavior、file coordination、offline conflict materialization、placeholder/account/scale gates。已跑项与开放项见 `docs/workbench/anchor/2026-06-07-stage-1/icloud-drive-report.md`。
- **iCloud Drive 作首期默认 transport（B14）gated on scale gate：** million-op replay/merge/compaction + steady-state segment budget（N op 不产约 N segment）+ iCloud Drive 真机 compromise-to-go 判定 + product conflict-resolution policy + 四-horizon retention 正确性；no-go 转 CloudKit / 中立 object-store。
- 任何「必须调整的模型点」回填 contract-baseline.md / key-decisions.md / fixture-set.md。

## 10. Pause conditions（出现即停止并让用户决策；plan §13）

- 实时多人协作 / CRDT 存储模型需求；真实（非 fixture）AI agent / proposed-change 需求。
- package / workspace / Apple project 边界需在已批准 Option A/C 之外改变。
- Rust core 无法以可接受成本进入 macOS / iOS；某必需 core 能力无任何 `wasm32` + android 可编译实现且无法自实现（触 World A 跨平台承诺重评）。
- 同步路线需在 iCloud / CloudKit / 纯本地 / 用户自管目录 / 其他 transport 间做产品级选择（含 B14 scale gate no-go）。
- 某 UI 要求无法映射到 core Note / block / op，或要求持久化平台 editor state / 非 dispatch 写入路径。
- 跨 block 文本选择无法在 Apple 原生 text surface 稳定处理 selection / IME / undo / accessibility。
- 导入现有内容需做超出已记录 Markdown 限制的数据丢失选择。
- CLI 契约需暴露阶段0 DTO 草图未覆盖的新公开 schema（含提前暴露二期 conflict/resolve schema）。
- binding surface 出现 final Anchor DTO 不支持 / final generated Swift strict concurrency 失败 / structured error 退化 strings / C ABI bytes fast path 无法保留 / release packaging 或 CI/fresh-machine 不可复现 → 重评含转 C ABI primary（D01）。
- Kleppmann 祖先检查实现引入 move 历史保留（滑向完整收敛 move）；time-travel 范围升级为需保留 move 历史的结构重演。
- shared mutable manifest 或 iCloud file-version policy 无法提供可呈现、可保留、可解决的 conflict behavior（CP-1 前重设 manifest write 方案，不得回退为允许截断 open-conflict op）。
