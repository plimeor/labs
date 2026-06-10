# Anchor — Stage-2 `anchor-core` Ground Floor

任务：把 `anchor-core` 从 spike 推向 Stage-2 ground floor 的纯 Claude 可达部分，并把权威公开契约落到 `anchor-core` README；剩余 ground-floor 项精确记录。
日期：2026-06-10
状态：**workbench evidence（Stage-2 ground floor）—— 非公开接口契约**

> **边界声明（AGENTS 工作台规则，强制）：** 本文件**不授权**任何 workspace 结构改动、生成 lockfile 改动、产品 app / CLI 公开 schema 创建。本轮代码变更限于 `anchor-core` Rust 实现 + 测试 + 该 crate 的 `README.md`（package README 是该 crate 自身的文档，不是 workbench 契约）。`cli` 包未创建（D31 Phase-2 gated）；root workspace `members=["core"]` 未改。权威接口契约现落于 `suites/anchor/core/README.md`。

---

## 1. 结论

**Stage-2 的「权威公开契约」交付项已落地：`suites/anchor/core/README.md` 现为 anchor-core 的 authoritative API / schema / file-format 契约，按 stable / evolving / planned 三档标注。** 在 CP-2 core 不变量之上，本轮把 sync adapter interface 做成 concrete（reference `MemoryOpSyncPort` + 测试）。Stage-2 的若干 ground-floor 项（round-trippable segment codec、Markdown importer、full editor-core surface、intent-rebase、renormalize producer）体量大或被 Phase-2 gate，按「做不到的精确记录」列出。

Stage-2 **不能由纯 Claude agent 形式退出**：driver §4 要求 CP-2 先过，而 CP-2 whole-exit gated on CP-1 whole-exit（Apple runtime + human）。本文件交付 Stage-2 的 core/契约证据。

---

## 2. 本轮落地（ground-floor-complete，纯 Claude）

| 项 | 状态 | 证据 |
|---|---|---|
| **anchor-core README = 权威公开契约** | **done** | `suites/anchor/core/README.md`：design invariants、domain model、D24 op 信封冻结、三 register merge、identity/content-addressing、editor dispatch、DTO/error vocabulary、sync 边界、mirror/search、跨平台保证、build/test、planned 项 |
| **sync adapter interface concrete** | **done / tested** | `sync_port::OpSyncPort` + reference `MemoryOpSyncPort`（纯 byte store，零云类型）：immutable / idempotent re-delivery / content-addressed；`tests/sync_port.rs` 2 测试通过 |
| lib.rs status 更新（spike→CP-2 不变量在场，指向 README） | done | `src/lib.rs` 头注 |
| 全门控保持 green | done | §4 |

折叠了 CP-2 core 全部不变量（单一已校验 dispatch、macro 原子性、D24 冻结、跨目标执行）——见 `23-cp-2-core-readiness.md`。

## 3. Ground-floor 现状映射（implemented vs remaining）

| Stage-2 ground-floor 项 | 状态 | 说明 |
|---|---|---|
| 平台无关 deterministic core（model / op-log / replay / 三 register merge / identity / canonical） | **implemented** | spike 已实现且经 85 测试 + 跨目标执行守住；现以 README 固契约 |
| DTO / schema envelope owner（Rust core） | **implemented / stable** | `dto` + `op`；3 个 ValidationError code 冻结 |
| 单一已校验 dispatch | **implemented / stable** | grep 不变量 + `validate_batch`（见 23） |
| sync adapter interface | **concrete** | trait + reference adapter（本轮） |
| mirror/projection（export `.md`/`.json` + structured search parity） | **implemented** | `mirror`；lossy export only |
| op-segment **codec**（round-trippable serialize↔deserialize） | **planned** | `segment_bytes` 是单向 canonical 编码；无 deserializer（no_std + 零依赖下需自写 JSON parser，体量大）。这是真正的 op-log file format，留待专门一轮 |
| Markdown **importer** | **planned** | 仅有 lossy export；importer（外部 `.md` → ops）是 core 责任但需 Note 模型映射 |
| full `anchor-editor-core` intent surface | **partial** | dispatch 子集为下限；完整意图面（结构/嵌入编辑器/富 inline）remaining |
| 确定性 split/merge **intent-rebase** | **planned** | 安全下限是 surface+pin（no silent loss，见 23 §4.3）；auto-resolve remaining |
| `Renormalize` producer + 陈旧坍缩（F26c） | **planned** | 信封字段已 reserve；无 producer（reserved 变体） |
| 公开 **CLI** schema（`cli` 包） | **gated** | D31 Phase-2；触 workspace 边界 + 公开 schema，需 user approval |

## 4. Observed 证据（command + output）

```sh
cargo test   --manifest-path suites/anchor/Cargo.toml         # 85 passed; 0 failed; 1 ignored
cargo clippy --manifest-path suites/anchor/Cargo.toml --all-targets -- -D warnings   # Finished（clean）
cargo build  --manifest-path suites/anchor/Cargo.toml --target wasm32-unknown-unknown        # Finished
cargo build  --manifest-path suites/anchor/Cargo.toml --target aarch64-linux-android         # Finished
rg "CloudKit|CKRecord|CKAsset|CKContainer|CKSyncEngine|NSFileCoordinator|NSMetadataQuery|ubiquit|iCloud|NSURLIsExcludedFromBackupKey" suites/anchor/core   # 0 matches, exit 1
```
新增测试：`tests/sync_port.rs`（`memory_port_round_trips_immutably_and_idempotently`、`memory_port_blobs_are_content_addressed`）。测试计数 83（CP-2）→ **85**（Stage-2 +2）。

## 5. Scope-fence check

| Fence | 结果 |
|---|---|
| root workspace `members` / lockfile | 未改（仍 `["core"]`） |
| `cli` 公开 schema / 包 | 未创建（D31 gated） |
| 产品 app / Apple project / entitlement / iCloud container | 未创建 |
| `anchor-core` 云/account/file-coordination 类型 | 未加（audit 0 / exit 1；reference adapter 是纯 byte store） |
| 持久应用写入 | 未加 |

## 6. Remaining work / open gates

| Open gate | 状态 | Owner |
|---|---|---|
| op-segment round-trippable codec（op-log file format） | planned | Claude/core（需 no_std 零依赖 parser，专门一轮） |
| Markdown importer + import/export parity proof | planned | Claude/core |
| full editor-core intent surface | partial | Claude/core |
| 确定性 split/merge intent-rebase（auto-resolve） | planned | Claude/core（见 23 item 4） |
| `Renormalize` producer + F26c 坍缩 | planned | Claude/core（reserved 变体） |
| 公开 CLI schema（`cli` 包） | Needs user approval | human（D31 Phase-2，触 workspace 边界） |
| **Stage-2 whole-exit** | gated on CP-2 whole-exit（→ CP-1 whole-exit → Apple runtime + human） | human |

> 权威契约：`suites/anchor/core/README.md`。Cursor / ledger：`21-stage-1-integration-report.md`。CP-1 / CP-2 exit assembly：`22` / `23`。
