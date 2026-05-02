# @plimeor/code-wiki

Code wiki CLI for codebase Q&A, PRD review, and coding plan generation.

The executable is `code-wiki`. It stores durable wiki state as Markdown plus
small JSON metadata files under `.code-wiki/`, keeps managed clones under
`.code-wiki/repos/`, and gives local agent runtimes focused code context for
answering codebase questions, reviewing PRDs, and producing coding plans.

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
code-wiki projects add web-app --repo git@github.com:org/web-app.git
code-wiki projects add platform --repo git@github.com:org/platform.git
code-wiki projects list
code-wiki scan
code-wiki review prd.md
```

Shared mode stores project entries by Git remote URL. Managed clones are
created under `.code-wiki/repos/<project-id>/` and are ignored by Git.

## Embedded Quick Start

```bash
cd /path/to/web-app
code-wiki init
code-wiki runtime set codex
code-wiki scan
code-wiki review prd.md
```

Embedded mode stores a single repository wiki under `.code-wiki/wiki/`.

## Commands

```bash
code-wiki init --shared
code-wiki init
code-wiki runtime set codex
code-wiki runtime current
code-wiki runtime select
code-wiki projects add web-app --repo git@github.com:org/web-app.git
code-wiki projects list
code-wiki scan
code-wiki scan web-app
code-wiki review prd.md
code-wiki review prd.md --projects web-app,platform
code-wiki review --url https://example.com/prd --projects web-app
code-wiki review --text "Add team-level billing controls" --projects web-app
code-wiki correct web-app correction.md
```

`review <prd>` in shared mode asks the configured runtime to propose affected
projects and requires confirmation before it runs. Use `--projects` to bypass
the proposal step with an explicit project set.

## State Files

Shared mode:

```text
.code-wiki/
  config.json
  projects.json
  reports/
  projects/<project-id>/
  repos/
```

Embedded mode:

```text
.code-wiki/
  config.json
  project.json
  reports/
  wiki/
```
