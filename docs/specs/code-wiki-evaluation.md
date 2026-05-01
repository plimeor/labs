# Spec: Code Wiki Evaluation

Created: 2026-05-01
Status: Draft for review
Related spec: `docs/specs/code-wiki.md`

## Objective

Build a local `code-wiki evaluate` workflow that scores scan, review, and correction behavior against repeatable benchmarks, then produces evidence-backed improvement suggestions.

The goal is not to prove that the wiki is complete. The goal is to detect whether `code-wiki` is improving at its real product job: turning registered code projects and PRDs into accurate routing, useful code-level plans, visible risks, and maintainable human corrections.

Primary users:

- CodeWiki maintainers who need to compare behavior before and after scanner, prompt, runtime, or wiki contract changes.
- Small frontend teams that want a reviewable quality signal before trusting `code-wiki` on real PRDs.

Success means an evaluation run can answer:

1. Did `scan` produce routable, traceable, contract-aware wiki state?
2. Did `review` select the right project and page context?
3. Did the report identify missing requirements, concrete implementation work, integration risks, and open questions?
4. Did human corrections survive and influence later review?
5. Which specific behavior should be improved next, and what evidence supports that recommendation?

## Scope Layers

### MVP Required

The first evaluation implementation must support this local workflow:

```bash
code-wiki evaluate init
code-wiki evaluate benchmark init twenty-crm
code-wiki evaluate benchmark project add twenty-crm twenty --repo https://github.com/twentyhq/twenty.git --ref <commit>
code-wiki evaluate case add twenty-crm record-field-permissions --prd prd.md --oracle oracle.md --expected expected.json
code-wiki evaluate run twenty-crm --output .code-wiki/evaluation/runs
code-wiki evaluate baseline set twenty-crm .code-wiki/evaluation/runs/<run-id>
code-wiki evaluate compare twenty-crm --candidate .code-wiki/evaluation/runs/<candidate-run-id>
code-wiki evaluate suggest .code-wiki/evaluation/runs/<candidate-run-id>
```

Required behavior:

- Benchmarks are file-backed and can be committed with the package or a team wiki repository.
- Benchmarks define their target projects by Git repo URL and pinned ref, so any repository can be evaluated without depending on a developer checkout path.
- Cases run in disposable workspaces, not against a developer's live checkout.
- Evaluation outputs are durable JSON plus Markdown reports under `.code-wiki/evaluation/runs/<run-id>/`.
- Scoring combines deterministic checks with optional judge-assisted rubric scoring.
- Every score must trace back to artifacts: generated wiki files, routing indexes, review reports, correction logs, oracle answer keys, expected fixtures, or judge rationales.
- Improvement suggestions are written as proposals. They must not automatically change scanner code, prompts, runtime config, wiki files, or source projects.

### Light Support

These features are allowed in the first implementation if they stay small:

- Built-in benchmark templates under `packages/code-wiki/evaluation/benchmarks/`.
- Team-local benchmarks under `.code-wiki/evaluation/benchmarks/`.
- `--case <case-id>` to run a single case.
- Fake runtime and fake judge adapters for deterministic contract tests.
- JSON output for CI-friendly threshold checks.

### Later

These are out of the first evaluation path:

- Hosted dashboard, web UI, telemetry, production monitoring, or user analytics.
- Automatic prompt rewriting, scanner tuning, runtime selection, or wiki regeneration based on score.
- Reinforcement learning, fine-tuning, or self-training loops.
- Direct model HTTP calls outside the configured runtime boundary.
- Database, embedding store, or external search service as required evaluation infrastructure.
- Treating a single opaque LLM judge score as the final quality signal.

## Assumptions

1. Evaluation is part of the `@plimeor/code-wiki` package, not a separate service.
2. The evaluator runs locally with Bun and TypeScript.
3. The evaluator can reuse `code-wiki` command handlers through internal APIs or subprocess calls.
4. The first built-in complex benchmark targets a pinned commit of `twentyhq/twenty`.
5. Users can create benchmarks for any Git repository by providing repo URL, project id, and pinned ref.
6. Large-repository quality is evaluated through routing, traceability, context selection, report quality, and correction behavior.
7. Judge-assisted scoring is optional and must be auditable.
8. Oracle answer keys are the target truth. Baseline runs are only historical comparison points.

## Tech Stack

- Runtime: Bun.
- Language: TypeScript.
- State format: JSON artifacts plus Markdown reports.
- Benchmark targets: Git repo URLs plus pinned refs.
- Evaluation fixtures: local PRDs, oracle answer keys, expected JSON, optional correction files.
- Judge runtime: the same runtime adapter boundary as `code-wiki`, or a deterministic fake judge in tests.
- Validation: direct TypeScript validation helpers first; add a schema library only if benchmark and result validation becomes repetitive.

## Commands

MVP commands:

```bash
code-wiki evaluate init
code-wiki evaluate benchmark init twenty-crm
code-wiki evaluate benchmark project add twenty-crm twenty --repo https://github.com/twentyhq/twenty.git --ref <commit>
code-wiki evaluate case add twenty-crm record-field-permissions --prd prd.md --oracle oracle.md --expected expected.json
code-wiki evaluate run twenty-crm --output .code-wiki/evaluation/runs
code-wiki evaluate report .code-wiki/evaluation/runs/<run-id>
code-wiki evaluate baseline set twenty-crm .code-wiki/evaluation/runs/<run-id>
code-wiki evaluate compare twenty-crm --candidate .code-wiki/evaluation/runs/<candidate-run-id>
code-wiki evaluate suggest .code-wiki/evaluation/runs/<candidate-run-id>
```

Light-support commands:

```bash
code-wiki evaluate benchmark import packages/code-wiki/evaluation/benchmarks/twenty-crm/benchmark.json
code-wiki evaluate run twenty-crm --case record-field-permissions --output .code-wiki/evaluation/runs
code-wiki evaluate compare twenty-crm --json --candidate .code-wiki/evaluation/runs/<candidate-run-id>
code-wiki evaluate baseline current twenty-crm
```

Command behavior:

- `evaluate init` creates `.code-wiki/evaluation/` and its benchmark, baseline, and run directories.
- `evaluate benchmark init <benchmark>` creates an empty benchmark manifest.
- `evaluate benchmark project add <benchmark> <project> --repo <url> --ref <commit-or-tag>` adds a benchmark target project by portable Git identity.
- `evaluate benchmark import <path>` copies a built-in or external benchmark definition into the current CodeWiki evaluation workspace.
- `evaluate case add <benchmark> <case> --prd <path> --oracle <path> --expected <path>` registers one case and its oracle answer key.
- `evaluate run <benchmark>` creates a new run directory, clones target projects at pinned refs into a disposable workspace, executes each case, scores the artifacts, and writes `run.json`, `scores.json`, `report.md`, and case artifacts.
- `evaluate report <run-dir>` renders or re-renders the Markdown report for an existing run directory.
- `evaluate baseline set <benchmark> <run-dir>` marks an accepted run as that benchmark's historical baseline only when explicitly invoked.
- `evaluate baseline current <benchmark>` prints the current accepted baseline run for the benchmark.
- `evaluate compare <benchmark> --candidate <run-dir>` compares the candidate run against that benchmark's accepted baseline unless an explicit `--baseline <run-dir>` is provided.
- `evaluate suggest <run-dir>` reads one run directory and writes an improvement proposal with evidence, likely root causes, candidate changes, and verification steps.

## Benchmark, Oracle, and Baseline

The evaluation workflow uses three different artifacts:

- Benchmark: a repeatable task set with target repositories, pinned refs, PRDs, oracle answer keys, expected structured facts, scoring weights, and thresholds.
- Oracle answer key: the human-confirmed target answer for one case. It is created by reading the target repository code, schemas, tests, docs, and known flows. It is the source of truth for scoring.
- Baseline run: a previously accepted `evaluate run` output. It is used only for regression comparison and must not replace the oracle.

Rules:

- A benchmark may target any Git repository that CodeWiki can clone.
- Target project refs must be pinned to a commit hash or immutable tag for repeatability.
- Oracle answer keys must include code evidence such as file paths, symbols, schema names, resolver names, tests, or config paths.
- A baseline run is accepted only through `evaluate baseline set`.
- Replacing a baseline does not change the oracle. Changing an oracle requires an explicit benchmark fixture update.

## Project Structure

Package additions:

```text
packages/code-wiki/
  evaluation/
    benchmarks/
      twenty-crm/
        benchmark.json
        cases/
          <case-id>/
            case.json
            prd.md
            oracle.md
            expected.json
    rubrics/
      review-report.md
      scan-routing.md
  src/
    evaluate/
      benchmark.ts
      case-runner.ts
      scoring.ts
      compare.ts
      suggest.ts
      report.ts
```

Team-local optional structure:

```text
.code-wiki/
  evaluation/
    benchmarks/
      <benchmark-id>/
        benchmark.json
        cases/
    baselines/
      <benchmark-id>.json
    runs/
      <timestamp>-<benchmark-id>/
        run.json
        scores.json
        report.md
        suggestions.md
        cases/
          <case-id>/
            artifacts/
```

## Evaluation Inputs

A benchmark defines target projects, cases, weights, thresholds, and scoring modes:

```json
{
  "schemaVersion": 1,
  "id": "twenty-crm",
  "projects": [
    {
      "id": "twenty",
      "repo": "https://github.com/twentyhq/twenty.git",
      "ref": "<commit>"
    }
  ],
  "cases": ["record-field-permissions", "bulk-record-update"],
  "weights": {
    "scanContract": 20,
    "routing": 20,
    "review": 40,
    "correction": 10,
    "evidence": 10
  },
  "thresholds": {
    "pass": 80,
    "regressionBudget": -3
  }
}
```

Each case defines PRD input, oracle answer key, expected affected context, and expected report findings:

```json
{
  "schemaVersion": 1,
  "id": "record-field-permissions",
  "mode": "shared",
  "projects": ["twenty"],
  "prd": "prd.md",
  "oracle": "oracle.md",
  "expected": {
    "affectedProjects": ["twenty"],
    "requiredPageIds": ["module.object-record.fields", "contract.graphql.object-records"],
    "requiredEvidence": [
      "packages/twenty-front/src/modules/object-record/**",
      "packages/twenty-server/src/engine/**"
    ],
    "missingRequirements": ["field visibility behavior for read-only users"],
    "integrationRisks": ["frontend-only hiding can leak fields through API responses"],
    "negativeExpectations": ["Do not treat this as a pure UI change"]
  }
}
```

Rules:

- Built-in benchmarks should be small enough to review manually, even when the target repository is large.
- Team-created benchmarks can point at any reachable Git repository.
- Expected outputs should name durable ids, source refs, or report facts, not depend on exact prose.
- Cases should include at least one negative expectation, such as a project that should not be selected.
- Benchmarks must pin target refs and scoring weights so historical comparisons remain meaningful.
- Oracle answer keys should be updated rarely and only when the benchmark author confirms that the previous standard answer was wrong or intentionally superseded.

## Scoring Model

Scores are normalized to `0..100`. The overall score is a weighted average from the benchmark manifest.

Required score groups:

- `scanContract`: validates wiki contract shape.
- `routing`: evaluates whether `index.json` and page metadata route review to the expected pages.
- `review`: evaluates project selection, context selection, missing requirement detection, implementation plan usefulness, integration risk coverage, and open question quality.
- `correction`: evaluates whether human corrections are preserved, marked with higher authority, and used in later review.
- `evidence`: evaluates whether reports distinguish observed facts, PRD-derived requirements, inferred risks, and open questions with page ids, contract ids, source refs, or explicit uncertainty.

Deterministic checks should score:

- JSON validity and schema version compatibility.
- Required wiki files exist.
- Required page frontmatter exists.
- Stable page ids are present in `index.json`.
- `sourceRefs`, `symbols`, and `dependsOn` fields are present where expected.
- Required review report sections exist.
- Expected project ids and page ids appear in selected context or final report.
- Expected oracle evidence appears in selected context or final report where relevant.
- Human-corrected or human-confirmed pages are not overwritten by later scans.

Judge-assisted checks may score:

- Whether a missing requirement was substantively identified even if wording differs.
- Whether an implementation plan names concrete code changes rather than generic advice.
- Whether integration risks are specific enough to act on.
- Whether open questions are blockers, useful clarifications, or noise.

Judge-assisted scores must store:

- Judge runtime id.
- Prompt or rubric version.
- Input artifact references.
- Raw judge output.
- Extracted score and rationale.

## Improvement Loop

Evaluation supports a conservative improvement loop:

1. Run a benchmark.
2. Compare against an accepted baseline.
3. Identify regressions, low-scoring groups, and repeated failure patterns.
4. Generate `suggestions.md` with evidence-backed candidate improvements.
5. Human reviews and chooses which improvement to implement.
6. After implementation, rerun the same benchmark and compare against the baseline.

`suggestions.md` must separate:

- Observed failures.
- Root-cause hypotheses.
- Candidate changes.
- Expected score movement.
- Verification commands.
- Risks or boundary changes.

The evaluator must not automatically apply suggestions. Automatic optimization is a later boundary change.

## Code Style

Use explicit typed records and direct validation at the boundary. Keep scoring functions small and deterministic where possible.

```ts
export type ScoreGroup =
  | "scanContract"
  | "routing"
  | "review"
  | "correction"
  | "evidence";

export type EvaluationScore = {
  group: ScoreGroup;
  score: number;
  maxScore: number;
  findings: EvaluationFinding[];
};

export type EvaluationFinding = {
  benchmarkId: string;
  caseId: string;
  group: ScoreGroup;
  severity: "pass" | "warning" | "fail";
  message: string;
  evidence: string[];
};
```

Conventions:

- Store machine-readable results in JSON and human-readable explanations in Markdown.
- Keep run ids stable and sortable: `<timestamp>-<benchmark-id>`.
- Do not use exact Markdown prose matching when checking semantic review quality.
- Prefer ids, source refs, and structured report sections as scoring anchors.
- Use guard clauses instead of nested ternary expressions.

## Testing Strategy

Required behavior tests:

- Benchmark manifest validation accepts valid benchmarks and rejects missing weights, duplicate case ids, and unknown score groups.
- Benchmark project validation rejects missing repo URLs, missing pinned refs, duplicate project ids, and developer-local checkout paths.
- Case runner executes in a disposable workspace and does not mutate fixture source directories.
- Deterministic scoring catches missing `index.json`, missing frontmatter, missing required report sections, and overwritten human corrections.
- Review scoring can match expected project ids and page ids without depending on exact report prose.
- Compare reports score deltas and flags regressions beyond the benchmark's regression budget.
- Suggestion generation includes evidence, hypotheses, candidate changes, and verification commands without applying changes.

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

- Keep benchmarks, cases, rubrics, results, and baselines file-backed and reviewable in Git.
- Keep benchmark target projects portable by storing repo URLs and pinned refs, not local checkout paths.
- Run cases in disposable workspaces.
- Preserve raw artifacts needed to audit scores.
- Separate deterministic scores from judge-assisted scores.
- Cite evidence for every warning, failure, and improvement suggestion.
- Keep score weights explicit in the benchmark manifest.
- Keep oracle answer keys separate from baseline run outputs.
- Treat evaluation output as decision support, not automatic authorization to change product behavior.

Ask first:

- Adding direct model HTTP calls.
- Adding a database, embedding store, hosted dashboard, telemetry, or production monitoring.
- Automatically applying prompt, scanner, runtime, wiki, or source-code changes based on scores.
- Replacing an accepted baseline.
- Changing oracle answer keys after benchmark results exist.
- Changing score weights after baselines exist.
- Using private team repositories as committed package fixtures.

Never:

- Mutate a developer's live checkout during evaluation.
- Depend on developer-local checkout paths in benchmark definitions.
- Hide judge prompts, judge outputs, or failed cases.
- Present a score without artifact-backed evidence.
- Treat a single LLM judge score as the only quality signal.
- Silently update baselines to make regressions disappear.
- Treat a baseline run as the standard answer.
- Commit secrets, credentials, private PRDs, or private source code into package fixtures.

## Success Criteria

The evaluation mechanism is ready when:

- `code-wiki evaluate init` creates the evaluation workspace.
- `code-wiki evaluate benchmark project add <benchmark> <project> --repo <url> --ref <commit>` stores a portable benchmark target.
- `code-wiki evaluate run <benchmark> --output .code-wiki/evaluation/runs` creates a complete run directory.
- `scores.json` includes per-case, per-group, and overall scores from explicit weights.
- `report.md` explains pass/fail status, low-scoring cases, and evidence links.
- `evaluate baseline set` records an accepted run for historical comparison without changing oracle answer keys.
- `evaluate compare` identifies improvements and regressions between baseline and candidate run directories.
- `evaluate suggest` creates a reviewable improvement proposal without mutating product code, prompts, wiki state, runtime config, or source projects.
- Tests cover benchmark validation, isolated case execution, deterministic scoring, baseline management, comparison, and suggestion generation.

## Open Questions

1. Which exact Twenty commit should the built-in benchmark pin?
2. Should judge-assisted scoring be disabled by default until the Codex runtime invocation is stable?
3. What threshold should block a release: overall score, score-group minimum, or explicit regression budget?
4. Should team-local evaluation runs be committed by default, or should only accepted baselines be committed?
5. What exact human correction fixture format should be used before `correct` is fully implemented?
