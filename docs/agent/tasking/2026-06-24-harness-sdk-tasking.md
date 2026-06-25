---
date: 2026-06-24
status: completed
---

# @plimeor/harness SDK Implementation Tasking

Plan: `docs/plans/2026-06-24-harness-sdk-plan.md`.

This tasking record converts the accepted harness SDK plan into a
foundation-first execution graph. It does not redesign the plan. Adapter-specific
CLI details that are not yet proven in the codebase are called out as a blocker
for the built-in adapter implementation task.

## Task Graph

Execution order: `T001 -> T002 -> T003 -> T004 -> T005 -> T006 -> T007 -> T008`.

Global rule for the executor: each task must remove the old or empty path it
replaces, must name and avoid the forbidden additive patch, and must verify both
positive behavior and negative absence. A green build alone is not acceptance.
If an adapter-specific CLI flag, config path, or ownership rule is missing, stop
and report the missing fact instead of adding a generic fallback.

## Evidence

- `packages/harness/src/index.ts` currently contains only `export {}`.
- `packages/harness/test` currently has no tests.
- `@standard-schema/spec` is used by the approved requirement and plan but is not
  declared in `packages/harness/package.json`.
- `bun.lock` currently has no `@plimeor/harness` workspace entry.
- Adjacent packages commonly expose `test` as `bun test test` and lint both
  `src` and `test`.
- The plan and requirement no longer contain the removed `mcpServices`,
  diagnostics, evidence, remediation, or adapter extension resource concepts as
  approved API.

## T001 - MODIFY Package Wiring

- Group / Order / Depends-on: package / 1 / none
- Classification: atomic-synchronized - dependency and test wiring must land
  together or tests can stay invisible.
- Root-cause change:
  - `packages/harness/package.json`
  - `packages/harness/tsconfig.json`
  - `bun.lock`, if dependency installation updates it
- Ripple set: add `@standard-schema/spec` as a direct dependency; add a `test`
  script; update lint to include `test`; include test files in package
  TypeScript inputs; update the lockfile if needed.
- Forbidden patch: do not add a `bin`; do not rely on transitive
  `@standard-schema/spec`; do not leave tests outside package tooling.
- Change: modify package metadata and local TypeScript inputs so the harness
  package can type-check and run tests directly.
- Definition of done: `@plimeor/harness` remains library-only, structured output
  has a direct schema dependency, and local tests are visible to lint, test, and
  type-check workflows.
- Verify:
  - `bun run --filter @plimeor/harness lint`
  - `bun run --filter @plimeor/harness test`
  - `bun run check`

## T002 - REPLACE Empty Public Contract

- Group / Order / Depends-on: contract / 2 / T001
- Classification: atomic-synchronized - private types without public exports are
  not an independently useful green state.
- Root-cause change:
  - `packages/harness/src/index.ts`
  - likely new contract owner file such as `packages/harness/src/types.ts`
- Ripple set:
  - `HarnessId`
  - `HarnessContext`
  - `HarnessRegistry`
  - `HarnessAdapter`
  - `HarnessHandle`
  - `HarnessDetection`
  - `HealthFacet`
  - `HealthReport`
  - `ProcessFacet`
  - `RunRequest`
  - `RunOutputRequest`
  - `TextOutputRequest`
  - `JsonlOutputRequest`
  - `StructuredOutputRequest`
  - `CommandPlan`
  - `HarnessRun`
  - `HarnessRunEvent`
  - `HarnessRunResult`
  - `HarnessRunOutputError`
  - `ExtensionFacet`
  - `HarnessExtension`
  - `ExtensionResources`
  - `McpServerResource`
  - `HookResource`
  - `ExtensionResult`
  - `ExtensionIssue`
- Forbidden patch: do not introduce `V2`, `Legacy`, `Compat`, `Diagnostic`,
  `diagnostics`, `evidence`, `remediation`, `RunRequest.native`,
  `schema: unknown`, or `schema: any`.
- Change: replace the empty export with the approved public SDK contract. Keep
  `HealthReport` exactly as `{ success: true } | { success: false; message:
  string }`. Keep `HarnessExtension.resources` as the only resource container.
  Document `skills?: string[]` as filesystem paths, not skill names.
- Definition of done: `export {}` is gone; the public surface matches the
  approved core contract; no extra public compatibility layer exists; no
  diagnostics or native escape hatch is present.
- Verify:
  - `rg 'export \{\}' packages/harness/src -n` returns no hits.
  - `rg -n 'Diagnostic|diagnostics|evidence|remediation|HealthIssue|HealthStatus' packages/harness docs/requirements docs/plans` has no harness API hits.
  - `rg -n 'RunRequest.*native|native\?:|adapterOptions|passthrough|extraArgs|rawArgs|rawOptions' packages/harness docs/requirements docs/plans` has no harness API hits.
  - `bun run check`

## T003 - MODIFY Output Decoding And Typed Errors

- Group / Order / Depends-on: process / 3 / T002
- Classification: atomic-synchronized - parse failure, validation failure,
  `finalText`, `exitCode`, `signal`, and `outputMode` are one result/error
  contract.
- Root-cause change:
  - likely new `packages/harness/src/errors.ts`
  - likely new `packages/harness/src/output.ts`
  - `HarnessRunOutputError`
  - structured validation through `StandardSchemaV1`
- Ripple set: text finalization, JSONL parsing, structured JSON parsing, schema
  validation, typed output error construction, and result typing.
- Forbidden patch: do not let adapters parse JSONL or structured output
  independently; do not downgrade structured parse failure to text success; do
  not return a successful result with missing `structured`; do not add
  `StructuredRunResultV2`, `ParsedOutput`, or `rawStructured`.
- Change: implement core output decoding and typed errors used by process
  execution.
- Definition of done: invalid JSON and schema validation failures reject
  `HarnessRunOutputError`; the error preserves `finalText`, `exitCode`,
  `signal`, `outputMode`, and `cause`; successful structured output returns
  `StandardSchemaV1.InferOutput<Schema>` as required `structured`.
- Verify:
  - Tests cover text output, valid JSONL, invalid JSONL, structured success,
    and structured schema failure.
  - `rg -n 'schema: unknown|schema: any|structured\?: undefined|StructuredRunResultV2|ParsedOutput|rawStructured' packages/harness docs/requirements docs/plans` has no harness API hits.
  - `bun run --filter @plimeor/harness test`

## T004 - MODIFY Exact CommandPlan Runner

- Group / Order / Depends-on: process / 4 / T003
- Classification: atomic-synchronized - exact-plan execution, streams, timeout,
  kill, result, and event decoding are one observable run contract.
- Root-cause change:
  - likely new `packages/harness/src/process.ts`
  - `ProcessFacet.run`
  - `HarnessRun`
  - `HarnessRunEvent`
  - `HarnessRunResult`
- Ripple set: spawn command, args, cwd, env patching, stdin, stdout stream,
  stderr stream, events stream, result promise, timeout, kill, and mismatched
  `harnessId` rejection.
- Forbidden patch: do not re-plan when `run` receives a `CommandPlan`; do not
  read hidden `RunRequest` state from a closure; do not override
  `CommandPlan.command`, `args`, `cwd`, `env`, `stdin`, or `timeoutMs`.
- Change: implement `process.run(input)` so it plans `RunRequest` input once,
  executes reviewed `CommandPlan` input exactly, and connects process output to
  the core output decoder.
- Definition of done: `run` accepts `RunRequest` for the common path and
  `CommandPlan` for reviewed execution, rejects a plan whose `harnessId` does
  not match the current handle, exposes stdout/stderr/events, resolves result
  with final text, and supports timeout and kill.
- Verify:
  - Tests use fake local commands for cwd, env set/delete, stdin, stdout, stderr,
    JSON events, final text, timeout, kill, and mismatched harness id.
  - `rg -n 'planAndRun|run\(request|RunRequest.*native|adapterOptions|passthrough|extraArgs|rawArgs|rawOptions' packages/harness docs/requirements docs/plans` has no harness API hits.
  - `bun run --filter @plimeor/harness test`

## T005 - MODIFY Registry

- Group / Order / Depends-on: registry / 5 / T002
- Classification: independently-green - fake adapters can fully test registry
  behavior after the contract exists.
- Root-cause change:
  - likely new `packages/harness/src/registry.ts`
  - exported `harness`
- Ripple set: `use`, `list`, `detectAll`, and `open`.
- Forbidden patch: do not add `get`, `require`, `getOrThrow`,
  `requireAdapter`, or `lookupRequired`.
- Change: implement the registry singleton and any test-only factory needed to
  exercise it without global state coupling.
- Definition of done: `open` is the only id-to-handle public path; list order is
  deterministic; duplicate adapter behavior is explicit; unknown ids fail
  clearly; `detectAll` delegates to each registered adapter.
- Verify:
  - Tests cover registration, duplicate behavior, list order, `detectAll`, open
    delegation, and unknown id.
  - `rg -n 'getOrThrow|requireAdapter|lookupRequired|\.get\(|\.require\(' packages/harness docs/requirements docs/plans` has no harness API hits.
  - `bun run --filter @plimeor/harness test`

## T006 - MODIFY Extension Contract Tests

- Group / Order / Depends-on: extension / 6 / T002
- Classification: atomic-synchronized - install and uninstall must be paired in
  the adapter facet.
- Root-cause change:
  - `ExtensionFacet`
  - `HarnessExtension`
  - `ExtensionResources`
  - `McpServerResource`
  - `HookResource`
  - `ExtensionResult`
  - `ExtensionIssue`
- Ripple set: skills path comments, MCP server `command` / `args` / `env`, hook
  `name` / `event` / `command`, unsupported and conflict issue reporting, and
  user-scope-only install/uninstall ownership.
- Forbidden patch: do not introduce `plugin`, `AdapterExtensionResource`,
  `SkillResource`, singular `resource`, `mcpServices`, `McpService`, project
  scope, a core file-writing executor, preview, dry-run, side-effect plan, or
  change record.
- Change: lock extension shapes with tests or type fixtures so the approved
  resources are the only core extension contract.
- Definition of done: `HarnessExtension.resources` is the only resource
  container; skills are filesystem paths; MCP servers are keyed stdio configs;
  hooks are native hook event plus command declarations; install and uninstall
  are both adapter-owned.
- Verify:
  - Type or runtime tests cover accepted and rejected extension shapes.
  - `rg -n 'AdapterExtensionResource|SkillResource|resource:|sideEffect|sideEffects|dryRun|preview|changeRecord' packages/harness docs/requirements docs/plans` has no harness API hits.
  - `rg -n 'mcpServices|McpService|McpServerResource.*kind|HookResource.*kind|HookResource.*args|HookResource.*env' packages/harness docs/requirements docs/plans` has no harness API hits.
  - `rg -n 'project scope|project-scope|scope\?:|scope:|projectDir|workspace scope' packages/harness docs/requirements docs/plans` has no harness API hits, except the requirement/plan non-goal text if retained as prose.

## T007 - MODIFY Built-In Adapter Modules

- Group / Order / Depends-on: adapters / 7 / T003, T004, T005, T006
- Classification: implementation-backed - built-in adapters cover Codex,
  Claude, Kiro, and pi with adapter-owned CLI flags, smoke prompts, config
  paths, and uninstall ownership rules.
- Root-cause change:
  - `packages/harness/src/adapters/codex.ts`
  - `packages/harness/src/adapters/claude.ts`
  - `packages/harness/src/adapters/kiro.ts`
  - `packages/harness/src/adapters/pi.ts`
  - package export subpaths if self-registration uses explicit imports
- Ripple set: each built-in adapter module, its self-registration entry, tests
  for detection and health behavior, tests for planning supported output modes,
  and tests for extension install/uninstall results.
- Forbidden patch: do not claim built-in adapter support with unsupported stubs;
  do not implement install without uninstall; do not bypass core process/output
  decoding; do not add adapter-local structured parsing.
- Change: implement each adapter with identity-checked detection, health
  install/smoke checks, command planning, and user-scope extension
  install/uninstall.
- Definition of done: each adapter self-registers on import, verifies CLI
  identity rather than only command existence, returns the approved
  `HealthReport`, plans native commands without hidden options, and owns both
  install and uninstall for user-scope extension resources it supports.
- Verify:
  - Tests mock `PATH`, `HOME`, and `cwd`; tests do not depend on real installed
    CLIs.
  - For each adapter, tests cover detect false, identity true, health missing
    binary, health smoke timeout, plan unsupported output mode typed error, and
    extension unsupported/conflict visibility.
  - `bun run --filter @plimeor/harness test`

## T008 - MODIFY README

- Group / Order / Depends-on: docs / 8 / T001, T002, T003, T004, T005, T006,
  T007
- Classification: implementation-backed - README describes the public SDK
  behavior exposed by the package.
- Root-cause change:
  - `packages/harness/README.md`
- Ripple set: package status, public SDK overview, registry usage, process
  usage, health report shape, extension ownership, and adapter import notes.
- Forbidden patch: do not document behavior that code does not expose.
- Change: document the implemented library boundary, built-in adapters, health
  reports, process planning/running, and extension resources.
- Definition of done: every documented public API is implemented.
- Verify:
  - README includes the package boundary, built-in adapter matrix, process
    example, and extension example.
  - `bun run --filter @plimeor/harness lint`

## Stop Conditions

The task graph is complete when T001 through T008 are implemented and verified.
Built-in adapters must expose only implemented behavior; unsupported native
capabilities are reported through typed errors or extension issues.
