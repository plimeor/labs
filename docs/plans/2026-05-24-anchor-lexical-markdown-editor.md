# 计划：Anchor Lexical Markdown Editor

创建日期：2026-05-24

## Clarification Status

本计划描述 Anchor 内部 Lexical Markdown editor 的目标状态和实施路径。Markdown 语法组合能力归属 `apps/anchor/src/editor/markdown`，应用层 editor adapter 归属 `apps/anchor/src/editor/index.tsx` 并导出 `Editor` 组件，`App.tsx` 通过该入口接入 editor。

保守假设：

- Anchor 使用 SolidJS；Lexical 通过 core editor 与 Solid lifecycle 集成。
- Markdown 文件是正文 source of truth。
- `Editor` 的上层 contract 维持在 `body`、`baseRevision`、`noteId`、`onAutosave`、`onDirtyChange`、`onOpenWikilink`。
- Lexical editor state 只属于当前编辑会话。
- editor 依赖变化限于 `apps/anchor/package.json` 和 `bun.lock`。
- 工作区已有 Anchor 改动时，实施前读取相关 diff，并保留用户已有工作。

## Background / Problem

Anchor 的 editor 需要同时承担 Markdown 写作体验、Markdown import/export、custom syntax、autosave、conflict、token interaction 和保存安全。把这些能力直接堆在组件里，会让新增语法时必须同时理解 editor lifecycle、Markdown transformer、runtime hook、UI 状态和 Operation Core 交互。

内部 `apps/anchor/src/editor/markdown` 提供一个更合适的边界：语法、transformer、node、parse/serialize、preservation report 和 headless fixtures 归入同一处；产品层 editor adapter 只处理应用状态、autosave、交互状态和上层回调。

## Objective

交付 Anchor 内部 Lexical Markdown editor：`apps/anchor/src/editor/markdown` 负责 Markdown syntax composition、parse/serialize、custom syntax 和 headless fixtures；`apps/anchor/src/editor/index.tsx` 导出 `Editor` 组件，使用 Lexical 承载 Bear-like single-surface Markdown 编辑，并提供 autosave、dirty/conflict、wikilink 打开和 unsupported syntax gate。

## Scope

包含：

- `apps/anchor/src/editor/markdown` 内部目录。
- 内部 `MarkdownSyntaxModule`、syntax factory、`createMarkdownKit(modules)` 或等价组合器。
- Anchor syntax module collection，例如 `createAnchorMarkdownKit()`。
- Lexical parse / serialize wrapper，基于 `@lexical/markdown` 的 `$convertFromMarkdownString` 和 `$convertToMarkdownString`。
- Lexical live Markdown shortcuts，基于 `registerMarkdownShortcuts`。
- 内部 syntax factories：
  - heading
  - quote
  - bold / italic / strikethrough / inline code
  - Markdown link
  - unordered list / ordered list / checklist
  - code block
  - wikilink
  - tag token
  - MDX directive 的 inline / block 语法框架
- `apps/anchor/src/editor/index.tsx` 的 `Editor` component implementation。
- editor behavior：
  - Markdown body load。
  - Markdown body serialize。
  - debounced autosave。
  - dirty state。
  - conflict state。
  - paste handling。
  - slash command menu。
  - checkbox toggle。
  - wikilink open callback。
  - Markdown link safe open。
  - unsupported syntax detection / save gate。
- editor dependency update：
  - Lexical runtime dependencies。
  - editor runtime dependency cleanup。
- headless fixture、browser smoke 和 Tauri smoke 验证计划。

## Non-goals

范围外：

- Public `@plimeor/markdown-kit` package。
- npm publish。
- 对外稳定的 `MarkdownSyntaxModule` API。
- `defaultMarkdownSyntaxModules` preset。
- 全局 `replace` / `extend` override API。
- Anchor vault、Operation Core、search、graph 或 agent task 架构改造。
- Lexical JSON persistence。
- 绕过 `Notes Operation Core` 的 Markdown 写入路径。
- 完整 CommonMark、MDX、Obsidian 或 GitHub Flavored Markdown 覆盖。
- 所有未来自定义语法的一次性交付。

## Required Context

实施前先读：

- `AGENTS.md`
- `docs/plans/2026-05-24-anchor-v1.md`
- `docs/plans/2026-05-24-anchor-v1-note-model-and-editor.md`
- `docs/plans/2026-05-24-anchor-v1-operation-core.md`
- `apps/anchor/package.json`
- `apps/anchor/src/App.tsx`
- `apps/anchor/src/editor/index.tsx`
- `apps/anchor/src/domain/markdown.ts`
- `apps/anchor/src/backend/local-operation-core.ts`
- `apps/anchor/src/styles.css`
- 当前 `git diff` 中涉及 `apps/anchor` 的用户修改。
- Lexical 官方 `@lexical/markdown` 文档。
- Lexical 官方 `@lexical/headless` 文档。
- Lexical editor instance 与 `contenteditable` root 的绑定方式。

## Planning Iteration

本轮是 local planning + design review，未委派子代理。

设计结论：

- `apps/anchor/src/editor/markdown` 是内部边界，可以快速调整 syntax factory、MDX directive 表示和 fixture。
- `Editor` 是应用层 adapter，隐藏 Lexical lifecycle、editor state、selection、parse/serialize 和 syntax registration。
- `createMarkdownKit` 是内部组合器，只组合调用方显式传入的 modules。
- `Editor` 的上层 props contract 是应用接入边界。
- editor runtime cleanup 由 Lexical smoke evidence 驱动。

## Proposed Approach

推荐路径是先建立内部 Markdown syntax 层，再接入 Lexical editor adapter。

内部目录建议：

```txt
apps/anchor/src/editor/
  index.tsx
  markdown/
    create-markdown-kit.ts
    anchor-markdown-kit.ts
    types.ts
    parse.ts
    serialize.ts
    preservation.ts
    syntax/
      code-block.ts
      heading.ts
      link.ts
      list.ts
      mdx-directive.ts
      text-format.ts
      token.ts
    test-utils/
      headless-editor.ts
      markdown-fixtures.ts
```

内部 kit 示例：

```ts
const kit = createMarkdownKit([
  headingSyntax({ levels: [1, 2, 3] }),
  listSyntax(),
  checkListSyntax(),
  textFormatSyntax(),
  linkSyntax(),
  codeBlockSyntax(),
  wikiLinkSyntax(),
  tagSyntax(),
  mdxDirectiveSyntax({
    block: anchorBlockDirectives,
    inline: anchorInlineDirectives
  })
])
```

Lexical editor adapter：

- Solid `onMount` 创建 Lexical editor。
- 组件内 `contenteditable` element 作为 editor root。
- `kit.nodes` 配置 Lexical nodes。
- `kit.transformers` 支撑 Markdown import/export 和 live shortcuts。
- `registerUpdateListener` 更新 `currentMarkdown` 并触发 autosave debounce。
- Lexical commands/listeners 承担 paste、keyboard shortcut、slash command 和 token interaction。
- `Editor` 对外输出 Markdown body 和 base revision。

## Work Sequence

1. Baseline behavior map
   - 读取 editor 调用、Markdown data flow 和相关 app 调用。
   - 列出用户可见行为：load、save、dirty、conflict、slash menu、checkbox、table、wikilink、Markdown link、unsupported syntax、paste、code fence。
   - forward evidence：behavior checklist。
   - regression evidence：明确目标行为和允许进入 known gap 的行为。

2. Dependency and internal module skeleton
   - 更新 `apps/anchor/package.json` 的 editor runtime dependencies。
   - 建立 `apps/anchor/src/editor/index.tsx` 作为应用层 editor entrypoint，导出 `Editor` 组件。
   - 建立 `apps/anchor/src/editor/markdown`。
   - 建立内部 `types.ts`、`create-markdown-kit.ts`、`anchor-markdown-kit.ts`。
   - forward evidence：TypeScript 能解析内部 API。
   - regression evidence：App 与 Operation Core contract 清晰，`App.tsx` 只依赖 `Editor` entrypoint。

3. Headless Markdown conversion fixtures
   - 用 `@lexical/headless` 建立 fixture helper。
   - 覆盖 heading、list、checklist、quote、code fence、link、wikilink、tag、nested syntax。
   - 对 MDX directive 建立 inline 和 block fixture，初始状态标为 experimental。
   - forward evidence：Markdown -> Lexical -> Markdown 的支持语法有明确 fixture。
   - regression evidence：unsupported syntax 只进入 report 或 gate。

4. Lexical editor shell in `Editor`
   - 保留上层 props。
   - 初始化 Lexical core editor。
   - 绑定 `contenteditable` root、cleanup 和 prop-change reload。
   - forward evidence：编辑器能加载当前 note body 并显示可编辑内容。
   - regression evidence：`App.tsx` 通过 `apps/anchor/src/editor` 使用 `Editor`，调用数据流经过明确 props contract。

5. Autosave / dirty / conflict behavior
   - 用 Lexical update listener 序列化 Markdown。
   - 实现 autosave debounce、base revision、save status 和 conflict gate 语义。
   - 触发 `onDirtyChange` 和 `onAutosave`。
   - forward evidence：正文变更能 auto-save 并更新 revision。
   - regression evidence：stale base revision 进入 conflict 状态。

6. Markdown interaction behavior
   - 接入 `registerMarkdownShortcuts`。
   - 覆盖 heading、list、quote、code fence、bold、italic、inline code、checkbox。
   - 将 slash command menu 接到 Lexical commands。
   - forward evidence：single-surface 输入 Markdown shortcut 后转成对应结构。
   - regression evidence：editor 没有 source mode，持久化边界仍是 Markdown。

7. Anchor token syntax
   - 实现 wikilink 和 tag syntax。
   - 实现 Markdown link safe-open 行为。
   - 在 code block / inline code 语境中跳过 wikilink、tag 和 directive。
   - forward evidence：`[[target]]`、`[[target|alias]]`、`#tag` 可输入、渲染、保存、打开或索引。
   - regression evidence：code fence 内 token 排除在关系索引之外。

8. Table and MDX directive gate
   - table 编辑能力进入独立 fixture gate。
   - Anchor 内部 `tableSyntax` 先通过 Markdown fixture，再进入 UI。
   - MDX directive 支持 inline / block 两种模式，稳定范围限于 Anchor 明确声明的 directive definitions。
   - forward evidence：table 或 directive 的 Markdown fixtures 通过后进入稳定编辑路径。
   - regression evidence：未支持的 table/directive 进入 unsupported gate。

9. Editor runtime cleanup
   - Lexical editor shell 和 smoke evidence 通过后清理 editor runtime imports、extensions、decoration code 和未使用依赖。
   - 更新 `apps/anchor/package.json` 和 lockfile。
   - forward evidence：代码里没有过期 editor runtime usage。
   - regression evidence：Anchor app 能启动、编辑、保存和恢复 Markdown。

10. Documentation and readiness evidence
   - 更新必要的 Anchor plan/readiness 文档，只记录当前 Lexical editor 边界和 known gaps。
   - smoke screenshots 放入 readiness evidence。
   - forward evidence：计划和 evidence 描述当前 editor target。
   - regression evidence：已有文档和 screenshot evidence 语境可追溯。

## Acceptance, Regression Evidence, and Verification

验收结果：

- `apps/anchor/src/editor/markdown` 存在，并承担 Anchor 内部 Markdown syntax composition。
- `apps/anchor/src/editor/index.tsx` 导出 `Editor` 组件。
- `Editor` 使用 Lexical editor runtime。
- `App.tsx` 通过 `apps/anchor/src/editor` 使用 `Editor`，props contract 稳定。
- Markdown body 通过 `onAutosave(body, baseRevision)` 进入 Operation Core。
- 持久化文件、SQLite、operation record 和 public app state 只接收 Markdown 语义数据。
- 用户可以在同一 editor surface 中输入 heading、list、checkbox、quote、code fence、Markdown link、wikilink 和 tag。
- checkbox toggle 后 auto-save 回写 Markdown checkbox。
- wikilink open callback 可用。
- unsafe Markdown link 由 safe-open policy 处理。
- unsupported syntax 进入明确 gate 或 report。
- MDX directive inline / block 至少有内部 fixture；产品可用状态由 stable fixture 和 UI smoke 共同决定。
- editor runtime dependency graph 只保留当前 Lexical implementation 需要的依赖。

建议验证命令：

```bash
bun run check
git diff --check
```

建议手动 smoke：

- 浏览器或 Tauri 中打开 golden vault。
- 打开当天 Journal。
- 输入 heading、bullet list、ordered list、checkbox、quote、code fence、Markdown link、wikilink 和 tag。
- 确认 auto-save 后 Markdown 文件可读。
- 重启应用，确认从 Markdown 恢复。
- 触发 stale base revision conflict，确认保存进入 conflict 状态。
- 粘贴 unsupported syntax，确认保存被阻断或明确提示。

Test gap decision：

- 这个 editor engine change 的核心风险在 Markdown import/export 和编辑交互。实施前需要决定是否允许新增针对 `apps/anchor/src/editor/markdown` 的 headless fixture tests。推荐允许；否则只能依赖 `bun run check` 和手动 smoke，无法充分证明 nested syntax、MDX directive 和 round-trip 安全。

## Risks and Rabbit Holes

- Solid + Lexical integration risk：手动绑定 `contenteditable` 需要覆盖 lifecycle、selection、cleanup 和 accessibility。
- Markdown serialization risk：serializer 输出可能产生语义等价但文本不同的 Markdown；计划只要求 supported syntax 的语义 round-trip。
- Table risk：`@lexical/markdown` 默认 transformer 没有 Markdown table。table 需要独立 syntax 和 fixture gate。
- MDX directive risk：inline / block directive 容易吞掉嵌套内容或和 link/tag 冲突，必须通过 fixture 固定行为。
- Autosave risk：Lexical update listener 可能造成过度保存、漏保存或 selection 抖动。
- Token parsing risk：wikilink、tag、Markdown link 在 code block / inline code 语境中需要跳过。
- Dirty worktree risk：Anchor 文件已有未提交改动时，实施必须逐文件阅读 diff。
- Dependency churn risk：lockfile 只承载 editor runtime 依赖变化。

## Checkpoints

- Integration checkpoint：Lexical core + Solid lifecycle 能稳定编辑文本、更新 state、cleanup 后，再接高级语法。
- Round-trip checkpoint：heading/list/link/code/checklist fixtures 通过后，再接 autosave。
- Autosave checkpoint：dirty、saved、saving、conflict、failed 状态语义清晰。
- Table checkpoint：table fixture 和 UI 方案明确前，table editing 进入 known gap。
- MDX checkpoint：inline / block directive fixtures 通过前，MDX directive 标记为 experimental。
- Dependency checkpoint：Lexical runtime 和 smoke evidence 通过后，再清理 editor runtime dependencies。

## Stop Condition

实施完成时停在这个状态：

- Anchor editor 使用 Lexical。
- `apps/anchor/src/editor/markdown` 是 Anchor 内部 Markdown syntax owner。
- Markdown source-of-truth、Operation Core write boundary、autosave/conflict 语义成立。
- editor runtime dependency graph 与当前 implementation 一致。
- 支持语法和未支持语法的行为都有验证证据或明确 known gap。
- 公共 package 与外部 API 承诺留在本计划范围外。

## Pause Conditions

出现以下情况时暂停给用户确认：

- Lexical core 在 Solid 中无法稳定绑定 contenteditable，需要 React island 或第三方 wrapper。
- `Editor` 对 `App.tsx` 的核心 props contract 需要变化。
- 需要 Lexical JSON persistence 才能保留关键功能。
- table 需要在原文保留和产品可编辑能力之间做取舍。
- MDX directive 解析需要大型 parser pipeline 或完整 MDX runtime。
- 需要修改 vault schema、Operation Core mutation contract、SQLite projection 或 agent workflow。
- 需要独立 package 或 npm publish。

## Progress Report Format

实施过程中的更新按这个格式报告：

- 已完成：具体文件/API/交互。
- 验证：运行的命令、手动 smoke 或 fixture 结果。
- 当前风险：只列会影响 editor behavior、Markdown 保存安全或 editor dependency graph 的风险。
- 下一步：一个最小 work slice。

## References

- [Lexical home page](https://lexical.dev/)：Lexical editor instance 绑定到单个 contenteditable element；Lexical 本身具备 UI/plugin 层低耦合。
- [Lexical `@lexical/markdown` 官方文档](https://facebook-lexical.mintlify.app/api/packages/markdown)：`$convertFromMarkdownString`、`$convertToMarkdownString`、`registerMarkdownShortcuts`、内置 transformer 和 custom transformer 类型。
- [Lexical `@lexical/headless` 官方文档](https://facebook-lexical.mintlify.app/api/packages/headless)：headless editor 支持 Markdown 转换和测试 fixture。
