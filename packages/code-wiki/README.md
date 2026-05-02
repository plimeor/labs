# @plimeor/code-wiki

Scan Git repositories into durable Markdown wikis, then query those wikis through
the configured runtime.

The executable is `code-wiki`. It stores wiki state under `.code-wiki/`, keeps
managed clones under `.code-wiki/repos/`, and generates deterministic Markdown
plus JSON indexes for source inspection, version-to-version comparison, and
runtime-backed question answering.

This phase is scan + query only: `review`, `correct`, PRD analysis, coding plan
generation, and non-Codex runtimes are intentionally out of scope.

## Installation

The published CLI is Bun-only and runs the TypeScript entrypoint directly.
Install Bun first, then install the package globally:

```bash
bun install -g @plimeor/code-wiki
code-wiki --help
```

For one-off usage without a global install:

```bash
bunx @plimeor/code-wiki --help
```

## Shared Wiki Quick Start

```bash
mkdir team-code-wiki
cd team-code-wiki
git init
code-wiki init --shared
code-wiki runtime set codex
code-wiki project add react --repo https://github.com/facebook/react/tree/main --ref v15.6.2
code-wiki scan
code-wiki project set react --ref v16.14.0
code-wiki scan react
code-wiki query "react 两个版本之间的差异是什么？"
```

Shared mode stores project entries by Git remote URL and ref. Managed clones are
created under `.code-wiki/repos/<project-id>/` and are ignored by Git.

## Embedded Quick Start

```bash
cd /path/to/repo
code-wiki init
code-wiki scan
```

Embedded mode stores a single repository wiki under `.code-wiki/wiki/`.

## Commands

```bash
code-wiki init --shared
code-wiki init
code-wiki runtime set codex
code-wiki runtime current
code-wiki runtime select
code-wiki project add react --repo https://github.com/facebook/react.git --ref v15.6.2
code-wiki project add chakra --repo https://github.com/chakra-ui/chakra-ui.git --ref main
code-wiki project set react --ref v19.0.0
code-wiki project list
code-wiki scan
code-wiki scan react
code-wiki query "react 15 和 16 的源码差异是什么？"
code-wiki query --project react --commits <commit-a>,<commit-b> "这两个 commit 的关键变化是什么？"
```

`project add` and `project set` accept `--ref` or `--commit`. Use one of them,
not both. A GitHub URL such as `https://github.com/facebook/react/tree/main` is
normalized to `https://github.com/facebook/react.git`; the URL ref is used only
when no explicit `--ref` or `--commit` is provided.

## State Files

Shared mode:

```text
.code-wiki/
  config.json
  projects.json
  projects/<project-id>/
  repos/
```

Embedded mode:

```text
.code-wiki/
  config.json
  project.json
  wiki/
```

Generated project wikis include `overview.md`, `index.md`, `index.json`,
`metadata.json`, `versions.json`, `log.md`, `modules/`, `contracts/`, and
`versions/<commit>/` snapshots. `query` reads current and historical snapshots,
builds a bounded source-evidence prompt, and asks the configured runtime to
answer with cited wiki/source context.
