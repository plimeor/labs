# Spec: Code Wiki

Created: 2026-04-29
Status: Scan and query implementation
Source idea: `docs/ideas/2026-04-29-code-wiki.md`

## Objective

Build `code-wiki` as a local CLI that scans one or more Git repositories into durable,
reviewable Markdown wikis and answers questions from those generated wikis.

The current product proof is deliberately narrow: a workspace can register projects by
portable Git remote URL plus a branch, tag, or commit ref; `scan` fetches those projects
into ignored managed clones; generated wiki snapshots are preserved by commit; and `query`
uses the configured runtime to answer from current and historical wiki evidence before any
PRD review or coding-plan feature is reintroduced.

## Current Scope

Required commands:

```bash
code-wiki init --shared
code-wiki runtime set codex
code-wiki runtime current
code-wiki runtime select
code-wiki project add react --repo https://github.com/facebook/react.git --ref v15.6.2
code-wiki project set react --ref v16.14.0
code-wiki project list
code-wiki scan
code-wiki scan react
code-wiki query "react 15 和 16 的源码差异是什么？"
code-wiki query --project react --commits <commit-a>,<commit-b> "这两个 commit 的关键变化是什么？"
```

Embedded single-repository scanning remains supported:

```bash
code-wiki init
code-wiki scan
```

Out of scope for this phase:

- `review`, `correct`, `evaluate`, PRD analysis, and coding plan generation.
- End-to-end runtimes other than `codex`.
- Runtime plugin systems, hosted services, databases, embedding stores, dashboards, or web
  viewers.
- Preserving hand-edited generated wiki pages. Current scan output remains generated state
  for the selected ref; historical generated snapshots are preserved for query context.

## State

Shared workspace state:

```text
.code-wiki/
  config.json
  projects.json
  projects/
    <project-id>/
      overview.md
      index.md
      index.json
      metadata.json
      versions.json
      log.md
      modules/
      contracts/
      versions/
        <commit>/
          overview.md
          index.md
          index.json
          metadata.json
          modules/
          contracts/
  repos/                 Ignored managed clones
```

Project entries are portable. They must not store developer-local checkout paths.

```json
{
  "schemaVersion": 1,
  "projects": [
    {
      "id": "react",
      "displayName": "react",
      "repoUrl": "https://github.com/facebook/react.git",
      "ref": "v15.6.2",
      "managedRepoPath": ".code-wiki/repos/react",
      "wikiPath": ".code-wiki/projects/react"
    }
  ]
}
```

`project add` accepts GitHub `/tree/<ref>` URLs and normalizes them to cloneable Git URLs.
An explicit `--ref` or `--commit` overrides the URL ref.

## Scan Flow

For shared workspaces:

1. Read `.code-wiki/projects.json`.
2. For each selected project, ensure `.code-wiki/repos/<project-id>/` is a managed clone.
3. Fetch heads and tags from `origin`.
4. Resolve the configured `ref` as `HEAD`, branch, tag, or commit.
5. Skip unchanged projects when `metadata.json.lastScannedCommit` equals the resolved
   commit.
6. Checkout the resolved commit detached in the managed clone.
7. Generate current wiki output under `.code-wiki/projects/<project-id>/`.
8. Generate a commit snapshot under `.code-wiki/projects/<project-id>/versions/<commit>/`.
9. Rewrite generated module and contract pages for the current ref so old version pages do
   not survive as stale current state.
10. Write `index.json`, `metadata.json`, `versions.json`, and append `log.md`.

For embedded workspaces:

1. Resolve the current Git repository.
2. Skip unchanged commits.
3. Generate wiki output under `.code-wiki/wiki/`.

## Wiki Contract

Each generated wiki must include:

- `overview.md`: repository facts, configured ref, scanned commit, source shape, detected
  architecture signals, entry points, major subsystems, and durable contracts.
- `index.md`: human-readable routing index.
- `index.json`: deterministic machine-readable page index.
- `metadata.json`: project id, repo URL, configured ref, resolved branch, scanned commit,
  scan time, and include/exclude filters.
- `versions.json`: known scanned commits with refs, branches, scan times, and snapshot paths.
- `log.md`: append-only scan history.
- `modules/**/*.md`: source-group pages with key files, entry files, notable symbols,
  dependency hints, detected signals, common change points, and regression hints.
- `contracts/*.md`: package and route-like contracts when observed.

Generated Markdown pages must start with frontmatter containing stable id, kind, title,
authority, source refs, symbols, generated commit, content hash, and verification time.

`index.json` must stay deterministic and small enough to inspect before opening page bodies.

## Scanner Rules

- Ignore managed clones, dependency directories, build output, fixtures, and test-only
  directories by default.
- Prefer module groups that match real ownership boundaries, such as `packages/<name>`,
  `apps/<name>`, `src/<area>`, or root-level configuration.
- Do not hard-code framework-specific capability signals in the scanner. Generated wiki
  facts must come from observed files, symbols, imports, package metadata, and module
  boundaries.
- Do not carry old-version claims forward after a project ref changes. Old generated
  content may survive only under `versions/<commit>/` as explicit historical context.
- Treat generated wiki content as routing and inspection evidence, not final human design
  judgment.

## Query Flow

`query` requires a configured runtime. In this phase only `codex` is valid.

1. Resolve the workspace and selected project. If `--project` is omitted, infer the project
   from the question when possible.
2. Read `versions.json` and the current `metadata.json`.
3. Select commits from `--commits`, or use the latest known scanned snapshots.
4. Build a bounded prompt containing available snapshots, generic page-level deltas, and
   selected generated wiki page bodies.
5. Run the configured runtime in read-only mode and print its answer.

The query prompt must instruct the runtime to answer from provided wiki/source evidence,
cite commit refs and source paths, and state when the generated wiki lacks enough evidence.

## Runtime

Only `codex` is supported in this phase. Runtime configuration is retained because scanner
quality may later use Codex-assisted summarization, but scan correctness must not depend on
non-Codex runtimes.

## Testing

Required tests:

- CLI help exposes only `init`, `runtime`, `project`, `scan`, and `query` surfaces.
- `project add` stores portable repo URLs and refs.
- GitHub tree URLs normalize to cloneable repo URLs.
- `project set` updates refs so real workspaces can scan React 15, then React 16, then
  React 19 without hand-editing JSON.
- Shared scan uses managed clones and configured refs.
- Unchanged scans skip rewrites.
- Scan output includes deterministic `index.json`, required page frontmatter, metadata,
  module pages, contract pages, and scan logs.
- Ref changes remove stale generated pages and stale version signals.
- Ref changes preserve old generated snapshots under `versions/<commit>/`.
- `query` builds runtime context from multiple scanned commits and includes version deltas.
- Runtime commands support `codex` only.

Verification commands:

```bash
bun run --filter @plimeor/code-wiki test
bun run --filter @plimeor/code-wiki prepack
bun run check
bun run lint
```

## Success Criteria

This phase is done when:

- `code-wiki` no longer exposes `review`, `correct`, or `evaluate`.
- A workspace can register React by URL and ref, scan React 15, switch the project ref to
  React 16 and React 19, regenerate wiki output without stale current-version claims, and
  query across the retained historical snapshots.
- A workspace can register Chakra UI and generate a wiki that identifies its package,
  styling, and accessibility boundaries from source evidence instead of scanner presets.
- Integration tests cover the scan/project/runtime/query contracts above.
- README and this spec describe the scan + query product boundary.
