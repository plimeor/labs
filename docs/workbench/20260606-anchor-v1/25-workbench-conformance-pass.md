# Anchor — Workbench Spec Conformance Pass（整理）

任务：按 workbench skill 规范整理本工作台（角色归位、cursor 置顶、ledger 终态化 + iteration history、批准入决策表、指针修复）
日期：2026-06-10
状态：**workbench evidence（maintenance iteration）—— 非公开接口契约**

> **边界声明（AGENTS 工作台规则，强制）：** 本文件**不授权**任何 package / workspace / 产品 app / 生成 lockfile / 代码改动。本轮只改 `docs/workbench/20260606-anchor-v1/` 内文档；`suites/**`、root 配置、lockfile 零触碰。

---

## 1. 本轮做了什么（user-requested：按 skill 规范整理）

全目录（25 docs）spec 符合性审计（4 路并行只读审计：ledger 结构、22/23/24 终态、决策表形态、其余 19 docs 扫描），随后修复以下偏差：

| 偏差 | 修复 | 文件 |
|---|---|---|
| cursor 埋在 driver §6 深处且陈旧（85 tests、`22` 记为 future、codec/importer/CLI 记为 open、签字记为 pending） | 新增 §0 CURSOR 置顶（mode / checkpoint / 单一下一动作 / settled-IDs-only / ledger 指针）；§1/§4/§6 更新到终态；§11 删除与 `21` §3 重复的陈旧 axis 快照（one home per fact） | `00` |
| driver 指针腐烂：引用不存在的 `21 §9`/`21 §11` | 全量改指 `21` §5（env）/ `21` §4（stop check）/ `00` §8（a–g 清单 home） | `00` |
| ledger 角色未声明；§1/§3 停留在 Stage-1 时点（77 tests、无 CP-2/Stage-2 axis、签字未反映）；**无逐轮 iteration history** | 状态行声明为 ledger（state block + history）；§1/§3 重写到终态（145 tests、新增 CP-2 dispatch 与 Stage-2 ground floor 两 axis）；§2 标记为 Stage-1 时点快照（终态 command home = `24` §3）；§4 members 行更新；新增 §8 append-only iteration history（consolidation 之前的行以 consolidation 粒度重建，标 Inferred） | `21` |
| 2026-06-10 非 Apple whole-exit 批准只存在于 evidence docs（`22` §5 / `24` §6），决策表无 home | `05` 新增 §I「Post-CP-0 批准记录」+ **D39**（用户原文逐字、日期、覆盖范围、明确不覆盖范围）；`05` 头部重新声明为全工作台决策权威（D01–D39）；D31 Status 加戳（Phase-2 执行已授权落地）；`00`/`21` 改引 D39 | `05` |

## 2. 审计中确认已符合规范（无需修复）

- `01`–`20` 零 amendment markers（`UPDATE:`/`CORRECTION:`/`Revised`/勘误等 grep 全部 0 hits）；plan `01` 已正确冻结为历史并移交权威。
- 全目录无 >~25 行连续命令输出粘贴 → `artifacts/` 暂无需创建。
- `17`–`20` 诚实性标签（Observed/Not run/Blocked）齐备；`05` 内 evidence 与 decision 分节、无同题双活跃行。
- Evidence docs 自上次 consolidation（76→25）以来 ≤8 篇，未触发 consolidation 阈值。

## 3. 已知遗留的不符合项（记录，不修复）

- **CP-0 期批准形态：** `10` §8 以「[x] 批准（日期）+ 决策转述」记录，非用户原文逐字引用。2026-06-07 的原话未被转录，**事后补造引文 = 伪造，禁止**；既有带日期勾选记录维持为 recorded basis。自 D39 起新批准一律逐字引用（`00` §7 已写入该规则）。`Inferred`：此项对既批准决策的效力无影响（B4/B14 等另有 commit 记录与多文档一致互证）。
- **`22`/`23` 内的「后记」段：** 系本轮之前对 append-only evidence docs 的 retro-edit（违例已发生）。本轮不再触碰（再编辑只会加重违例）；其事实已迁移 home 至 D39 / `24`，后续文档一律引 D39。

## 4. Observed 证据（command + output）

```sh
grep -rEn "UPDATE:|CORRECTION:|Revised|勘误|addendum" docs/workbench/20260606-anchor-v1/0[1-9]-*.md docs/workbench/20260606-anchor-v1/1*-*.md
# 0 hits（审计轮）
ls docs/workbench/20260606-anchor-v1/   # 26 个 .md（00–25），无 artifacts/；本轮仅 docs/ 路径变更
```

终态机器门数值（145 tests、0-match audit 含 cli、D24 golden `18582d53…`）为冻结值，home = `24` §3，本轮按规则引用、未重跑。

## 5. Ledger entry

### Ledger entry — 2026-06-10 — iteration 9 — doc 25-workbench-conformance-pass.md

- **Checkpoint / cursor:** CP-1 Apple 半边（不变）
- **Action selected:** workbench spec conformance 整理（user-requested maintenance；非 gate 推进）
- **Owner classification:** Claude（纯文档，repo 内）
- **Scope-fence check:** passed — trips none of 11 §5 (1–10) or 00 §8 (a–g)（零代码/workspace/lockfile 触碰）
- **Evidence (Observed = command + output):** §4 本文件
- **Gates closed this iteration:** none（文档整理，不关闭项目 gate）
- **Gates still open:** 不变 — 全部 Apple 类，见 `21` §7
- **Backfill to 04/05/06:** `05` D31 Status 戳 + 新增 D39（§I）
- **Axis matrix delta:** 无 verdict 变化（`21` §3 仅同步既有事实到终态表述）
- **Gate evaluation:** STOP — 单一下一动作仍为 Apple operator round / human（见 `00` §0）
- **Decision requested (if STOP):** run Codex/Apple verifier per `21` §5/§7，或 human 决定暂停于此
- **New doc:** `docs/workbench/20260606-anchor-v1/25-workbench-conformance-pass.md`
