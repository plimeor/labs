# Anchor — Stage-2 Round 3（editor-core 完整意图面 / CLI D31 Phase-2 / 非 Apple whole-exit 签字）

任务：执行用户 2026-06-10 的追加授权——「editor-core 完整意图面（partial）、CLI 包（D31 Phase-2）、CP-1/CP-2/Stage-2 whole-exit（除 apple 相关内容）」。
日期：2026-06-10
状态：**workbench evidence（Stage-2 round 3）—— 非公开接口契约**

> **边界声明（AGENTS 工作台规则，强制）：** 本轮的 workspace 结构改动**恰好一处且被本次授权显式覆盖**：`suites/anchor/Cargo.toml` `members = ["core"] → ["core", "cli"]`（D31 Phase-2 CLI 包，用户 2026-06-10 批准）。Bun workspace 未触（suites/anchor/** 仍无 package.json，D02）；生成 lockfile 未触；Apple/FFI 侧未触（`EditorIntent` 仅 construct-only 新增变体）。Apple runtime / 付费 ADP / 真实 iCloud 项继续保持 open，不伪造。

---

## 1. 结论

三项授权全部落地：

1. **editor-core 意图面 = 首期承诺全集。** plan §8.1 列出的 intent 清单（insert text、replace range、split、merge backward、exit-container-on-empty、indent/outdent、move、transform、apply mark、insert code block、paste fragment）现已全部实现，外加多块选区编辑（`DeleteBlocks`/`MoveBlocks`）与 F21 选择提升/降级阶梯（core 拥有，纯函数）。
2. **`anchor` CLI（D31 Phase-2）已创建并通过端到端测试**：apiVersion 信封、vault 解析、`--format tsv|json`/`--fields`/`--limit`/`--count`、固定退出码 0–6、读写命令全经 core dispatch、公开 `ConflictRecord` schema + `resolve`/`restore-order`/`restore-subtree`。**D31 stop condition 校验通过**：全部 10 个 ConflictKind 均由 replay 从冻结 D24 信封派生（`resolve` 首次消费 D24 预留字段 `supersedes_rev`，信封零改动）。
3. **CP-1/CP-2/Stage-2 whole-exit 的非 Apple human 签字已由用户 2026-06-10 授权给出**（`22`/`23`/`24` 各自后记）。三个 checkpoint 的剩余 open gate 现在**只剩 Apple runtime 一类**（signed device + ADP + 真实 iCloud + product app 集成）。

测试 120 → **145**（+25：editor_surface 13、resolve 7、CLI e2e 5），全门控 green，D24 golden 未漂移。

## 2. 本轮落地

| 项 | 内容 | 证据 |
|---|---|---|
| **editor-core 完整意图面** | `IndentBlock`（前兄弟成为新 parent）/ `OutdentBlock`（回到祖父、排在原 parent 之后；仅容器 block 内合法）/ `ExitContainerOnEmpty`（空体才出容器）/ `TransformBlock`（type 变换 + block 选区手势）/ `InsertCodeBlock`（F21 嵌入编辑器载体：create+type+language+body 单原子 macro，selection 进入 `Selection::Embedded`）/ `PasteFragment`（粘贴走 importer 规整为多块片段，单原子 macro，光标落最后块尾）/ 多块选区 `DeleteBlocks`（原子整组 trash + undo 恢复）与 `MoveBlocks`（保序整组 reparent + dispatch 侧成环拒绝）。全部为 construct-only 新增，binding 不破坏 | `core/src/dto.rs`；`tests/editor_surface.rs` 13 测试（原子性 prefix-replay、到达序无关、undo 往返） |
| **F21 选择阶梯（core 拥有）** | `editor::escalate`（Cmd+A：partial → full payload → block，block 封顶）与 `editor::demote`（Esc：embedded/text → block → None=workspace focus 归 adapter）；`Selection::Block`/`Embedded` 首次由 core 发射（TransformBlock/多块编辑 → Block；InsertCodeBlock → Embedded） | `core/src/editor.rs`；`tests/editor_surface.rs` 阶梯 2 测试 |
| **body keep-both 解决产线（resolve）** | `Session::dispatch_resolve_body`：以 winner rev 为 `base_sub_rev`、对每个 pinned loser 发 `supersedes_rev`（**D24 预留字段首次被 merge 消费**）；replay 后 chosen 成普通 `Single`，`body_overlap` 记录消失；log 永不改写；N-way 一次 dispatch 清除；字节相同的并发 body 同 rev 去重、永不算冲突 | `core/src/replay.rs`（`resolve_body` frontier：supersedes + 同 rev 去重）、`core/src/dto.rs`；`tests/resolve.rs` 7 测试（2-way/N-way/keep-winner/无冲突拒绝/同体去重/到达序无关） |
| **结构冲突启发式因果收紧** | CLI 真实流程暴露两处误报：(a) base 链回溯到 macro 自身产出 rev 的编辑（如「编辑刚导入的块」）是 macro 的因果下游，非并发——新增传递式 `causally_after_macro` 回溯；(b) 被 resolution op `supersedes_rev` 取代的 rev 现计入 superseded 集合。修复后 import→并发编辑场景只产生一条 `body_overlap`，无 `split_merge_structural` 误报 | `core/src/replay.rs`（`derive_split_merge_structural`）；`tests/resolve.rs` import-downstream 测试 + CLI e2e |
| **`anchor` CLI 包（D31 Phase-2）** | 新 crate `suites/anchor/cli`（bin `anchor`，仅依赖 anchor-core，std host-only）：vault 落盘 `.anchor/operations/<device>/<seq>.seg`（严格 canonical codec 字节，一写不改）+ `config/vault.toml` + 本地 `cache/`（device id，不同步）；命令 init/notes/note/blocks/import/export/move/type/prop/delete/restore-subtree/restore-order/conflicts/resolve/doctor；写路径=加载全部 segment→`open_from_ops`（经 IngestState dedup+HWM 摄入）→dispatch→新 op 单 segment 落盘；HLC frontier 跟随、clock/entropy 全在 CLI（D36）；`conflicts` 有开放冲突时退出码 3 | `cli/src/{main,vault,output}.rs`、`cli/README.md`（公开契约）；`cli/tests/cli.rs` 5 端到端测试（退出码契约、import/export、全局 IO flags、写命令+segment 持久化、跨设备冲突→exit 3→resolve→exit 0） |
| **契约/注释同步** | core README（intent 全集、选择阶梯、resolution、planned 列表只剩真 remaining、跨目标 build 命令限 `-p anchor-core`）；`model.rs` ConflictKind 注释（Phase-2 已公开）；`lib.rs` status（持久化在 cli，core 仍零 I/O）；workspace Cargo.toml 头注 | 各文件 |

## 3. Observed 证据（command + output）

```sh
cargo test   --manifest-path suites/anchor/Cargo.toml   # 145 passed; 0 failed; 2 ignored（corpus、scale_bench，均按设计）
cargo clippy --manifest-path suites/anchor/Cargo.toml --all-targets -- -D warnings   # Finished（clean，含 cli）
cargo build  --manifest-path suites/anchor/Cargo.toml -p anchor-core --target wasm32-unknown-unknown   # Finished
cargo build  --manifest-path suites/anchor/Cargo.toml -p anchor-core --target aarch64-linux-android    # Finished
rg "CloudKit|CKRecord|CKAsset|CKContainer|CKSyncEngine|NSFileCoordinator|NSMetadataQuery|ubiquit|iCloud|NSURLIsExcludedFromBackupKey" suites/anchor/core suites/anchor/cli   # 0 matches, exit 1（audit 范围扩到 cli）
rg -n "self\.log\.(extend|push)" suites/anchor/core/src suites/anchor/cli/src
#   core/src/dto.rs    Session::commit     — 唯一本地 dispatch append（全部新 intent/producer 经此）
#   core/src/ingest.rs IngestState::ingest — sync 摄入（CLI 加载 vault 复用此路径）
#   （cli/src 零 append —— CLI 不拥有 op-log）
cargo test --manifest-path suites/anchor/Cargo.toml -p anchor-core --test op_shape_freeze   # 1 passed —— D24 golden 18582d53… 未漂移
```

冻结面未漂移：`resolve` 只消费既冻结的 `supersedes_rev`；CLI 只是 dispatch shell；信封 24 字段零改动。

## 4. Scope-fence check

| Fence | 结果 |
|---|---|
| Cargo workspace `members` | `["core"] → ["core", "cli"]` —— **本次用户授权显式覆盖（D31 Phase-2）** |
| Bun workspace / package.json / 生成 lockfile | 未触（suites/anchor/** 无 package.json，D02） |
| Apple project / FFI / entitlement / iCloud | 未触（intent 枚举 construct-only 新增；`Selection::Block`/`Embedded` 为既有 binding 变体） |
| core/cli 云/account 类型 | 0（audit 扩到 cli，exit 1） |
| 跨目标保证 | 不变：wasm32/android 属 `anchor-core`（CLI 为 std host bin，build 命令已限 `-p anchor-core`） |
| 文档/fixture 个人信息 | 零 |

## 5. Whole-exit 签字记录与剩余 gate

**用户 2026-06-10 授权原文：「我给你授权以下内容：editor-core 完整意图面(partial)、CLI 包(D31 Phase-2)、CP-1/CP-2/Stage-2 whole-exit（除 apple 相关内容）」。** 据此：

- `22`（CP-1）：human sign-off 的**非 Apple 部分**记为已签（确定性 core、多目标编译红线、binding vocabulary、TextKit mechanism floors、回填、无持久写入）。CP-1 形式 whole-exit 剩余 = **Apple operator round**（remote `.icloud` placeholder、account states、iOS scale delivery、distribution identity、product app 集成）。
- `23`（CP-2）：core 不变量证据此前已齐；op-shape **formal freeze 签字视为已授**（核心契约事实，golden 自 CP-2 起 pin 住；其「授权后续 cloud record schema」的消费端仍属二期 CloudKit、Apple-gated）。CP-2 whole-exit 剩余 = CP-1 的 Apple runtime 链。
- `24`/`25`（Stage-2）：ground floor 全部关闭（本轮收掉最后两项：editor-core 完整面、CLI）。Stage-2 whole-exit 剩余 = CP-2 → CP-1 的同一 Apple 链。

| 剩余 open gate（全部 Apple 类） | Owner |
|---|---|
| Apple operator round：remote placeholder / account states / iOS CloudDocuments 大规模 delivery / iCloud-语境 compaction | Apple verifier（signed device + ADP + 真实 iCloud） |
| Developer ID / App Store distribution identity + 渠道 | Apple account |
| product app 集成（binding/TextKit/undo/VoiceOver/conflict-resolution UX） | Apple product owner |
| Swift/FFI undo-group input 契约 | binding owner（Apple 侧） |

> 权威契约：`suites/anchor/core/README.md`（core）+ `suites/anchor/cli/README.md`（CLI，本轮新增）。上轮：`25`。exit assembly：`22`/`23`。Cursor / ledger：`21`。
