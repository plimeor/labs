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

### Automatic Setup (Recommended)

The configuration is automatically set up via a postinstall script that copies `.oxfmtrc.json` to your project root when you install the package.

### Manual Setup

Since oxfmt [does not currently support `extends`](https://github.com/oxc-project/oxc/issues/16394), you need to copy the configuration manually or use the postinstall script.

**Option 1: Copy the configuration file**

```bash
cp node_modules/@plimeor-labs/oxfmt-config/oxfmtrc.json .oxfmtrc.json
```

**Option 2: Create `.oxfmtrc.json` with the same settings**

```json
{
  "$schema": "https://raw.githubusercontent.com/oxc-project/oxc/main/npm/oxfmt/configuration_schema.json",
  "arrowParens": "avoid",
  "experimentalSortImports": {
    "internalPattern": ["~/", "@/", "@repo/"],
    "groups": [
      ["builtin"],
      ["external"],
      ["internal"],
      ["parent", "sibling", "index"],
      ["subpath"],
      ["side-effect-style"],
      ["unknown"]
    ]
  },
  "embeddedLanguageFormatting": "auto",
  "semi": false,
  "singleQuote": true
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
