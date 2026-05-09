# 规格：Code Wiki

创建日期：2026-04-29
更新日期：2026-05-09
状态：本地 scan-only CLI；下一阶段对齐 Google Code Wiki 3.2、3.3、3.4 的生成契约
来源 idea：`docs/ideas/2026-04-29-code-wiki.md`
参考调研：`/Users/plimeor/Documents/Codex/2026-05-06/google-code-wiki-spec/google-code-wiki-spec.md`

## 目标

`code-wiki` 是一个本地 CLI，把 Git repositories 扫描成 durable Markdown wikis。外部 CLIs/agents 只通过生成的 `AGENTS.md`、`index.json` 和 page files 读取 wiki；本阶段不暴露 runtime-backed query surface。

Wiki 正文不是纯脚本产物。程序扫描只能收集证据、切分模块、生成上下文包和写入 artifacts；每个可读 wiki page 的自然语言分析必须通过 AI/Codex 阅读对应源码证据后生成。没有 AI 分析步骤时，工具最多能产出 inventory，不算完成 Code Wiki 生成。

对齐 Google Code Wiki 时，先只采纳这三类能力：

- 3.2 Wiki 自动生成：从源码生成有自然语言理解价值的结构化 topic pages，并显示 snapshot commit/date。
- 3.3 源码链接与证据回跳：wiki 结论必须能回到生成 snapshot 中的文件、目录、符号或行号。
- 3.4 图示能力：从源码关系生成可读的架构/依赖图，并把图示节点、边和证据绑定。

不采纳 Google public hosted product 的首页、搜索、badge、repo chat、FAQ、opt-out、私有仓库等待名单、web viewer 和 hosted service 行为。这些不是当前 CLI 的公开边界。

## 当前 CLI 范围

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

一个 project 可以是独立仓库，也可以是 monorepo 根目录。Monorepo 不拆成多个 `project` 才能工作；workspace 内的 packages/apps/libs 是同一个 project 的内部 ownership units。

## 扫描流程

Scan 从 `projects.json` 开始。它维护 ignored managed clones，fetch `origin`，把 project ref 解析成 resolved commit，detached checkout 到该 commit，然后把当前 wiki output 写到 `.code-wiki/projects/<project-id>/`。

Skip 条件：commit 和 scan contract inputs 都没变。每次实际扫描会先删除该 project 的旧 generated wiki root，再写入当前 snapshot output。Project ref 变化后，不把 old-ref claims 带到新输出里。

扫描和生成分五层：

1. 收集 Git-tracked candidate source files，并应用工具内置忽略规则和目标 repo 当前 `.gitignore` 解析出的 ignored path 集合。
2. 识别 repository shape，包括 entry points、module/package ownership、package metadata、imports、symbols、route-like files、workspace/package-manager metadata 和 shared config。
3. 为每个 ownership unit 构建 AI evidence bundle。Bundle 包含少量关键文件内容、package metadata、exports/imports、入口路径、route/page/store/hook/service 命名、README/AGENTS 摘要、内部依赖和待回答问题；不能只传文件名列表。
4. 通过 AI/Codex 对 evidence bundle 做源码阅读和模块分析，生成自然语言 wiki page draft。AI 输出必须引用 bundle 内证据，区分 observed facts、inference 和 unknowns。
5. 校验并写入 wiki pages、index、metadata、diagram source 和 diagram metadata。所有 page facts 都绑定到当前 resolved commit；图示只能表达已观测到的路径、依赖、package/workspace metadata 或 import 关系。

## 生成输出

每个 generated wiki root 包含：

```text
AGENTS.md
overview.md
index.md
index.json
metadata.json
log.md
modules/**/*.md
contracts/*.md
diagrams/
  index.md
  *.mmd
  *.json
```

`AGENTS.md` 定义读取顺序：先 `index.json`，再 `overview.md` 和 `index.md`，最后只打开相关 module/contract/diagram pages。它还要要求回答引用 wiki page paths 和 `sourceRefs`；证据不足时说清 missing evidence；code review 时检查真实 diff/source；不要直接编辑 generated wiki files。

Generated Markdown pages 以 frontmatter 开头，记录 stable id、kind、title、authority、source refs、symbols、generated commit、content hash 和 verification time。

`index.json` 要保持 deterministic，并小到足以在打开 page bodies 前先读完。它是 routing index，不是完整知识库。

## 3.2 Wiki 自动生成契约

Wiki 自动生成的目标不是倾倒文件列表，而是产出可路由、可审计、可增量重扫的 topic graph。每个 topic page 必须先帮助读者理解“这个模块是干什么的”，再给继续查证的文件和源码引用。

### AI 生成流程

每个 generated wiki page 必须经过 AI/Codex 分析步骤。脚本负责准备证据，不负责凭规则直接写完整正文。

程序化扫描阶段必须输出每个 page 的 evidence bundle：

- `pageId`、`modulePath`、`projectId`、`commit`。
- 真实源码片段：入口文件、package manifest、公开 export root、route/page/bootstrap/store/hook/service 文件、README/AGENTS 片段，以及少量代表性 domain files。
- 结构化索引：文件树摘要、workspace dependency edges、import/export hints、symbols、scripts、bin/exports/types/files whitelist。
- 生成约束：该 page 必须回答的问题、允许使用的证据、不能推断的内容、需要标记为 unknown 的缺口。

AI/Codex 分析阶段必须：

- 阅读 evidence bundle 中的真实文件内容，而不是只看路径、文件名或 symbol 名。
- 用自然语言写出 `Purpose`、`Responsibilities`、`Entry Flows/Public Surface`、`Collaborators`、`Common Change Points` 和 `Regression Hints`。
- 对每条核心结论挂上 1-5 个最直接的 source refs；source refs 是证据，不是正文主体。
- 明确区分 `Observed`、`Inference`、`Unknown`。当源码证据只能支持弱推断时，必须降低语气或写入 unknown。
- 对大型模块先归纳 domain areas，再分别说明每个 area 的职责和证据。

校验阶段必须：

- 拒绝没有自然语言分析的 page，例如只包含 `Source Shape`、`Key Files`、`Notable Symbols`、`Dependency Hints` 的页面。
- 拒绝未引用源码证据的业务结论。
- 拒绝把文件列表、route 列表、symbol 列表当作 wiki 正文。
- 拒绝 AI 编造的能力、业务流程、运行时行为或团队意图。
- 在 AI 无法生成可信分析时写入 `Unknowns and Follow-up Reading`，而不是用目录名硬凑描述。

允许的实现形态：

- 本地 CLI 调用 Codex/AI 生成每个 page，并把结果写入 durable Markdown。
- CLI 先生成 evidence bundles，再由 Codex agent 分批读取 bundles 和源码生成 pages。
- 大 repo 可以按 workspace unit 分批生成；不要求一次性把整个 repo 放入一个上下文。

不接受的实现形态：

- 只用确定性脚本、正则、路径规则和 package metadata 直接生成完整 wiki 正文。
- 让 AI 只看文件列表和 symbol 列表，不看源码内容。
- 用模板句拼接出“模块职责”，例如 “This module contains files under ...”。
- 把 AI 生成当成不可审计文本；每个结论仍必须回到当前 commit 的源码证据。

每个 snapshot 必须记录：

- `projectId`
- repository source
- configured ref
- resolved commit
- scanned branch
- scan time
- indexed source file count
- generated artifact schema version

最小 topic tree：

- `overview.md`：project/repo 级事实、source shape、major subsystems、monorepo workspace summary，以及对 repo 主要业务/技术分区的自然语言说明。
- `index.md`：human-readable routing index，只帮助选择 page，不重复 page body。
- `modules/**/*.md`：ownership unit pages，记录 module purpose、business/technical responsibility、domain concepts、entry flows、collaborators、key evidence、change points、regression hints。
- `contracts/*.md`：跨模块或公开边界，例如 package metadata、workspace metadata、route-like files、CLI/API/configuration surface。
- `diagrams/index.md`：列出 generated diagrams、适用范围、证据质量和读取提示。

每个 page body 至少包含：

- `Purpose`：用自然语言说明该模块当前负责什么。不能写成 “Generated summary for files under ...” 或目录名复述。
- `Responsibilities`：列出 3-7 条由源码证据支持的职责，例如页面流程、业务动作、SDK/adapter 边界、服务端接口、共享模型、工具职责。
- `Evidence`：每条核心职责都要能回跳到少量关键文件、symbols、imports、package metadata 或 repo 内 README/AGENTS。文件列表只能服务于证据，不是正文主体。
- `Entry Flows` 或 `Public Surface`：说明用户/调用方通常从哪里进入这个模块，例如 page/route/CLI/bin/export/store/hook/service entry。
- `Collaborators`：说明依赖和被依赖的内部 workspace packages、重要外部 runtime/library、以及这些依赖在职责中的作用。
- `Common Change Points` 和 `Regression Hints`：用于 PRD review 和 code review 的初始定位。

文件、symbol、sourceRefs 的展示规则：

- `sourceRefs` 可以放在 frontmatter 和 `Evidence` 段，但正文不能被几十行 source refs 淹没。
- `Key Files` 必须是经过筛选的 5-12 个关键文件，并带一句为什么关键；不能把目录下前 N 个文件直接排序输出。
- `Notable Symbols` 只能列对理解模块职责有帮助的 public/domain symbols；构建 helper、转译 helper、局部变量和低语义名字必须过滤。
- `Entry Files` 只能包含真实入口，例如 package entry、route/page、CLI/bin、公开 export root、runtime bootstrap；不能把所有 `index.tsx` 都当入口。
- 大模块可以拆成 `Domain Areas` 或 `Submodules`，每个 area 用自然语言概括，文件路径作为证据挂在 area 下。

明确禁止的低价值输出：

- 把 `Responsibility` 写成 “files and symbols under <path>”。
- 用 `Source Shape`、`Key Files`、`Notable Symbols`、`Dependency Hints` 拼出整页，而没有自然语言解释。
- 把 IDE/agent/cache/local config directories 当作业务模块，例如 `.vscode`、`.cursor`、`.serena`。
- 把所有含 `pages`、`app`、`routes` 字样的组件/工具文件平铺成 route contract；只有真实 route/page entry 才能进入 route contract。
- 生成 100 行以上的单一文件列表段落。超过上限时必须按 domain area 聚合并解释。

生成内容必须满足：

- 不把 AI 推断写成源码事实。无法从文件、symbols、imports、package metadata 或 module boundaries 观察到的内容，只能标成 `Inference` 或不写。
- 不硬编码 framework-specific capability signals。Framework 识别只能来自 repo 自身配置、依赖、目录、文件和符号。
- 自然语言分析必须由 AI/Codex 基于真实源码证据生成，并标明证据基础；不能为了显得聪明而编造业务结论。
- 不把 old snapshot 的 claim 带到新 snapshot。
- 不保留手工编辑。用户修正路径以后再设计，不能混在 generated output 里。

## 3.3 源码链接与证据回跳契约

`sourceRefs` 是 generated wiki 的信任边界。每个关键结论都必须能回到当前 snapshot 的 source reference。

Source reference 的逻辑结构：

```ts
type SourceReference = {
  projectId: string
  commit: string
  path: string
  startLine?: number
  endLine?: number
  symbolName?: string
  packageId?: string
  externalUrl?: string
}
```

Markdown frontmatter 可以继续用 compact string 表示，但 `index.json` 和 diagram metadata 必须保留足够字段，让 reader 能判断 evidence scope。

引用规则：

- Repo 内路径必须相对 scanned repository root。
- `commit` 必须是 resolved commit，不允许用 moving branch 作为证据身份。
- GitHub remote 可以额外渲染 pinned commit URL，例如 `https://github.com/{owner}/{repo}/blob/{commit}/{path}#L{line}`。
- 非 GitHub remote 仍保留 `projectId + commit + path + line`，不伪造外部链接。
- 文件级证据用 `path`；行级证据用 `path + startLine/endLine`；目录级证据必须明确是 coarse evidence。
- Section 级 page content 应列出本 section 主要 `sourceRefs`，避免整页只有一个宽泛 `**/*`。
- `index.json` 的 page entries 必须暴露 page-level `sourceRefs`，让 external agent 不打开 body 也能判断页面是否相关。

禁止行为：

- 不生成指向 branch head 的源码链接。
- 不引用 ignored files、dependency directories、build output 或 stale generated pages。
- 不让 diagram、overview 或 summary 使用比其证据更强的措辞。

## 3.4 图示契约

图示是 source-derived routing aid，不是设计权威。第一阶段使用 durable Mermaid source；以后可派生 SVG，但 Mermaid source 和 metadata 仍是 source of truth。

输出结构：

```text
diagrams/
  index.md
  workspace-graph.mmd
  workspace-graph.json
  dependency-graph.mmd
  dependency-graph.json
```

每个 diagram metadata：

```ts
type DiagramDocument = {
  id: string
  title: string
  kind: 'workspace' | 'dependency' | 'module' | 'route' | 'sequence'
  commit: string
  mermaidPath: string
  nodes: Array<{
    id: string
    label: string
    kind: 'repo' | 'workspace' | 'package' | 'app' | 'module' | 'file' | 'symbol' | 'external'
    sourceRefs: SourceReference[]
  }>
  edges: Array<{
    from: string
    to: string
    kind: 'declares' | 'depends_on' | 'imports' | 'exports' | 'routes_to' | 'calls' | 'configures'
    sourceRefs: SourceReference[]
  }>
}
```

第一阶段图示优先级：

- `workspace-graph`：monorepo root、apps、packages/libs、shared config、workspace dependency 关系。
- `dependency-graph`：module/package import 和 declared dependency 关系。
- `module` diagram：单个 ownership unit 内部 key files/symbols 的关系，只有证据足够时生成。
- `route` 或 `sequence` diagram：只有 route-like files、call/import direction 和 entrypoint 足够明确时生成；否则不生成，避免编造流程。

图示要求：

- Mermaid node/edge 必须能在 companion JSON 中找到 source refs。
- 图示只表达已观测关系：workspace manifest、package metadata、TypeScript project reference、import/export、route file placement、symbol declaration。
- 图示必须绑定当前 commit。
- 大型 repo/monorepo 中，图示必须有规模控制：优先 workspace/package 级图，避免把所有文件画成一个不可读的大图。
- `diagrams/index.md` 必须说明每张图的 evidence scope、omitted detail 和推荐继续阅读的 module/contract pages。

## Monorepo 支持

Monorepo 是一等场景。Scanner 不能只把 `packages/`、`apps/` 当普通目录列表，也不能把整个仓库压扁成一个 symbol bucket。

Monorepo discovery inputs：

- root `package.json` workspaces
- `pnpm-workspace.yaml`
- `turbo.json`
- `nx.json`
- `lerna.json`
- package-level `package.json`
- package manager lockfile 的 workspace hint
- `tsconfig.json` project references
- root-level shared configs，例如 Biome、ESLint、TypeScript、Vite、Next、Bun、Changesets、release scripts

Ownership units：

- `apps/<name>`：deployable or runnable applications。
- `packages/<name>`：libraries、CLIs、SDKs、shared tooling。
- `libs/<name>` 或 repo-specific workspace directories：按 workspace manifest 识别。
- root configuration：workspace-level contracts，不归入任意 package。

Monorepo wiki contract：

- `overview.md` 只总结 workspace shape 和主要业务/技术分区，不列出所有 package 文件。
- 每个 app/package 有独立 module page，page id 和 path 必须稳定。
- 每个 app/package module page 必须用自然语言描述它的职责。例如 mini app 应说明它覆盖哪些用户流程、哪些 page/domain areas 是核心；shared package 应说明它提供哪些模型、API、hooks、services 或 adapters。
- root shared configs 进入 `modules/root.md` 或 `contracts/workspace.md`。
- package metadata、bin、exports、scripts、dependencies、workspace dependency edges 进入 package/module page 或 workspace contract。
- 跨 package import、workspace dependency 和 project reference 必须作为 dependency hints 或 diagram edges 暴露。
- 当一个 package 发布 npm artifact 时，spec 应把 package boundary、entrypoint、files whitelist、prepack/publish scripts 当成 contract evidence。

Monorepo acceptance examples：

- React、Kubernetes、Flutter 这类大型 repo 不应该只生成一个 root overview 和一个 `src` page。
- `packages/code-wiki` 这类 workspace package 应生成独立 package/module topic，且 root `package.json` 和 package `package.json` 的职责不同。
- `apps/web` 依赖 `packages/ui` 时，dependency graph 应有 app-to-package edge，并引用 app/package manifests 或 imports。
- Root build/test/lint/release config 影响所有 packages 时，必须出现在 workspace contract 或 root module page。

## Scanner 规则

- 默认忽略 managed clones、dependency directories、build output、fixtures 和 test-only directories。
- 默认忽略 IDE/agent/local tool state directories，除非它们是当前 project 显式注册的 workspace unit 或 package。
- 扫描时使用目标 repo 当前 `.gitignore` 解析出的 ignored path 集合；这是路径集合过滤，不承诺完整 Git ignore pattern、negation 或 Git 自身 matcher 语义。每次更新 repo 后重新读取该路径集合。
- Module groups 优先贴近真实 ownership boundaries，例如 `packages/<name>`、`apps/<name>`、`src/<area>` 或 root-level configuration。
- Scanner 不硬编码 framework-specific capability signals。Generated wiki facts 只能来自观测到的 files、symbols、imports、package metadata、module boundaries 和 AI 阅读源码后的 evidence-backed analysis。
- Scanner 必须把 path/package/symbol/import evidence 打包给 AI/Codex 做自然语言 module analysis；只输出文件列表、symbol 列表或依赖列表不满足生成契约。
- Project ref 变化后，不把 old-ref claims 带到新输出里。
- 不写入或读取 `versions.json` 或 `versions/<commit>` snapshots。
- Generated wiki content 是 routing 和 inspection evidence，不是最终 human design judgment。

## 测试与验证

测试覆盖 CLI surface、portable project refs、project ref updates、managed-clone scans、repo `.gitignore` handling、unchanged-scan skips、包含 `AGENTS.md` 的 generated wiki outputs、stale-page cleanup，以及无 version snapshots。

下一阶段补充覆盖：

- 结构化 wiki pages：overview/index/module/contract pages 都带 snapshot commit/date 和 source refs。
- Evidence bundle：每个 page 生成前都有可审计的 evidence bundle，包含真实源码片段和生成约束。
- AI/Codex generation：每个 module page 由 AI/Codex 基于 evidence bundle 和源码内容生成自然语言 `Purpose`、`Responsibilities`、`Entry Flows`、`Collaborators`，且不是文件列表包装。
- Source reference：GitHub remote 生成 pinned commit URL；非 GitHub remote 保留 local source identity；line refs 不指向 moving branch。
- Diagram：生成 Mermaid 和 companion JSON；diagram nodes/edges 都有 source refs；diagram commit 与 page commit 一致。
- Monorepo：root workspace、apps、packages、shared configs、workspace dependency edges 被分开建模。

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
- 每个 module page 都由 AI/Codex 基于真实源码证据生成可读的自然语言职责分析；没有 AI 分析、只有文件列表或 symbol 列表的页面不算成功。
- Wiki 自动生成、source evidence 和 diagrams 对齐 Google Code Wiki 3.2、3.3、3.4，但保持本地 CLI、Markdown artifact 和 monorepo-aware 边界。
