# 计划：Anchor V1 Agent-safe Tasks

创建日期：2026-05-24

## 目标

建立 Anchor 的 agent-safe task surface。Agent 是笔记系统里的任务执行层，不是单独的聊天产品；它只能通过 `Notes Operation Core` 请求读取、生成产物和申请写入。

V1 的重点是安全操作模型：scope、mode、timeline、diff preview、approval surface、operation record 和 agent 产物分层。

## 范围

包含：

- Agent Spec route。
- Agent Connection registry。
- Agent feature flags。
- Task creation。
- Context bar：
  - target note
  - date range
  - tag
  - object type
  - current folder
  - attachments
  - explicit sources
- Mode selector：
  - `explore`
  - `ask`
  - `execute`
- Timeline：
  - user message
  - agent message
  - plan
  - tool call
  - permission request
  - result
- Output model：
  - `Draft`
  - `Reference`
  - `Proposal`
  - `Proposed Change`
- Markdown output boundary：
  - read selected Markdown fields
  - generate Markdown draft/proposal body
  - propose Markdown diff instead of direct file write
- Approval surface：
  - target notes
  - diff
  - metadata impact
  - Graph impact
  - accept / edit / reject
- Agent Spec lightweight editing：
  - Agent Command create / edit / disable
  - Automation definition create / edit / disable

不包含：

- 通用多 agent 编排。
- Agent marketplace。
- 任意 provider 的全局自动执行权限。
- 外部 agent 直接读写 Markdown。
- 复杂 review queue。
- 云端 task execution。
- 自动后台调度器；V1 可以保存 Automation definition，但实际定时运行需要单独授权。

## Agent Connection

`Agent Connection` 是统一抽象，描述：

- connection id。
- display name。
- connection type。
- auth state。
- capabilities。
- model / runtime limits。
- available tools。
- health state。
- default mode。

Provider 差异只能影响连接设置、能力、认证、上下文长度、速度和不可用状态，不能影响写入边界。

V1 connection 实施顺序：

1. Internal development connection
   - 用于跑通 timeline、tool call、Draft、Proposal 和 Proposed Change。
   - 不作为长期产品卖点。
2. ACP adapter checkpoint
   - 验证外部 agent 能否通过统一 capability 和 permission request 接入。
   - ACP adapter 不拥有笔记语义，只把请求映射到 Operation Core。
3. Built-in provider checkpoint
   - 验证桌面端 subscription auth、token refresh、logout 和 provider-managed model filtering 的可行性。
   - 如果认证或平台限制不稳定，V1 保留 disabled / unavailable 状态，不绕过安全边界。

## Modes

`explore`：

- 只读探索。
- 允许 read-only operation。
- 可以生成 Draft、plan 或 Proposed Change。
- 不能直接写入 Markdown、metadata 或 Core Graph。

`ask`：

- 默认模式。
- 读操作直接运行。
- 文件、metadata、Graph、外部 mutation 和非只读操作需要确认。

`execute`：

- 只用于用户明确授权的窄 scope。
- 可以按 policy 自动应用允许的 operation。
- 仍然记录 operation record 和 diff。

## Agent outputs

`Draft`：

- 临时输出。
- 可以保存在 task session。
- 默认不进入 Core Graph。

`Reference`：

- 基于明确 sources 整理出的可追溯笔记。
- 必须记录 source refs、snapshot 或 retrieval metadata。
- 可进入 Core Graph，但关系要能追溯来源。

`Proposal`：

- agent 基于对话、近期笔记或行为生成的候选判断。
- 用户确认前不进入 Core Graph。
- 接受后可以转为普通 Note，或追加到已有 Note。

`Proposed Change`：

- 对已有 Note、metadata 或 Graph 的候选修改。
- 必须带 target notes、base revisions、diff、Graph impact、provenance、mode 和 approval state。

## Agent Spec

Agent Spec route 覆盖：

- Agent feature flags。
- Connections list。
- Connection health。
- Agent global prompt preview。
- Skills inheritance preview。
- Agent Commands list / create / edit / disable。
- Automations list / create / edit / disable。
- Draft / Reference / Proposal / Proposed Change list。
- Operation records filtered by agent。

V1 可以只读展示 Skills inheritance，不在产品内编辑 `~/.agents/skills`。

## Source intake

`Reference` 和代码解释类任务必须绑定明确 sources：

- 当前 note 或选中的 notes。
- 用户粘贴的文本 source。
- 用户选择的本地文件或目录 snapshot。
- 当前 task attachment。
- 搜索结果中用户明确选中的 notes。

V1 不允许 agent 任意遍历文件系统或执行 shell。代码目录解释以用户选择的目录 snapshot 或文件列表作为 source；如果需要运行命令、读取 repo 外路径或访问网络，进入 permission request。

## Capability mapping

Agent tools 不直接暴露文件系统，而是映射到 Operation Core capabilities：

- `search_notes`
- `read_note`
- `read_graph_neighborhood`
- `create_reference`
- `create_proposal`
- `create_proposed_change`
- `apply_proposed_change`

`apply_proposed_change` 在 `ask` 模式下需要 approval；在 `execute` 模式下也必须符合 scope 和 policy。

`read_note` 对 agent 是字段化读取能力：

- 默认返回 id、title、kind、type、metadata summary 和 requested snippet。
- 只有 task scope 或用户命令明确需要时，才返回完整 `body_markdown`。
- 不返回 Tiptap JSON、SQLite 内部 row 或 provider 私有缓存。

`search_notes` 对 agent 是有界读取能力：

- 调用必须带 scope 或使用当前 task context 推导出的 scope。
- 调用必须带 `limit`；需要总数时使用 `count`，不能把整库正文作为默认结果返回。
- 调用必须声明返回字段，例如 id、title、snippet、metadata 或 body。
- 长时间扫描必须可取消，并以 timeline event 展示运行状态。
- 无界全库正文扫描需要用户在 task scope 或 Agent Command 中显式授权。

Agent 生成内容的持久化边界：

- `Draft` 可以是 Markdown body，但默认只属于 task session。
- `Reference` 和 `Proposal` 保存为 Markdown 文件时必须带 provenance metadata。
- `Proposed Change` 必须表达为 target note、base revision、Markdown diff、metadata patch 和 graph impact，不允许 agent 直接提交 Tiptap state 或任意 filesystem patch。

## 工作序列

1. 定义 Agent Connection、Task、Timeline Event 和 Output DTO。
2. 建立 Agent Spec route 和 feature flags。
3. 实现 internal development connection。
4. 实现 task creation、context bar 和 mode selector。
5. 实现 timeline rendering。
6. 将 read-only tools 映射到 Operation Core。
7. 实现 `read_note` 字段选择和 `search_notes` 有界读取。
8. 实现 explicit source intake 和 source refs projection。
9. 实现 Draft、Reference 和 Proposal 创建。
10. 实现 Markdown diff based Proposed Change preview。
11. 接入 approval surface 和 Operation Core apply。
12. 实现 Agent Command 和 Automation definition 的轻量 CRUD。
13. 做 ACP adapter feasibility checkpoint。
14. 做 built-in provider auth feasibility checkpoint。

## 接受标准

- 用户能从 Agents route 创建 task。
- Task 必须声明 scope 或保持 scope none 状态。
- Agent read-only tool 通过 Operation Core 读取笔记。
- Agent `read_note` 默认不返回整篇 Markdown body，除非 scope 或 command 明确要求。
- Agent `search_notes` 不能默认无界扫描全库正文，且必须支持 scope、limit、field selection 和 cancellation。
- `Reference` 和代码解释类任务必须展示 explicit sources；没有 sources 时不能保存为可信 Reference。
- `explore` 模式不能直接写 Markdown。
- `ask` 模式下 mutating operation 进入 approval surface。
- `Proposed Change` 以 Markdown diff、metadata patch 和 graph impact 展示，不接受任意 filesystem patch。
- `Proposed Change` accept 后通过 Operation Core 写入并记录 operation record。
- `Reference` 必须带 source refs。
- `Proposal` 默认不进入 Core Graph。
- 用户能创建、编辑和禁用 Agent Command 与 Automation definition；V1 不承诺后台自动调度执行。
- Provider unavailable 时 UI 展示不可用状态，不改变安全策略。

## 验证方式

实现阶段验证：

- `bun run check`
- `bun run lint`
- Agent task smoke：创建 task、设置 scope、切换 `explore` / `ask` / `execute`、查看 timeline event。
- Capability smoke：`read_note` 和 `search_notes` 通过 Operation Core，支持字段选择、scope、limit 和 cancellation。
- Source smoke：Reference 和代码目录解释任务都显示 source refs；无 source 的 Reference 保存被阻止或降级为 Draft / Proposal。
- Approval smoke：`ask` 模式下 mutating operation 进入 approval surface；accept 前 Markdown 文件无变化。
- Agent Spec smoke：创建、编辑、禁用 Agent Command 和 Automation definition，确认不会触发后台执行。
- Markdown boundary smoke：`Proposed Change` 只包含 Markdown diff、metadata patch、graph impact 和 base revision，不包含 Tiptap JSON 或任意 filesystem patch。
- Provider unavailable smoke：connection unavailable 时任务 UI 降级，不放宽写入策略。

## 风险与规避

- 先做 provider 集成会掩盖产品边界。规避：先实现 task surface 和 Operation Core capability mapping。
- `execute` 模式可能扩大风险。规避：V1 只允许窄 scope，并保留 operation record。
- Agent 默认拿到整篇 Markdown 会扩大读取面。规避：`read_note` 和 `search_notes` 都要求字段选择、scope 和 limit。
- Source refs 如果不严格会让 Reference 变成普通摘要。规避：无 explicit sources 的结果只能是 Draft 或 Proposal，不能保存为可信 Reference。
- Automation definition 容易被误解为自动后台执行。规避：V1 保存 definition，不默认调度；后台执行单独授权。
- ACP 和 subscription auth 有平台风险。规避：把 connector 作为 checkpoint，不让认证实现决定核心任务模型。

## 暂停条件

遇到以下情况暂停确认：

- 需要保存 provider token 到 Markdown 或 vault。
- ACP adapter 需要绕过 Operation Core 才能完成写入。
- Built-in provider auth 不能在 Tauri desktop 内稳定实现。
- 需要支持任意 shell command execution。
- 需要全局 execute 权限。
- 需要 agent 默认读取整库正文。
- 需要 agent 直接写 Tiptap JSON、SQLite projection 或 filesystem patch。
- 需要自动后台调度 Automation。

## 停止条件

本模块完成时应停在这个状态：

- Agent task surface 可以创建、运行和展示 timeline。
- Agent 读取和写入请求都通过 Operation Core。
- Draft、Reference、Proposal 和 Proposed Change 的边界明确。
- Provider 能力不足时，产品降级为 unavailable 或 checkpoint state，而不是放宽写入边界。
