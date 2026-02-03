# @plimeor-labs/oxfmt-config

Shared [oxfmt](https://oxc.rs/docs/guide/usage/formatter.html) configuration for consistent code formatting across all projects.

## Features

- **No semicolons** - Cleaner, modern JavaScript/TypeScript style
- **Single quotes** - Consistent string delimiter
- **Arrow function parens** - Avoid unnecessary parentheses (`avoid`)
- **Automatic import sorting** - Groups and sorts imports by:
  - Built-in Node.js modules
  - External dependencies
  - Internal packages (`~/`, `@/`, `@repo/`)
  - Parent/sibling/index files
  - Subpath imports
  - Side-effect styles
- **Embedded language formatting** - Auto-formats code in template literals

## Installation

```bash
bun add -D @plimeor-labs/oxfmt-config
```

## Usage

The configuration is automatically set up via a postinstall script that copies `.oxfmtrc.json` to your project root.

Alternatively, create an `.oxfmtrc.json` file manually:

```json
{
  "$schema": "https://raw.githubusercontent.com/oxc-project/oxc/main/npm/oxfmt/configuration_schema.json",
  "extends": "@plimeor-labs/oxfmt-config"
}
```

## Scripts

Add these scripts to your `package.json`:

```json
{
  "scripts": {
    "format": "oxfmt --write .",
    "format:check": "oxfmt --check ."
  }
}
```

## Configuration

See [oxfmtrc.json](./oxfmtrc.json) for the full configuration.
