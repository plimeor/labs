# @plimeor/code-wiki

Scan Git repositories into durable Markdown wikis for source inspection and external agent context.

`code-wiki` stores state under `.code-wiki/`, keeps managed clones under `.code-wiki/repos/`,
and generates deterministic Markdown plus JSON indexes. This phase is scan-only: no `query`,
`context`, `review`, runtime configuration, or runtime selection commands.

## Installation

The published CLI is Bun-only and runs the TypeScript entrypoint directly:

```bash
bun install -g @plimeor/code-wiki
code-wiki --help
```

For one-off usage without a global install:

```bash
bunx @plimeor/code-wiki --help
```

## Quick Start

```bash
mkdir team-code-wiki
cd team-code-wiki
git init
code-wiki init
code-wiki project add react --repo https://github.com/facebook/react.git --ref v15.6.2
code-wiki scan
code-wiki project set react --ref v16.14.0
code-wiki scan react
```

CodeWiki stores portable Git remote URLs and refs. Managed clones live under
`.code-wiki/repos/<project-id>/` and generated wikis live under
`.code-wiki/projects/<project-id>/`; both are ignored by `.code-wiki/.gitignore`.

## Commands

```bash
code-wiki init
code-wiki project add react --repo https://github.com/facebook/react.git --ref v15.6.2
code-wiki project add chakra --repo https://github.com/chakra-ui/chakra-ui.git --ref main
code-wiki project set react --ref v19.0.0
code-wiki project list
code-wiki scan
code-wiki scan react
```

`project add` accepts a repo URL and optional `--ref`; `project set` only updates `--ref`. Repo URLs
are stored as provided and passed to Git without GitHub `/tree/<ref>` URL normalization.

## Generated Wiki

Generated wikis include `AGENTS.md`, `overview.md`, `index.md`, `index.json`, `metadata.json`,
`log.md`, `modules/`, and `contracts/`. `AGENTS.md` tells external CLIs to read `index.json`,
`overview.md`, then `index.md`, open only relevant pages, cite page paths and `sourceRefs`, and
inspect real diff/source before using the wiki for code review.
