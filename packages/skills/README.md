# @plimeor/skills

Manifest-based CLI for installing agent skills.

The executable is `skills`. It uses `skills.json` as desired state,
`skills.lock.json` as resolved install state, and installs skill directories
into `.agents/skills`.

## Why This Exists

Agent skills are infrastructure. I maintain my personal skills repository at
[plimeor/agent-skills](https://github.com/plimeor/agent-skills) and use it
across multiple computers. That repository changes often: skills get added,
rewritten, renamed, and deleted as my workflows change. A one-off install
command turns every source change into repeated manual work on every machine.

The contract I want is simpler: keep one manifest under dotfile or project
sync, then run one command to make the local `.agents/skills` directory match
that manifest. When I subscribe to all skills from a source, `all` is a live
source subscription, not a snapshot of the skills that existed on the day I ran
the command.

This package was built to make skills installation manifest-driven:

- `skills.json` is the human-maintained desired state.
- `skills.lock.json` records the exact resolved install state.
- `sync` converges the filesystem back to the manifest.
- `sync --locked` can reproduce the locked commits instead of refreshing refs.
- Global and project scopes use the same commands, with different state files.
- An `all` source follows later source changes, so new skills are installed and
  removed skills are pruned on the next sync.

It is not a wrapper around the Vercel Labs `skills` CLI. It owns installation,
removal, listing, sync, update, and migration behavior directly.

## Installation

The published CLI is Bun-only and runs the TypeScript entrypoint directly.
Install Bun first, then install the package globally:

```bash
npm uninstall -g skills
bun install -g @plimeor/skills
skills --help
```

The uninstall step matters if you previously installed the Vercel Labs
`skills` CLI. Both packages provide a `skills` executable, so keeping the old
global package installed can leave a conflicting binary on `PATH`.

Global installs link `skills` to the package's `src/cli.ts`; the full `src/`
tree is published with the package, so relative imports resolve from the
installed package directory.

For one-off usage without a global install:

```bash
bunx @plimeor/skills sync -g --dry-run
```

## Quick Start

```bash
skills sync -g --dry-run
```

Use `-g` or `--global` for `~/.agents`. Without it, commands use `./.agents`
from the current working directory.

## Migrate From Vercel Labs Skills

If you already used the Vercel Labs `skills` CLI, migrate the old lock file into
the new manifest format first:

```bash
skills migrate -g
skills sync -g --dry-run
skills sync -g
```

For global scope, `migrate -g` reads `~/.agents/.skill-lock.json` and writes
`~/.agents/skills.json` plus `~/.agents/skills.lock.json`. `skills list -g`
works immediately after migration; `sync -g` then refreshes the installed state
from the new manifest. After migration, the CLI asks whether to link detected
agent targets to `~/.agents/skills`; run `skills agents add <agent-id> -g` later
when you want to link one target explicitly.

For a project-local migration, run from the project root:

```bash
skills migrate
skills sync --dry-run
skills sync
```

Project migration defaults to reading `./skills-lock.json` and writing
`./.agents/skills.json` plus `./.agents/skills.lock.json`. Pass an input path or
`--output` only when the legacy lock or target manifest lives somewhere else.

After migration, keep `skills.json` under version control or dotfile sync. Treat
`skills.lock.json` as generated resolved state.

## Commands

```bash
skills add plimeor/agent-skills -g
skills add plimeor/agent-skills --skill code-scope-gate -g
skills add plimeor/agent-skills --all -g
skills sync -g
skills sync -g --locked
skills update -g
skills list -g
skills list -g --json
skills agents list -g
skills agents list -g --json
skills agents list -g --all
skills agents add claude-code
skills agents add claude-code -g
skills remove code-scope-gate -g
skills remove code-scope-gate,writing-blog -g
skills migrate
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
- Git URLs: `git@`, `https://`, `http://`

## Common Workflows

Keep a personal skills repository synced across machines:

```bash
skills add plimeor/agent-skills --all -g
skills sync -g --dry-run
skills sync -g
```

Put `~/.agents/skills.json` under dotfile sync. On each machine, `skills sync -g`
installs the current set from the source repository. If the source gains a new
skill, the next sync installs it. If the source removes a skill, the next sync
removes the installed copy and lock entry.

Choose global skills from an interactive prompt:

```bash
skills add plimeor/agent-skills -g
```

Install one global skill:

```bash
skills add plimeor/agent-skills --skill code-scope-gate -g
```

Subscribe to every skill in a source:

```bash
skills add plimeor/agent-skills --all -g
```

Preview and apply the manifest:

```bash
skills sync -g --dry-run
skills sync -g
```

Refresh refs and lock the newly resolved commits:

```bash
skills update -g
```

Reinstall exactly what the lock file records:

```bash
skills sync -g --locked
```

Use project-local state instead of global state:

```bash
skills add plimeor/agent-skills --skill project-review
skills sync
```

Inspect installed state:

```bash
skills list -g
skills list -g --json
```

Inspect supported coding agent targets:

```bash
skills agents list -g
skills agents list -g --json
skills agents list -g --all
skills agents add claude-code
skills agents add claude-code -g
skills agents add kiro-cli -g
```

When an agent marker directory is missing, `skills agents add <agent-id>` asks
whether to create it before linking the agent-specific skills directory. For
example, `skills agents add kiro-cli -g` can create `~/.kiro` and then link
`~/.kiro/skills` to `~/.agents/skills`.

Remove several named skills in one command:

```bash
skills remove code-scope-gate,writing-blog -g
```

## Distinctive Features

- **Manifest-first state**: `skills.json` is stable, deterministic, and
  suitable for dotfiles or project repos.
- **Separate lock state**: exact commits, install paths, timestamps, and other
  generated metadata live in `skills.lock.json`.
- **Source grouping**: manifest entries are grouped by source so the file stays
  readable when many skills come from the same repository.
- **Prompted source install**: `skills add <source>` lists skills from the
  source `skills/` directory, shows `SKILL.md` descriptions, labels already
  installed skills as `(installed)`, and installs only newly selected skills. If
  every skill from the source is already installed, it exits before prompting and
  points users to `sync` for refreshes.
- **Live `--all` subscription**: `skills add <source> --all` stores
  `skills: "all"` instead of freezing the current skill list. Later `sync` and
  `update` can add new skills and prune removed ones from that source.
- **Locked sync**: `sync --locked` installs from the lock file's exact commits
  and fails when the lock cannot satisfy the manifest.
- **Global or project scope**: `-g` targets `~/.agents`; no `-g` targets the
  current project's `./.agents`. In project scope, agent detection only uses
  project-level markers such as `./.claude`, not globally installed agents in
  the user's home directory.
- **Canonical store updates**: `add` and `remove` maintain only the current
  scope canonical `.agents/skills` store plus manifest/lock state.
  Already-linked agent target directories update automatically because they
  point at the canonical store; unlinked agent target directories are left
  alone by those commands.
- **Prompted agent linking**: after `sync` or `migrate` finishes its own state
  work, the CLI asks whether to create or replace directory links for detected
  agent targets that can point at the canonical store. `update` reuses the
  normal `sync` path and inherits the same prompt.
- **Agent target diagnostics**: `skills agents list` shows detected agents,
  target directory, canonical support, and link mode. Add `--all` to show three
  groups: standard agents, detected non-standard agents, and non-standard
  agents that are not detected on this machine. In the Detected group, `🔗`
  marks an agent target already linked to the standard path and `⚪` marks a
  detected target that is not linked yet.
- **Explicit agent target linking**: `skills agents add <agent-id>` links the
  detected agent's current-scope skills directory to the current-scope
  `.agents/skills` store. Add `-g` to link the detected agent's global skills
  directory to `~/.agents/skills`. Native agents read the standard path in both
  project and global scope, so they do not need duplicate links. Existing target
  directories, files, or symlinks are replaced after path safety checks pass. If
  the current-scope agent marker directory is missing, the command asks whether
  to create it before linking.
- **Dry-run and JSON output**: `sync --dry-run` previews filesystem changes;
  `list --json` and `agents list --json` are available for scripts.

## Missing Compared With Vercel Labs Skills

Verified against Vercel Labs `skills@1.5.1` with `npx skills` from a directory
outside this workspace. Agent registry paths and detection rules were refreshed
against the Vercel Labs `src/agents.ts` registry on 2026-05-22. This CLI
intentionally covers the manifest-and-lock workflow first, so the current gaps
are mostly around discovery, explicit agent selection, and authoring UX:

- **Explicit agent selection**: Vercel supports `--agent <agents>` and
  `--agent '*'` for selecting target agents. This CLI derives agent target
  directories from the registry and current machine detection only; it supports
  explicit one-agent linking through `skills agents add <agent-id>`, but does
  not maintain an enabled-agents list or provide `skills agents remove`.
- **Open-ended discovery**: Vercel has `skills find [query]` and `skills add
  --list` for searching or listing skills before installation. This CLI can
  prompt within a known source, but it does not search across unknown sources.
- **Skill authoring scaffold**: Vercel has `skills init [name]` to create a
  `SKILL.md` skeleton. This CLI only installs existing skills.
- **Node package workflow**: Vercel includes `experimental_sync` from
  `node_modules` and `experimental_install` from `skills-lock.json`. This CLI
  uses native `skills.json` / `skills.lock.json` state instead and only provides
  `migrate` for moving an old lock file into the manifest format.
- **Scope auto-selection and confirmation flags**: Vercel supports confirmation
  prompts, `--yes`, `--project`, and update-scope auto-detection. This CLI keeps
  project scope as the default, and `-g` explicitly selects the global scope.
- **Partial update and all-scope removal**: Vercel accepts `update [skills...]`
  and can remove all skills through `--skill`, `--agent`, and `--all`. This CLI
  updates the whole manifest and supports comma-separated batch removal only for
  named skills.
- **Install method choice**: Vercel defaults to agent-directory symlinks and has
  `--copy` as an option. This CLI always copies skill directories into the
  canonical store and records `method: "copy"` in the lock file; agent-specific
  directories are derived directory-level symlinks.
- **Compatibility binary**: Vercel exposes an extra `add-skill` binary. This
  CLI supports the common command aliases (`a`, `upgrade`, `ls`, `rm`) but only
  publishes the `skills` binary.

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

This package is Bun-only. The published `skills` binary points at
`src/cli.ts`; there is no `dist/` build step. `prepack` runs an entrypoint
smoke check before packaging.

```bash
bun run --filter @plimeor/skills lint
```

Package-local agent instructions live in
[`AGENTS.md`](./AGENTS.md).
