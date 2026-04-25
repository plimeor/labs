# Project: Labs

## Commands

- Type check: `bun run check`
- Lint: `bun run lint`
- Format: `bun run format`

## Conventions

- Files under `docs/specs/` and `docs/plan/` must use a date-prefixed name: `YYYY-MM-DD-description.md`.
- Keep specs and plans scoped to the project or feature they describe; do not mix temporary task notes into project rules.

## Packages

- Every package under `packages/` must extend the root `tsconfig.json`; package-level `tsconfig.json` files should only override package-local inputs, outputs, and emit settings when needed.
- New publishable packages under `packages/` must define npm metadata before publishing: `repository` with `directory`, `homepage`, `bugs`, a `files` whitelist, and a `prepack` script that builds published artifacts.
- README files for publishable CLI packages must include installation instructions and a minimal first command using the installed executable.

## Boundaries

- Do not change package boundaries, workspace structure, or generated lockfiles unless the task explicitly requires it.
- Do not add test cases or run test commands unless the user explicitly asks for them.

## Patterns

- Use `docs/specs/YYYY-MM-DD-*.md` for implementation specs before coding multi-file changes.
