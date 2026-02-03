# @plimeor-labs/config-typescript

Shared TypeScript configuration presets for modern JavaScript/TypeScript projects.

## Important Note

**This configuration is designed for personal use and targets ES2024.** It assumes you're using modern JavaScript engines and bundlers that support the latest ECMAScript features. If you need broader compatibility, consider using a different target.

## Available Configurations

### Base Configuration

General-purpose TypeScript configuration with:

- **Latest features** - Uses `ESNext` for maximum language feature support
- **Module preservation** - Preserves ES modules as-is
- **Strict mode** - All strict type checking enabled
- **Bundler mode** - Optimized for modern bundlers (Vite, Bun, etc.)
- **No emit** - Type checking only, no compilation
- **JSX support** - React JSX transformation

### Client Configuration

**Targets ES2024 specifically** for client-side applications:

- **ES2024 target** - Uses the latest finalized ECMAScript features
- **DOM types** - Includes DOM and DOM.Iterable libraries
- **Stricter checks** - Enables unused locals/parameters detection
- **Side effect checking** - Validates side effects in imports

## Installation

```bash
bun add -D @plimeor-labs/config-typescript
```

## Usage

### For Node.js/Server Projects

Create a `tsconfig.json`:

```json
{
  "extends": "@plimeor-labs/config-typescript"
}
```

### For Client/Browser Projects

Create a `tsconfig.json`:

```json
{
  "extends": "@plimeor-labs/config-typescript/client"
}
```

### Custom Overrides

You can override any settings:

```json
{
  "extends": "@plimeor-labs/config-typescript/client",
  "compilerOptions": {
    "target": "ES2020", // Override if you need older target
    "noUnusedLocals": false // Disable specific checks
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

## Configuration Details

### Base Config Features

- ✅ Strict type checking
- ✅ Skip library checks for faster builds
- ✅ No fallthrough in switch statements
- ✅ Checked indexed access
- ✅ Require override keyword
- ✅ Verbatim module syntax

### Client Config Additions

- ✅ ES2024 target with modern language features
- ✅ DOM type definitions
- ✅ Unused code detection
- ✅ Unchecked side effect validation
- ✅ Isolated modules mode

## Why ES2024?

This configuration uses **ES2024** as the target for client-side code because:

1. **Personal projects** - Designed for modern development workflows
2. **Modern browsers** - Target environments support latest features
3. **Bundler optimization** - Modern bundlers can transpile if needed
4. **Future-proof** - Stay current with JavaScript evolution

If you need broader compatibility, you can override the `target` in your project's `tsconfig.json`.

## Files

- [`base.json`](./base.json) - Base configuration for all projects
- [`client.json`](./client.json) - Client-side configuration with ES2024

## References

- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [TSConfig Reference](https://www.typescriptlang.org/tsconfig)
