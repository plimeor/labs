# 想法：command-kit

创建日期：2026-05-01
状态：已提升到 `docs/specs/command-kit.md` 和 `docs/decisions/2026-05-01-command-kit.md`

这是一份早期想法记录，主要保留当时为什么要做 `command-kit`，以及第一个 adoption target 是什么。后续实现变更以 spec 和 decision record 为准。

## 原始动机

`packages/skills` 需要一层 command declaration，既能给人用，也能给 agent 用。现有 `incur` setup 卡在 positional argument binding：

```bash
skills add plimeor/agents skill-1 skill-2 skill-3
```

目标形状很具体：

- `plimeor/agents` 绑定到第一个 positional argument。
- `skill-1 skill-2 skill-3` 绑定到第二个 positional array。
- command handlers 接收 typed `ctx.args` 和 `ctx.options`。
- agent-facing runs 返回稳定的 `{ ok, data | error }` envelope。

这个包只做 small command kit，不做完整 CLI framework。

## 命名

使用 `@plimeor/command-kit`。

名字要指向 package 真正承担的工作：声明 commands、解析 argv、校验 inputs、渲染 help、规范化 results。不要把某个 schema implementation detail 写进名字。

## 第一版范围

- Bun runtime first。
- command args 和 options 使用 Standard Schema schemas。
- 可选 Standard JSON Schema adapter，用于 help metadata。
- 使用 `defineCommand(name, config)` 做 declarative command definition。
- 支持 positional binding，包括 first positional 加 rest-array positional。
- 支持 root commands、subcommands、missing arguments 和 `--help` 的 help output。
- 只有 command 显式声明 `--json` 时才输出 JSON result envelopes；runtime 负责写 envelope，并在这个模式下隐藏 pretty/log output。
- 不做 command output schema validation。

## 非目标

- 替代 full-featured CLI frameworks。
- 绑定到某个 specific schema library。
- 提供 plugin system。
- 生成 MCP server。
- shell completion。
- OpenAPI mounting。
- global `--format json`。

## 第一个采用目标

当 `packages/skills` 能完整从 `incur` 迁到 `@plimeor/command-kit`，并且除了明确需要的 command-line contract improvements 外不改变业务行为时，这个 MVP 就算站住了。
