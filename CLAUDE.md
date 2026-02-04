# AGENTS.md

Guidelines for AI agents and contributors working in this repository.

## Project Overview

This is a Bun monorepo workspace. Packages are in `packages/`.

## Memory Management

**Update CLAUDE.md when you complete any operation that adds project knowledge:**

- Add architectural decisions or patterns
- Document non-obvious solutions to problems
- Record dependency changes or new tools
- Add commands, scripts, or workflows
- Note security requirements or constraints

Keep updates concise. Remove outdated information.

## Code Conventions

### Language

All code, comments, commit messages, and documentation must be in English. Use clear English words for identifiers.

### Style

- Follow existing patterns
- Run formatter before committing
- Keep functions small and focused
- Prefer explicit over implicit

## Security

Never commit secrets (API keys, passwords, certificates, tokens, credentials).

Use `.env.example` for documentation. Store secrets in environment variables.

If gitleaks blocks a commit, remove the flagged content.

## Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`

Examples:

```
feat(auth): add OAuth2 login support
fix(api): handle null response
docs: update installation instructions
```

## Pull Requests

Title must follow conventional commit format.

Requirements:

1. Explain what and why in description
2. Include tests for new functionality
3. No secrets
4. One approval required

## Development

```bash
bun install
bun run dev
bun run test
bun run build
```

## Git Hooks

Requires `brew install gitleaks`.

Skip hooks: `git commit --no-verify` (not recommended).
