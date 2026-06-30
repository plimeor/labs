# Project: Labs

## Commands

- Type check: `bun run check`
- Lint: `bun run lint`
- Format: `bun run format`

## Conventions

- Use English for pull request titles and bodies.
- TS/JS relative module specifiers are extensionless: use `./foo`, not
  `./foo.js` or `./foo.ts`.
- Concrete file paths keep real suffixes, including docs, package metadata, and
  scripts such as `src/cli.ts` or `scripts/link-package.ts`.
- Package READMEs own public CLI, API, schema, file format, and stable behavior
  docs.

## Packages

- Workspaces live in three tiers: `packages/*` (cross-suite generic packages),
  `suites/<suite>/*` (theme-scoped groups of related packages), and `apps/*`
  (standalone apps with no suite affiliation).
- Every workspace package extends the root `tsconfig.json`, defines `prepack`,
  and keeps package-local `tsconfig` overrides narrow. Note the relative depth:
  `packages/*` and `apps/*` extend `../../tsconfig.json`, while `suites/<suite>/*`
  extend `../../../tsconfig.json`.
- If a package publishes generated artifacts, `prepack` builds them; if it
  publishes source directly, `prepack` runs a package-level entrypoint smoke
  check.
- New publishable packages define `repository.directory`, `homepage`, `bugs`,
  and a `files` whitelist before publishing.
- Publishable CLI package READMEs include install instructions and a minimal
  first command using the installed executable.
- Bun pack/publish rewrites `catalog:` and `workspace:*`; do not flag those
  protocols as publishability issues by themselves.

## Boundaries

- Do not change package boundaries, workspace structure, or generated lockfiles
  unless the task explicitly requires it.

## Agentic Docs

- Current workflow cursor: `agentdocs/cursor.md`.
- Living collaboration requirements: `agentdocs/requirements/`.
- Episode plans live in `agentdocs/plans/` only while active.
- Cursor-linked execution tasking lives in `agentdocs/tasking/` only while
  active.
- Repo-wide durable decisions live in `DECISIONS.xml`.
- Package-owned durable decisions live beside the owning package in
  `packages/<package>/DECISIONS.xml` and are surfaced by that package's
  `AGENTS.md` and `CLAUDE.md`.

## Skills

## Patterns

- Avoid nested ternaries; use guard clauses, named helpers, or explicit `if`
  branches for multi-step conditions.
- For CLI command routing, prefer `@plimeor/command-kit`.
- Command args/options use `StandardSchemaV1`; package implementations may use
  Valibot plus `@valibot/to-json-schema` for help metadata.
- Prefer `@clack/prompts` for terminal prompts and progress.
- In Bun apps, use Bun Shell (`$` from `bun`) by default for subprocess work.
- Prefer `es-toolkit` for general utilities. Use `effect` only for complex
  workflows needing explicit errors, retries, concurrency, resources, or
  dependency flow.
