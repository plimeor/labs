# Spec: Code Wiki

Created: 2026-04-29
Status: Draft for review
Source idea: `docs/ideas/2026-04-29-code-wiki.md`

## Objective

Build `code-wiki` as a PRD review-first code wiki CLI.

The first product proof is narrow: a small frontend team can register code projects, scan them into durable Markdown wikis, and review a PRD against selected project wikis to produce a more stable code-level implementation plan.

Success is not "complete repository documentation". Success is that a review report catches missing requirements, names concrete code changes, exposes integration risks, and gives the team a better implementation starting point before coding begins.

## Scope Layers

### MVP Required

The first implementation must support this shared-wiki flow:

```bash
cd /path/to/team-code-wiki
code-wiki init --shared
code-wiki runtime set codex
code-wiki projects add web-app --repo git@github.com:org/web-app.git
code-wiki projects add platform --repo git@github.com:org/platform.git
code-wiki projects list
code-wiki scan
code-wiki review prd.md
```

Required behavior:

- Shared-wiki mode stores wiki state in an independent Git repository.
- Shared projects are registered by Git remote URL, not by developer checkout path.
- CodeWiki clones and fetches registered projects under ignored managed clones in `.code-wiki/repos/<project-id>/`.
- `scan` defaults to auto mode: it fetches registered projects, compares each latest commit with the last scanned commit, and scans only changed or never-scanned projects.
- `review <prd>` defaults to auto mode: the configured agent proposes affected projects, shows the proposal to the user, and runs only after the user confirms or edits the project set.
- The first real runtime is Codex CLI.
- The durable source of truth is Markdown plus small JSON metadata files.

### Light Support

These features are allowed in the first implementation, but they must stay simple and must not dominate the core build:

- Embedded mode for a single code repository:

  ```bash
  cd /path/to/web-app
  code-wiki init
  code-wiki scan
  code-wiki review prd.md
  ```

- PRD input as local Markdown file, URL, or direct text.
- First-run runtime selection UI.
- Runtime ids for `claude-code`, `cursor`, and `kiro`, with adapter contract tests only.
- Manual overrides: `scan <project>` and `review <prd> --projects ...`.
- `correct` as a human correction capture path that appends to `log.md` or a correction note. It must not automatically rewrite durable decisions.

### Later

These are explicitly out of the first implementation path:

- End-to-end Claude Code, Cursor CLI, or Kiro CLI verification.
- Standalone `projects sync` command.
- `scan --all`.
- `scan <project> --ref <branch-or-commit>`.
- Automatic or semi-automatic `decisions/*.md` crystallization.
- React/Solid demo repository scans as part of product scope.
- HTML viewer, GitHub Pages publishing, rich diagrams, permissions, web app, approval UI, provider marketplace, or runtime plugin system.

## Assumptions

1. The package lives in `packages/code-wiki`.
2. The npm package name is `@plimeor/code-wiki`, and the executable name is `code-wiki`.
3. The first interface is command-line only.
4. Shared-wiki mode is the primary MVP path.
5. Embedded mode is a convenience path for single-repository use.
6. The first verified runtime is Codex CLI.
7. Managed clones are disposable cache, not durable wiki state.
8. Upstream CodeWiki is design reference only; this product is not a full CodeWiki or DeepWiki clone.

## Tech Stack

- Runtime: Bun.
- Language: TypeScript.
- Package location: `packages/code-wiki`.
- State format: Markdown plus JSON metadata.
- Agent runtime: local CLI adapter, with Codex as the first verified adapter.
- Validation: direct TypeScript validation helpers first; add a schema library only if validation code becomes repetitive.

## Commands

Workspace maintenance commands:

```bash
bun install
bun run check
bun run lint
bun run format
bun run --filter @plimeor/code-wiki test
bun run --filter @plimeor/code-wiki prepack
```

MVP user commands:

```bash
code-wiki init --shared
code-wiki runtime set codex
code-wiki runtime current
code-wiki projects add web-app --repo git@github.com:org/web-app.git
code-wiki projects list
code-wiki scan
code-wiki review prd.md
```

Light-support commands:

```bash
code-wiki init
code-wiki scan
code-wiki review prd.md
code-wiki scan web-app
code-wiki review prd.md --projects web-app,platform
code-wiki review --url https://example.com/prd --projects web-app,platform
code-wiki review --text "Add team-level billing controls" --projects web-app,platform
code-wiki runtime select
code-wiki runtime set claude-code
code-wiki runtime set cursor
code-wiki runtime set kiro
code-wiki correct web-app correction.md
```

Command behavior:

- `init --shared` initializes the current Git repository as a shared CodeWiki repository.
- `init` initializes the current code repository as an embedded single-project CodeWiki repository.
- `projects add <project> --repo <url>` registers a shared project by Git remote URL.
- `scan` in shared-wiki mode is auto by default: it checks every registered project's latest default-branch commit against the last scanned commit and scans only projects that changed.
- `scan <project>` in shared-wiki mode manually scans one project.
- `scan` in embedded mode is auto by default: it compares the current Git commit with the last scanned commit and skips if unchanged.
- `review <prd>` in shared-wiki mode asks the configured agent to propose affected projects, then requires user confirmation before running.
- `review <prd> --projects ...` in shared-wiki mode bypasses project proposal and reviews the explicit project set.
- `review <prd>` in embedded mode reviews the PRD against the current repository wiki.
- `runtime set codex` selects Codex without an interactive prompt.
- `runtime select` opens a simple runtime selector.

## Project Structure

Package layout:

```text
packages/code-wiki/
  package.json
  README.md
  src/
    cli.ts
    commands/
    workspace.ts
    projects.ts
    scanner/
    review/
    correction/
    runtime/
    markdown/
  test/
    commands/
    fixtures/
```

Shared-wiki state:

```text
.code-wiki/
  config.json
  projects.json
  reports/
    <timestamp>-<prd-slug>.md
  projects/
    <project-id>/
      overview.md
      index.md
      log.md
      modules/
      flows/
      metadata.json
  repos/                    Ignored managed clones
    <project-id>/
```

Embedded state:

```text
.code-wiki/
  config.json
  project.json
  reports/
    <timestamp>-<prd-slug>.md
  wiki/
    overview.md
    index.md
    log.md
    modules/
    flows/
    metadata.json
```

`decisions/*.md` is intentionally not part of the required MVP write path. It can be added later after the correction and crystallization workflow is proven.

## Project Flow

Shared-wiki mode:

1. `init --shared` writes `.code-wiki/config.json` with `mode: "shared"`, creates `.code-wiki/projects.json`, and ensures `.code-wiki/repos/` is ignored.
2. `projects add <project> --repo <url>` writes a portable project entry: project id, display name, repo URL, default branch, wiki path, and optional include/exclude rules.
3. Project entries must not contain developer-local checkout paths.
4. Managed clones under `.code-wiki/repos/` can be deleted and recreated from `projects.json`.

Embedded mode:

1. `init` writes `.code-wiki/config.json` with `mode: "embedded"` and `.code-wiki/project.json` with inferred Git identity.
2. The current Git repository is the only project.
3. Multi-project registration is not available in embedded mode.

## Scan Flow

Shared-wiki scan:

1. Resolve the shared CodeWiki repository and project registry.
2. If no project argument is provided, enter auto mode:
   - Ensure each registered project's managed clone exists.
   - Fetch each project's configured default branch.
   - Read the latest default-branch commit.
   - Compare it with the project's last scanned commit from `metadata.json`.
   - Select only projects whose latest commit differs from `lastScannedCommit`, plus never-scanned projects.
3. If a project argument is provided, scan only that project.
4. For each selected project, check out the latest default-branch commit in its managed clone.
5. Scan the managed clone.
6. Write wiki output under `.code-wiki/projects/<project-id>/`.
7. Write `metadata.json` with `lastScannedCommit`, branch, repo URL, scan time, and include/exclude rules.
8. Append a scan entry to that project's `log.md`, including scanned branch and commit.
9. If no projects changed, print an up-to-date result and do not rewrite wiki files.

Embedded scan:

1. Resolve the current Git repository and embedded config.
2. Compare the current Git commit with `.code-wiki/wiki/metadata.json.lastScannedCommit`.
3. If unchanged, print an up-to-date result and do not rewrite wiki files.
4. If changed or never scanned, scan the current repository.
5. Write wiki output under `.code-wiki/wiki/`.
6. Write `metadata.json` with `lastScannedCommit`, branch, repo URL, scan time, and include/exclude rules.
7. Append a scan entry to `.code-wiki/wiki/log.md`.

## Review Flow

Shared-wiki review:

1. Load the PRD source.
2. If `--projects` is provided, use that explicit project set.
3. If `--projects` is omitted, enter auto mode:
   - Ask the configured agent to inspect the PRD, project index, and latest scan metadata.
   - Produce a proposed affected-project set with short reasons.
   - Show the proposal to the user.
   - If the user confirms, use that set.
   - If the user rejects it, open a multi-select project picker and use the edited set.
4. Read each selected project's wiki.
5. Run Codex CLI through the runtime adapter.
6. Write one Markdown report under `.code-wiki/reports/`.

Embedded review:

1. Load the PRD source.
2. Read `.code-wiki/wiki/`.
3. Run Codex CLI through the runtime adapter.
4. Write one Markdown report under `.code-wiki/reports/`.

## Wiki Contract

Each project wiki contains:

- `overview.md`: project purpose, boundaries, entry points, major subsystems.
- `index.md`: routing index for humans and agents.
- `log.md`: append-only scan and correction history.
- `modules/*.md`: module responsibilities, key files, dependencies, common change points, regression hints.
- `flows/*.md`: important inferred or human-corrected flows.
- `metadata.json`: repository identity, `lastScannedCommit`, branch, include/exclude rules, scan metadata.

Automatic scan output is not final truth. Human corrections have higher authority than generated summaries.

## Review Report Contract

`review` writes a Markdown report with these sections:

1. Code-level objective: what concretely needs to change in code.
2. Missing requirements: PRD gaps and ambiguity that affect implementation.
3. Project plans: affected modules, concrete code changes, implementation steps, local risks, regression scope, verification notes.
4. Integration plan: contracts, coordination points, rollout order, open questions.

The report must distinguish observed wiki facts, PRD-derived requirements, inferred risks, and open questions.

## Runtime Contract

Required for MVP:

- `codex`: verified local Codex CLI adapter.

Light support:

- `claude-code`: runtime id and command-construction contract test.
- `cursor`: runtime id and command-construction contract test.
- `kiro`: runtime id and command-construction contract test.

Rules:

- First agent-backed use must select a runtime if none is configured.
- Runtime config is stored in CodeWiki state.
- Runtime adapters must check executable availability before running.
- Runtime adapters must write outputs through CodeWiki's Markdown renderer, not directly mutate durable wiki files.
- No public runtime plugin system in MVP.

## Code Style

Use direct command handlers with explicit validation at the boundary. Keep behavior in small modules; do not introduce a generic platform abstraction for future modes.

```ts
export type WorkspaceMode = "shared" | "embedded";
export type RuntimeId = "codex" | "claude-code" | "cursor" | "kiro";

export type ProjectRef = {
  id: string;
  wikiPath: string;
  managedRepoPath?: string;
};

export type PrdSource =
  | { kind: "file"; path: string }
  | { kind: "url"; url: string }
  | { kind: "text"; text: string };
```

Conventions:

- Keep markdown output deterministic and diffable.
- Keep `.code-wiki/repos/` disposable and ignored.
- Preserve the original PRD input reference in reports.
- Do not generalize runtime adapters beyond the four named runtime ids.

## Testing Strategy

Required behavior tests:

- Shared mode: `init --shared`, `projects add --repo`, auto `scan`, auto `review`.
- Managed clone: clone/fetch happens under `.code-wiki/repos/`; developer checkout paths are never used.
- Scan auto mode: unchanged `lastScannedCommit` skips wiki rewrites; changed commits trigger a scan and update metadata.
- Review auto mode: fake agent proposes projects, user confirmation is required, and user-edited project selection is respected.
- Embedded mode: `init`, `scan`, `review`.
- Runtime: Codex adapter command construction and executable availability checks.
- Report: generated Markdown contains the required report sections.

Light-support tests:

- Runtime command-construction contract tests for Claude Code, Cursor CLI, and Kiro CLI with fake executables.
- Assisted project selection with a fake runtime response.
- `correct` appends human correction state without rewriting `decisions/*.md`.

Verification commands:

```bash
bun run --filter @plimeor/code-wiki test
bun run --filter @plimeor/code-wiki prepack
bun run check
bun run lint
```

Per repo rule, do not add or run tests during implementation unless that task explicitly includes test work.

## Boundaries

Always:

- Keep wiki state file-backed and reviewable in Git.
- Keep shared projects portable by storing repo URLs, not local paths.
- Keep managed clones ignored and disposable.
- Make no-argument `scan` incremental by default using `lastScannedCommit`.
- Make no-argument shared-wiki `review` use agent-proposed project selection with user confirmation.
- Use Codex as the first verified runtime.
- Require explicit user confirmation before using runtime-proposed project sets.
- Preserve human corrections above generated scan output.
- Separate observed facts, model inference, and open questions in reports.

Ask first:

- Adding a database, service, web app, permission system, approval UI, or hosted viewer.
- Adding direct model HTTP calls.
- Making Claude Code, Cursor CLI, or Kiro CLI end-to-end supported.
- Adding `scan --all`, `--ref`, standalone `projects sync`, or repeated-review skipping based on unchanged PRD/project commits.
- Adding durable `decisions/*.md` crystallization.
- Changing `.code-wiki/` state locations.

Never:

- Depend on developer checkout paths in shared-wiki mode.
- Commit `.code-wiki/repos/`.
- Silently edit the source PRD.
- Treat automatic scan output as final human-confirmed knowledge.
- Start a shared-wiki review from runtime-guessed projects before user confirmation.
- Build a public runtime plugin system in MVP.

## Success Criteria

MVP is done when:

- A shared Wiki repository can register two projects by Git URL.
- `scan` creates or updates managed clones, skips unchanged projects by comparing `lastScannedCommit`, and writes changed project wikis.
- `review prd.md` asks Codex to propose affected projects, requires user confirmation or edited selection, and writes a Markdown report with code-level objective, missing requirements, project plans, integration plan, regression scope, and open questions.
- The Codex runtime path works end to end.
- Embedded mode can run `init`, `scan`, and `review` for one repository.
- Managed clones are ignored by Git.
- Tests cover shared mode, embedded mode, managed clone behavior, Codex adapter, and report shape.

## Open Questions

1. Should managed clones be full clones, shallow clones by default, or configurable per project?
2. Should embedded mode's `.code-wiki/` directory be committed by default, or should teams opt in file by file after the first scan?
3. What exact non-interactive Codex CLI invocation should the adapter use?
4. What is the smallest correction file format that is comfortable for reviewers to write?
5. How should URL inputs be fetched when authentication, login state, or internal network access is required?
6. Should repeated-review skipping be added later by comparing PRD source identity plus selected project commits with a previous report?
