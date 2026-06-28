---
date: 2026-06-29
status: implemented
---

# Pulse 管理器整体方案

## Clarification Status

需求已足够进入实现规划。`pulse` 的方向从单个 agent cron 包调整为本地 PULSE 管理器；`usage-window-warmup` 只是第一个内置 PULSE。

本方案采用以下判断：

- package 建议改名为 `@plimeor/pulse`，bin 为 `pulse`。
- 只提供 CLI，不暴露 public `src/index.ts`。
- 本期支持 custom PULSE：用户可以直接 install 一个本地 Bun 文件。
- scheduled PULSE 由 `pulse daemon` 管理，不再让 OS scheduler 直接启动每个 PULSE worker。
- 定时能力仍使用 Bun：daemon 内部使用 in-process `Bun.cron(schedule, handler)`。

## Implementation Status

第一阶段已实现。`@plimeor/pulse` 是 CLI-only package，daemon 管理 built-in/custom PULSE catalog、enabled state、Bun in-process schedule、managed child runs、reload、status 和 stdout/stderr logs。`usage-window-warmup` 作为 built-in scheduled PULSE 固定通过 Harness health check 尝试 Claude 和 Codex；其 cron 使用 Bun in-process UTC schedule `0 4,9,14,23 * * *`，对应 UTC+8 的 07:00、12:00、17:00、22:00。

已验证命令：

- `bun run --filter @plimeor/pulse test`
- `bun run --filter @plimeor/pulse lint`
- `bun run --filter @plimeor/pulse prepack`
- `bun run check`
- `bun run lint`

已做 side-effect-free CLI smoke：临时 `PULSE_HOME` 下验证 daemon start/status/stop、`available`、`logs`/`log` 无参、`reload usage-window-warmup` 后 `status` 读取新 schedule。真实 LaunchAgent 安装和真实 Claude/Codex prompt 执行未纳入自动验证。

## Background / Problem

当前 `@plimeor/agent-pulse` 实现主要围绕 `usage-window-warmup`，通过 `Bun.cron(path, schedule, title)` 安装 OS-level cron，并由 PULSE 自己实现 `install/remove/run/status`。

这个方向存在三个问题：

- package 名称和 CLI 语义仍然绑定 agent，而目标已经变成通用 PULSE 管理器。
- `list/logs/reload` 需要管理器级别的运行状态和日志来源，不能由每个 PULSE 各自拼装。
- OS-level cron 直接启动 worker 后，stdout/stderr、正在运行的任务、reload、status 都脱离 `pulse` 控制。
- PM2 的 ecosystem 配置文件对本工具太重；Bun 文件可以直接执行，所以 custom PULSE 应该让开发者导出最少 metadata 和 `run()`，而不是维护额外配置 DSL。

PM2 的 log 模型是重要参考：PM2 管理进程后，将 stdout 和 stderr 写入 `$HOME/.pm2/logs`，`pm2 logs` 再读取和 stream 这些日志文件；PM2 文档也区分 out log、error log 和可选 combined log。参考：[PM2 Logs](https://pm2.keymetrics.io/docs/usage/log-management/)。

Bun cron 的两种模式也决定了边界：`Bun.cron(schedule, handler)` 在当前长进程内执行；`Bun.cron(path, schedule, title)` 注册 OS-level job。Bun 文档说明 in-process cron 不跨进程或重启，但适合 long-running servers/workers，并提供 no-overlap 行为；OS-level cron 可以跨重启，但会把调度控制权交给系统。参考：[Bun Cron](https://bun.com/docs/runtime/cron)。

## Objective

`pulse` 成为一个本地 PULSE 管理器：由 daemon 统一管理 built-in 与 custom PULSE 的 catalog、启用状态、调度、运行、reload、status 和 stdout/stderr 日志；CLI 负责向 daemon 发控制命令并展示结果。

## Scope

第一阶段包含：

- package rename：`packages/agent-pulse` -> `packages/pulse`，`@plimeor/agent-pulse` -> `@plimeor/pulse`，`agent-pulse` -> `pulse`。
- CLI commands：
  - `pulse install <file>`
  - `pulse uninstall <name>`
  - `pulse update <name>`
  - `pulse available`
  - `pulse list`
  - `pulse enable <name>`
  - `pulse disable <name>`
  - `pulse reload <name>`
  - `pulse status <name>`
  - `pulse logs [name]`
  - `pulse run <name|file>`
  - `pulse daemon start|stop|restart|status|install|uninstall`
  - PULSE 层不提供 `restart`；`restart` 只保留给 daemon 进程本身。
- `pulse daemon` 作为唯一 runtime owner。
- scheduled PULSE 在 daemon 内注册 in-process `Bun.cron(schedule, handler)`。
- scheduled tick 触发时，daemon spawn 对应 managed child process，并捕获 child stdout/stderr。
- custom PULSE 通过本地 Bun 文件安装；install/update 在导入前确认执行风险，在写入或启用前二次确认。
- `usage-window-warmup` 继续固定尝试 Claude 和 Codex adapter，不接收用户参数。
- built-in 和 custom PULSE 使用同一种单文件 Bun module 格式：导出 `name`、`run()`，以及可选 `schedule`。
- built-in PULSE 从 `src/pulses/builtin` 目录扫描；目录下每个 `.ts` 或 `.js` 文件都是一个 PULSE，加载后只进入 catalog，不自动 enable。
- state/logs 默认写入 `~/.pulse`，并支持 `PULSE_HOME` 覆盖以便测试。

授权边界：

- 实现代码和文档可以修改。
- 测试不得真实触发 Claude/Codex prompt。
- 测试不得真实安装 LaunchAgent 或其他 OS autostart 配置，除非用户明确授权。
- 测试不得 import 未受控的用户文件；custom PULSE 测试使用 fixture Bun files。

## Non-goals

- 不提供 public library API。
- 不做 PM2 的 cluster、watch、deploy、metrics、logrotate。
- 不做跨机器管理。
- 不做 `--json`、`--dry-run`、`next`。
- 不做远程 URL、npm package、Git repo 形式的 custom PULSE install；本期只支持本地 Bun 文件。
- 不做 custom PULSE 的 TypeScript type package；开发者可以写普通 Bun/TypeScript 文件并导出约定成员。
- 不保留旧 package/bin alias，当前包仍处于新建阶段，兼容层会增加无意义表面积。
- 不直接依赖 OS-level `Bun.cron(path, schedule, title)` 管理每个 scheduled PULSE。

## Required Context

实现前需要先读：

- `packages/pulse/package.json`
- `packages/pulse/README.md`
- `packages/pulse/src/cli.ts`
- `packages/pulse/src/pulses/types.ts`
- `packages/pulse/src/pulses/index.ts`
- `packages/pulse/src/pulses/builtin/usage-window-warmup.ts`
- `packages/pulse/test/pulse.test.ts`
- `packages/harness/src/types.ts`
- `packages/skills/src/commands/*.ts` 中的 `@clack/prompts` 使用方式
- Bun cron docs
- PM2 log management docs

Baseline commands before edits:

```sh
bun run --filter @plimeor/pulse test
bun run --filter @plimeor/pulse lint
bun run --filter @plimeor/pulse prepack
bun run check
```

## Planning Iteration

Review findings integrated:

- `logs` must be tied to captured stdout/stderr, not an arbitrary state file.
- `list` must come from daemon/runtime state when daemon is alive, not only from desired state.
- PULSE 层移除 `restart`，改为 `reload`；立即执行由 `run` 表达。
- daemon/autostart is a core part of the PM2-like direction, not a future footnote.
- custom PULSE 纳入本期：本地 Bun file 既是 manifest，也是 execution entry。
- Custom metadata loading directly imports the Bun file after confirmation, validates named exports, and does not define any stdout parsing protocol.
- Custom source hash gates only the entry file in this phase; transitive local imports are explicitly outside the hash guarantee.

Lean result:

- Keep one manager boundary because `list/logs/reload/status` need a runtime owner.
- Drop per-PULSE `install/remove`; lifecycle belongs to daemon/manager.
- Drop OS-level per-PULSE cron because it fragments logs and runtime control.
- Keep in-process `Bun.cron` because it satisfies the user's Bun scheduling constraint with better control.
- Avoid PM2-style config files; a custom PULSE is a Bun module with named exports.

Design gate result:

- Option A, OS-level cron per PULSE: simplest install path, but weak control over logs, reload, and runtime status.
- Option B, daemon owns scheduled PULSE runtime: more initial code than OS-level cron, but one source of truth for state/logs/reload and matches the requested management model.
- Chosen option: daemon owns scheduled runtime. Scheduled PULSE still uses Bun via in-process `Bun.cron`.
- For custom PULSE, a Bun file install beats a config DSL because the developer writes the same executable module that the daemon will run.

## Proposed Approach

### Runtime Ownership

`pulse daemon` is the runtime owner for all enabled PULSEs.

CLI commands that need runtime truth connect to the daemon. If the daemon is not running:

- `available` works without daemon.
- `daemon status` reports stopped.
- `list/status/logs` can show desired state plus `daemon: stopped`, but must not claim runtime is active.
- `enable/run/reload/disable` should start or require the daemon according to command semantics documented in README.

Recommended first implementation: management commands start the daemon if possible, then send the command. This matches PM2's ergonomic model and keeps user-facing behavior simple.

### PULSE Types

Internal contracts:

```ts
export type PulseKind = 'manual' | 'scheduled'

export type PulseMetadata = {
  kind: PulseKind
  name: string
  schedule?: string
  source: PulseSource
}
```

PULSE module 不暴露 `install/remove` 或 `workerPath`。启用、停用、reload 和日志都由 manager 操作。

### Custom PULSE File Contract

一个 custom PULSE 是一个本地 Bun module。最小文件：

```ts
export const name = 'daily-note'

export async function run() {
  console.log('daily note pulse')
}
```

scheduled PULSE 文件：

```ts
export const name = 'daily-note'
export const schedule = '0 9 * * *'

export async function run() {
  console.log('daily note pulse')
}
```

Export rules:

- `name` is required and must match `/^[a-z0-9][a-z0-9-]{0,62}$/`.
- `run` is required and must be a function.
- `schedule` is optional. When present, it must pass `Bun.cron.parse`; the PULSE kind is `scheduled`.
- If `schedule` is absent, the PULSE kind is `manual`; it can be installed and run, but not enabled.

`definePulse()` is intentionally not required. A Bun file with named exports is the authoring surface.

### Custom Install / Update Semantics

`pulse install <file>` installs a local Bun file into the catalog.

Safe install flow:

1. Resolve `<file>` to an absolute path and compute SHA256.
2. Show path, hash, and a warning that importing the file executes module top-level code.
3. Use `@clack/prompts` to confirm before any import happens; non-TTY install/update aborts before import unless an explicit future non-interactive approval mode is added.
4. Import the file in the CLI process and validate exports strictly.
5. Reject name collisions with built-in and installed PULSEs.
6. Show detected metadata and ask for final install confirmation.
7. Write installed state.
8. If kind is `scheduled`, ask whether to enable now.

`pulse update <name>` re-runs the same import and confirmation flow for an installed custom PULSE. The recorded SHA256 covers the entry file only; transitive local imports are not hashed in this phase. If the entry file hash changed, daemon must not run that entry file again until `update` succeeds.

Enabled scheduled PULSEs reload their cron handle after a successful update without immediately running.

`pulse uninstall <name>` removes only custom PULSEs. Built-in PULSEs cannot be uninstalled. If the custom PULSE is enabled, uninstall must first confirm that it will disable the PULSE and stop active runtime; non-TTY uninstall of an enabled PULSE aborts.

### Runner Model

每个 PULSE 文件就是自己的 execution entry。daemon 不直接在 daemon 进程内调用 PULSE 的业务函数，而是 spawn managed child process：

```txt
daemon Bun.cron tick
  -> spawn bun <pulse runner> <pulse name>
  -> capture stdout -> ~/.pulse/logs/<name>-out.log
  -> capture stderr -> ~/.pulse/logs/<name>-error.log
  -> append runtime event -> ~/.pulse/logs/<name>.jsonl
```

runner 根据 catalog 判断执行入口：

- built-in PULSE：导入 `src/pulses/builtin` 下对应 PULSE file。
- custom PULSE：先比较 entry file SHA256；匹配 installed state 时才导入 Bun source file 并调用其 `run()`。

这样 scheduled 和 custom PULSE 都有真实 stdout/stderr 日志来源，`pulse logs` 读取 manager-owned log files。

### Active Run Semantics

The manager enforces one active run per PULSE.

- A scheduled cron tick starts a worker only when no active run exists for that PULSE.
- If a scheduled tick fires while a run is active, daemon records a skipped-run event in `<name>.jsonl` and leaves the existing child running.
- `pulse run <name>` refuses when that PULSE already has an active run.
- `pulse reload <name>` for scheduled PULSEs rebuilds the cron handle but does not kill an active one-off run.
- `pulse disable <name>` stops the cron handle and also terminates any active run for that PULSE.

### PULSE Reload Semantics

`pulse reload <name>` 重新读取 PULSE 定义并让 daemon 重新 reconcile runtime。它不等同于立即执行；立即执行始终使用 `pulse run <name|file>`。

For scheduled PULSE:

1. 重新读取 built-in metadata 或 installed custom metadata。
2. 如果 custom source hash changed，要求先运行 `pulse update <name>`，不静默加载新代码。
3. 停止该 PULSE 当前的 `CronJob` handle。
4. 按当前 metadata 重新注册 `Bun.cron(schedule, handler)`。
5. 不立即启动新的 worker child；需要立即执行时使用 `pulse run <name>`。
6. 更新 runtime state：`lastReloadAt`、`nextRunAt`、`status`。

For manual PULSE:

- `reload` checks installed metadata and entry hash state. If the entry file changed, it refuses to refresh and tells the user to run `pulse update <name>`; it has no runtime effect.

### Enable / Disable / Run Semantics

`enable <name>`：

- manual PULSE cannot be enabled.
- scheduled PULSE writes desired state, notifies daemon reconcile, and registers in-process cron.
- enable does not run scheduled workers immediately, avoiding model calls or other external work on enable.

`disable <name>`：

- 移除 desired state 中的 enabled 标记。
- 停止 scheduled cron handle。
- 如果 active run 正在运行，按 stop 流程终止。

`run <name>`：

- 通过 daemon 启动一次 managed worker child。
- 不改变 enabled state。
- 对 installed custom PULSE，entry file SHA256 必须匹配 installed state；不匹配时拒绝运行并提示 `pulse update <name>`。
- stdout/stderr 同样进入日志。

`run <file>`：

- 在一个 managed child 中导入本地 Bun file、校验 exports、调用 `run()`；不能先 import 一次再另起 runner 导致顶层代码执行两次。
- 不写 catalog，不改变 enabled state。
- 仍使用 managed runner 捕获 stdout/stderr。

### List / Status Semantics

`available`：

- 读取内置 PULSE catalog 和已安装 custom PULSE catalog。
- 不依赖 daemon。

`list`：

- daemon running 时，以 daemon runtime snapshot 为准。
- daemon stopped 时，只能显示 desired enabled PULSEs，并标记 `daemon: stopped`。
- 不把 desired state 误报为 active runtime。

`status <name>`：

- 显示 catalog metadata。
- 显示 desired enabled state。
- 对 custom PULSE 显示 source path、recorded SHA256 和当前文件是否 changed。
- 显示 daemon runtime state。
- scheduled PULSE 显示 schedule、next run、last run、active child pid、last exit。
- `usage-window-warmup` 额外显示 Claude/Codex detection。

### Logs Semantics

`pulse logs [name]` 默认读取 manager 捕获的 stdout/stderr event stream，并按 stream 标记输出。未传 `name` 时展示所有 catalog PULSE 的日志；`pulse log` 是 alias。

持久文件：

```txt
~/.pulse/logs/<name>-out.log
~/.pulse/logs/<name>-error.log
~/.pulse/logs/<name>.jsonl
```

第一阶段只要求 `logs [name]` 展示最近日志；持续 tail、`--out`、`--err`、logrotate 后续再做。数据层先保留 out/error 分流，避免未来补功能时丢失来源。

### State Layout

默认 home：

```txt
~/.pulse/
  state.json
  runtime.json
  daemon.pid
  daemon.sock
  logs/
```

`PULSE_HOME` 可覆盖该目录。

`state.json` 保存 desired state：

```json
{
  "version": 1,
  "installed": {
    "daily-note": {
      "kind": "scheduled",
      "schedule": "0 9 * * *",
      "source": {
        "type": "file",
        "path": "/Users/plimeor/pulses/daily-note.ts",
        "sha256": "..."
      },
      "installedAt": "2026-06-29T00:00:00.000Z"
    }
  },
  "enabled": {
    "usage-window-warmup": {
      "kind": "scheduled",
      "enabledAt": "2026-06-29T00:00:00.000Z"
    }
  }
}
```

`runtime.json` 是 daemon 写出的快照，只用于 CLI fallback/read-only display，不作为调度 source of truth。

State writes use a single local lock under `PULSE_HOME` and write through temp file + atomic rename. Mutating commands prefer daemon-owned writes when daemon is running; if the daemon is stopped, CLI uses the same locked state writer and daemon reconciles from `state.json` on next start.

### Daemon Autostart

`pulse daemon install` 安装当前用户级 autostart：

- macOS：LaunchAgent。
- Linux：systemd user service，若不可用再记录 unsupported。
- Windows：先作为后续平台项，第一阶段可标记 unsupported，除非实现成本可控。

daemon 启动后读取 `state.json`，reconcile enabled PULSEs，注册 scheduled cron。

## Work Sequence

1. Baseline and rename
   - Purpose: 建立新 package 身份。
   - Touchpoints: package directory, package metadata, README, lockfile。
   - Proof: old name 不再出现在 package public surface；`prepack` 仍能跑 help。

2. Define catalog and PULSE contracts
   - Purpose: 把 built-in/custom PULSE 统一到单文件 module contract，同时保留 kind/source 边界。
   - Touchpoints: `src/pulses/types.ts`, `src/pulses/index.ts`, `usage-window-warmup` module。
   - Proof: catalog test 覆盖 `usage-window-warmup` name/kind/schedule；fixture directory 能扫描 scheduled PULSE 文件。

3. Add custom PULSE loader and validator
   - Purpose: 支持 `pulse install <file>` 和 `pulse run <file>` 的导入确认和强校验。
   - Touchpoints: export schema, `@clack/prompts` confirmation flow。
   - Proof: fixture files 覆盖 valid, missing name, invalid name, missing run, invalid schedule, name collision, hash changed, non-TTY refusal before import。

4. Add state/log path helpers
   - Purpose: 统一 `PULSE_HOME`、state、runtime、logs 路径。
   - Touchpoints: new internal state module。
   - Proof: temp `PULSE_HOME` unit tests，不写真实 home；state writes use lock + temp file + atomic rename。

5. Add managed child runner
   - Purpose: daemon 统一 spawn child 并捕获 stdout/stderr。
   - Touchpoints: runner module, log writer, PULSE file command integration。
   - Proof: built-in fixture 和 custom fixture 输出 stdout/stderr 后，out/error/event log 都存在且内容正确；`run <file>` fixture 顶层代码只执行一次。

6. Add daemon runtime
   - Purpose: 管理 enabled PULSEs、scheduled cron handles、active workers。
   - Touchpoints: daemon module, command channel, runtime snapshot。
   - Proof: fake scheduled PULSE 可 enable/list/status/reload/disable；manual PULSE enable 被拒绝；active scheduled tick 被 skip 并写 event；changed custom entry 被拒绝运行；不触发 Claude/Codex。

7. Implement CLI commands
   - Purpose: 将 public CLI 绑定到 manager/daemon。
   - Touchpoints: `src/cli.ts`。
   - Proof: CLI smoke with temp `PULSE_HOME` 覆盖 `install/available/list/status/run <file>`；management commands 在 fake daemon/test mode 下验证。

8. Update `usage-window-warmup`
   - Purpose: 保留固定 Claude/Codex warmup 行为，改成单文件 PULSE execution。
   - Touchpoints: `src/pulses/builtin/usage-window-warmup.ts`。
   - Proof: status 只做 detection；run/reload 测试使用 harness mock 或 fixture，不真实调用模型。

9. Document public behavior
   - Purpose: README 拥有 CLI、state、logs、daemon/autostart、limitations 的稳定说明。
   - Touchpoints: package README。
   - Proof: README 命令和 CLI help 一致。

## Acceptance, Regression Evidence, and Verification

Observable acceptance:

- `pulse available` lists built-in and installed custom PULSEs without daemon.
- `pulse install ./daily-note.ts` confirms before import, validates exports, records source path/hash, and can optionally enable after a second confirmation.
- non-TTY `pulse install ./daily-note.ts` aborts before importing the file.
- `pulse update daily-note` is required before daemon runs a changed custom entry file.
- `pulse run ./daily-note.ts` runs a local Bun file once without installing it and does not execute module top-level code twice.
- `pulse enable <manual-pulse>` fails with a clear message.
- `pulse enable usage-window-warmup` enables it in desired state and daemon runtime.
- overlapping scheduled ticks do not start concurrent workers for the same PULSE.
- `pulse list` distinguishes daemon runtime from desired state fallback.
- `pulse reload usage-window-warmup` is valid for scheduled PULSE and rebuilds the cron handle without immediately running it.
- `pulse logs usage-window-warmup` reads captured stdout/stderr logs, not arbitrary state text.
- `pulse logs` reads captured stdout/stderr logs for every catalog PULSE.
- `usage-window-warmup` still fixedly probes Claude and Codex through `@plimeor/harness`.
- No public `index.ts` export is introduced.

Regression commands:

```sh
bun install
bun run --filter @plimeor/pulse test
bun run --filter @plimeor/pulse lint
bun run --filter @plimeor/pulse prepack
bun run check
```

Manual checks requiring explicit authorization:

- `pulse daemon install`
- `pulse enable usage-window-warmup` against real home
- `pulse run usage-window-warmup` against real Claude/Codex
- autostart after logout/reboot

Regression gaps:

- Cross-platform daemon autostart needs platform-specific verification.
- In-process `Bun.cron` interprets schedules in UTC. If local-time schedules are required, that becomes a separate scheduling design decision.

## Risks and Rabbit Holes

- Daemon control channel can grow into a framework. Containment: implement only local single-user commands needed by CLI.
- Logs can become a PM2 clone. Containment: first version captures out/error/event files and reads recent logs only.
- Autostart can become platform-heavy. Containment: macOS first if necessary; mark Linux/Windows unsupported rather than inventing untested behavior.
- Custom PULSE import executes user code at module top level. Containment: show path/hash warning and require confirmation before import.
- Custom entry source can change after install. Containment: recorded entry SHA256 gates runtime; `pulse update <name>` is required before changed entry code runs.
- Custom transitive imports can change without changing the entry file hash. Containment: document the entry-hash boundary; upgrade to dependency graph hashing only if users need stronger supply-chain guarantees.
- `reload` can be confused with `run`. Containment: reload never triggers a scheduled run; immediate execution uses `run`.
- UTC schedule semantics may surprise users. Containment: document UTC and add a pause condition before promising local-time schedules.
- Active worker kill behavior can corrupt work if future PULSEs do non-idempotent work. Containment: worker contract must define graceful SIGINT handling before such PULSEs are added.

## Checkpoints

- Before daemon autostart implementation: confirm target platform priority.
- Before real local validation: confirm whether installing LaunchAgent and triggering Claude/Codex is authorized.

## Stop Condition

Stop when the plan is implemented such that `pulse` is a CLI-only package with daemon-managed built-in and custom PULSEs, Bun-file install/update, PM2-style stdout/stderr log ownership, PULSE reload support, and verified behavior through tests and side-effect-free smoke checks.

## Pause Conditions

Pause if:

- The package/bin name changes from `@plimeor/pulse` / `pulse`.
- The first implementation must support Windows autostart.
- Schedules must be interpreted in local time rather than UTC.
- Custom PULSE must support remote URLs, npm packages, or Git repos in this phase.
- Real Claude/Codex prompt execution is required for verification.
- Real daemon autostart installation is required for verification.

## Progress Report Format

For implementation, report:

- current slice
- files touched
- verification command and result
- skipped external side effects
- next checkpoint or pause condition
