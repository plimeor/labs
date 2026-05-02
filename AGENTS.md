# Project: Labs

## Commands

- Type check: `bun run check`
- Lint: `bun run lint`
- Format: `bun run format`

## Conventions

- Use English for pull request titles and pull request bodies.

## Packages

- Every package under `packages/` must extend the root `tsconfig.json`; package-level `tsconfig.json` files should only override package-local inputs, outputs, and emit settings when needed.
- Every package under `packages/` must define a `prepack` script. If the package publishes generated artifacts, `prepack` must build them; if it publishes source directly, `prepack` must run a package-level smoke check for the published entrypoint or equivalent packaging boundary.
- New publishable packages under `packages/` must define npm metadata before publishing: `repository` with `directory`, `homepage`, `bugs`, and a `files` whitelist.
- README files for publishable CLI packages must include installation instructions and a minimal first command using the installed executable.

## Boundaries

- Do not change package boundaries, workspace structure, or generated lockfiles unless the task explicitly requires it.
- Do not add test cases or run test commands unless the user explicitly asks for them.

## Skills

- For project documentation maintenance, use `meta-project-docs-maintenance`: https://github.com/plimeor/agent-skills/blob/main/skills/meta-project-docs-maintenance/SKILL.md

## Patterns

- Avoid nested ternary expressions. Use guard clauses, named helpers, or explicit `if` branches when conditional logic has more than one decision point.
- For CLI packages and commands, prefer `@plimeor/command-kit` for command routing, argument parsing, help output, and typed handlers.
- For command args and options, use `StandardSchemaV1` as the `command-kit` contract; package implementations may use Valibot schemas plus `@valibot/to-json-schema` for help metadata.
- For terminal interaction, prefer `@clack/prompts` for prompts, task progress, and interactive feedback.
- Use `es-toolkit` as the default general-purpose utility library before adding one-off helpers or alternative utility dependencies.
- Use `effect` for genuinely complex logic or workflows that need explicit control over errors, retries, concurrency, resource management, or dependency flow; keep simple linear code plain.
