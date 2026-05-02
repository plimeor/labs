# 采用 command-kit 作为仓库内 CLI 和 agent tools 的命令层

## 状态

已接受

2026-05-02 更新：schema 边界从 TypeBox-only 调整为 Standard Schema，并可选接入 Standard JSON Schema metadata。

## 日期

2026-05-01

## 背景

这个仓库已经不止一个 CLI 了。后续工具都要重复处理几件事：定义命令、校验输入、拿到 typed command context、生成一致的 help，并给人和 agent 都留下稳定输出。

当时 `packages/skills` CLI 使用 `incur`。它能处理基础 command routing 和 typed handlers，但不能表达 `skills` 接下来需要的 positional argument 形状：

```bash
skills add plimeor/agent-skills skill-1 skill-2 skill-3
```

这条命令里，`plimeor/agent-skills` 要绑定到第一个 positional argument，后续值要绑定到第二个 positional array。这不是边缘情况；如果这一点做不好，`skills add` 的主要路径就不成立。

第一批用户就是 repo-local tools 和 agents。`command-kit` 以后可以公开发布，但现在不提前支付外部框架的成本；先让 `packages/skills` 这条真实路径跑通。

## 决策

采用 `@plimeor/command-kit`，把它定位成 Bun-first 的 command declaration package，服务 repo-local CLI 和 agent-facing tools。

第一步用它完整替换 `packages/skills` 中的 `incur`。只有它能覆盖 `packages/skills` 的 command shapes 后，才考虑让其他 package 跟进。

Bun-first 的含义：

- CLI entrypoints 可以直接用 Bun 运行 TypeScript source。
- `#!/usr/bin/env bun` 是 repo-local executables 的可接受默认值。
- Node.js runtime compatibility 不是 v1 要求。
- 如果未来要面向 Node-compatible build output 或外部发布，再单独做决策。

Schema 边界：

- `StandardSchemaV1` 是 command args 和 options 的契约。
- runtime 从 `StandardSchemaV1.InferOutput` 推导 typed `ctx.args` 和 `ctx.options`。
- `defineCli` 可以接收 `schemaAdapter.toStandardJsonSchema`，让 command help 读取字段描述，同时不把 public API 绑定到某个 schema library。
- command output 不由 `command-kit` 做 schema validation；handler 自己拥有返回数据形状。
- `packages/skills` 当前使用 Valibot 作为具体 schema library。

## 备选方案

### 继续使用 `incur`

`incur` 已经能做 command routing、option parsing、help output 和 typed handlers。简单 CLI 用它没有问题。

拒绝原因：`packages/skills` 现在缺的正是 first-class rest positional arguments。如果把这段 parsing 手写到每个 command 里，表面能跑，底层 mismatch 还在。

### 包一层 `incur`

可以保留现有依赖，再补 repo-local helpers 做 validation 和 output。

拒绝原因：主要问题在 wrapper 边界之下，是 positional argument binding。wrapper 要么继承限制，要么绕过足够多 `incur`，最后其实还是在写另一个 command runtime。

### 从一开始做外部通用 CLI framework

可以一开始就把 API 当成可发布 framework 来设计。

拒绝原因：v1 的需求是这个 codebase 和 agents 的 repo-local tool layer。面向外部用户会提前引入 compatibility、documentation、packaging 和 API-stability 工作，而本地 command model 还没证明自己。

### 只做 agent tool declaration layer

agent-only declaration layer 可以避开 CLI 细节，只处理 structured inputs 和 outputs。

拒绝原因：`packages/skills` 仍然是真 CLI。这里更想要的是同一组 command definitions 同时服务 shell usage 和 agent-friendly output。

## 后果

- 未来 repo-local CLI tools 可以共享一个 command declaration model，不用每个 package 重新选择 parser 行为。
- `packages/skills` 是 `command-kit` 的验证场，重点验证 positional binding、option parsing、Standard Schema validation、help output 和 result formatting。
- 仓库会自己拥有一小层 CLI runtime 行为：argv parsing、help text、error formatting、JSON-mode output suppression 和 output envelopes。
- `@standard-schema/spec` 成为 command runtime 的 schema dependency。
- 具体 command package 可以选择任何 Standard Schema-compatible library；当前 `packages/skills` 使用 Valibot。
- Bun 是 v1 假定 runtime。本地 TypeScript 执行因此更简单，代价是 Node.js compatibility 被推迟。
- 实现验证后，repo guidance 应指向 `command-kit`，不要再让新的 internal CLI work 默认走 `incur`。

## 边界

v1 runtime 不包含：

- plugin systems
- automatic MCP server generation
- shell completion
- OpenAPI mounting
- custom schema DSLs 或 schema-library-specific public APIs
- external publish-readiness guarantees

这些能力等 repo-local runtime 先在 `packages/skills` 中证明有用后，再重新讨论。
