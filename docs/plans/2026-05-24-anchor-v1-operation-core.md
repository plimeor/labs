# 计划：Anchor V1 Operation Core

创建日期：2026-05-24

## 目标

`Notes Operation Core` 是 Anchor 的本地语义操作层。UI、CLI、ACP adapter、内置 provider 和测试工具都应通过它读写笔记，而不是直接操作 Markdown 或 SQLite session projection。

V1 先把文件写入、metadata 更新、diff preview、approval apply、并发保护和 operation record 集中到一个 Rust 模块。

## 范围

包含：

- Read operations：
  - list notes
  - read note
  - search notes
  - read backlinks
  - read graph neighborhood
  - read object type projection
- Write operations：
  - create journal
  - create note
  - update note body
  - append note body
  - update frontmatter metadata
  - create reference
  - create proposal
  - create proposed change
  - apply proposed change
  - reject proposed change
- Safety：
  - base revision / checksum check
  - atomic file write
  - current-session projection refresh or local rescan after write
  - operation record append
  - conflict error
- Preview：
  - diff by target note
  - metadata impact
  - graph impact summary
- Markdown boundary：
  - body Markdown write contract
  - frontmatter metadata patch contract
  - source-view fallback preservation

不包含：

- Full provider runtime。
- 外部 agent protocol 细节。
- 云端事务。
- 多设备 merge。
- 任意 shell execution。

## 统一入口

V1 的所有业务入口都映射到 Operation Core：

```text
Solid UI
  -> Tauri command
    -> Notes Operation Core
      -> Vault files
      -> SQLite session projection
      -> Operation records
```

后续 CLI、ACP adapter 和内置 provider 复用同一路径：

```text
CLI / ACP adapter / Built-in provider
  -> Notes Operation Core
```

外部入口不能直接写 Markdown 文件，也不能直接改 SQLite session projection。

## 版本和冲突

每个 mutating operation 必须携带 base revision：

- base file checksum 或等价 file revision。
- target note id。

写入时如果当前 checksum 与 base checksum 不一致，Operation Core 返回 conflict：

- 不覆盖文件。
- 不刷新当前会话 projection。
- 不追加 applied operation record。
- 返回当前 revision 和冲突目标。

UI 可以让用户重新载入、合并或重新生成 proposed change。

## Markdown write contract

Operation Core 是 Markdown 持久化的唯一写入口：

- `update_note_body` 接收 Markdown body，不接收 Tiptap JSON、HTML fragment 或 ProseMirror patch。
- `append_note_body` 接收 Markdown append block，并由 Operation Core 决定追加位置和换行规则。
- `update_frontmatter_metadata` 接收结构化 metadata patch，不接收 UI 拼好的 YAML 片段。
- body write 和 metadata patch 可以组合成一个 operation，但 diff preview 必须分开展示 body diff、metadata impact 和 graph impact。
- unsupported Markdown 的保存由 editor adapter 提供 diagnostics；Operation Core 不尝试把 unsupported syntax 转成别的格式。
- 写入成功后返回新的 file revision、body checksum 和 refreshed projection status。

## 写入流程

普通写入：

1. 读取当前 note。
2. 校验 base revision。
3. 校验 metadata 和 note model 不变量。
4. 生成下一版 Markdown 文件内容。
5. 生成 body diff、metadata impact 和 graph impact summary。
6. 写临时文件。
7. atomic rename 到目标路径。
8. 刷新当前会话中该 note 的 projection，或触发局部重扫。
9. 追加 operation record。
10. 返回新 revision。

Proposed Change 写入：

1. 保存 proposed change record。
2. 展示 target notes、diff、metadata impact 和 graph impact。
3. 用户 accept、edit 或 reject。
4. accept 时重新校验 base revision。
5. 应用 patch 或整段替换。
6. 刷新当前会话 projection，或触发相关 note 的局部重扫。
7. 追加 applied operation record。

## Operation record

Operation records 是可迁移资产，写入 `.anchor/operations/operations.jsonl`。

每条记录至少包含：

- operation id。
- timestamp。
- actor type：user、agent、system。
- actor id。
- mode：manual、explore、ask、execute。
- operation type。
- target note ids。
- base revisions。
- resulting revisions。
- provenance。
- approval state。
- graph impact summary。

Operation record 不保存 provider secret 或完整 token。

## Error model

Operation Core 使用稳定错误类型：

- `vault_not_open`
- `note_not_found`
- `invalid_metadata`
- `parse_error`
- `conflict`
- `unsafe_path`
- `index_unavailable`
- `graph_policy_rejected`
- `permission_required`
- `provider_unavailable`
- `internal_error`

UI 文案可以基于错误类型呈现；日志保留更详细的 debug context。

## 不变量

- 当天 Journal 只能有一篇。
- 创建普通 Note 时按用户本地时间关联到对应 Journal。
- `Reference` 必须有 source refs。
- `Proposal` 默认不进入 Core Graph。
- Agent 产生的 mutating operation 默认进入 proposed change，除非 mode 和 policy 明确允许自动执行。
- Graph edge 的 Core / Agents 归属由 relation policy 决定，不由调用方自由写入。

## 工作序列

1. 定义 Operation Core service interface 和 DTO。
2. 接入 vault repository 和 index repository。
3. 实现 read operations。
4. 实现 create journal / create note。
5. 定义 Markdown body write、append 和 metadata patch contract。
6. 实现 update body / append / metadata update。
7. 实现 base revision conflict detection。
8. 实现 body diff、metadata impact 和 graph impact preview。
9. 实现 proposed change record、diff preview 和 apply。
10. 实现 operation record append。
11. 将 Tauri commands 收敛到 Operation Core。
12. 为 agent-safe tasks 暴露 capability registry。

## 接受标准

- UI 不直接写 Markdown 文件。
- 创建 Journal 能保证同一天只产生一个 Journal。
- Editor 保存只向 Operation Core 提交 Markdown body、metadata patch 和 base revision。
- Operation Core 不接受 Tiptap JSON 或前端拼接的 YAML 片段作为持久化输入。
- 更新 note body 时，过期 base revision 返回 conflict。
- body-only edit 不丢 frontmatter；metadata-only edit 不改写正文。
- Agent 产生的 proposed change 在 accept 前不改变 Markdown。
- Accept proposed change 后，文件、索引和 operation record 同步更新。
- Operation record 可从 vault 文件系统读取，不依赖 SQLite 唯一副本。

## 验证方式

实现阶段验证：

- `bun run check`
- `bun run lint`
- Operation smoke：创建 Journal、创建 Note、更新 body、更新 metadata、append body、读取新 revision。
- Conflict smoke：对同一 note 用过期 base revision 写入，确认文件、projection 和 operation record 都没有 applied 状态变更。
- Markdown boundary smoke：editor/Tauri command 不能提交 Tiptap JSON；metadata patch 由 Operation Core 序列化为 frontmatter。
- Proposed change smoke：accept 前 Markdown 文件无变化，accept 后 body diff、metadata impact、graph impact 和 operation record 一致。

## 风险与规避

- SQLite 是当前会话 projection，不参与持久事务。规避：Operation Core 只把 Markdown、sidecar 和 operation records 作为 durable write set；写后 projection 刷新失败时，当前会话可局部重扫或提示重开 vault 重建。
- Operation Core 过早变成大而全 API。规避：V1 只实现 UI 和 agent-safe task 必需的语义操作。
- 直接暴露 path-based 写入会破坏 note identity。规避：公开 mutating operation 使用 note id，内部解析 path。
- UI adapter 试图绕过 Operation Core 直接保存 editor state 会破坏 source-of-truth。规避：Tauri command 只暴露 Operation Core mutation，Rust 层拒绝非 Markdown body input。

## 暂停条件

遇到以下情况暂停确认：

- 需要支持多 vault 同时写入。
- 需要跨设备 merge 或云事务。
- 需要允许外部 agent 直接提供任意 filesystem patch。

## 停止条件

本模块完成时应停在这个状态：

- 所有业务写入都经过 Operation Core。
- 写入具备 base revision 检查、operation record 和当前会话 projection 刷新。
- Agent-safe task 可以复用 proposed change 和 approval apply。
