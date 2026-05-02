# 规格：command-kit

## 目标

`@plimeor/command-kit` 是 Bun-runtime-first 的 command declaration package，用于 repo-local CLI 和 agent tools。

第一个 production user 是 `packages/skills`。Runtime 要替换它的 command layer，同时保留业务行为，并补上旧 command stack 表达不了的 positional argument model：

```bash
skills add plimeor/agent-skills code-scope-gate writing-blog
```

`plimeor/agent-skills` 绑定到 `ctx.args.source`；后续 positional values 绑定到 `ctx.args.skills` array。这是 `command-kit` 的第一条硬需求。

## 当前范围

- Bun first、TypeScript、ESM。
- 通过 `defineCommand(name, config)` 声明 commands。
- 通过 `defineGroup(name, config)` 声明 one-level command groups。
- 通过 `defineCli({ ..., schemaAdapter })` 声明 CLI。
- `args` 和 `options` schemas 使用 `@standard-schema/spec` 的 `StandardSchemaV1`。
- Help metadata 可以使用 `@standard-schema/spec` 的 `StandardJSONSchemaV1`。
- `packages/skills` 使用 Valibot 做 validation，并用 `@valibot/to-json-schema` 转换 help metadata。
- `command-kit` 不对 command output 做 schema validation。

## 非目标

- 替代 full-featured CLI frameworks。
- 自己发明 custom schema DSL。
- 自动生成 MCP server。
- shell completion。
- OpenAPI mounting。
- global `--format json`。
- plugin system。
- nested command groups、group aliases 或 group-level schema adapters。

## 依赖

`packages/command-kit` 只需要这些依赖：

- `@standard-schema/spec`
- `@types/json-schema`，用于 TypeScript JSON Schema helper types

`packages/skills` 依赖：

- `@plimeor/command-kit`
- `valibot`
- `@valibot/to-json-schema`
- `@clack/prompts`

TypeBox 不在当前 command-kit 或 skills command contract 内。

## 公开接口

```ts
import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec'

type SchemaAdapter = {
  toStandardJsonSchema: (schema: any) => StandardJSONSchemaV1 | undefined
}

type CommandArgBinding<ArgsSchema extends StandardSchemaV1> = {
  name: Extract<keyof StandardSchemaV1.InferOutput<ArgsSchema>, string>
  optional?: boolean
  rest?: boolean
}

type CommandOptionAliases<OptionsSchema extends StandardSchemaV1> =
  Extract<keyof StandardSchemaV1.InferOutput<OptionsSchema>, string> extends never
    ? never
    : Partial<Record<Extract<keyof StandardSchemaV1.InferOutput<OptionsSchema>, string>, string>>

type CommandConfig<ArgsSchema extends StandardSchemaV1, OptionsSchema extends StandardSchemaV1> = {
  aliases?: string[]
  args?: ArgsSchema
  description: string
  optionAliases?: CommandOptionAliases<OptionsSchema>
  options?: OptionsSchema
  argBindings?: CommandArgBinding<ArgsSchema>[]
  run: (ctx: CommandContext<ArgsSchema, OptionsSchema>) => unknown | Promise<unknown>
}

type CommandGroupConfig = {
  commands: CommandDefinition[]
  description: string
}

function defineCommand(name: string, config: CommandConfig): CommandDefinition

function defineGroup(name: string, config: CommandGroupConfig): CommandGroupDefinition

function defineCli(definition: {
  commands: Array<CommandDefinition | CommandGroupDefinition>
  description: string
  name: string
  schemaAdapter?: SchemaAdapter
}): CliDefinition & { serve(argv: string[]): Promise<void> }
```

`ctx.args` 和 `ctx.options` 从 `StandardSchemaV1.InferOutput<typeof schema>` 推导。某个 command 不需要 args 或 options 时，调用方省略对应字段，command-kit 将其视为空对象。

`argBindings[].name` 必须是 command args schema output 的 string key。`optionAliases` 的 keys 必须是 command options schema output 的 string keys。例如 `args` 输出 `{ name: string; age: string }` 时，binding names 只允许 `'name' | 'age'`。

`command-kit` 只校验声明出来的 `args` 和 `options` schemas。跨字段 business rules 放在具体 command implementation 里。

## 命令组

Command groups 只解决 one-level subcommand routing，例如：

```bash
code-wiki project add web-app --repo git@github.com:org/web-app.git
code-wiki project list
```

Group 只是 declaration：一个 `name`、一个 `description`、一组扁平 `commands`。不支持 aliases、group-level schema adapter 或 nested groups。Group subcommands 使用 parent CLI 的 `schemaAdapter`，help 使用派生 CLI name：

```text
Usage: code-wiki project <command>
Usage: code-wiki project add <project> [options]
```

## Standard Schema 校验

Runtime 使用以下方式校验用户输入：

```ts
await schema['~standard'].validate(value)
```

成功时使用 `result.value`；失败时把 `result.issues` 规范化为 `CommandRuntimeError`。

校验顺序：

1. 把 raw argv 解析为 args object 和 options object。
2. 用 command 的 `args` `StandardSchemaV1` 校验 args；未声明时使用内部 empty-object schema。
3. 用 command 的 `options` `StandardSchemaV1` 校验 options；未声明时使用内部 empty-object schema。
4. 只有 schema validation 成功后才调用 `run(ctx)`。

## JSON Schema Metadata

Standard Schema 不提供 option names、option kinds 或 descriptions 的 runtime introspection。所以 `command-kit` 在能拿到 JSON Schema metadata 时就用它。

解析顺序：

1. 如果 schema 本身实现 `StandardJSONSchemaV1`，直接使用。
2. 否则，如果 `defineCli` 提供 `schemaAdapter.toStandardJsonSchema`，使用该 adapter。
3. 如果转换不可用或抛错，继续执行，但不显示 field descriptions。

Help output 从 JSON Schema object properties 读取 positional arguments 和 options 的 `description`。拿不到 JSON Schema 时，只省略 field descriptions，不影响 command 运行。

Option parsing 也使用 JSON Schema metadata 识别 declared option names 和 basic kinds：

- boolean
- string
- array

带 options 的 commands 应提供实现 `StandardJSONSchemaV1` 的 schemas，或通过 CLI-level adapter 补 metadata。

## 参数绑定

支持形式：

```ts
argBindings: [{ name: 'source' }]
argBindings: [{ name: 'input', optional: true }]
argBindings: [{ name: 'source' }, { name: 'skills', optional: true, rest: true }]
```

规则：

- 一个 arg binding 把一个 positional argv value 映射到 `args` schema output 的属性。
- non-rest binding 消费一个 raw argument。
- rest binding 消费所有剩余 raw arguments。
- 只有最后一个 binding 可以使用 `rest: true`。
- 缺少 required arg bindings 时，在 command execution 前失败。
- 没有 rest binding 却出现额外 argv values 时，报 unknown argument error。
- 最终 validation 属于 `args` Standard Schema。

## 选项

支持形式：

- `--global`、`--dry-run`、`--locked`
- 通过 `optionAliases` 支持 `-g`
- `--ref main`、`--commit abc123`、`--output path`
- 当 JSON Schema property 是 array 时，支持 repeatable string options

Unknown options 在 command execution 前失败。Parsed values 继续交给 `options` Standard Schema 校验。

Negated boolean options 不在范围内。

## 输出模型

```ts
type CommandResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: CommandError }

type CommandError = {
  code: string
  message: string
  details?: unknown
}
```

`run(ctx)` 可以返回 raw data，也可以返回完整 success envelope。Runtime 统一把 successful values 规范化为 `{ ok: true, data }`。

Thrown errors 统一规范化为 `{ ok: false, error }`。

Stable error codes：

- `COMMAND_NOT_FOUND`
- `INVALID_ARGUMENTS`
- `INVALID_OPTIONS`
- `UNKNOWN_OPTION`
- `UNKNOWN_ARGUMENT`
- `MISSING_ARGUMENT`
- `COMMAND_FAILED`

## JSON 模式

没有 global JSON mode。Command 只有声明 boolean `json` option 才 opt in；未声明 `json` 的 command 收到 `--json` 时，直接按 unknown option 处理。

JSON mode 中：

- stdout 只包含 JSON result envelope。
- validation 和 `run(ctx)` 执行期间，command stdout/stderr 会被 suppress。
- command handlers 不读取 runtime format field。
- 可能 prompt 的 commands 在 prompt 前调用 `ctx.assertInteractive()`；JSON mode 下它会抛错，提示 caller 移除 `--json`。

第一轮 skills migration 只让 `skills list` 声明 `--json`。

## Skills 迁移契约

`packages/skills` 使用 Valibot schemas 定义 args 和 options：

- Field shape 和 type validation 位于 Valibot object schemas。
- Parameter constraints 使用 `v.check`。
- Cross-field business rules 位于具体 command implementation。
- Help descriptions 使用 Valibot `v.description`。
- CLI 将 `schemaAdapter: { toStandardJsonSchema }` 传给 `defineCli`。

Valibot `check` actions 是 validation logic，不是 JSON Schema。command-kit 读取 help 和 option metadata 时要求 Standard JSON Schema converter 忽略 `check` actions；runtime validation 仍然通过 Standard Schema 使用原始 Valibot schemas，所以 args/options parameter constraints 仍由这些 schemas 拥有。

## 测试策略

Runtime tests 只盯 public behavior：

- first positional 加 rest-array binding
- missing、extra 和 unknown arguments
- boolean、string、alias 和 repeatable options
- args、options 和 request validation 的 Standard Schema validation failures
- 从 JSON Schema metadata 派生 help descriptions
- JSON mode suppress command output，并只写 envelope

Skills tests 只覆盖这次迁移影响到的 command compatibility：

```bash
skills add plimeor/agent-skills
skills add plimeor/agent-skills code-scope-gate writing-blog
skills remove code-scope-gate writing-blog
skills list -g --json
skills sync -g --dry-run
skills migrate -g
```

## 成功标准

- `packages/command-kit` 没有 TypeBox dependency 或 TypeBox-specific API。
- `packages/command-kit` 接受 `StandardSchemaV1` 作为 args 和 options，并允许 command 不需要时省略任一字段。
- `defineCli` 接受 optional `schemaAdapter.toStandardJsonSchema`。
- `defineCli` 接受用 `defineGroup` 声明的 one-level command groups。
- Command groups 不支持 aliases、group-level schema adapters 或 nested groups。
- JSON Schema metadata 可用时，help output 显示 field descriptions；不可用时省略。
- `packages/skills` 使用 Valibot 而不是 TypeBox。
- `packages/skills` parameter validation rules 使用 Valibot `check` 实现。
- `skills add plimeor/agent-skills code-scope-gate writing-blog` 正确绑定 source 和 skills。
- `skills remove code-scope-gate writing-blog` 正确绑定 skill names array。
- 只有 `skills list` 接受 `--json`。
- JSON mode 只写 result envelope。
- `bun run check`、`bun run lint` 和相关 Bun tests 通过。
