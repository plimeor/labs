# @plimeor/skills

Manifest-based CLI for installing agent skills.

The executable is `skills`. It uses `skills.json` as desired state,
`skills.lock.json` as resolved install state, and installs skill directories
into `.agents/skills`.

## Quick Start

```bash
bun run --filter @plimeor/skills build
packages/skills/dist/cli.js sync -g --dry-run
```

Use `-g` or `--global` for `~/.agents`. Without it, commands use `./.agents`
from the current working directory.

## Commands

```bash
skills add plimeor/agent-skills --skill code-scope-gate -g
skills add plimeor/agent-skills --all -g
skills sync -g
skills sync -g --locked
skills update -g
skills list -g
skills list -g --json
skills remove code-scope-gate -g
skills migrate -g
```

Pin a source to a branch, tag, or commit:

```bash
skills add plimeor/agent-skills --skill code-scope-gate --ref main -g
skills add plimeor/agent-skills --skill code-scope-gate --ref v1.2.0 -g
skills add plimeor/agent-skills --skill code-scope-gate --commit abc123 -g
```

Supported sources:

- GitHub shorthand: `owner/repo`
- `github:owner/repo`
- Git URLs: `git@`, `https://`, `http://`
- Local paths: `/path`, `./path`, `../path`

## Manifest

Explicit skills:

```json
{
  "schemaVersion": 1,
  "scope": "global",
  "sources": [
    {
      "source": "plimeor/agent-skills",
      "skills": [
        {
          "name": "code-scope-gate",
          "path": "skills/code-scope-gate",
          "ref": "main"
        }
      ]
    }
  ]
}
```

All skills from a pinned source:

```json
{
  "schemaVersion": 1,
  "scope": "global",
  "sources": [
    {
      "source": "plimeor/agent-skills",
      "ref": "main",
      "skills": "all"
    }
  ]
}
```

`ref` can be a branch or tag. Use `commit` for an exact commit. A source or
skill can specify `ref` or `commit`, but not both.

## Development

```bash
bun run --filter @plimeor/skills build
bun run --filter @plimeor/skills lint
```

Package-local agent instructions live in
[`AGENTS.md`](./AGENTS.md).
