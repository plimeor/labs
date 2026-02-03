# @plimeor-labs/oxlint-config

Shared [oxlint](https://oxc.rs/docs/guide/usage/linter.html) configuration for static code analysis and error prevention.

## Features

### Category Rules

- **Correctness** - Error-level rules for catching bugs
- **Suspicious** - Warning-level rules for potentially problematic code
- **Performance** - Warning-level rules for performance issues

### Custom Rules

- **TypeScript**
  - No floating promises (error)

- **Import/Module**
  - No circular dependencies (error)
  - No duplicate imports (warn)
  - No named as default exports (error)
  - No self-imports (error)
  - No unassigned imports except styles (error)

- **React**
  - No duplicate JSX props (error)
  - Warn on dangerous HTML (warn)
  - No unknown DOM properties (error)

- **Testing**
  - No Jest exports (error)

- **Promises**
  - No return from promise executor (error)
  - No multiple resolved promises (warn)

- **Utility**
  - No useless fallback in spread (warn)

## Installation

```bash
bun add -D @plimeor-labs/oxlint-config
```

## Usage

Create an `.oxlintrc.json` file in your project root:

```json
{
  "$schema": "https://raw.githubusercontent.com/oxc-project/oxc/main/npm/oxlint/configuration_schema.json",
  "extends": "@plimeor-labs/oxlint-config/base.json"
}
```

## Scripts

Add these scripts to your `package.json`:

```json
{
  "scripts": {
    "lint": "oxlint",
    "lint:fix": "oxlint --fix"
  }
}
```

## Configuration

See [base.json](./base.json) for the full configuration.

## Notes

- `console` statements are allowed (useful for development and logging)
- Strict rules for imports help maintain clean module structure
- React rules ensure proper component development
