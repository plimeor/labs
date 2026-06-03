# 计划：Anchor V1 Investor Readiness

创建日期：2026-05-24

## 澄清状态

当前六个模块计划不足以直接支撑投资人交付。它们描述了模块边界和实现顺序，但还缺少从最初 idea 到 V1 可演示产品的端到端 traceability、release candidate gate、demo 证据和失败条件。

本计划把投资人交付定义为一个可本地运行、可重复演示、证据可追踪的 Anchor V1 release candidate。它不改变产品边界：V1 仍然是本地优先、Markdown source-of-truth、agent-safe 的桌面应用。

## 背景 / 问题

原始 idea 承诺的不是单个编辑器能力，而是一套 note-first product loop：

- 本地 Markdown 写作、阅读、编辑。
- Journal、普通 Note、link、tag、property、Object 和 Local Graph。
- 搜索、反链、未链接提及。
- AGENTS 通过受控 scope、mode、diff、approval 和 operation record 参与维护。
- 没有 agent 时，核心笔记能力仍然离线可用。

如果只按模块完成来判断，V1 可能出现“各模块都能跑，但投资人无法理解或无法信任产品是否兑现承诺”的缺口。因此需要独立的 investor readiness gate。

## 目标

交付一个 Anchor V1 release candidate：投资人可以安装或运行桌面应用，按固定 demo script 验证核心笔记 loop、Bear-like Markdown editor、Object / Properties、Search / Graph 和 agent-safe change loop，并能看到每个原始承诺对应的证据、限制和风险状态。

## 范围

包含：

- Golden demo vault。
- Packaged desktop artifact 或等价 release candidate runbook。
- 原始 idea 到 V1 的 traceability matrix。
- Investor demo script。
- Release evidence bundle。
- Offline-first smoke。
- Markdown data-loss / round-trip evidence。
- Agent-safe task evidence。
- Provider unavailable / degraded state evidence。
- Known gaps and limitations。

不包含：

- 商业条款、融资材料、财务预测或法律承诺。
- 云同步、账号系统、多设备冲突解决。
- 完整 Obsidian plugin compatibility。
- 全库复杂大图。
- 通用 agent marketplace。
- 生产级 provider SLA 或外部 provider 法务审计。

## 必要上下文

实施 readiness gate 前先读：

- `docs/ideas/2026-05-23-note-first-agent-safe-knowledge-app.md`
- `docs/plans/2026-05-24-anchor-v1.md`
- 六个 Anchor V1 模块计划。
- 当前 app build、package、test 和 fixture 位置。
- 当前可用 agent connection 类型和认证限制。

## 原始承诺追踪矩阵

| 原始承诺 | V1 证据 | Owner plan | 不可接受缺口 |
| --- | --- | --- | --- |
| 本地 Markdown 是 source of truth | 创建、编辑、重启后 Markdown 恢复；vault 中没有 Tiptap JSON | Vault / Editor / Operation Core | 内容只存在 SQLite、Tiptap JSON 或 provider cache |
| 无 agent 时核心能力离线可用 | 断网后写作、编辑、搜索、链接、标签、属性、Local Graph 仍可用 | Vault / Editor / Relations | 搜索、graph 或保存依赖网络 |
| Journal 和普通 Note 是用户主模型 | `/today` 生成单日 Journal；普通 Note 不强制类型化 | Editor | 新增未授权顶层 note 类型 |
| Object / Properties 是增强层 | Object route 能浏览 type、property 和相关 notes；无 type 的 Note 仍可用 | Editor / Relations / Shell | Object 成为强制数据模型 |
| Link / backlink / unlinked mention | `[[link]]`、alias、backlinks、unresolved link、unlinked mention 可演示 | Relations | 自动改写正文或误扫 code fence |
| Local Graph | 当前 note 一跳 / 两跳 graph，edge 有来源和状态 | Relations | 默认展示无来源全库大图 |
| Agent task surface | Agents route 能从空白 task 开始，绑定 scope、mode 和 output target | Agent-safe Tasks | Agent UI 只是设置页，无法完成任务 |
| Reference 来自明确 sources | Reference 带 source refs、snapshot 或 retrieval metadata | Agent-safe Tasks | Reference 只有 agent 摘要，没有 source |
| Proposal / Proposed Change 需要确认 | accept 前不改 Markdown；accept 后写 Operation record | Operation Core / Agent-safe Tasks | Agent 直接改文件或 Core Graph |
| Agent unavailable 时不破坏本体 | Provider unavailable 状态可见，核心笔记能力仍可用 | Shell / Agent-safe Tasks | provider 失败导致应用主流程不可用 |

## Demo script

Investor demo 必须是一条可重复流程：

1. 启动 packaged desktop artifact，打开 golden demo vault。
2. 进入 `/today`，看到当天 Journal；重复打开不创建第二篇。
3. 创建普通 Note，用单一写作 surface 输入 heading、list、checkbox、code fence、table、`[[link]]`、`#tag` 和 property link。
4. 确认正文没有显式 Save 按钮；等待 auto-save 完成并重启应用，从 Markdown 恢复。
5. 设置 Object Type 和 Properties，在 `/objects` 中浏览 type、properties 和 related notes。
6. 搜索正文、tag、type 和 property，打开搜索结果。
7. 查看当前 note 的 backlinks、unresolved links、unlinked mentions 和一跳 / 两跳 Local Graph。
8. 断网或模拟 provider unavailable，确认写作、auto-save、搜索、关系和 graph 仍可用。
9. 在 `/agents` 从空白 task 开始，绑定 scope 和 mode。
10. 用明确 sources 生成 Reference，确认 source refs 可见。
11. 生成 Proposal 或 Proposed Change，查看 target notes、Markdown diff、metadata impact、Graph impact、mode、provenance 和 approval state。
12. accept Proposed Change，确认 Markdown 文件变化、projection 刷新、operation record 追加。
13. 用过期 base revision 触发 auto-save，确认 conflict，不覆盖文件。

## Work sequence

1. 建立原始承诺 traceability matrix。
   - 触点：idea doc、总计划、六个模块计划、acceptance criteria。
   - 前向证据：每个承诺都有 owner、demo step、verification 和 limitation。
   - 回归证据：非目标不会被误当成 V1 承诺。
2. 建立 golden demo vault。
   - 触点：sample Markdown、Journal、Notes、Object examples、Reference / Proposal samples、operation records。
   - 前向证据：demo vault 覆盖 editor、search、graph、object 和 agent-safe flows。
   - 回归证据：删除 SQLite cache 后可以从 Markdown/config/operations 重建。
3. 建立 packaged artifact 或 release candidate runbook。
   - 触点：Tauri build、app launch、fixture vault path、diagnostics route。
   - 前向证据：非开发者可以启动 app 并打开 demo vault。
   - 回归证据：dev server 不作为唯一可演示路径。
4. 建立 investor demo script。
   - 触点：script 文档、screenshots 或 screen recording、expected states。
   - 前向证据：按步骤能从空 vault / demo vault 走完核心产品 loop。
   - 回归证据：demo 不需要手动改 Markdown、SQLite 或 operation records 才能继续。
5. 建立 automated evidence floor。
   - 触点：fixture tests、E2E smoke、Tauri smoke、round-trip tests。
   - 前向证据：关键路径有命令或 artifact 证明。
   - 回归证据：核心 note loop、source-of-truth 和 Operation Core boundary 有覆盖。
6. 建立 provider / agent fallback evidence。
   - 触点：internal development connection、provider unavailable state、one real or clearly labeled demo connection。
   - 前向证据：至少一个 agent connection 能完成 Reference 和 Proposed Change flow。
   - 回归证据：provider unavailable 不影响 offline-first note loop。
7. 汇总 release evidence bundle。
   - 触点：test output、manual smoke notes、screenshots、known gaps、pause decisions。
   - 前向证据：投资人交付前能看到 pass/fail 状态。
   - 回归证据：没有把未验证能力写成已完成。

## 接受、回归证据和验证

接受结果：

- Packaged desktop artifact 或 release candidate runbook 可用。
- Golden demo vault 能重建 projection，并能展示 Journal、Note、Object、Search、Graph 和 Agent task。
- Demo script 能从启动应用走到 accepted Proposed Change 和 operation record。
- Offline-first smoke 通过：断网后核心笔记能力仍可用。
- Markdown data-loss gate 通过：支持语法 round-trip 无未批准 diff；unsupported syntax 不被静默改写。
- Agent-safe gate 通过：Reference 有 source refs；Proposed Change accept 前不改 Markdown；accept 后走 Operation Core。
- Evidence bundle 能把每个原始承诺映射到 pass、partial、deferred 或 paused。

最低验证：

- `bun run check`
- `bun run lint`
- Tauri packaged app smoke 或 release candidate runbook smoke。
- Markdown fixture round-trip。
- Vault rebuild smoke。
- Search / Relations / Local Graph smoke。
- Agent-safe task smoke。
- Offline-first smoke。
- Conflict and operation record smoke。

## 风险与规避

- 模块完成不等于产品可交付。规避：investor readiness gate 必须按 demo script 验收，而不是按模块清单验收。
- Provider 不稳定会导致 demo 失败。规避：至少保留 internal development connection；如果不是生产 provider，demo 和材料必须明确标注。
- Demo vault 可能掩盖空 vault onboarding 问题。规避：demo script 同时包含打开 golden vault 和创建新 Note / Journal。
- 手工 smoke 容易过度乐观。规避：每个高风险承诺至少有一个自动检查、fixture、screenshot、recording 或明确 manual rubric。
- 原始 idea 的某些能力可能超出 V1。规避：traceability matrix 必须标记 deferred / paused，并在交付前由用户确认。

## 检查点

- Traceability matrix 完成前，不把 V1 计划称为 investor-ready。
- Packaged artifact 或 runbook smoke 完成前，不安排投资人 demo。
- Offline-first smoke 完成前，不声称本体离线可用。
- Agent-safe task smoke 完成前，不声称 AGENTS 已兑现原始承诺。
- Evidence bundle 完成前，不把模块完成当成交付完成。

## 暂停条件

遇到以下情况暂停确认：

- 投资人要求 cloud sync、账号、多设备、marketplace 或生产 provider SLA。
- Tiptap 无法满足 single-surface auto-save 与 round-trip gate，需要替换 editor engine。
- 没有任何 agent connection 能稳定完成 Reference / Proposed Change flow。
- 需要把 demo-only internal connection 包装成生产能力。
- 原始 idea 中某项能力无法在 V1 时间内完成，需要降级或移出 V1。

## 停止条件

本计划完成时应停在这个状态：

- 原始 idea 的 V1 承诺都有 traceability。
- Release candidate 可运行、可演示、可验证。
- Evidence bundle 区分已通过、部分通过、延期和暂停项。
- 未通过 readiness gate 的内容不会被写成 V1 已完成。
