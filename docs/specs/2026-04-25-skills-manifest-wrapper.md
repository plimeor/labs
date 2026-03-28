# Spec: Native Skills Manifest Installer

Created: 2026-04-25

## Objective

Build `@plimeor/skills` as a native TypeScript CLI for managing agent skills from two state files:

- `skills.json`: desired state, grouped by source for human maintenance.
- `skills.lock.json`: resolved install state, including the exact commit and installation metadata.

The package must not call the upstream npm package `skills`. It owns installation, removal, listing, lock refresh, and sync behavior directly.

## Assumptions

1. The package lives in `packages/skills`.
2. The npm package name is `@plimeor/skills`, but its executable name is `skills`.
3. The first supported backend is Git plus local filesystem sources.
4. The first canonical install target is `.agents/skills`.
5. Global state lives under `~/.agents`; project state lives under `./.agents`.
6. Agent-specific fan-out, interactive discovery, `find`, and `init` are out of scope for this version.

## Commands

```bash
skills add plimeor/agent-skills --skill code-scope-gate -g
skills add plimeor/agent-skills --skill code-scope-gate --ref main -g
skills add plimeor/agent-skills --skill code-scope-gate --commit abc123 -g
skills remove code-scope-gate -g
skills list -g
skills list -g --json
skills sync -g
skills sync -g --locked
skills sync -g --dry-run
skills update -g
skills migrate -g
```

`add --all` records the source group as `skills: "all"` instead of freezing the currently discovered skill list. Later `sync` and `update` therefore add newly appearing skills and prune skills that disappeared from that source.

## `skills.json`

`skills.json` is desired state. It is deterministic, human-editable, and excludes install timestamps or generated hashes.

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
        },
        {
          "name": "obsidian-markdown",
          "path": "skills/obsidian-markdown",
          "commit": "abc123"
        }
      ]
    }
  ]
}
```

Rules:

- `schemaVersion` must be `1`.
- `scope` must be `global` or `project`.
- `sources[].source` accepts GitHub shorthand, Git URLs, HTTP Git URLs, or local paths.
- `sources[].skills` is either an explicit skill list or `"all"`.
- `sources[].ref` or `sources[].commit` applies to the source group; skill-level `ref` or `commit` may override it for explicit skills.
- Skill names are unique after source groups are expanded.
- `sources[].skills[].path` points to a directory containing `SKILL.md`; if omitted by command code, it defaults to `skills/<name>`.
- A skill may specify `ref` or `commit`, not both.
- `commit` pins desired state to an exact Git commit.

## `skills.lock.json`

`skills.lock.json` records the exact installed result.

```json
{
  "schemaVersion": 1,
  "scope": "global",
  "skills": {
    "code-scope-gate": {
      "source": "plimeor/agent-skills",
      "path": "skills/code-scope-gate",
      "ref": "main",
      "commit": "9f4c1b",
      "installedAt": "2026-04-25T12:00:00.000Z",
      "installPath": "/Users/plimeor/.agents/skills/code-scope-gate",
      "method": "copy"
    }
  }
}
```

Rules:

- `commit` is the resolved commit actually installed.
- `installedAt` is install metadata and belongs only in the lock file.
- Normal `sync` resolves manifest refs again and writes new lock commits.
- `sync --locked` reuses exact lock commits and fails if the lock is missing or mismatches `skills.json`.
- For a source group with `skills: "all"`, normal `sync` and `update` discover skills from the requested source target, while `sync --locked` expands the skill list from matching lock entries.

## Scope Semantics

Global scope:

- Selected by `-g` or `--global`.
- Uses `~/.agents/skills.json`.
- Uses `~/.agents/skills.lock.json`.
- Installs into `~/.agents/skills/<skill-name>`.

Project scope:

- Default when `-g` is absent.
- Uses `./.agents/skills.json`.
- Uses `./.agents/skills.lock.json`.
- Installs into `./.agents/skills/<skill-name>`.

## Sync Semantics

`sync` converges installed state to `skills.json`.

1. Read and validate `skills.json`.
2. Read `skills.lock.json`, or create an empty lock in memory if absent.
3. Expand any source group with `skills: "all"` from the requested source target, or from matching lock entries in `sync --locked`.
4. Remove lock entries and installed directories for skills no longer declared.
5. Group skills by `{source, commit || ref || default ref}`.
6. Clone or use each group once, in parallel.
7. Copy each skill directory to the scope install directory.
8. Write `skills.lock.json` after successful convergence.

Failure rule: if clone or install fails, the command exits non-zero and does not write a successful new lock.

## Native Installer Boundaries

Always:

- Keep `skills.json` deterministic.
- Keep install metadata in `skills.lock.json`.
- Batch checkout work by source and target commit/ref during `sync`.
- Use exact lock commits only for `sync --locked`.
- Use atomic writes for manifest and lock files.

Never:

- Invoke the upstream `skills` CLI.
- Store timestamps, folder hashes, or generated install state in `skills.json`.

Out of scope for this version:

- Multi-agent fan-out beyond `.agents/skills`.
- Interactive discovery.
- Search / `find`.
- Skill template creation / `init`.
