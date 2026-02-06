# Migrate oxfmt/oxlint to Biome

## Motivation

oxfmt v0.19.0+ broke Bun compatibility ([oven-sh/bun#25658](https://github.com/oven-sh/bun/issues/25658)). Replace oxfmt + oxlint with Biome as a single tool for formatting and linting.

## Migration Steps

### 1. Create branch

```
git checkout -b chore/migrate-to-biome
```

### 2. Install Biome, remove oxc tools

```bash
bun add -d @biomejs/biome
bun remove oxfmt oxlint
```

### 3. Remove config packages

Delete entirely:

- `packages/config-oxlint/`
- `packages/config-oxfmt/`

Remove their workspace references from root `package.json` workspaces and devDependencies.

### 4. Remove root oxc config files

- `.oxlintrc.json`
- `.oxfmtrc.json`

### 5. Create `biome.json` at repo root

```json
{
  "$schema": "https://biomejs.dev/schemas/2.2.5/schema.json",
  "root": true,
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "ignoreUnknown": false
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "lineWidth": 120
  },
  "css": {
    "formatter": { "enabled": true }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "a11y": { "recommended": false },
      "security": {
        "noDangerouslySetInnerHtml": "warn"
      },
      "complexity": {
        "useArrowFunction": "off"
      },
      "correctness": {
        "useJsxKeyInIterable": "warn",
        "useExhaustiveDependencies": {
          "level": "error",
          "options": {
            "hooks": [
              {
                "name": "useMemoizedFn",
                "stableResult": true
              }
            ]
          }
        }
      },
      "suspicious": {
        "noConsole": {
          "level": "warn",
          "options": { "allow": ["warn", "error"] }
        },
        "noShadowRestrictedNames": "warn",
        "noAssignInExpressions": "off",
        "noArrayIndexKey": "warn",
        "noEmptyInterface": "off",
        "noDoubleEquals": "warn",
        "noExplicitAny": "off",
        "noVar": "error"
      },
      "style": {
        "useImportType": "off",
        "useExponentiationOperator": "off",
        "noNonNullAssertion": "info"
      },
      "nursery": {
        "useSortedClasses": {
          "level": "info",
          "fix": "safe"
        }
      }
    }
  },
  "javascript": {
    "formatter": {
      "jsxQuoteStyle": "double",
      "quoteProperties": "asNeeded",
      "trailingCommas": "none",
      "semicolons": "asNeeded",
      "arrowParentheses": "asNeeded",
      "bracketSameLine": false,
      "quoteStyle": "single",
      "attributePosition": "auto",
      "bracketSpacing": true
    }
  },
  "assist": {
    "enabled": true,
    "actions": {
      "source": {
        "organizeImports": {
          "level": "on",
          "options": {
            "groups": [
              [":URL:", ":BUN:", ":NODE:"],
              ":BLANK_LINE:",
              ":PACKAGE:",
              ":BLANK_LINE:",
              ":ALIAS:",
              ":BLANK_LINE:",
              ":PATH:"
            ]
          }
        }
      }
    }
  }
}
```

### 6. Update lint-staged in root `package.json`

Replace:

```json
"lint-staged": {
  "*.{js,jsx,ts,tsx,mjs,cjs}": [
    "oxfmt --write",
    "oxlint"
  ],
  "*.{json,md}": [
    "oxfmt --write"
  ]
}
```

With:

```json
"lint-staged": {
  "*.{js,jsx,ts,tsx,mjs,cjs,json,md,css}": [
    "biome check --write --no-errors-on-unmatched"
  ]
}
```

### 7. Run Biome on the codebase

```bash
bunx biome check --write .
```

Fix any errors or suppress false positives.

### 8. Verify

- `bunx biome check .` passes
- Pre-commit hook works on a test commit

## Files Changed

| Action | Path |
|--------|------|
| Create | `biome.json` |
| Delete | `.oxlintrc.json` |
| Delete | `.oxfmtrc.json` |
| Delete | `packages/config-oxlint/` (entire directory) |
| Delete | `packages/config-oxfmt/` (entire directory) |
| Modify | `package.json` (deps, lint-staged, workspaces) |
| Modify | `bun.lock` (after install) |
