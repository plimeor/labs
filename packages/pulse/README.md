# @plimeor/pulse

Run small local automation jobs from one CLI-owned runtime.

`pulse` is for jobs that should live beside your developer tools: warm up an
agent session, run a local check on a schedule, or keep a small recurring task
observable without wiring it into a full system scheduler. The CLI is the
control surface; the daemon is the runtime owner for schedules, active workers,
and captured stdout/stderr logs.

## Install

```sh
bun add --global @plimeor/pulse
```

Check what the installed CLI can see:

```sh
pulse available
```

Install daemon autostart when you want scheduled PULSEs to survive terminal
sessions:

```sh
pulse daemon install
```

`pulse daemon install` creates and activates a user LaunchAgent on macOS. Other
platforms report unsupported.

## Mental Model

A PULSE is a Bun module with two required exports:

- `name`: stable CLI identity, such as `daily-note`
- `run()`: the work to execute

Add `schedule` when the PULSE should be enableable by the daemon:

- Manual PULSE: no `schedule`; can be run on demand.
- Scheduled PULSE: has `schedule`; can be enabled, disabled, reloaded, and run
  on demand.

The catalog contains built-in PULSEs plus custom PULSEs you install from local
files. Installing a custom PULSE records its entry file path and SHA256. If that
entry file changes later, `pulse` refuses to run the installed copy until you
approve it with `pulse update <name>`.

## First Scheduled PULSE

List available PULSEs:

```sh
pulse available
```

Enable the built-in warmup PULSE:

```sh
pulse enable usage-window-warmup
```

Inspect it:

```sh
pulse status usage-window-warmup
pulse list
```

Run it immediately, without waiting for its schedule:

```sh
pulse run usage-window-warmup
```

Read its captured output:

```sh
pulse logs usage-window-warmup
```

## Write A PULSE

Manual PULSE:

```ts
export const name = 'daily-note'

export async function run() {
  console.log('daily note pulse')
}
```

Scheduled PULSE:

```ts
export const name = 'daily-note'
export const schedule = '0 9 * * *'

export async function run() {
  console.log('daily note pulse')
}
```

Rules:

- `name` must match `/^[a-z0-9][a-z0-9-]{0,62}$/`.
- `run` must be exported as a function.
- `schedule`, when present, must be a string accepted by `Bun.cron.parse`.
- A PULSE without `schedule` is manual and cannot be enabled.

Keep module top-level code boring. `pulse install` and `pulse update` import the
file to read metadata, so top-level side effects run during those commands.
Put the actual work inside `run()`.

## Use A Local File

Run a file once without installing it:

```sh
pulse run ./daily-note.ts
```

Install it into the catalog:

```sh
pulse install ./daily-note.ts
```

`pulse install <file>` asks before importing the file, validates the exports,
shows the loaded metadata, asks again before saving it, and can optionally enable
a scheduled PULSE immediately.

After editing an installed custom PULSE:

```sh
pulse update daily-note
```

`pulse update <name>` re-imports the original entry file, refreshes the recorded
SHA256, and reloads daemon runtime when the PULSE is enabled and scheduled. The
recorded hash covers the entry file only; transitive local imports are not
hashed in this version.

Remove an installed custom PULSE:

```sh
pulse uninstall daily-note
```

Built-in PULSEs cannot be uninstalled.

## Operate Runtime

```sh
pulse available
pulse list
pulse status <name>
pulse logs [name]

pulse enable <name>
pulse disable <name>
pulse reload <name>
pulse run <name>

pulse daemon start
pulse daemon stop
pulse daemon restart
pulse daemon status
pulse daemon uninstall
```

Use `reload` when the PULSE definition should be re-read and daemon scheduling
should be reconciled. It does not run the PULSE immediately. Use `run` for an
immediate one-shot execution.

Use `daemon install` again after relinking or upgrading the `pulse` package
itself so the LaunchAgent records the current Bun executable, package path,
`PULSE_HOME`, and `PATH`. Use `daemon restart` when the installed LaunchAgent or
manual daemon should restart without rewriting its configuration. PULSE-level
commands do not have a `restart`; `restart` only applies to the daemon.

On macOS, `pulse daemon status` reports both the daemon socket state and the
LaunchAgent state. `pulse daemon stop` unloads an installed LaunchAgent for the
current `PULSE_HOME`; `pulse daemon start` loads it again. If autostart is not
installed, these commands fall back to the local detached daemon process.

When a schedule fires, the daemon starts a managed child process, captures its
stdout and stderr, records a runtime event, and skips overlapping runs for the
same PULSE.

## Logs And State

Default state lives under:

```txt
~/.pulse/
  state.json
  runtime.json
  daemon.pid
  daemon.sock
  logs/
```

Set `PULSE_HOME` to use another directory.

Managed child output is captured here:

```txt
~/.pulse/logs/<name>-out.log
~/.pulse/logs/<name>-error.log
~/.pulse/logs/<name>.jsonl
```

Inside `run()`, write logs to the normal process streams:

```ts
console.log('stdout line')
console.error('stderr line')
await Bun.write(Bun.stdout, 'stdout line\n')
await Bun.write(Bun.stderr, 'stderr line\n')
```

`pulse logs [name]` reads the captured stdout, stderr, and event files. Without
`name`, it prints logs for every catalog PULSE. `pulse log` is an alias.

Direct writes to other files, such as `Bun.write('/tmp/pulse.log', ...)`, stay
in those files and are not redirected into Pulse-managed logs.

## Built-In PULSEs

Built-in PULSEs are available in the catalog but are not enabled automatically.

`usage-window-warmup` checks Claude and Codex through `@plimeor/harness`. When a
CLI is detected, it sends a minimal health-check prompt through that adapter.
Its schedule is `0 4,9,14,23 * * *` in Bun's in-process UTC cron, matching
07:00, 12:00, 17:00, and 22:00 in UTC+8.

This is best-effort. Claude, Codex, and their providers decide how requests
count toward usage windows.

## Safety Boundaries

Custom PULSE files are executable Bun modules. `pulse` protects the installed
entry point by prompting before import and by refusing changed entry files until
`pulse update <name>` succeeds. It does not sandbox the code, hash transitive
imports, or redirect arbitrary file writes.

Use `pulse status <name>` to check catalog metadata, enabled state, source path,
recorded hash state, and daemon runtime. Use `pulse logs <name>` when a run does
not behave as expected.
