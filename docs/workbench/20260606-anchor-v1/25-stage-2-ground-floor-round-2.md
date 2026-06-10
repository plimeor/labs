# Anchor — Stage-2 Ground Floor Round 2（codec / importer / renormalize / intent-rebase / intent surface）

任务：在用户授权「凡与 Apple / iCloud 无关的工作均可执行」下，关闭 `24` §6 中全部 Claude/core 可执行的 remaining 项。
日期：2026-06-10
状态：**workbench evidence（Stage-2 ground floor round 2）—— 非公开接口契约**

> **边界声明（AGENTS 工作台规则，强制）：** 本轮代码变更限于 `anchor-core` Rust 实现 + 测试 + 该 crate 的 `README.md`。root workspace `members=["core"]` 未改；`cli` 包未创建（D31 Phase-2 gated，触 workspace 边界，不在本次授权范围内自行解释）；Apple/FFI 侧未触碰（`EditorIntent` 仅做 construct-only 的新增变体，不破坏既有 binding 的构造路径）。

---

## 1. 结论

`24` §6 中 5 项 Claude/core remaining 工作全部落地并有测试守住：**op-segment 双向 codec、Markdown importer（含真实语料浸泡）、Renormalize producer + F26c 陈旧坍缩、确定性 split/merge intent-rebase（保守规则）、编辑器意图面扩展**。`anchor-core` README 契约同步更新。测试 85 → **120**（+35），全门控 green。

剩余 open gates 只剩两类：**human/Apple 门**（CP-1/CP-2/Stage-2 whole-exit、Apple runtime、CLI 的 D31 Phase-2 user approval）与**设计保守面**（intent-rebase 的 straddle/链式/纯 mark 并发仍走 surface+pin floor，by design）。

## 2. 本轮落地

| 项 | 内容 | 证据 |
|---|---|---|
| **op-segment codec（round-trippable op-log file format）** | `codec::encode_segment` / `decode_segment`：in-crate no_std 零依赖 canonical JSON parser（仅整数、深度有界、严格无空白）+ 全 24 字段 D24 信封 decoder；**严格 canonical 校验**（decode 后 re-encode 必须 byte-identical，否则 `NonCanonical` —— segment 是 content-addressed，字节形态即身份）；版本不识别拒收 | `src/codec.rs`；`tests/codec.rs` 9 测试（byte-identical round-trip、全 payload kind、port→ingest 收敛、严格性、深度防爆栈） |
| **Markdown importer + parity 证明** | `importer::plan_import`：段落粒度、内容保真、CommonMark fence-aware（``` / ~~~，关闭 fence 须不短于开启 fence —— 4-backtick 嵌套 3-backtick 由真实语料暴露并修复）；`Session::dispatch_import_markdown` 单原子 macro 提交；parity：import → export → re-plan 恒等，二轮循环为字节不动点 | `src/importer.rs`；`tests/import_export.rs` 8 测试 + sanitized fixture `tests/fixtures/complex-note.md` |
| **真实语料浸泡（操作者本机，不入库）** | `tests/import_corpus.rs`（`#[ignore]`，`ANCHOR_IMPORT_CORPUS` 指向本机 markdown 目录）：plan parity / mirror 不动点 / codec round-trip / 零内容丢失四不变量逐文件断言。本轮对个人 vault 副本实跑：**330 files / 10,100 blocks 全过**；语料副本已删除，仓库零个人内容 | `tests/import_corpus.rs` |
| **Renormalize producer + F26c 陈旧坍缩** | `Session::dispatch_renormalize_children`：对 parent 的 living children 重铺 order key，单原子 macro，每 op 携带 `base_snapshot_revision = location_rev(child)`（CAS base）；replay 端 **all-or-nothing CAS**：任一 base 陈旧 ⇒ 整个 rebalance 静默坍缩（maintenance 无用户意图，并发 move 恒胜，部分重铺永不致 sibling 乱序）；无 base 的 legacy 信封保持无条件应用 | `src/dto.rs`、`src/replay.rs`（`resolve_locations` CAS 组处理）、`src/model.rs`（`location_rev`）；`tests/renormalize.rs` 5 测试（含到达序无关性） |
| **确定性 split/merge intent-rebase（23 item 4）** | replay 时（log 永不改写）对与结构 macro 并发的 plain body 编辑做意图重放：split —— hunks 全在左侧 ⇒ 重放到保留块截断体上（行内编辑 diff3 无法合并的情形现在可解）；全在右侧 ⇒ 重定向到 split 新块（偏移 -at）；merge-backward —— 被吸收（trashed）块上的编辑折入吸收块 merged body（偏移 +prev len），原本该编辑会滞留在不可见块上。**保守回退面**：straddle / base 不可恢复 / macro 形状未通过字节验证（pre == left+right、merged == prev+absorbed）/ 链式编辑 / 纯 mark 编辑 / 多候选歧义 / surrogate 边界 ⇒ 一律 surface+pin floor（no silent loss 不变） | `src/replay.rs`（`rebase_structural_edits`）、`src/diff3.rs`（`TextEdit` 内容携带 hunks + `apply_text_edits`）；`tests/intent_rebase.rs` 6 测试（左/右/straddle/merge/marks/链式，全部含到达序无关断言） |
| **结构冲突启发式收紧** | `split_merge_structural` 不再误报因果历史：排除已被 rebase 整合的编辑、macro 因果消费的 pre-image（字节验证关联）、节点内被 base 链取代的历史 op | `src/replay.rs`（`derive_split_merge_structural`） |
| **编辑器意图面扩展** | `EditorIntent` 新增 `DeleteText` / `ReplaceText`（UTF-16 范围替换为一般式，insert/delete 为特例，统一 `replace_body_op`）/ `RemoveMark`（重叠 mark 裁剪为范围外残段）/ `CreateBlock`（parent + 可选 after 锚，单原子 macro，undo 走 RemoveTextSurface）；selection hint / undo selection 同步覆盖；对 binding 为 construct-only 新增 | `src/dto.rs`；`tests/editor_intents.rs` 7 测试（含 surrogate-pair 拒收且 log 不动） |
| **README 契约同步** | codec 新章、importer/mirror 合章、merge 规则补 intent-rebase 与 F26c CAS、intent 面更新、planned 列表只剩真 remaining | `suites/anchor/core/README.md` |

## 3. Observed 证据（command + output）

```sh
cargo test   --manifest-path suites/anchor/Cargo.toml        # 120 passed; 0 failed; 1 ignored（corpus，需本机语料）
cargo clippy --manifest-path suites/anchor/Cargo.toml --all-targets -- -D warnings   # Finished（clean）
cargo build  --manifest-path suites/anchor/Cargo.toml --target wasm32-unknown-unknown   # Finished
cargo build  --manifest-path suites/anchor/Cargo.toml --target aarch64-linux-android    # Finished
rg "CloudKit|CKRecord|CKAsset|CKContainer|CKSyncEngine|NSFileCoordinator|NSMetadataQuery|ubiquit|iCloud|NSURLIsExcludedFromBackupKey" suites/anchor/core   # 0 matches, exit 1
rg -n "self\.log\.(extend|push)" suites/anchor/core/src
#   dto.rs    Session::commit     — 单一已校验 dispatch chokepoint（importer/renormalize/create-block 均经此）
#   ingest.rs IngestState::ingest — sync 摄入（dedup + HWM）
ANCHOR_IMPORT_CORPUS=<本机语料副本> cargo test --test import_corpus -- --ignored --nocapture
#   corpus ok: 330 files, 10100 blocks round-tripped
```

冻结面未漂移：D24 op-shape golden `18582d53…` 与 fixture determinism goldens 原值通过（信封零改动 —— codec/rebase/CAS 全部只是消费既有字段，`macro_size`/`base_snapshot_revision` 为既冻结字段的首批 producer/consumer）。

## 4. Scope-fence check

| Fence | 结果 |
|---|---|
| root workspace `members` / lockfile | 未改（仍 `["core"]`） |
| `cli` 公开 schema / 包 | 未创建（D31 Phase-2 gated，需 user approval） |
| Apple project / FFI / entitlement / iCloud | 未触碰（intent 枚举为 construct-only 新增） |
| `anchor-core` 云/account 类型 | 未加（audit 0 / exit 1） |
| 文档/fixture 个人信息 | 零（真实语料仅本机浸泡，fixture 为重写的结构样例） |

## 5. Remaining work / open gates（round 2 之后）

| Open gate | 状态 | Owner |
|---|---|---|
| intent-rebase 保守面（straddle / 链式 / 纯 mark 并发 ⇒ surface+pin floor） | by design（floor 即安全语义；进一步 auto-resolve 属产品决策） | core + product |
| editor-core 完整意图面（嵌入编辑器、富 inline、多块选区） | partial | Claude/core |
| 公开 CLI schema（`cli` 包） | Needs user approval（D31 Phase-2，触 workspace 边界） | human |
| CP-1 / CP-2 / Stage-2 **whole-exit** | gated（Apple runtime + human sign-off，见 `22`/`23`/`24`） | human |

> 权威契约：`suites/anchor/core/README.md`。上一轮 ground floor：`24`。CP-1/CP-2 exit assembly：`22`/`23`。Cursor / ledger：`21`。
