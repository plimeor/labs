# Anchor — Stage-2 Ground Floor（closed；三轮合并终态）

任务：把 `anchor-core` 从 spike 推向 Stage-2 ground floor 并全部关闭。共三轮（均 2026-06-10）：**round 1** 权威公开契约 + sync adapter concrete；**round 2**（用户授权「凡与 Apple/iCloud 无关均可执行」）codec / importer / renormalize / intent-rebase / 意图面扩展；**round 3**（用户授权「editor-core 完整意图面、CLI 包（D31 Phase-2）、CP-1/CP-2/Stage-2 whole-exit（除 apple 相关内容）」）editor-core 全集 + `anchor` CLI + resolve 产线 + 非 Apple whole-exit 签字。本文件是三轮报告的合并终态（原 `25`/`26` 已并入此处）。
日期：2026-06-10
状态：**workbench evidence（Stage-2 ground floor，closed）—— 非公开接口契约**

> **边界声明（AGENTS 工作台规则，强制）：** 全程唯一一处 workspace 结构改动且被 round-3 授权显式覆盖：`suites/anchor/Cargo.toml` `members = ["core"] → ["core", "cli"]`（D31 Phase-2）。Bun workspace 未触（suites/anchor/** 无 package.json，D02）；root lockfile 未触（`suites/anchor/Cargo.lock` 随 member 增加同步更新属授权范围）；Apple/FFI 侧未触（`EditorIntent`/`Selection` 仅 construct-only 既有变体使用）。Apple runtime / 付费 ADP / 真实 iCloud 项保持 open，不伪造。

---

## 1. 结论

**Stage-2 ground floor 全部关闭。** 权威公开契约 = `suites/anchor/core/README.md`（core，stable/evolving/planned 三档）+ `suites/anchor/cli/README.md`（CLI，round 3 新增）。测试 85 → 120 → **145**，全门控 green，D24 golden `18582d53…` 三轮未漂移（全部新机制只消费既冻结字段）。

Stage-2 **不能由纯 Claude agent 形式退出**（driver §4 链到 CP-1 whole-exit 的 Apple runtime）；但 whole-exit 的**非 Apple human 签字已由用户 2026-06-10 给出**（§6），剩余 open gate 只剩 Apple 一类。

## 2. Ground-floor 项总表（全部 closed）

| Stage-2 ground-floor 项 | 终态 | 证据 |
|---|---|---|
| 平台无关 deterministic core（model / op-log / replay / 三 register merge / identity / canonical） | implemented（spike 起；README 固契约） | `suites/anchor/core` + README |
| DTO / schema envelope owner；单一已校验 dispatch | implemented / stable（3 个 ValidationError code 冻结；chokegrep 恰 2 个 appender） | `23` §2 |
| sync adapter interface | concrete（`OpSyncPort` + reference `MemoryOpSyncPort`） | `tests/sync_port.rs` |
| mirror/projection（`.md`/`.json` export + structured search parity） | implemented（lossy export only） | `src/mirror.rs` |
| **op-segment codec**（round-trippable op-log file format） | done（round 2） | `codec::{encode,decode}_segment`：in-crate no_std 零依赖 canonical JSON parser（仅整数、深度有界）+ 全 24 字段 D24 decoder；**严格 canonical**（decode 后 re-encode 必须 byte-identical，否则 `NonCanonical`——segment 内容寻址，字节即身份）；版本不识别拒收。`tests/codec.rs` 9 测试 |
| **Markdown importer + parity 证明** | done（round 2） | `importer::plan_import`（段落粒度、内容保真、CommonMark fence-aware——关闭 fence 须不短于开启 fence，4-backtick 嵌套 3-backtick 由真实语料暴露并修复）+ `dispatch_import_markdown` 单原子 macro；parity：import → export → re-plan 恒等、二轮循环字节不动点。`tests/import_export.rs` 8 测试 + 脱敏 fixture |
| **真实语料浸泡**（操作者本机，不入库） | done（round 2） | `tests/import_corpus.rs`（`#[ignore]`，`ANCHOR_IMPORT_CORPUS` 指向本机 markdown 目录；plan parity / mirror 不动点 / codec round-trip / 零内容丢失逐文件断言）。个人 vault 副本实跑 **330 files / 10,100 blocks 全过**；副本已删，仓库零个人内容 |
| **`Renormalize` producer + F26c 陈旧坍缩** | done（round 2） | `dispatch_renormalize_children`：living children 重铺 order key，单原子 macro，每 op 携带 `base_snapshot_revision = location_rev(child)`；replay 端 **all-or-nothing CAS**：任一 base 陈旧 ⇒ 整 macro 静默坍缩（并发 move 恒胜 maintenance，部分重铺永不乱序）；无 base legacy 信封无条件应用。`tests/renormalize.rs` 5 测试 |
| **确定性 split/merge intent-rebase** | done（round 2，保守规则） | replay 时（log 永不改写）对与结构 macro 并发的 plain 编辑做意图重放：hunks 全在 split 左/右侧 ⇒ 重放到对应侧（右侧重定向到 split 新块，偏移 −at）；merge-backward 被吸收块上的编辑折入吸收块（偏移 +prev len）。macro 形状字节验证（pre==left+right、merged==prev+absorbed）；straddle / base 不可恢复 / 链式 / 纯 mark / 多候选歧义 / surrogate 边界 ⇒ surface+pin floor（no silent loss 不变）。`tests/intent_rebase.rs` 6 测试（含到达序无关） |
| **full editor-core intent surface** | done（round 2 + 3 = plan §8.1 全集） | round 2：+`DeleteText`/`ReplaceText`（UTF-16 范围替换一般式）/`RemoveMark`（重叠裁剪）/`CreateBlock`。round 3：+`IndentBlock`（前兄弟成新 parent）/`OutdentBlock`（回祖父、排原 parent 后；仅容器 block 内）/`ExitContainerOnEmpty`（空体才出容器）/`TransformBlock`/`InsertCodeBlock`（F21 嵌入编辑器载体：create+type+language+body 单原子 macro，selection 进 `Embedded`）/`PasteFragment`（粘贴走 importer，单原子多块片段，光标落最后块尾）/多块选区 `DeleteBlocks`（原子整组 trash + undo 恢复）与 `MoveBlocks`（保序 reparent + dispatch 侧成环拒绝）。全部 construct-only，binding 不破坏。`tests/editor_intents.rs` 7 + `tests/editor_surface.rs` 13 测试 |
| **F21 选择阶梯（core 拥有）** | done（round 3） | `editor::escalate`（Cmd+A：partial → full payload → block，block 封顶）/ `editor::demote`（Esc：embedded/text → block → None=workspace focus 归 adapter）；`Selection::Block`/`Embedded` 首次由 core 发射 |
| **body keep-both resolution 产线** | done（round 3） | `Session::dispatch_resolve_body`：以 winner rev 为 `base_sub_rev`、对每个 pinned loser 发 `supersedes_rev`（**D24 预留字段首次被 merge 消费**，信封零改动）；replay 后 chosen 成 `Single`、`body_overlap` 记录消失；log 永不改写；N-way 一次 dispatch 清除；字节相同并发 body 同 rev 去重、永不算冲突。`tests/resolve.rs` 7 测试 |
| **结构冲突启发式因果收紧** | done（round 2 + 3） | round 2：排除 rebased / macro 因果消费 pre-image / 节点内 base 链取代的历史 op。round 3（CLI 真实流程暴露）：(a) base 链回溯到 macro 自身产出 rev 的编辑（如编辑刚导入的块）是因果下游，传递式 `causally_after_macro` 回溯排除；(b) 被 `supersedes_rev` 取代的 rev 计入 superseded。import→并发编辑只产生一条 `body_overlap`，无 `split_merge_structural` 误报 |
| **公开 CLI schema（`cli` 包，D31 Phase-2）** | done（round 3，user-approved 2026-06-10） | `suites/anchor/cli`（bin `anchor`，仅依赖 anchor-core，std host-only）：vault 落盘 `.anchor/operations/<device>/<seq>.seg`（严格 codec 字节，一写命令=一 segment）+ `config/vault.toml` + 本地 `cache/`（device id 不同步）；apiVersion-1 信封、`--format tsv|json`/`--fields`/`--limit`/`--count`、退出码 0–6；命令 init/notes/note/blocks/import/export/move/type/prop/delete/restore-subtree/restore-order/conflicts/resolve/doctor；写路径 = 全 segment 加载（经 `IngestState` dedup+HWM）→ dispatch → 新 op 单 segment 落盘；HLC frontier 跟随、clock/entropy 全在 CLI（D36）；`conflicts` 有开放冲突退出码 3。**D31 stop condition 验证通过**：全部 10 个 ConflictKind 由 replay 从冻结 D24 信封派生。契约落 `cli/README.md`；`cli/tests/cli.rs` 5 端到端测试（退出码契约、import/export、全局 IO flags、写命令持久化、跨设备冲突→exit 3→resolve→exit 0） |

## 3. Observed 证据（终态 command + output）

```sh
cargo test   --manifest-path suites/anchor/Cargo.toml   # 145 passed; 0 failed; 2 ignored（corpus、scale_bench，均按设计）
cargo clippy --manifest-path suites/anchor/Cargo.toml --all-targets -- -D warnings   # Finished（clean，含 cli）
cargo build  --manifest-path suites/anchor/Cargo.toml -p anchor-core --target wasm32-unknown-unknown   # Finished
cargo build  --manifest-path suites/anchor/Cargo.toml -p anchor-core --target aarch64-linux-android    # Finished（跨目标保证属 core；CLI 为 std host bin）
rg "CloudKit|CKRecord|CKAsset|CKContainer|CKSyncEngine|NSFileCoordinator|NSMetadataQuery|ubiquit|iCloud|NSURLIsExcludedFromBackupKey" suites/anchor/core suites/anchor/cli   # 0 matches, exit 1
rg -n "self\.log\.(extend|push)" suites/anchor/core/src suites/anchor/cli/src
#   core/src/dto.rs    Session::commit     — 唯一本地 dispatch append（全部 intent/producer 经此）
#   core/src/ingest.rs IngestState::ingest — sync 摄入（CLI 加载 vault 复用此路径）
#   （cli/src 零 append —— CLI 不拥有 op-log）
cargo test --manifest-path suites/anchor/Cargo.toml -p anchor-core --test op_shape_freeze   # 1 passed —— D24 golden 18582d53… 未漂移
ANCHOR_IMPORT_CORPUS=<本机语料目录> cargo test --manifest-path suites/anchor/Cargo.toml --test import_corpus -- --ignored --nocapture
#   corpus ok: 330 files, 10100 blocks round-tripped（round 2 实跑记录）
```

## 4. Scope-fence check（终态）

| Fence | 结果 |
|---|---|
| Cargo workspace `members` | `["core"] → ["core", "cli"]` —— round-3 用户授权显式覆盖（D31 Phase-2） |
| Bun workspace / package.json / root lockfile | 未触（suites/anchor/** 无 package.json，D02） |
| Apple project / FFI / entitlement / iCloud container | 未触（intent/selection 为 construct-only 既有面） |
| core/cli 云/account/file-coordination 类型 | 0（audit 范围含 cli，exit 1） |
| 持久应用写入 | core 仍零 I/O；持久化由 `cli` 按契约承担（segment 经严格 codec，一写不改） |
| 文档/fixture 个人信息 | 零（真实语料仅本机浸泡，fixture 为重写结构样例） |

## 5. 设计保守面（by design，非缺口）

intent-rebase 的 straddle / 链式 / 纯 mark 并发仍走 surface+pin floor——floor 即安全语义，进一步 auto-resolve 属产品决策。core README planned 列表同口径：rebase-beyond-conservative、富 inline 一等结构、compaction 执行。

## 6. Whole-exit 签字记录与剩余 gate

**用户授权原文（2026-06-10）：** round 2「请继续完成推进进度，只要和 apple, icloud 无关的，我都授权你执行」；round 3「我给你授权以下内容：editor-core 完整意图面(partial)、CLI 包(D31 Phase-2)、CP-1/CP-2/Stage-2 whole-exit（除 apple 相关内容）」。据此：

- `22`（CP-1）：human sign-off 的**非 Apple 部分已签**（详见 `22` §5）。CP-1 形式 whole-exit 剩余 = Apple operator round。
- `23`（CP-2）：op-shape **formal freeze 签字视为已授**（golden 自 CP-2 起 pin 住；其「授权后续 cloud record schema」的消费端仍属二期 CloudKit、Apple-gated）。CP-2 whole-exit 剩余 = CP-1 的 Apple runtime 链。
- Stage-2（本文件）：ground floor 全关；whole-exit 剩余 = CP-2 → CP-1 的同一 Apple 链。

| 剩余 open gate（全部 Apple 类） | Owner |
|---|---|
| Apple operator round：remote `.icloud` placeholder / account states / iOS CloudDocuments 大规模 delivery / iCloud-语境 compaction | Apple verifier（signed device + ADP + 真实 iCloud） |
| Developer ID / App Store distribution identity + 渠道 | Apple account |
| product app 集成（binding/TextKit/undo/VoiceOver/conflict-resolution UX） | Apple product owner |
| Swift/FFI undo-group input 契约 | binding owner（Apple 侧） |

> 权威契约：`suites/anchor/core/README.md` + `suites/anchor/cli/README.md`。CP-1/CP-2 exit assembly：`22`/`23`。Cursor / ledger：`21`。本文件合并了原 round-2（`25-stage-2-ground-floor-round-2.md`）与 round-3（`26-stage-2-round-3-cli-editor-exit.md`）报告，二者已删除。
