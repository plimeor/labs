# Spec: Code Wiki

Created: 2026-04-29
Status: Scan-only implementation
Source idea: `docs/ideas/2026-04-29-code-wiki.md`

## Objective

Build `code-wiki` as a local CLI that scans Git repositories into durable Markdown wikis.
External CLIs/agents read the generated wiki through `AGENTS.md`; CodeWiki does not expose a
runtime-backed query surface.

## Current Scope

Required commands:

```bash
code-wiki init --shared
code-wiki project add react --repo https://github.com/facebook/react.git --ref v15.6.2
code-wiki project set react --ref v16.14.0
code-wiki project list
code-wiki scan
code-wiki scan react
```

Embedded single-repository scanning remains supported:

```bash
code-wiki init
code-wiki scan
```

Non-goals: `query`, `context`, `review`, `correct`, `evaluate`, PRD/coding-plan generation,
runtime config or selection, runtime plugins, cross-version QA, version snapshots, hosted
services, databases, embedding stores, dashboards, web viewers, and preserving hand-edited
generated pages.

## State

Shared workspace state:

```text
.code-wiki/
  config.json
  projects.json
  projects/<project-id>/
  repos/                 Ignored managed clones
```

Embedded workspace state:

```text
.code-wiki/
  config.json
  project.json
  wiki/
```

`config.json` stores only workspace mode and schema version. Runtime selection is not part of
workspace state. Project entries are portable and must not store developer-local checkout
paths. `project add` accepts GitHub `/tree/<ref>` URLs and normalizes them to cloneable Git
URLs; explicit `--ref` or `--commit` overrides the URL ref.

## Scan Flow

Shared scan reads `projects.json`, maintains ignored managed clones, fetches `origin`, resolves
`ref` as `HEAD`, branch, tag, or commit, checks out the resolved commit detached, then writes
current wiki output under `.code-wiki/projects/<project-id>/`.

Embedded scan resolves the current Git repository and writes current wiki output under
`.code-wiki/wiki/`.

Both modes skip only when the commit and scan contract inputs are unchanged and the wiki root
already has the current contract. Scan rewrites generated module/contract pages, writes
`AGENTS.md`, `overview.md`, `index.md`, `index.json`, `metadata.json`, appends `log.md`, and
removes legacy `versions.json` / `versions/` outputs.

## Wiki Contract

Each generated wiki root must include `AGENTS.md`, `overview.md`, `index.md`, `index.json`,
`metadata.json`, `log.md`, `modules/**/*.md`, and observed `contracts/*.md`.

Generated Markdown pages must start with frontmatter containing stable id, kind, title,
authority, source refs, symbols, generated commit, content hash, and verification time.

`index.json` must stay deterministic and small enough to inspect before opening page bodies.
`AGENTS.md` must define this reading order: `index.json`, `overview.md`, `index.md`, then only
relevant module/contract pages. It must require citations to wiki page paths and `sourceRefs`,
explicit missing-evidence statements, real diff/source inspection for code review, and no
direct edits to generated wiki files.

## Scanner Rules

- Ignore managed clones, dependency directories, build output, fixtures, and test-only
  directories by default.
- Prefer module groups that match real ownership boundaries, such as `packages/<name>`,
  `apps/<name>`, `src/<area>`, or root-level configuration.
- Do not hard-code framework-specific capability signals in the scanner. Generated wiki facts
  must come from observed files, symbols, imports, package metadata, and module boundaries.
- Do not carry old-ref claims forward after a project ref changes.
- Do not write or read `versions.json` or `versions/<commit>` snapshots.
- Treat generated wiki content as routing and inspection evidence, not final human design
  judgment.

## Internal Runtime Adapter

Runtime is an internal code adapter boundary only. It is not exposed through the CLI and does
not participate in scan/query orchestration. Current shape: `RuntimeId = 'codex'`,
`RuntimeRunOptions = { cwd, prompt, outputPath? }`, and `RuntimeAdapter = { id,
assertAvailable(), run(options) }`. Only the `codex` adapter exists.

## Testing

Required tests cover CLI surface, portable project refs, GitHub tree URL normalization, project
ref updates, shared managed-clone scans, unchanged-scan skips, generated wiki outputs including
`AGENTS.md`, stale-page cleanup, no version snapshots, and the internal codex adapter contract.

Verification commands:

```bash
bun run --filter @plimeor/code-wiki test
bun run --filter @plimeor/code-wiki prepack
bun run check
bun run lint
```

## Success Criteria

This phase is done when:

- `code-wiki` exposes only `init`, `project`, and `scan` as top-level CLI surfaces.
- Runtime configuration is absent from user-visible workspace state.
- Ref changes regenerate current wiki output without stale current-ref claims.
- Generated wiki roots contain `AGENTS.md` with the external CLI reading protocol.
- README and this spec describe the scan-only product boundary.
