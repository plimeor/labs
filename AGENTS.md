# Project: Labs

## Commands

- Type check: `bun run check`
- Lint: `bun run lint`
- Format: `bun run format`

## Conventions

- Files under `docs/specs/` are living implementation specs and must use stable topic names: `<topic>.md`.
- Files under `docs/plan/` are one-time implementation plans and must use a date-prefixed name: `YYYY-MM-DD-description.md`.
- Files under `docs/decisions/` are historical decision records and must use a date-prefixed name: `YYYY-MM-DD-description.md`.
- Keep specs, plans, and decisions scoped to the project or feature they describe; do not mix temporary task notes into project rules.

## Docs Maintenance

- Update `docs/specs/` when a change affects CLI commands, arguments, output, errors, state file schemas, package metadata, workspace contracts, install/sync/publish behavior, package boundaries, or cross-module interfaces.
- Do not update specs for pure internal refactors, bug fixes with no contract change, temporary research, execution logs, failed attempts, or already superseded historical notes.
- Maintain `docs/plan/` only while its task is active; after implementation, do not keep old plans synchronized with later code changes except to mark `Implemented`, `Abandoned`, or `Superseded` when useful.
- Use `docs/decisions/` only for significant, traceable decisions that are expensive to reverse; preserve them as historical records and supersede them with a new decision record instead of rewriting history.
- Update README for user-facing entrypoints and current usage. Update AGENTS.md for long-lived repo rules. Do not put single-feature implementation details in either file.

## Packages

- Every package under `packages/` must extend the root `tsconfig.json`; package-level `tsconfig.json` files should only override package-local inputs, outputs, and emit settings when needed.
- Every package under `packages/` must define a `prepack` script. If the package publishes generated artifacts, `prepack` must build them; if it publishes source directly, `prepack` must run a package-level smoke check for the published entrypoint or equivalent packaging boundary.
- New publishable packages under `packages/` must define npm metadata before publishing: `repository` with `directory`, `homepage`, `bugs`, and a `files` whitelist.
- README files for publishable CLI packages must include installation instructions and a minimal first command using the installed executable.

## Boundaries

- Do not change package boundaries, workspace structure, or generated lockfiles unless the task explicitly requires it.
- Do not add test cases or run test commands unless the user explicitly asks for them.

## Patterns

- Use `docs/specs/<topic>.md` for living implementation specs before coding multi-file changes.
- Avoid nested ternary expressions. Use guard clauses, named helpers, or explicit `if` branches when conditional logic has more than one decision point.
- For CLI packages and commands, prefer `incur` for command routing, argument parsing, help output, and typed handlers.
- For terminal interaction, prefer `@clack/prompts` for prompts, task progress, and interactive feedback.
- Use `es-toolkit` as the default general-purpose utility library before adding one-off helpers or alternative utility dependencies.
- Use `effect` for genuinely complex logic or workflows that need explicit control over errors, retries, concurrency, resource management, or dependency flow; keep simple linear code plain.
