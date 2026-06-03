# 计划：Anchor V1 Vault and Index

创建日期：2026-05-24

## 目标

建立 Anchor 的本地 vault 和打开应用时重建的 SQLite 会话投影。Markdown 文件保存用户核心知识资产，SQLite 只保存从文件和 sidecar 推导出的临时查询投影。

这个模块让应用能够打开 vault、扫描文件、解析基础 metadata、重建会话投影并提供稳定读取基础。

## 范围

包含：

- Vault 创建和打开。
- Markdown 文件发现和路径规范。
- Note id、title、kind、created、updated、aliases、tags 的基础解析。
- Markdown file checksum、body checksum、frontmatter parse diagnostics 和 unsupported syntax summary。
- 打开应用时删除或覆盖旧 SQLite cache，并创建当前版本会话投影。
- 每次打开 vault 时全量重建 projection。
- 基础 read model：
  - note list
  - note path
  - note metadata projection
  - note file revision
  - note body checksum
  - rebuild status

不包含：

- 完整 Markdown 编辑器和 live preview 交互。
- Agent task。
- Graph UI。
- 云同步。
- 自动跨设备冲突解决。
- embedding 或 semantic index。

## Vault 布局

V1 使用简单可迁移布局：

```text
anchor-vault/
  journals/
    2026/
      05/
        2026-05-24.md
  notes/
    anchor-v1.md
  references/
    example-reference.md
  proposals/
    example-proposal.md
  .anchor/
    config/
      vault.toml
      agent-spec.toml
    operations/
      operations.jsonl
    cache/
      index.sqlite
```

可迁移资产：

- `journals/`
- `notes/`
- `references/`
- `proposals/`
- `.anchor/config/`
- `.anchor/operations/`

打开应用时重建的会话资产：

- `.anchor/cache/index.sqlite`

应用打开 vault 时不迁移旧 `.anchor/cache/index.sqlite`，而是删除或覆盖旧 cache，并从 Markdown、config 和 operation records 重建当前会话投影。

## Markdown identity

Anchor 创建的 Markdown 文件默认写入 frontmatter：

```yaml
id: note_...
kind: note
created: 2026-05-24T10:00:00+08:00
updated: 2026-05-24T10:00:00+08:00
aliases: []
tags: []
```

V1 支持的 `kind` 存储值：

- `journal`
- `note`
- `reference`
- `proposal`

用户侧只把 `journal` 和 `note` 视为普通笔记本体；`reference` 和 `proposal` 是 agent 产物，在 agent 模块中有额外状态。

导入没有 `id` 的 Markdown 时，索引层可以生成 transient id 用于只读浏览。第一次由 Operation Core 写入该文件时，再写入稳定 `id`。

## Markdown scan contract

Vault/index 模块只负责读取和投影，不负责改写 Markdown。扫描器必须保留原始 body，并把解析结果作为当前会话投影：

- Frontmatter 与正文分开解析；frontmatter 解析失败时记录 `index_errors`，不覆盖文件。
- title 优先来自 frontmatter 或一级 heading；无法确定时使用文件名 fallback。
- file checksum 基于完整持久化 Markdown 文件，供 Operation Core 做 base revision。
- body checksum 基于正文 Markdown，供 editor dirty check、search cache 和 changed-body detection 使用。
- parser 至少识别 heading、`[[link]]`、Markdown link、tag、checkbox、code fence、table 和 YAML frontmatter 的边界，供后续 editor 与 relations 模块复用。
- code fence、inline code 和 HTML block 的 source span 需要可识别，避免 search / tag / unlinked mention 误判。
- unsupported Markdown 只产生 diagnostics，不触发自动 rewrite。

## SQLite 职责

SQLite 存储当前应用会话的可重建投影：

- `notes`：note id、kind、path、title、created、updated、file_checksum、body_checksum、indexed_at。
- `note_aliases`：note id、alias。
- `note_tags`：note id、tag。
- `note_properties`：note id、property key、normalized value。
- `index_errors`：文件路径、错误类型、错误摘要。

SQLite 不保存索引版本、迁移状态或持久脏状态。当前版本应用拥有当前版本 projection shape；打开 vault 时重新创建 projection。正文搜索不在 vault/index 模块建立正文索引表。V1 搜索由 Rust 直接扫描 vault 内 Markdown 文件；SQLite 只提供 note path、metadata 和 relations 的候选过滤。

Relations 和 graph edge 的完整 projection 由 relations 模块扩展；它们同样只属于当前会话重建结果，不承担迁移职责。

## 索引流程

1. 打开 vault。
2. 删除或覆盖旧 `.anchor/cache/index.sqlite`。
3. 创建当前版本 SQLite projection shape。
4. 读取 vault config。
5. 扫描 Markdown 文件。
6. 解析 frontmatter 和正文。
7. 计算 file checksum 和 body checksum。
8. 更新 `notes` 和 metadata projection。
9. 记录无法解析的文件到 `index_errors`。
10. 标记 rebuild 状态为 complete 或 partial。

解析失败的文件不能阻塞整个 vault：

- 文件仍在 diagnostics 中可见。
- 搜索和 graph 不依赖该文件。
- 用户打开文件时显示 parse error，并保留原文。

## 工作序列

1. 定义 vault path、cache path、config path 和 operation path。
2. 实现 create/open vault。
3. 实现打开 vault 时删除或覆盖旧 SQLite cache。
4. 建立 Markdown fixture matrix：正常 frontmatter、缺失 frontmatter、损坏 frontmatter、code fence、table、wikilink、tag、unsupported syntax。
5. 实现 Markdown scan、frontmatter parser 和 source span boundary detection。
6. 实现 note id / title / timestamps / file checksum / body checksum 的 normalized projection。
7. 实现 open-session projection rebuild。
8. 实现 rebuild status query、parse error query 和 unsupported syntax summary。
9. 为后续 Operation Core 暴露 repository interface。

## 接受标准

- 新 vault 创建后包含约定目录和 `.anchor/config/vault.toml`。
- 打开已有 vault 时，不要求网络或账号。
- 每次打开 vault 时都会重新创建 SQLite projection，不迁移旧 cache。
- 扫描 Markdown 后，note list 能从 SQLite 返回。
- 删除 `.anchor/cache/index.sqlite` 后，再次打开 vault 能恢复 note list 和 metadata projection。
- 单个 Markdown frontmatter 损坏时，不影响其他文件被索引。
- code fence、inline code 和 unsupported Markdown 不会在索引阶段被改写。
- file checksum 能随正文或 metadata 变化而变化；body checksum 只随正文变化。
- SQLite 中没有保存不可从 Markdown、config 或 operation records 重建的核心知识内容。

## 验证方式

实现阶段验证：

- `bun run check`
- `bun run lint`
- Vault smoke：创建 vault、写入样例 Markdown、删除 `.anchor/cache/index.sqlite`、重新打开并重建 projection。
- Fixture scan：正常 frontmatter、损坏 frontmatter、缺失 id、code fence、table、`[[link]]`、`#tag` 和 unsupported syntax 都得到预期 projection 或 diagnostics。
- No-write smoke：只打开和扫描 vault 后，Markdown 文件内容和 mtime 不因 index rebuild 被改写。

## 风险与规避

- 把 SQLite 当成主存储会破坏本地优先边界。规避：每张表都要能说明来源文件或 sidecar 来源。
- 导入旧 Markdown 时强行写入 metadata 会造成意外修改。规避：导入无 `id` 文件先只读索引，首次写入时再补稳定 id。
- parser 把 code fence 或 HTML 当成正文关系来源会污染 links/tags。规避：扫描 contract 必须记录 source span boundary，relations 模块只消费允许语境。
- 文件 watcher 在早期引入会增加并发复杂度。规避：V1 先做打开 vault 时全量重建；watcher 作为独立增强接入。

## 暂停条件

遇到以下情况暂停确认：

- 需要改变 vault 目录结构作为公开迁移承诺。
- 需要把 operation records 放进 SQLite 作为唯一副本。
- 需要为 SQLite cache 提供迁移或跨版本兼容承诺。
- 需要在 V1 引入 semantic index 或 embedding 存储。

## 停止条件

本模块完成时应停在这个状态：

- Vault 可以创建、打开和扫描。
- SQLite projection 在每次打开 vault 时重建。
- Note 基础 metadata projection 可用。
- 复杂关系、写入不变量和 agent 产物由后续模块接管。
