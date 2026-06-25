# Current Agentic Workflow Cursor

Current goal: Implement `@plimeor/harness` from the accepted SDK requirement, draft architecture plan, and implementation tasking record.

Scope in:

- Workflow routing through `docs/index.md`.
- Current execution pointer in `docs/agent/current.md`.
- Requirement record: `docs/requirements/2026-06-24-harness-sdk-requirement.md`.
- Draft plan record: `docs/plans/2026-06-24-harness-sdk-plan.md`.
- Tasking record: `docs/agent/tasking/2026-06-24-harness-sdk-tasking.md`.

Scope out:

- Public API, schema, file format, and stable behavior contracts owned by package READMEs.
- Package boundaries, workspace structure, generated lockfiles, and source code behavior.

Active authority:

- Requirements: `docs/requirements/2026-06-24-harness-sdk-requirement.md`.
- Decisions: `docs/decisions/001-native-skills-manifest-installer.md`, `docs/decisions/002-command-kit.md`.
- Package public contracts: package-local README files.

Draft context:

- Plans: `docs/plans/2026-06-24-harness-sdk-plan.md`.
- Tasking: `docs/agent/tasking/2026-06-24-harness-sdk-tasking.md`.

Archived context:

- `docs/archive/2026-05-22-skills-cli-agent-targets-planning-record.md`.

Next step: Execute tasking records T001 through T006. Pause before T007 until the adapter-specific CLI matrix is approved.

Verification state: Requirement, draft plan, and implementation tasking captured on 2026-06-24; verify with file listing, front matter checks, link checks, and `git status --short`.

Stop condition: T001 through T006 are implemented and verified, and T007 either has an approved adapter-specific matrix or remains explicitly blocked.
