# 规格：Code Wiki

创建日期：2026-04-29
状态：仅扫描实现
来源 idea：`docs/ideas/2026-04-29-code-wiki.md`

## 目标

`code-wiki` 是一个本地 CLI，把 Git repositories 扫描成 durable Markdown wikis。外部 CLIs/agents 只通过生成的 `AGENTS.md` 读取 wiki；本阶段不暴露 runtime-backed query surface。

## 当前范围

当前只承诺这些 commands：

```bash
code-wiki init
code-wiki project add react --repo https://github.com/facebook/react.git --ref v15.6.2
code-wiki project set react --ref v16.14.0
code-wiki project list
code-wiki scan
code-wiki scan react
```

本阶段不做：`query`、`context`、`review`、`correct`、`evaluate`、PRD/coding-plan generation、runtime config 或 selection、runtime plugins、cross-version QA、version snapshots、hosted services、databases、embedding stores、dashboards、web viewers。Generated pages 也不保留手工编辑。

## 状态文件

Shared workspace state：

```text
.code-wiki/
  .gitignore
  config.json
  projects.json
  projects/<project-id>/
  repos/                 Ignored managed clones
```

`.code-wiki/.gitignore` 由工具写入，忽略 managed clones 和 generated wiki outputs，不要求调用方手动调整外层 repo 的 `.gitignore`。

`config.json` 只存 schema version。Runtime selection 不进入 workspace state。Project entries 要保持可移植，不能写入 developer-local checkout paths。`project add` 的 repo URL 不做 GitHub `/tree/<ref>` 等额外规范化；ref 通过通用 `--ref` 传入，由 Git 解析 branch、tag、commit 或 remote ref。

## 扫描流程

Scan 从 `projects.json` 开始。它维护 ignored managed clones，fetch `origin`，把 project ref 解析成 resolved commit，detached checkout 到该 commit，然后把当前 wiki output 写到 `.code-wiki/projects/<project-id>/`。

Skip 条件：commit 和 scan contract inputs 都没变。每次实际扫描会先删除该 project 的旧 generated wiki root，再写入 `AGENTS.md`、`overview.md`、`index.md`、`index.json`、`metadata.json`、`log.md`、`modules/` 和 `contracts/`。

## Wiki 契约

每个 generated wiki root 包含 `AGENTS.md`、`overview.md`、`index.md`、`index.json`、`metadata.json`、`log.md`、`modules/**/*.md`，以及扫描时观测到的 `contracts/*.md`。

Generated Markdown pages 以 frontmatter 开头，记录 stable id、kind、title、authority、source refs、symbols、generated commit、content hash 和 verification time。

`index.json` 要保持 deterministic，并小到足以在打开 page bodies 前先读完。`AGENTS.md` 定义读取顺序：先 `index.json`，再 `overview.md` 和 `index.md`，最后只打开相关 module/contract pages。它还要要求回答引用 wiki page paths 和 `sourceRefs`；证据不足时说清 missing evidence；code review 时检查真实 diff/source；不要直接编辑 generated wiki files。

## Scanner 规则

- 默认忽略 managed clones、dependency directories、build output、fixtures 和 test-only directories。
- 扫描时使用目标 repo 当前 `.gitignore` 解析出的 ignored path 集合；这是路径集合过滤，不承诺完整 Git ignore pattern、negation 或 Git 自身 matcher 语义。每次更新 repo 后重新读取该路径集合。
- Module groups 优先贴近真实 ownership boundaries，例如 `packages/<name>`、`apps/<name>`、`src/<area>` 或 root-level configuration。
- Scanner 不硬编码 framework-specific capability signals。Generated wiki facts 只能来自观测到的 files、symbols、imports、package metadata 和 module boundaries。
- Project ref 变化后，不把 old-ref claims 带到新输出里。
- 不写入或读取 `versions.json` 或 `versions/<commit>` snapshots。
- Generated wiki content 是 routing 和 inspection evidence，不是最终 human design judgment。

## 测试

测试覆盖 CLI surface、portable project refs、project ref updates、managed-clone scans、repo `.gitignore` handling、unchanged-scan skips、包含 `AGENTS.md` 的 generated wiki outputs、stale-page cleanup，以及无 version snapshots。

验证 commands：

```bash
bun run --filter @plimeor/code-wiki test
bun run --filter @plimeor/code-wiki prepack
bun run check
bun run lint
```

## 成功标准

这个阶段完成时应满足：

- `code-wiki` 只暴露 `init`、`project` 和 `scan` 作为 top-level CLI surfaces。
- Runtime configuration 不出现在 user-visible workspace state 中。
- Ref changes 会重新生成当前 wiki output，且没有 stale current-ref claims。
- Generated wiki roots 包含带 external CLI reading protocol 的 `AGENTS.md`。
- README 和本 spec 都描述 scan-only product boundary。
