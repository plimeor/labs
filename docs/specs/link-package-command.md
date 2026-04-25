# Spec: Link Package Command

Created: 2026-04-25

## Objective

Add a root command that installs, builds, and registers an internal workspace package with Bun's global link registry.

The command is optimized for local development of `@plimeor/*` packages in this monorepo. It accepts the short package name by default:

```bash
bun run link-package skills
```

This resolves to `@plimeor/skills`.

## Behavior

The root command is:

```bash
bun run link-package <package>
```

Supported inputs:

- `skills`
- `@plimeor/skills`

Rejected inputs:

- Missing package name.
- More than one package name.
- A scoped package outside `@plimeor/*`.
- A slash-containing package name that is not exactly `@plimeor/<name>`.
- A package that is not present in the root workspace package list.

After the package is resolved, the command runs in this order:

```bash
bun install --filter <workspace-package-path>
bun run build    # if the package defines it
bun run prepack  # otherwise, if the package defines it
cd <resolved-package-directory>
bun link
```

The command intentionally runs `bun link` from the package directory. Bun's package-directory `bun link` registers the current package as linkable; `bun link --global` is not used.
The install filter uses the resolved workspace package path because Bun's
`install --filter` may not match the package name consistently across versions.

## Implementation Notes

- The script lives at `scripts/link-package.ts`.
- The root `package.json` exposes it as `link-package`.
- The script is run by Bun and uses `zx` only for subprocess execution.
- The script reads the root `workspaces` field and package-level `package.json` files to locate the package by actual package name.
- The script must not hardcode `packages/<name>` as the resolution mechanism.

## Verification

Do not add test cases for this command unless separately requested.

Manual verification:

```bash
bun run link-package
bun run link-package missing
bun run link-package skills
```

The first two commands should fail before running install, prepare, or link. The final command should install the target workspace dependencies, run the package's available preparation script, and register it with Bun link.
