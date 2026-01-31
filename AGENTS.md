# AGENTS.md

Guidelines for AI agents and contributors working in this repository.

## Project Overview

This is a Bun monorepo workspace. Packages are located in the `packages/` directory.

## Code Conventions

### Language

- All code, comments, commit messages, and documentation must be in **English only**
- Variable names, function names, and identifiers should use clear English words

### Style

- Follow existing code patterns in the repository
- Use consistent formatting (run formatter before committing)
- Keep functions small and focused
- Prefer explicit over implicit

## Security Guidelines

### Sensitive Information

**Never commit sensitive information including:**

- API keys and secrets
- Passwords and credentials
- Private keys and certificates
- Environment-specific configuration with real values
- Personal access tokens
- Database connection strings with credentials

### Environment Variables

- Use `.env.example` files with placeholder values for documentation
- Never commit `.env` files (they should be in `.gitignore`)
- Use environment variables for all sensitive configuration

### Pre-commit Checks

This repository uses gitleaks for secret detection:
- Local: pre-commit hook scans staged files
- CI: GitHub Actions scans all PRs

If a commit is blocked, review the flagged content and remove any secrets.

## Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, semicolons, etc.)
- `refactor`: Code refactoring without feature changes
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `build`: Build system or dependency changes
- `ci`: CI configuration changes
- `chore`: Other changes that don't modify src or test files

### Examples

```
feat(auth): add OAuth2 login support
fix(api): handle null response from external service
docs: update installation instructions
chore(deps): upgrade typescript to v5.3
```

## Pull Request Requirements

### PR Title Naming Convention

PR titles **must** follow [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <description>
```

- **type**: Use the same types as commit messages (feat, fix, docs, etc.)
- **scope**: Optional, indicates the affected module or package
- **description**: Brief summary in imperative mood, lowercase, no period

**Examples:**

```
feat(auth): add OAuth2 login support
fix(api): handle null response from external service
docs: update installation instructions
refactor(ui): simplify form validation logic
```

### Checklist

1. **Title**: Must follow conventional commit format (see above)
2. **Description**: Explain what and why (not how)
3. **Tests**: Include tests for new functionality
4. **Security**: Ensure no secrets are included
5. **Review**: All PRs require at least one approval

## Development Setup

```bash
# Install dependencies
bun install

# Run development
bun run dev

# Run tests
bun run test

# Build
bun run build
```

## Git Hooks

Git hooks are managed by [husky](https://typicode.github.io/husky/). After cloning:

```bash
# Hooks are automatically configured via the prepare script
bun install
```

### Pre-commit Hook

The pre-commit hook runs:
- **gitleaks** - Secret detection (requires `brew install gitleaks`)

To skip hooks temporarily (not recommended):
```bash
git commit --no-verify
```
