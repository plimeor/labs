# Imprint Design System → React 组件库 实施计划

> 状态：定稿，待执行授权 · 最后更新 2026-06-02
> 落位：**并入 `~/Documents/labs`**（`packages/imprint-*` + `apps/imprint-docs`）

## 锁定决策（执行前提）

| 项 | 决策 |
|---|---|
| 技术目标 | React 组件库 |
| 分发 | 发布 npm，scope `@plimeor`，包名 `@plimeor/imprint-{tokens,react,note-syntax}` |
| **monorepo 工具链** | **Bun workspaces** + `catalog:` 共享版本 + **Biome**(lint/format) + husky/lint-staged + **`bun test`**；版本经 `scripts/bump-version.ts` + `bun publish`。**镜像 `~/Documents/labs` 约定**——不用 pnpm / turbo / Changesets / ESLint / Prettier |
| headless 基座 | **Ark UI**（`@ark-ui/react`，基于 Zag，`data-part`/`data-scope` 驱动） |
| CSS 方案 | plain CSS / CSS Modules，引用既有 CSS 变量，零运行时 |
| token 源 | CSS 变量为单一真值源；**不上** Style Dictionary（推迟到出现第二目标） |
| 测试 | 视觉回归 + a11y + 交互行为；交互/a11y 跑 `bun test`，视觉跑 Playwright（详见验收） |
| 文档 | Storybook 作工作台/测试宿主/autodocs 目录；**不建**独立对外文档网站 |
| local-first 加固 | 自托管三款 OFL 字体 + 用 `lucide-react`，去除 Google Fonts / unpkg CDN |
| 仓库位置 | ✅ **并入 `~/Documents/labs`**：`labs/packages/imprint-{tokens,react,note-syntax}` + `labs/apps/imprint-docs`，复用 labs 全部 infra（已确认 2026-06-02，见文末决策记录） |

**镜像 labs 的具体约定**（来自其 `AGENTS.md` / 根配置）：
- 根 `package.json`：`private: true`、`workspaces: ["apps/*","packages/*"]`、`catalog` 集中共享依赖版本；包内用 `"dep": "catalog:"` 与 `workspace:*`（`bun publish` 自动改写，勿当作问题）。
- Biome 统一 lint/format（含 import 分组、键排序）；TS 相对导入**无扩展名**（`./foo` 不是 `./foo.ts`），具体文件路径保留真实后缀。
- 包 `extends` 根 `tsconfig.json`，本地 override 收窄；类型检查 `bun run check`（`tsc --noEmit`）。
- 可发布包定义 `repository.directory`、`homepage`、`bugs`、`files` 白名单、`publishConfig.access: "public"`。
- `prepack`：发布**生成物**的包构建产物；发布**源码**的包跑入口冒烟检查。
- 避免嵌套三元；用 guard clause / 命名 helper。PR 标题与正文用英文。`docs/plans/` 是历史记录，非接口契约。

---

## Background / problem

`Imprint Design System-3/` 是 claude design 一次性生成的**静态快照**：高质量 token CSS、内容层 CSS、57 个视觉规格卡、品牌 SVG、一份高质量 spec。它**不是活系统**——无可复用组件代码、无机器可读 token 源、无构建/版本/测试/CI、全靠 CDN（与 local-first 定位冲突）。关键事实：每个 specimen 的组件样式（如 `.btn`）在各自内联 `<style>` 里重写，**不存在共享组件层**——组件库目前是 0，需从头建，57 个 specimen 是其**视觉真值参考**。

## Objective

把 Imprint 资产变成**可维护、可发布、可被其它项目消费的设计系统包集**：token 与组件样式单一真值源，React 组件库从 specimen 1:1 落地并发版到 npm，由一个真实项目验证消费链路跑通。

## Scope

- 把资产迁入 `~/Documents/labs`（复用其 workspaces/catalog/biome/tsconfig/husky/CI/bump 脚本），溶解 `Imprint Design System-3/`，迁出后原 `~/Documents/imprint` 置空（无 commit，可后删）
- 三个包：`@plimeor/imprint-tokens`（token CSS + 自托管字体 + 品牌资产 + `tokens.ts`，直发源码）、`@plimeor/imprint-react`（组件 + 组件 CSS，prepack 构建产物）、`@plimeor/imprint-note-syntax`（`ns-` 内容层 CSS，直发源码）
- 自托管字体去 Google Fonts CDN；改用 `lucide-react` 去 unpkg CDN
- 共享组件 CSS 层（终结内联重复）+ Storybook + react 包构建（tsup/Vite）+ 版本脚本 + CI + 三层测试
- **MVP 垂直切片**：tokens + Button，先打通"建→测→发→消费"全链路再横向铺开

## Non-goals

- ❌ Style Dictionary / DTCG JSON token 编译（单 Web 目标下过度工程，推迟）
- ❌ 独立 `@plimeor/imprint-icons` 包（不包装 Lucide，直接 peer dep `lucide-react`）
- ❌ 独立对外文档网站（Astro/Nextra/自建）——高维护低回报，Storybook autodocs 已够
- ❌ pnpm / turbo / Changesets / ESLint / Prettier——一律用 labs 既有工具链
- ❌ 付费视觉回归（Chromatic）——MVP 用本地 Playwright 截图
- ❌ app 专属/领域组件（agent-message、diff-review、note-list）——不属通用组件资产
- ❌ 多框架（Vue/Solid）输出、Figma 文件

## Required context（动手前必读）

| 文件 | 为什么 |
|---|---|
| `~/Documents/labs` 根配置 + `AGENTS.md` | monorepo 约定真值源：`package.json`(workspaces/catalog)、`biome.json`、`tsconfig.json`、`.husky/`、`scripts/bump-version.ts`、`scripts/link-package.ts`、`.github/`。新仓库/新包照抄。 |
| `colors_and_type.css`（全 360 行） | token 真值源；含 `--diff-*`/`--agent-*` 语义层、dark mode、`.ds-*` 排版类、`.focus-ring` 规则。组件只引用语义 token。 |
| `note_syntax.css` | 直接成为 `@plimeor/imprint-note-syntax` 内容，几乎零改动 |
| `preview/*.html`（57） | 组件的视觉真值参考，逐个比对 |
| `README.md` + `SKILL.md` | 组件 DoD、语态、a11y、图标、字体替换策略依据；正名后迁为根/包文档 + 技能 |

**57 个 specimen 分类：**
- **Foundations（16，→ token 故事，非组件）**：color×6、type×5、spacing/radius/elevation/focus、brand-logo
- **通用组件（按优先级，Ark UI 覆盖绝大多数）**：button*、inputs(text/search)、checkbox、radio、switch、segmented(SegmentGroup)、slider、number-input、tags-input、tabs、breadcrumb*、pagination、steps、accordion、tree、menu、tooltip、popover、dialog、toast、alert*、badge*、progress、avatar、states*
  （`*` = 无行为、纯 CSS 手搓：button/breadcrumb/alert/badge/states）
- **note-syntax（14，CSS-only 包，整体迁移）**：`ns-*`

## Proposed approach

**核心理念：复用 = 单一真值源 + 1:1 视觉落地 + 镜像 labs 工具链。** token CSS 已是高质量真值源，不重造；组件 = Ark UI 行为 + Imprint token 皮肤；工程约定不发明，直接套 labs。

**为什么这套选型：**
- **Bun + labs 约定**：复用你已熟悉、已成型的 catalog/biome/tsconfig/husky/CI，零学习成本、跨仓库一致。
- **CSS Modules + 既有 CSS 变量（零运行时）**：直接复用 token CSS，不引第二套真值；契合 local-first/性能；CSS 包可被非 React 项目复用；**一处定义共享组件 CSS，终结 57 个 specimen 的内联重复**。
- **Ark UI**：组件式（省组装）、无样式、`data-part` 驱动（plain CSS 皮肤理想形态）、覆盖面宽到几乎消除组件缺口。代价是 compound-parts API 啰嗦——用 Imprint 友好封装把 parts 包一层。
- **react 包构建、tokens/note-syntax 直发源码**：labs 多数包直发 TS 源码（Bun 原生跑），但 React 组件库要被任意打包器消费 + 处理 CSS Modules，需 `prepack` 出 ESM+d.ts+编译后 CSS（符合 labs"发布生成物则 prepack 构建"）。纯 CSS 的 tokens/note-syntax 则直发源码 + 入口冒烟。
- **token 源保持 CSS 变量**：附手维护 `tokens.ts`（类型化 token 名）给消费者补全；规模小，引编译链是负债。
- **Storybook 而非文档网站**：测试宿主 + autodocs 目录是测试 story 的零成本副产品。

**目标结构**（并入 labs：根级 infra 全部复用，仅新增 `imprint-*` 包与 `imprint-docs` 应用）：
```
~/Documents/labs/
  package.json            # 既有 workspaces/catalog——catalog 增补 react/@ark-ui/react/lucide-react/storybook/playwright/testing-library 等共享版本
  biome.json tsconfig.json .husky/ scripts/bump-version.ts .github/   # 既有，全部复用
  docs/plans/             # 本计划迁入此处
  packages/
    imprint-tokens/       # @plimeor/imprint-tokens — 直发源码：colors_and_type.css, fonts/*.woff2, font-face.css, brand/*.svg, tokens.ts; files 白名单; prepack 冒烟
    imprint-react/        # @plimeor/imprint-react — src/<Component>/{Component.tsx, Component.module.css, *.stories.tsx, *.test.tsx}; prepack 构建 ESM+d.ts+CSS
    imprint-note-syntax/  # @plimeor/imprint-note-syntax — note_syntax.css（直发源码）
    …                     # 既有 anchor-cli / command-kit / git-kit / claudify / …
  apps/
    imprint-docs/         # Storybook（工作台/测试宿主/autodocs）
    …                     # 既有 anchor 等——可作 imprint-react 真实消费方（workspace:* 免发布）
```

## Work sequence（按依赖排序）

**切片 0 — 迁入 labs（无依赖）**
- 在 labs 根 `package.json` 的 `catalog` 增补共享版本：`react`/`react-dom`/`@types/react`、`@ark-ui/react`、`lucide-react`、Storybook 全家桶、`@testing-library/react`、`happy-dom`、`@playwright/test`、`@axe-core/*`、`tsup`(或 vite) 等。
- 在 `labs/packages/` 建 `imprint-{tokens,react,note-syntax}`、`labs/apps/imprint-docs` 骨架；各 `package.json` extends 根 `tsconfig`、按 labs 补 `files`/`publishConfig`/`repository.directory`/`homepage`/`bugs`/`prepack`。
- 资产迁入：`colors_and_type.css`→imprint-tokens、`note_syntax.css`→imprint-note-syntax、`assets/`→imprint-tokens/brand、`preview/*` 暂留作视觉参考、`README/SKILL`→文档+技能、本计划→`labs/docs/plans/`；原 `~/Documents/imprint` 资产迁出后置空（无 commit，可后删）。
- 证据：labs 内 `bun install` 成功；`bun run check` / `bun run lint` 通过；`git status` 干净纳入。

**切片 1 — `@plimeor/imprint-tokens` + 自托管字体（依赖 0）**
- `colors_and_type.css` 入包；下载 Hanken Grotesk / Literata / JetBrains Mono（OFL）为 woff2 入 `fonts/`，写 `font-face.css` 替换 Google Fonts link；导出 `tokens.ts`；`exports` map 暴露 `./tokens.css`、`./fonts.css`、`./brand/*`；按 labs 补 `files`/`publishConfig`/`repository.directory`/`homepage`/`bugs`；`prepack` 跑入口冒烟。
- 正向证据：最小 HTML 引入包内 CSS，字体本地加载、light/dark 生效，**DevTools Network 无外网请求**。
- 契约回归：**既有 CSS 变量名集合迁移前后完全一致**（grep `--[a-z]` 排序去重 diff 为空）。

**切片 2 — MVP 垂直切片打通全链路（依赖 1）⭐ 最关键**
- 用单组件验证"建→测→发→消费"完整管线，再横向铺开。
  1. 建共享组件 CSS 层雏形；按 `buttons-variants.html` 1:1 实现 `Button`（纯 CSS、无 Ark，最干净；全状态 × lucide-react 图标位），CSS 只引 token。
  2. **紧接一个 Ark 驱动组件**（建议 `Switch` 或 `Dialog`）验证"Ark + 皮肤"这条路。
  3. `@plimeor/imprint-react` 配 `prepack` 构建 ESM + d.ts + 编译后 CSS（tsup/Vite），正确 `exports`/`sideEffects`(CSS)；peer deps：react、`@ark-ui/react`、`lucide-react`。
  4. Storybook 起在 `apps/docs`，story 对照 specimen；`bun test` + Testing Library + happy-dom 写交互/a11y 断言。
  5. 用 labs 内一个 app（或临时 `apps/imprint-sandbox`）以 `workspace:*` 引入，验证免发布消费。
  6. 发布演练（不真发）：`bun publish --dry-run`（确认 `files`/`exports`、`catalog:`·`workspace:*` 改写正确）；`bun pm pack` 核对 tarball。
- 正向证据：sandbox 渲染与 specimen 视觉一致；`bun run build` / `bun run check` 绿；tarball 内容正确。
- 回归证据：`bun test` 中 a11y 0 violation、交互（Switch 键盘切换/aria 状态）通过；键盘 focus ring 可见。

**切片 3 — 首次真实发布 0.0.x（依赖 2，🚧 pause）**
- 确认可发布后，`scripts/bump-version.ts` 定版 + `bun publish`（`publishConfig.access: public`）发 tokens + react 的 `0.0.x`；sandbox 改用真实 npm 版本再验证。
- pause：`bun publish` 不可逆，需用户确认（见 Pause conditions）。

**切片 4 — 横向铺开通用组件（依赖 2）**
- 按优先级逐个落地（Ark UI 覆盖绝大多数；纯 CSS 手搓 button/breadcrumb/alert/badge/states）。每组件走 specimen→story→`bun test`(a11y+交互)→视觉比对，满足 **DoD**：全状态 · 键盘可达 · light+dark · 仅用 token · a11y 0 violation · 交互测试覆盖核心键盘/状态行为 · 有 story。
- 证据：每组件 story 与 specimen 0 未批准视觉差；批次 `bun test` + 视觉全绿。

**切片 5 — `@plimeor/imprint-note-syntax` + 工程护城河（依赖 1，可与 4 并行）**
- `note_syntax.css` 成包（直发源码）出文档故事；GitHub Actions CI：`bun install → bun run check → bun run lint → bun test → bun run --filter docs build-storybook → 视觉回归(Playwright)`；版本经 `scripts/bump-version.ts` + `bun publish`。
- 证据：CI 在 PR 全绿；定版发布成功。

**切片 6 — 消费与回流（依赖 3，盘活收尾）**
- 让一个真实项目正式 `import @plimeor/imprint-react`（若并入 labs，可直接用 `apps/anchor` 等以 `workspace:*` 消费，免发布即用）；痛点回流为 issue/改进；删临时 sandbox。
- 证据：真实项目构建通过、按 Imprint 视觉呈现；≥1 条来自真实使用的改进项落库。

## Acceptance, regression evidence & verification

**视觉真值门（核心验收）：**
- 参考源：`preview/<name>.html`（迁移期暂留）。目标面：对应组件 Storybook story / sandbox 渲染。
- 矩阵：每组件全状态（default/hover/active/focus/disabled/selected/error/empty/filled）× **light + dark** × 桌面视口。
- 阈值：**0 未批准视觉差**。可 mask：动态文本/时间戳/示例数据。不可 mask：布局、间距、字体、颜色、边框、圆角、阴影、图标、选中/聚焦态。
- 证据：本地 Playwright 截图对比（specimen vs storybook build 产物），差异需显式批准。

**迁移/契约回归：**
- token CSS 变量名集合迁移前后完全一致（grep 排序 diff 为空）。
- 发布后遵循 semver；`exports` map 与 tarball 内容稳定。

**三层测试（用户已定，对齐 labs `bun test`）：**
- **交互**：`bun test` + `@testing-library/react` + happy-dom——键盘导航、开关态、focus trap（dialog/popover）、`aria-*` 状态切换。
- **a11y**：`bun test` 内 axe-core 断言 0 violation（视觉端可用 `@axe-core/playwright` 在真实浏览器复核）。
- **视觉回归**：Playwright 截图 vs specimen，跑在 `storybook build` 静态产物上。

**通用验收命令：**
- `bun install && bun run build && bun run check && bun run lint` 全绿
- `bun run --filter docs build-storybook` 成功
- `bun publish --dry-run` 产出预期 tarball；切片 6 真实项目 `bun add @plimeor/imprint-react` 后构建通过

## Risks & rabbit holes

- **Ark compound-parts API 啰嗦** → 用 Imprint 友好封装包住 parts，对外暴露简洁 props。
- **视觉 1:1 漂移**（specimen 内联手写 → 共享 CSS 层）→ 视觉门 0 未批准差 + 保留 specimen 对照至该组件验收。
- **React 包消费形态**（直发源码会让消费方打包器报错 + CSS Modules 失效）→ 故 react 包 `prepack` 出构建产物，区别于 labs 直发源码的 CLI 包。
- **bun test 浏览器环境**（DOM/视觉超出 happy-dom 能力）→ DOM 断言走 happy-dom，真实渲染/截图走 Playwright，分层不混。
- **字体许可** → 三款均 OFL，随字体放置原始 OFL 文本。
- **过度工程复发**（Style Dictionary / 更多包 / 自建文档站）→ Non-goals 已冻结，触发需新决策。
- **前端工具链/视觉快照混入偏 CLI 的 labs**（git churn）→ 视觉快照克制使用、必要时单独目录或 Git LFS；Storybook/Playwright 仅 imprint-docs 范围内。
- **Ark 组件名核对** → 实现时对照 ark-ui.com 组件清单确认确切 API。

## Checkpoints（越过风险点前汇报）

- 切片 1 完成：贴"CSS 变量名 diff 为空" + "无外网请求"证据再继续。
- 切片 2 完成：贴 `bun publish --dry-run` tarball 内容 + Button/Ark 组件视觉对照 + a11y/交互绿，再进真实发布。
- 切片 3（发布）：见 pause。

## Stop condition

**完成标准（用户定，2026-06-02）：切片 1–5 全面实现。**
1（tokens，✅ 已完）· 2（imprint-react 基建 + Button/Ark 组件模式跑通）· 3（首次 `bun publish 0.0.x`，**真实 publish 前需用户一次放行**，不可逆）· 4（全部通用组件按 specimen 1:1 落地，DoD 达标）· 5（note-syntax 包 + CI + 视觉回归 + a11y/交互测试）。
分阶段推进，每阶段以"build/test/storybook 绿 + 视觉门 0 未批准差 + dry-run pack 正确"为验收；全部达成即停。

## Pause conditions（需用户授权）

1. **首次 `bun publish`（切片 3）**：不可逆，需确认公开发布 OK（或选私有/GitHub Packages）。在此前只做 `--dry-run`。

## 决策记录：并入 labs（已确认 2026-06-02）

并入 `~/Documents/labs`，包放 `labs/packages/imprint-*`、Storybook 放 `labs/apps/imprint-docs`。
- **理由**：复用 labs 全部既有 infra（catalog/biome/tsconfig/husky/CI/bump 脚本），切片 0 大幅缩水；labs 内 `apps/*` 可 `workspace:*` 免发布消费，直接服务"盘活/真实消费"；`@plimeor/*` scope 一致；imprint 旧仓库无 commit，现在迁移零成本；发布不受仓库位置影响。
- **接受的代价**：前端工具链与视觉快照混入偏 CLI 的 labs（git churn，已在风险中给出克制策略）。
- **翻转条件（未触发）**：若日后要把 Imprint 作为对外公开、独立品牌的开源设计系统，再拆回独立仓库。

## 更新 2026-06-02：note-syntax 并入 tokens

原 `@plimeor/imprint-note-syntax` 已合并进 `@plimeor/imprint-tokens`（新增导出 `./note-syntax.css`）。现为**两个包**：`@plimeor/imprint-tokens`（tokens + 字体 + 品牌 + note-syntax 内容样式）与 `@plimeor/imprint-react`。理由：note-syntax 仅一个依赖 token 的 CSS 文件，单独成包收益不大；在首次发布前合并，无已发布包需废弃。上文中所有"三个包"的描述以此为准更正为两个。
