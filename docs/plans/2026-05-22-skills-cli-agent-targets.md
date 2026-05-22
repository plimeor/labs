# 计划：skills CLI agent targets

创建日期：2026-05-22

## 澄清状态

当前方向已调整为目录级 symlink，并且不维护 enabled agents：

- Canonical skill store 仍是当前 scope 的 `.agents/skills`：global scope 是 `~/.agents/skills`，project scope 是 `./.agents/skills`。
- Native agents 在 project/global scope 都读取当前 scope 的 canonical install dir；native 类型的 global target 是 `~/.agents/skills`。`codex` 属于 native agent，因此不需要 agent-specific link。
- 对不能直接读取 canonical install dir、且在当前 scope 被检测到的普通 agents，不再为每个 skill 创建 symlink，而是由 `skills agents add <agent-id>` 显式把该 agent 当前 scope 的 skills directory 作为目录级 symlink 指向 `scope.installDir`。
- 不在 `skills.json` 维护 `agents` list，不实现 `skills agents remove`，不保存 enabled agent state。
- `skills agents list` 展示 registry、detection、target 和 link 状态；`skills agents add` 是显式创建单个 agent target link 的入口。
- `add` 和 `remove` 只维护 canonical store、manifest 和 lock。已经 linked 的 agent directory 会自动看到 canonical store 变化；未 linked 的 directory 不处理。
- `sync` 和 `migrate` 在完成自身 state 工作后，提示用户是否批量 link 当前 scope 下所有检测到且可链接的 agent targets；`update` 复用普通 `sync` 路径，因此继承同一 prompt。
- `migrate` 只做 legacy state conversion，不自动 clone 或 reinstall；agent target prompt 只处理 directory link。

实现前仍需要一个 checkpoint：用本机实际目录和 registry 确认普通 agents 的 project/global target dir 与 detection 条件，尤其是 Claude Code、Kiro CLI、Goose、Continue 这类不读取 canonical store 的 agents。

## 背景

`@plimeor/skills` 现在是 manifest/lock 驱动的原生 installer。`skills.json` 描述 desired skill state，`skills.lock.json` 记录 resolved install state，当前 canonical install target 是当前 scope 的 `.agents/skills`。

用户希望补上 coding agent 探测和 agent 列表能力，并在 `sync` / `migrate` 后提醒用户是否把 detected agent 的 skills directory 自动链接到当前 scope canonical store；`update` 继承普通 `sync` prompt。同时保留 `skills agents add <agent-id>` 作为单个 target 的显式入口。最初计划按每个 skill 创建 agent-specific symlink，并在 manifest 中维护 enabled agents；调整后改为目录级 symlink，并完全移除 enabled agents 维护：agent target 只是从 registry、当前 scope、detection 和 canonical store 推导出的本机派生入口。

参考来源：

- Vercel Labs Skills supported agents docs：列出 supported agents、project path、global path 和 universal agents。URL: https://www.mintlify.com/vercel-labs/skills/guides/supported-agents
- Vercel Labs `src/agents.ts`：agent registry 包含 `skillsDir`、`globalSkillsDir`、`detectInstalled`、`getUniversalAgents()`、`getNonUniversalAgents()` 和 `isUniversalAgent()`。URL: https://github.com/vercel-labs/skills/blob/main/src/agents.ts

当前从 `vercel-labs/skills` registry 观察到的 universal agents 包括：

- `amp`
- `antigravity`
- `cline`
- `codex`
- `cursor`
- `deepagents`
- `dexto`
- `firebender`
- `gemini-cli`
- `github-copilot`
- `kimi-cli`
- `opencode`
- `warp`

需要 agent-specific target directory link 的典型 agents 包括：

- `claude-code`
- `continue`
- `goose`
- `kiro-cli`
- `openhands`
- `qwen-code`
- `roo`
- `windsurf`

## 目标

让 `@plimeor/skills` 能识别 supported coding agents，并在 `sync` / `migrate` 后询问是否把当前 scope 中 detected non-native agents 的 skills directory 批量收敛为指向当前 scope canonical store 的目录级 symlink；`update` 继承普通 `sync` prompt；用户也可以通过 `skills agents add <agent-id>` 显式收敛单个 agent target。

Canonical skill store 仍由现有 manifest/lock 工作流拥有；agent-specific target directory 只是从 canonical store 派生出的本机入口，不进入 manifest 或 lock。

## 范围

包含：

- 新增 agent registry/abstraction，例如 `packages/skills/src/agents.ts`。
- 新增 `skills agents list`。`list` 分组展示 native agents 和普通 agents，并显示当前 scope 的 detection、target、link 状态。
- 新增 `skills agents add <agent-id>`。该命令只对指定 detected non-native agent 做目录级 link 工作。
- 在 `sync` 和 `migrate` 完成自身 state 工作后，提示用户是否批量 link 当前 scope 下 detected 且可链接的 non-native agent targets；`update` 继承普通 `sync` 的 prompt。
- 保持 `add` 和 `remove` 只维护 canonical store 和 manifest/lock state，不主动处理 agent targets。
- 新增充分的 package-level tests；本计划已授权新增测试文件。
- 更新 `packages/skills/README.md` 的 commands、features、missing-gap 说明；必要时更新 `docs/specs/skills-manifest.md`。

## 非目标

不包含：

- 不调用 upstream `skills` CLI。
- 不做 open-ended skill discovery、`find`、`init`。
- 不扩展 `skills.json` schema 来保存 `agents` list。
- 不实现 `skills agents remove`。
- 不维护 enabled agents；detected agents 只用于 `skills agents list` 诊断、`skills agents add` 显式链接，以及 `sync` / `migrate` 后的批量 link prompt；`update` 继承普通 `sync` prompt。
- 不把 per-agent link paths 写进 `skills.lock.json`；它们是从 registry、scope 和 detection 推导出来的本机派生状态。
- 不做 per-skill symlink、per-skill prune 或 agent target 下的逐 skill reconciliation。
- 不对当前 scope 已具备 native canonical 读取能力的 agents 做重复 symlink。
- 不让 `migrate` 自动 clone、reinstall 或创建 agent target symlink。

## 必读上下文

实现前先读：

- `packages/skills/AGENTS.md`
- `packages/skills/src/cli.ts`
- `packages/skills/src/manifest.ts`
- `packages/skills/src/lock.ts`
- `packages/skills/src/scope.ts`
- `packages/skills/src/installer.ts`
- `packages/skills/src/commands/add.ts`
- `packages/skills/src/commands/remove.ts`
- `packages/skills/src/commands/sync.ts`
- `packages/skills/src/commands/update.ts`
- `packages/skills/src/commands/migrate.ts`
- `packages/skills/src/sync-plan.ts`
- `packages/command-kit/src/define.ts`
- `docs/decisions/2026-04-25-native-skills-manifest-installer.md`
- `docs/specs/skills-manifest.md`

## 规划迭代

设计审查结论：

- `skills.json` 继续只表达 desired skills，不表达 desired agents。
- `Lock` 继续只记录 resolved skills，不记录 machine-local agent target state。
- `command-kit` 已支持 one-level `defineGroup`，`skills agents list` 不需要扩展 command framework。
- Reconciliation 的 owner 应是一个独立 helper，例如 `agent-targets.ts`，避免把 agent-specific target 逻辑分散到各个 command。
- 目录级 symlink 取代 per-skill symlink。Lock skills 只决定 canonical store 内容，不决定 agent target link 的粒度。
- Native 判定是 skip 规则：当前 scope 能读取 canonical store 的 agent 不创建 link。产品定义上，native 类型的 global target 也是 `~/.agents/skills`。
- Detection 是 `skills agents list`、`skills agents add`、`sync` / `migrate` 后批量 link prompt 的输入；`update` 继承普通 `sync` prompt。未检测到的普通 agent 不创建目录，不产生 side effect。
- `sync --dry-run` 只预览 canonical skill install/prune changes；agent target link preview 属于 `skills agents list` / `skills agents add` 的职责。

## 推荐方案

新增 `AgentRegistry`，每个 agent 记录：

- `id`
- `displayName`
- `projectSkillsDir`
- `globalSkillsDir`
- `readsCanonicalProjectSkills`
- `readsCanonicalGlobalSkills`
- `detectInstalled`
- `showInUniversalList`

其中 native agents 的 `readsCanonicalProjectSkills` 和 `readsCanonicalGlobalSkills` 都为 `true`。`codex` 按 native agent 处理，不需要 agent-specific target link。即使 registry 中保留了 upstream `globalSkillsDir`，native global target 仍按本包产品定义使用当前 scope canonical store。

新增 helper：

- `listAgentTargets(scope)`：返回按分组组织的 known agents。默认分组是 `standard` 和 `detected`；`--all` 增加 `not-detected`。每个 entry 标注 `id`、`displayName`、`detected`、`targetDir`、`linkMode`、`native`。
- `resolveAgentTarget(agent, scope)`：按当前 scope 选择 target dir。
- `usesCanonicalTarget(agent, scope)`：按当前 scope 的 explicit capability 判定；target dir 等于 `scope.installDir` 也必须 no-op。
- `planAgentTargetReconciliation(scope)`：返回目录级 link plan，供 `skills agents list`、`skills agents add`、`sync` / `migrate` 后批量 link prompt 使用；`update` 通过普通 `sync` 路径复用同一 plan。
- `reconcileAgentTarget(scope, agentId)`：对指定 detected non-native agent 应用目录级 link plan；批量 prompt 逐个调用这个显式单体 owner。

`skills agents list --json` 输出使用 command-kit 的 JSON envelope，`data` 固定为：

```ts
{
  groups: [
    {
      id: 'standard',
      agents: AgentListEntry[]
    },
    {
      id: 'detected',
      agents: AgentListEntry[]
    }
  ]
}
```

`skills agents list --all --json` 在末尾增加 `{ id: 'not-detected', agents: AgentListEntry[] }`。

`AgentListEntry` 至少包含：

- `id`
- `displayName`
- `detected`
- `targetDir`
- `linkMode`
- `native`

`linkMode`：

- `native`：agent 在当前 scope 能直接读取 canonical install dir，不需要 link。
- `directory-symlink`：agent 在当前 scope 不能直接读取 canonical install dir，且 detected 后需要 target directory symlink。
- `undetected`：known agent 当前未检测到，不创建 target。
- `blocked`：target path 已存在但不能安全采用，例如普通目录、普通文件、非 canonical symlink 或来源不明的损坏 symlink。

`skills agents` 支持边界：

- `skills agents list` 必须分组展示：第一个分组是 standard/native agents，第二个分组是 detected 普通 agents。
- `skills agents list` 只展示状态，不修改 manifest、lock 或 filesystem。
- 支持 `skills agents add <agent-id>`，不支持 `skills agents remove`。用户不需要选择 enabled agents；`sync` / `migrate` 只在完成自身 state 工作后询问是否批量 link detected targets，`update` 继承普通 `sync` prompt，`add` / `remove` 不做 agent target reconciliation。

`skills agents add` 和 `sync` / `update` / `migrate` 批量 prompt 共享同一套 reconciliation 规则：

1. 运行 registry detection，得到当前 scope 的 detected agents。
2. 对每个 detected agent 计算当前 scope 的 native capability 和 target dir。
3. 如果 agent 在当前 scope 能直接读取 `scope.installDir`，跳过。
4. 如果 `targetDir` 与 `scope.installDir` 是同一路径，跳过。
5. 如果 `targetDir` 位于 `scope.installDir` 内部，或 `scope.installDir` 位于 `targetDir` 内部，失败并报告 unsafe link loop risk。
6. 如果 target 不存在，创建父目录，并创建 `targetDir -> scope.installDir` 的目录级 symlink。
7. 如果 target 已经是 symlink 且 target 指向当前 `scope.installDir`，保持不变。
8. 如果 target 已经是 symlink 但指向其他位置，安全检查通过后替换为 canonical directory symlink。
9. 如果 target 是普通目录、普通文件，安全检查通过后替换为 canonical directory symlink。
10. 未检测到的普通 agents 不创建 target，也不清理历史 symlink；如果需要 cleanup，后续单独设计 `skills agents prune`。

## 工作序列

1. 新增 agent registry。

   Touchpoints：`packages/skills/src/agents.ts`。

   Forward evidence：能列出 known agents、detect mocked HOME/project 下的 installed agents，并正确标注 project/global capability 与 target；`codex` 被标注为 project/global 都读取 canonical store。

   Regression evidence：不改变现有 scope 解析和 install dir。

2. 实现 target reconciliation plan 和 apply。

   Touchpoints：新 `packages/skills/src/agent-targets.ts`。

   Forward evidence：显式 `skills agents add <agent-id>` 能让 detected non-native agent target dir 成为指向 `scope.installDir` 的目录级 symlink。

   Regression evidence：native-capable target 不创建重复 link；未检测到的普通 agent 不创建 target；普通目录、普通文件、非 canonical symlink 和未知损坏 symlink 不被覆盖。

3. 新增 `skills agents` command group。

   Touchpoints：`packages/skills/src/cli.ts`、新 `packages/skills/src/commands/agents.ts`。

   子命令：

   ```bash
   skills agents list -g
   skills agents list -g --json
   ```

   Forward evidence：`list` 先展示 standard/native 分组，再展示 detected 普通 agent 分组；list 是 read-only，不修改 state 或 filesystem。

   Regression evidence：root help 和 group help 仍由 `command-kit` 正常生成；现有 top-level commands 不变。

4. 接入 `sync` / `update` / `migrate` 后的批量 agent target prompt。

   Touchpoints：`sync.ts`、`update.ts`、`migrate.ts`、`commands/agent-targets.ts`。

   Forward evidence：`sync` 和 `migrate` 完成自身 state 工作后，检测当前 scope 下 pending detected non-native targets，并询问用户是否批量创建或替换 directory links；`update` 继承普通 `sync` prompt；`sync --dry-run` 只输出 canonical skill changes。

   Regression evidence：`add` 和 `remove` 不提示也不处理 agent targets；`update` 继承普通 `sync` prompt；已经 linked 的 agent directory 通过 symlink 自动看到 canonical store 变化。

5. 保持 `migrate` 为 state conversion。

   Touchpoints：`packages/skills/src/commands/migrate.ts`，必要时只更新输出提示。

   Forward evidence：`migrate` 写入 manifest/lock 后提示用户运行 `skills sync`，并询问是否批量 link 当前检测到且可链接的 agent targets；它不 clone、不 reinstall。

   Regression evidence：legacy lock 到 manifest/lock 的转换行为不变；`migrate` 不隐式变成 network reinstall。

6. 补足测试。

   Touchpoints：可以新增 `packages/skills/test/agents.test.ts`、`packages/skills/test/agent-targets.test.ts`、`packages/skills/test/commands/agents.test.ts`，并按需扩展现有 command tests。

   Forward evidence：新增测试覆盖 registry 分组、`skills agents list` 行为、显式 `skills agents add` 目录级 target reconciliation、`sync` / `migrate` 批量 prompt、`update` 继承普通 `sync` prompt，以及 `add` / `remove` 不处理 agent targets。

   Regression evidence：测试继续覆盖旧 manifest/lock 行为、现有 top-level commands、`sync --locked`、`remove` 对 `skills: "all"` 的转换、`list --json` 输出。

7. 更新文档。

   Touchpoints：`packages/skills/README.md`，必要时更新 `docs/specs/skills-manifest.md`。

   Forward evidence：README command examples 包含 `skills agents list` 和 `skills agents add`，并说明 native agents 不需要 symlink，detected 普通 agents 通过显式命令创建 directory-level symlink。

   Regression evidence：不修改 package runtime contract，不引入 `dist/`。

## 接受标准与验证

接受标准：

- `skills agents list -g --json` 能输出 command-kit JSON envelope；`data.groups` 包含两个有序分组：第一组 `standard`，第二组 `detected`。每个 entry 标注 `id`、`displayName`、`detected`、`targetDir`、`linkMode`、`native`。
- `skills agents list -g` 是 read-only，不写 `skills.json`、`skills.lock.json`，也不创建 symlink。
- 当 mocked HOME 下检测到 Claude Code/Kiro CLI 等 non-native agents 时，`skills agents add <agent-id> -g` 成功后，对应 target dir 是指向 `~/.agents/skills` 的目录级 symlink。
- 当 mocked HOME 下检测到 Claude Code/Kiro CLI 等 non-native agents 时，`skills sync -g` 和 `skills migrate -g` 在自身 state 工作完成后会询问是否批量 link pending detected targets；`skills update -g` 继承普通 `sync` prompt。用户确认后对应 target dir 是指向 `~/.agents/skills` 的目录级 symlink。
- `codex` 被视为 native；普通 command 不为 Codex 创建 agent-specific link。
- 未检测到的普通 agents 不创建目录级 symlink。
- `skills sync -g --dry-run` 只预览 canonical skill install/prune changes，不包含 agent target directory link changes。
- `skills migrate -g` 不 clone、不 reinstall；它在 state conversion 后询问是否批量 link pending detected targets。
- `skills.json` 不新增 `agents` 字段；`skills.lock.json` 不新增 per-agent machine-local state。
- 新增或扩展测试覆盖下面的行为边界：
  - registry 能按 `universal` 和普通 agent 分组。
  - Codex project/global 都标注为 native canonical support。
  - `skills agents list --json` 输出固定 `data.groups` shape。
  - `skills agents list` 不修改 state 或 filesystem。
  - target reconciliation 对 native-capable agent 跳过，对显式指定的 detected 普通 agent 创建 directory symlink。
  - target reconciliation 不为 undetected 普通 agent 创建 target。
  - target reconciliation 拒绝 self-link 和 parent/child link loop。
  - `sync --dry-run` 不包含 agent target link preview。
  - `sync` 成功写入 state 后会询问是否批量 link pending detected targets。
  - `migrate` 完成 state conversion 后会询问是否批量 link pending detected targets。
  - `add` 和 `remove` 成功写入 state 后不会做 directory symlink reconciliation；`update` 继承普通 `sync` prompt。
  - 没有 detected non-native agents 时，现有 command 行为保持兼容。

实现阶段在用户授权运行测试命令时运行：

```bash
bun run --filter @plimeor/skills test
bun run --filter @plimeor/skills prepack
```

实现阶段还应做轻量 CLI smoke：

```bash
bun packages/skills/src/cli.ts agents --help
bun packages/skills/src/cli.ts agents list --json
bun packages/skills/src/cli.ts sync -g --dry-run
```

## 回归面

需要保护的已有行为：

- `skills.json` 仍是 deterministic desired state。
- `skills.lock.json` 仍只记录 resolved install metadata。
- `add` 的 prompted source install、`--all` live subscription、`--commit`/`--ref` 互斥规则不变。
- `sync --locked` 仍只使用 lock 中 exact commits，并在 lock 与 manifest 不匹配时失败。
- `remove` 对 `skills: "all"` source 的转换行为不变。
- `migrate` 仍是 legacy lock 到 manifest/lock 的 state conversion，不隐式变成 network reinstall；它只在转换后处理 agent target link prompt。
- `list --json` 仍保持机器可读输出。
- `sync --dry-run` 仍只预览 canonical skill filesystem changes。

## 风险与规避

- 目录级 symlink 可能覆盖用户已有 agent-specific skills directory。规避：只有显式 `skills agents add <agent-id>` 或用户确认 `sync` / `update` / `migrate` 后的批量 prompt 才会执行 target replacement；`add` 和 `remove` 不触碰 agent target directories。
- Self-link 或 parent/child link 可能造成 link loop。规避：在创建前解析 target/canonical path，拒绝相同路径和父子路径关系。
- Agent registry 可能随上游变化。规避：集中维护 registry，并在 README 标注参考来源和验证日期；agent state 不进入 manifest，减少 registry drift 对 state file 的影响。
- Detection false positive 可能让 agent list 或 `sync` / `update` / `migrate` prompt 展示某个用户不想管理的 agent。规避：list 是 read-only；`sync` / `update` / `migrate` 需要用户确认，或用户可用 `skills agents add <agent-id>` 显式处理单个 target。
- Detection false negative 会导致 agent target 未自动 link。规避：`skills agents list` 展示 detected 状态和 target dir，作为人工诊断入口。
- `sync --dry-run` 不展示 agent target side effects，因为 dry-run 不进入 prompt/apply 阶段。
- `migrate` legacy lock 里的 `installPath` 可能不是 canonical store。规避：`migrate` 不 clone 或 reinstall，只在用户确认后建立 target directory link；后续仍提示运行 `sync` 刷新 canonical store 内容。
- 未检测到的普通 agent 历史 symlink 不会自动 cleanup。规避：文档明确当前版本不维护 enabled agents，也不承诺 disabled cleanup；后续如需要再设计 prune。

## Checkpoints

实现过程中先报告这几个证据点，再继续大范围接入：

1. Registry 中 project/global capability、detection 条件与 target 的初版清单，尤其是 Codex、Claude Code、Kiro CLI。
2. `usesCanonicalTarget(agent, scope)` 的 project/global capability 判定示例；Codex 在两个 scope 都是 native，native global target 是 `~/.agents/skills`。
3. `skills agents list` 的 human output 和 JSON `data.groups` shape。
4. Detection 到 reconciliation 的输入清单，尤其是 detected 普通 agents 与 undetected 普通 agents 的差异。
5. Directory symlink adoption 的安全条件。
6. 确认 `sync --dry-run` 不输出 agent target link preview；普通 `sync` 完成后才进入 batch link prompt。
7. 新增测试文件清单和每个文件覆盖的行为边界。
8. 确认 `skills.json` schema 不新增 `agents` 字段。

## 停止条件

实现完成时应停在这个状态：

- agent registry、agent detection、directory-level target reconciliation、`skills agents list` 和 `skills agents add` 已实现。
- `sync`、`migrate` 已接入用户确认后的 detected agent directory symlink batch prompt；`update` 继承普通 `sync` prompt。
- `add` 和 `remove` 不接入 detected agent directory symlink reconciliation；`update` 继承普通 `sync` prompt。
- `skills.json` 和 `skills.lock.json` 不记录 agent enabled state 或 per-agent target state。
- `migrate` 仍只做 state conversion，并明确提示后续运行 `sync`；它可在用户确认后建立 agent target directory links。
- 当前 scope native-capable agents 不做重复 link。
- 未检测到的普通 agents 不创建 target。
- `sync --dry-run` 只展示 canonical skill changes。
- 已新增或扩展足够的 package-level tests，覆盖新行为和相关回归面。
- README 和命令 help 一致。
- 已明确报告 `bun run --filter @plimeor/skills test`、`bun run --filter @plimeor/skills prepack` 和 CLI smoke 的结果；如环境阻塞，说明阻塞原因和已完成的次优检查。

## 暂停条件

遇到以下情况暂停确认：

- 某个普通 agent 的 project/global target dir 或 detection 条件证据不足，但实现选择会影响是否创建 directory symlink。
- 某个 target path 的安全检查无法判断是否可以替换，需要用户决定是否手动处理。
- 需要手动选择、启用或禁用 agents。
- 需要自动 cleanup 未检测到 agents 的历史 symlink。
- 需要 `migrate` 自动 clone/reinstall，而不是只做 state conversion。
- 发现上游 registry 与本机实际 agent 目录冲突，且会改变 Claude Code、Kiro CLI 或其他普通 agent 的 target 语义。
