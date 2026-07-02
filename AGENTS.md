# Project: Labs

Personal AI tooling monorepo; every package is TypeScript and Bun-first.

## Commands

- Type check: `bun run check`
- Lint: `bun run lint`
- Format: `bun run format`

## Conventions

- Package READMEs own public CLI, API, schema, file format, and stable behavior
  docs; keep that content out of AGENTS.md.
- TS/JS relative module specifiers are extensionless: use `./foo`, not
  `./foo.js` or `./foo.ts`. Concrete file paths keep real suffixes (`src/cli.ts`,
  `scripts/link-package.ts`), including in docs and package metadata.
- Avoid nested ternaries; use guard clauses, named helpers, or explicit `if`
  branches for multi-step conditions.
- For CLI command routing, prefer `@plimeor/command-kit`. Command args/options
  use `StandardSchemaV1`; package implementations may use Valibot plus
  `@valibot/to-json-schema` for help metadata.
- Prefer `@clack/prompts` for terminal prompts and progress. In Bun apps, use
  Bun Shell (`$` from `bun`) for subprocess work.
- Prefer `es-toolkit` for general utilities; use `effect` only for complex
  workflows needing explicit errors, retries, concurrency, resources, or
  dependency flow.
- Before publishing a package, define `repository.directory`, `homepage`,
  `bugs`, and a `files` whitelist; publishable CLI READMEs include install
  instructions and a minimal first command using the installed executable.

## Architecture boundaries

- Workspaces live in three tiers: `packages/*` (cross-suite generic packages),
  `suites/<suite>/*` (theme-scoped package groups), and `apps/*` (standalone
  apps with no suite affiliation).
- Every workspace package extends the root `tsconfig.json` with narrow local
  overrides: `packages/*` and `apps/*` extend `../../tsconfig.json`, while
  `suites/<suite>/*` extend `../../../tsconfig.json`.
- `prepack` builds generated artifacts if the package publishes them, or runs a
  package-level entrypoint smoke check if it publishes source directly.
- Do not change package boundaries, workspace structure, or generated lockfiles
  unless the task explicitly requires it.

## Testing

- Do not add test cases or run test commands unless the user explicitly asks.

## Git & PR etiquette

- Write pull request titles and bodies in English.

## Decisions & gotchas (earned)

- Bun pack/publish rewrites `catalog:` and `workspace:*`; do not flag those
  protocols as publishability issues by themselves.

## Agentic docs

- Durable rules live in `AGENTS.md` at the narrowest owning scope; `CLAUDE.md`
  is a symlink to it, never a fork. Record decisions as terse current-state
  rules here, not as a ledger — git history is the audit trail.
- Ephemeral working docs (cursor, plans, tasking, freeform notes) live in
  `.agentdocs/` while active; distill durable residue into the owning
  `AGENTS.md`, then delete them. Create `.agentdocs/cursor.md` only for
  cross-session work and delete it when it links nothing.
