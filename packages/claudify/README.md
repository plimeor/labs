# @plimeor/claudify

Bun CLI for creating Claude-compatible project files from existing agent
project conventions.

## Installation

```bash
bun install -g @plimeor/claudify
claudify --help
```

For one-off usage:

```bash
bunx @plimeor/claudify
```

## Quick Start

Run from anywhere inside a Git repository:

```bash
claudify
```

The command resolves the current Git repository root and scans from that root.

## Behavior

For each directory that contains `.agent/skills`, `claudify` ensures there is a
`.claude` directory in the same directory and creates `.claude/skills` as a
directory symlink to `../.agent/skills` when the link is missing.

For each directory that contains `AGENTS.md`, `claudify` creates `CLAUDE.md`
as a same-directory symlink to `AGENTS.md` when `CLAUDE.md` is missing.

When both files exist and `CLAUDE.md` is not already a symlink to `AGENTS.md`,
`claudify` ensures `CLAUDE.md` contains a standalone `@AGENTS.md` reference
line. If it is missing, the reference is inserted at the top of the file.

When `CLAUDE.md` exists but `AGENTS.md` does not, `claudify` deletes
`CLAUDE.md` if it points to a missing path. Otherwise, it removes standalone
`@AGENTS.md` reference lines. If that leaves `CLAUDE.md` with no other content,
the file is deleted.

Existing `.claude/skills` paths are left untouched when they already point at
the matching `.agent/skills` directory; conflicting paths stop the command with
an error instead of being replaced.

The scanner skips `.git`, `.agent`, `.claude`, `node_modules`, and `dist`
directories while walking the repository.
