# 规格：Native Skills Manifest Installer

创建日期：2026-04-25

## 目标

`@plimeor/skills` 是原生 TypeScript CLI，用两个 state files 管理 agent skills：

- `skills.json`：desired state，按 source 分组，方便人维护和 review。
- `skills.lock.json`：resolved install state，记录 exact commit 和 installation metadata。

`@plimeor/skills` 不调用 upstream npm package `skills`。Installation、removal、listing、lock refresh 和 sync 都是自己的行为。

## 假设

1. Package 位于 `packages/skills`。
2. npm package name 是 `@plimeor/skills`，executable name 是 `skills`。
3. 第一版 backend 支持 Git 和 local filesystem sources。
4. 第一版 canonical install target 是 `.agents/skills`。
5. Global state 位于 `~/.agents`；project state 位于 `./.agents`。
6. Agent-specific fan-out、interactive discovery、`find` 和 `init` 不在当前版本范围内。

## 命令

```bash
skills add plimeor/agent-skills -g
skills add plimeor/agent-skills --skill code-scope-gate -g
skills add plimeor/agent-skills --skill code-scope-gate --ref main -g
skills add plimeor/agent-skills --skill code-scope-gate --commit abc123 -g
skills remove code-scope-gate -g
skills list -g
skills list -g --json
skills sync -g
skills sync -g --locked
skills sync -g --dry-run
skills update -g
skills migrate -g
```

`add <source>` 在没有 `--skill` 或 `--all` 时，会读取 source repository 的 `skills/` 目录，让用户选择一个或多个 skills。Prompt 展示 skill name，并用 `SKILL.md` frontmatter description 作为 hint。当前 scope lock file 中已经安装的 skills 标成 `<skill-name> (installed)`，并禁用。如果该 source 下所有 skills 都已安装，`add` 在打开 prompt 前退出，并提示用户需要刷新副本时运行 `sync`。如果用户不选新 skill 或取消 prompt，`add` 不安装 skills，也不写 state files。

`add --all` 把 source group 记录为 `skills: "all"`，不冻结当前发现到的 skill list。后续 `sync` 和 `update` 会继续跟随这个 source：新增的 skills 会被添加，已经消失的 skills 会被 prune。

`migrate` 把 legacy lock 转成 `skills.json` 和 `skills.lock.json`。迁移后 `list` 立即可用；之后普通 `sync` 再用新 manifest 刷新 lock 中的 exact resolved commits。

## CLI 输出

面向人的进度输出使用 Clack logs、spinners 和 task groups。机器可读输出保持干净：

- `skills list --json` 只向 stdout 写 formatted JSON。
- `skills sync --dry-run` 只向 stdout 写 dry-run plan。

## `skills.json`

`skills.json` 是 desired state。它应该 deterministic、human-editable，不写 install timestamps 或 generated hashes。

```json
{
  "schemaVersion": 1,
  "scope": "global",
  "sources": [
    {
      "source": "plimeor/agent-skills",
      "skills": [
        {
          "name": "code-scope-gate",
          "path": "skills/code-scope-gate",
          "ref": "main"
        },
        {
          "name": "obsidian-markdown",
          "path": "skills/obsidian-markdown",
          "commit": "abc123"
        }
      ]
    }
  ]
}
```

规则：

- `schemaVersion` 必须是 `1`。
- `scope` 必须是 `global` 或 `project`。
- `sources[].source` 接受 GitHub shorthand、Git URLs、HTTP Git URLs 或 local paths。
- `sources[].skills` 可以是 explicit skill list，也可以是 `"all"`。
- `sources[].ref` 或 `sources[].commit` 作用于整个 source group；explicit skills 上的 skill-level `ref` 或 `commit` 可以覆盖它。
- Source groups 展开后，skill names 必须唯一。
- `sources[].skills[].path` 指向包含 `SKILL.md` 的目录；如果 command code 省略它，默认是 `skills/<name>`。
- 一个 skill 可以指定 `ref` 或 `commit`，不能同时指定两者。
- `commit` 将 desired state pin 到 exact Git commit。

## `skills.lock.json`

`skills.lock.json` 记录实际安装结果。

```json
{
  "schemaVersion": 1,
  "scope": "global",
  "skills": {
    "code-scope-gate": {
      "source": "plimeor/agent-skills",
      "path": "skills/code-scope-gate",
      "ref": "main",
      "commit": "9f4c1b",
      "installedAt": "2026-04-25T12:00:00.000Z",
      "installPath": "/Users/plimeor/.agents/skills/code-scope-gate",
      "method": "copy"
    }
  }
}
```

规则：

- `commit` 是实际安装的 resolved commit。
- `installedAt` 是 install metadata，只写在 lock file。
- 普通 `sync` 重新解析 manifest refs，并写入新的 lock commits。
- `sync --locked` 复用 exact lock commits；lock 缺失或与 `skills.json` 不匹配时失败。
- 对 `skills: "all"` 的 source group，普通 `sync` 和 `update` 从 requested source target 发现 skills；`sync --locked` 从匹配的 lock entries 展开 skill list。

## Scope 语义

Global scope：

- 由 `-g` 或 `--global` 选择。
- 使用 `~/.agents/skills.json`。
- 使用 `~/.agents/skills.lock.json`。
- 安装到 `~/.agents/skills/<skill-name>`。

Project scope：

- 未传 `-g` 时默认使用。
- 使用 `./.agents/skills.json`。
- 使用 `./.agents/skills.lock.json`。
- 安装到 `./.agents/skills/<skill-name>`。

## Sync 语义

`sync` 的职责是让 installed state 收敛到 `skills.json`。

1. 读取并校验 `skills.json`。
2. 读取 `skills.lock.json`；如果不存在，先在内存中创建 empty lock。
3. 对 `skills: "all"` 的 source group，从 requested source target 展开；在 `sync --locked` 中则从匹配 lock entries 展开。
4. 移除不再声明的 skills 对应的 lock entries 和 installed directories。
5. 按 `{source, commit || ref || default ref}` 对 skills 分组。
6. 每个 group clone 或复用一次，允许并行执行。
7. 将每个 skill directory 复制到 scope install directory。
8. 成功收敛后写入 `skills.lock.json`。

Failure rule：clone 或 install 失败时，command 以 non-zero 退出，不写入 successful new lock。

## 原生安装器边界

始终：

- `skills.json` 保持 deterministic。
- install metadata 留在 `skills.lock.json`。
- `sync` 按 source 和 target commit/ref batch checkout work。
- `sync --locked` 只使用 exact lock commits。
- manifest 和 lock files 使用 atomic writes。

绝不：

- 调用 upstream `skills` CLI。
- 在 `skills.json` 中存 timestamps、folder hashes 或 generated install state。

当前版本不做：

- `.agents/skills` 之外的 multi-agent fan-out。
- Search / `find`。
- Skill template creation / `init`。
