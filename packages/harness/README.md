# @plimeor/harness

Drive CLI coding agents from one TypeScript API.

`@plimeor/harness` lets your app detect installed agents, check whether they
can answer a prompt, run tasks, decode common output modes, and install
user-scope integrations such as skills, MCP servers, and hooks.

It is an SDK only. It does not expose a CLI.

## Install

```sh
bun add @plimeor/harness
```

## Pick an Agent

Importing the package registers the built-in adapters.

```ts
import { harness } from '@plimeor/harness'

const available = await harness.detectAll()

for (const agent of available) {
  if (agent.detected) {
    console.log(agent.id, agent.binary?.identity)
  }
}
```

Open the adapter you want to use:

```ts
const handle = await harness.open('codex', {
  cwd: process.cwd()
})
```

## Check Health

Health checks answer one product question: can this CLI run right now?

```ts
const health = await handle.health.check()

if (!health.success) {
  throw new Error(health.message)
}
```

A successful report means the CLI is installed and produced output for a smoke
prompt. Codex and Claude health checks also verify that `google.com` is
reachable before running the smoke prompt. A failed report includes a message
suitable for showing to a user.

## Run a Task

For the common path, pass a request directly to `process.run()`.

```ts
const run = await handle.process.run({
  prompt: 'Summarize this repository in three bullets.',
  timeoutMs: 60_000
})

const result = await run.result

console.log(result.finalText)
```

`run.stdout` and `run.stderr` are async iterables, so you can stream raw process
output while still awaiting `run.result`.

Use `plan()` first when your app needs to show or approve the exact command
before spawning it:

```ts
const plan = await handle.process.plan({
  prompt: 'Summarize this repository in three bullets.'
})

console.log(plan.command, plan.args)

const run = await handle.process.run(plan)
```

## Output Modes

Text output is the default:

```ts
const run = await handle.process.run({
  prompt: 'Reply with OK.'
})
```

Use JSONL when the adapter supports native JSON events:

```ts
const run = await handle.process.run({
  output: { mode: 'jsonl' },
  prompt: 'Reply with OK.'
})

for await (const event of run.events) {
  if (event.type === 'json') {
    console.log(event.value)
  }
}
```

Use structured output when you need a validated object. Schemas use
`StandardSchemaV1`, so libraries such as Valibot can provide the schema.

```ts
import * as v from 'valibot'

const Answer = v.object({
  answer: v.string()
})

const run = await handle.process.run({
  output: { mode: 'structured', schema: Answer },
  prompt: 'Return JSON with an answer field.'
})

const result = await run.result

console.log(result.structured.answer)
```

Unsupported output modes fail during `process.plan()` with `HarnessPlanError`.
Invalid JSON or failed structured validation fails from `run.result` with
`HarnessRunOutputError`.

## Install Extensions

Extensions describe user-scope resources your app wants the selected agent to
know about.

```ts
const extension = {
  id: 'acme-tools',
  resources: {
    skills: ['./skills/review'],
    mcpServers: {
      'acme-tools__docs': {
        command: 'bun',
        args: ['run', 'docs-mcp.ts'],
        env: { DOCS_ROOT: '/workspace/docs' }
      }
    },
    hooks: [
      {
        name: 'acme-tools__pre-tool',
        event: 'PreToolUse',
        command: 'bun run hooks/pre-tool.ts'
      }
    ]
  }
}
```

Check compatibility before installing:

```ts
const check = await handle.extensions.check(extension)

if (!check.compatible) {
  console.error(check.issues)
  return
}
```

Install and uninstall through the adapter:

```ts
const installed = await handle.extensions.install(extension)

if (!installed.success) {
  console.error(installed.issues)
}

await handle.extensions.uninstall('acme-tools')
```

Skills are filesystem paths. Relative paths resolve from `HarnessContext.cwd`.
MCP servers are stdio process configs. Hooks use the target agent's native event
names.

Install is all-or-nothing: unsupported resources or conflicts prevent native
writes. By default, existing targets are replaceable only when the adapter can
prove they already match the requested extension resource. Kiro skill and hook
targets use extension-generated names and are replaced when a requested resource
resolves to the same target name. Uninstall only removes resources that the
adapter can still prove belong to the extension.

## Built-In Adapters

| Adapter | CLI command | Output modes | Extensions |
| --- | --- | --- | --- |
| `codex` | `codex` | `text`, `jsonl`, `structured` | skills, MCP servers, hooks |
| `claude` | `claude` | `text`, `jsonl`, `structured` | skills, MCP servers, hooks |
| `kiro` | `kiro-cli` | `text` | skills, MCP servers, hooks |
| `pi` | `pi` | `text`, `jsonl` | skills |

## Context

Pass `HarnessContext` when your app needs deterministic paths or environment:

```ts
const handle = await harness.open('kiro', {
  cwd: '/workspace/project',
  env: { KIRO_HOME: '/tmp/kiro-home' },
  home: '/tmp/user-home'
})
```

- `cwd` is the default working directory for runs and relative extension paths.
- `env` patches the process environment used by detection, planning, and native
  adapter commands.
- `home` controls where user-scope config is resolved.
