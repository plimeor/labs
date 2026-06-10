# Anchor v1 — Autonomous Agent Loop Driver

任务（task）：驱动一个无上下文的新 agent，沿 checkpoint 程序逐相推进 Anchor v1，每轮产出一份编号证据文档，遇人审 gate 即停。
日期（date）：2026-06-10
状态（status）：**driver document（loop hand-off）** —— 非公开接口契约。本文件是给每一轮 fresh agent 的唯一入口手册。

> **边界声明（AGENTS 工作台规则，强制 / mandatory boundary declaration）：** 创建或阅读本文件**不授权**任何 package / workspace / 产品 app / 生成 lockfile / 代码改动；**不**改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；**不**创建产品 app shell / entitlement / bundle id / iCloud container。本文件是流程驱动手册，不是接口契约。权威 CLI/API/schema/file-format 契约在实现后归 `anchor-core` 包 README。本目录下所有 workbench 文档同此规则。

---

## 1. Purpose

This document is the **single hand-off** a human gives to a fresh agent that has no prior context. It tells that agent how to advance the **Anchor v1** project one phase at a time, autonomously, producing exactly one new numbered evidence document per iteration, and stopping cleanly at human-approval gates.

**Project in one paragraph.** Anchor v1 is a local-first, Apple-native-first knowledge **"Note"** workbench (a native Note model, not a Markdown text shell). Its truth layer is a platform-agnostic Rust `anchor-core` crate built on an append-only **op-log** with a single validated dispatch path, a **three-register conflict model** (location / content / life), deterministic 3-way merge + causality-aware LWW + OR-Set + life-lattice merge, and content-addressed journal identity. macOS and iOS ship first via an **in-process Swift binding** (UniFFI DTO + C ABI bytes fast path); SQLite projection and `.md` / `.json` mirrors are **derived outputs**; **iCloud Drive** is the first-period sync transport behind a transport-neutral `OpSyncPort`. The program is documentation-gated and checkpoint-driven: each phase produces a numbered evidence doc; a human approves each checkpoint.

**Where we are right now (cursor; 2026-06-10 update).** CP-0 **approved** (2026-06-07). All **Claude/core-executable** work through CP-1, CP-2, and the Stage-2 ground floor has been driven to completion: CP-1 core conditions met (85 tests, multi-target compile + zero-cloud-symbol gates green); **CP-2 core landed** — single-validated-dispatch chokepoint (grep-provable) + `validate_batch`, all-or-nothing structural macros, `split_merge_structural` conflict materialization (no silent loss), D24 op-shape full-envelope freeze + golden vector, native+wasm cross-target execution (`23-cp-2-core-readiness.md`); **Stage-2** authoritative contract written as `suites/anchor/core/README.md` + concrete reference `OpSyncPort` adapter (`24-stage-2-core-ground-floor.md`). The remaining gates are exactly those a pure-Claude agent **cannot** self-execute: CP-1 Apple-runtime delivery (remote iCloud / distribution) + **human sign-off** (`22-cp-1-exit-report.md`), and a few large/Phase-2-gated core items (op-segment codec, importer, intent-rebase, CLI schema). B4 binding + B14 iCloud boundaries user-approved 2026-06-07. CP-1/CP-2/Stage-2 have **not** exited as whole checkpoints (each is a human gate). The workbench was consolidated 76→25 docs and scrubbed of device/account PII. See §6.

**Hard truth the loop must respect.** CP-1 whole-exit needs Apple runtime on a **signed device with a paid Apple Developer Program account and a real iCloud account**, plus a **human approval**. A pure-Claude agent cannot self-execute that. The loop's terminal autonomous step is to assemble all closeable core/boundary evidence into a CP-1-exit report and then **dispatch the Codex/Apple verifier or hand to the human operator** — never fabricate Apple results.

---

## 2. How to use this loop

You are a fresh agent. Before doing anything, **orient** by reading the documents below in order. Do not act from memory; the docs are authoritative.

**Required read-set (in this order):**

1. `21-stage-1-integration-report.md` — **the live cursor / progress ledger.** Read its §1 conclusion, §3 readiness matrix, §6 open gates, §9 exact commands + env, §11 stop conditions.
2. `11-cp-0-final.md` — frozen CP-0 conclusions + **§5 scope-fence prohibitions (ten items)**.
3. `10-cp-0-approval.md` — §0 (B4 / B14 approval state) + §8 (per-item approval checklist).
4. `12-stage-1-spike-plan.md` — **§6 = the CP-1 exit criteria** (5 numbered conditions) + §13 pause conditions.
5. `16-codex-apple-input.md` — the core→Apple called surface + golden truth (what Codex consumes, never re-derives).
6. `14-core-spike-report.md` + `15-core-evidence.md` — core side evidence (already complete; sanity-reference only).
7. `04-contract-baseline.md` / `05-key-decisions.md` (D01–D38) / `06-fixture-set.md` (F01–F43) — **backfill targets** (responsibility matrix).
8. `01-apple-native-note-workbench.md` + `02-conflict-resolution-model.md` — spec / history (read as needed).

> **Authority precedence.** The flattened docs in this directory are authoritative. The user's auto-memory (`MEMORY.md` / `anchor-architecture.md`, 2026-06-07 snapshot) is **behind**: it still says iCloud is "compromise, NOT default-transport-approved." That is **stale** — commits `1fb1934` (approve iCloud default transport) and `096c4d6` (approve B4 binding) landed after, and `10-cp-0-approval.md §0` records both as user-approved 2026-06-07. **Trust the docs.** Do not re-open B4, B14, Option A layout, the 50 MB cap, or journal identity.

---

## 3. The loop algorithm

Run this deterministically each iteration. One iteration = one new evidence doc (or one clean STOP).

1. **Orient.** Read the latest read-set (§2). Find the **highest-numbered** `NN-*.md` evidence doc and the latest integration / synthesis report (currently `21`). Read its axis matrix, "remaining work," and "stop condition" sections.
2. **Determine the current cursor.** Identify the active checkpoint (currently **CP-1**, Apple half, mid-flight). Cross-check approval gate letters with dates (e.g. `B4 approved 2026-06-07`, `B14 approved 2026-06-07`) to know what is already signed and must not be re-opened.
3. **Select the next action.** Pick the **single lowest-risk open gate within the current checkpoint** that trips **no** stop condition (§7) and **no** scope fence (§8). Prefer machine gates and already-approved "compromise" sub-gates. **Never jump checkpoints.** Classify the owner:
   - **core / deterministic** → Claude (you) execute it.
   - **Apple runtime / signed device / paid ADP / iOS hardware** → the action is **"dispatch the Codex/Apple verifier round"** (or hand to the human operator) using the exact env + commands from `21 §9`. You do **not** attempt the Apple runtime yourself.
4. **Execute within scope.** Do the work. Capture **Observed evidence = command + its output** (test counts, `rg` pattern + match count + exit code, `xcodebuild` result, benchmark ms / RSS, golden `snapshot_revision` hex). Re-use frozen golden values; never re-derive them.
5. **Write the evidence doc** at the next free `NN-kebab-name.md` (§4). Include the Chinese frontmatter (任务 / 日期 / 状态) + the mandatory 边界声明, the Observed command+output, verdicts, what closed, what remains.
6. **Update the progress ledger.** The integration / readiness report **is** the ledger. Re-emit the per-axis verdict matrix (go / approved / release-gated / compromise / blocked / no-go) and the open-gate checklist, each item marked closed / open + an evidence pointer. Append a ledger entry using the §9 template. **Backfill** any model adjustment into `04` / `05` / `06` under the **existing** D/F numbers — never as a new doc.
7. **Evaluate the gate (§6).** If all current-checkpoint exit criteria are now met → produce a checkpoint-exit report and **STOP** for human sign-off. If a stop condition / "Needs user approval" / "blocked" / "no-go" was hit → **STOP** and escalate with a crisp decision request. Otherwise → continue.
8. **Continue or STOP-for-human.** If continuing, return to step 1 for the next iteration. Every iteration produces exactly one numbered doc + ledger update; no silent work.

---

## 4. Phase roadmap (checklist)

Each phase is "done" only when its named evidence doc exists **AND** (for CP-N gates) the human approves the checkpoint. The agent **never self-certifies a checkpoint exit**. Projected/future stages are marked **(projected)**.

| ID | Name | Status | Exit criteria (short) | Evidence artifacts | Owner |
|---|---|---|---|---|---|
| **CP-0** | Platform / product / contract baseline freeze | **DONE** — user-approved 2026-06-07 | Human signs `10 §8` per-item checklist (route, binding direction, editor-core contract, IA baseline, 38 decisions, 43 fixtures, no-silent-loss proof, three-register invariant). Does **not** authorize any code/dir/crate creation. | `04`, `05`, `06`, `07`, `09`, `10`, `11` | mixed (Claude drafts, Codex verifies Apple reality, human approves) |
| **CP-1** | Stage 1 deterministic-core + Apple-reality spikes | **IN PROGRESS** — core side COMPLETE; Apple side has approved boundaries (B4, B14 @ 2026-06-07) but OPEN impl/delivery gates; whole-exit = 未退出 (not exited) | All of `12 §6`: (1) spike groups 1+5 cargo test + clippy + cross-device byte-identical diff3/order-key vectors (incl. wasm32) as CI gate; (2) World A multi-target compile gate + client zero-truth grep red line; (3) groups 2+3 repeatable binding round-trip / bytes benchmark / Swift 6 strict-concurrency / TextKit responder-chain·IME·accessibility proof; (4) group 4 iCloud delivery gates closed (million-op replay/merge/compaction, steady-state segment budget N≠~N, remote `.icloud` placeholder, signed-out/over-quota states, conflict-resolution policy, four-horizon retention); (5) model adjustments backfilled to `04`/`05`/`06`; (6) no persistent app writes before exit. | `12`, `13`, `14`, `15`, `16`, `17`, `18`, `19`, `20`, `21` + (future) `22-cp-1-exit-report.md` | mixed (Claude/core owns groups 1+5 + editor-core contract in group 3; Codex/Apple owns groups 2+3+4) |
| **CP-2** | Core dispatch / op-log replay / projection stable | **PENDING** — deferred per `14`; no persistent app writes until CP-1 fully exits | CP-1 whole-exit passed first. Then: core dispatch stable; op-log replay proven; projection / editor-core / sync-adapter-interface / CLI DTO stable; every persistent write path provably routed through the single validated dispatch (grep proof of the single-validated-dispatch invariant — see the `01` plan, "单一已校验 dispatch"); split/merge macro-op (D29) intent-rebase dispatch landed; op-shape frozen (D24) before any CloudKit record schema. | (future) `NN-cp-2-dispatch-proof.md` + backfills to `04`/`05`/`06` | Claude / core |
| **Stage-2 (projected)** | `anchor-core` ground floor (full core impl) | **PENDING** | CP-2 passed. Core ground floor implemented; importer/exporter parity proven; editor-core full surface stable; sync adapter interface concrete; `anchor-core` README becomes the authoritative public contract. | (future) `anchor-core` README + `NN-stage-2-*.md` | Claude / core |
| **Stage-3 (projected)** | macOS native client | **PENDING** | Stage 2 stable + TextKit product-runtime gates (CP-1 group 3) closed. macOS client reads/writes/edits entirely via core dispatch; CLI installable; persistent writes flow through validated dispatch only. | (future) `NN-stage-3-macos-*.md` | mixed (Claude/core contracts + Codex/Apple client) |
| **Stage-4 (projected)** | iOS native client | **PENDING** | Stage 3 macOS client stable + iCloud delivery gates (B14) fully closed. iOS client achieves identical core semantics to macOS; iCloud Drive sync-adapter-min operational; project reaches Anchor v1 "complete." | (future) `NN-stage-4-ios-*.md` | mixed (Claude/core + Codex/Apple) |

**Completion condition (loop DONE):** Anchor v1 reaches the end of Stage-4 — the iOS client achieves identical core semantics to macOS over an operational iCloud Drive sync-adapter-min; all checkpoints (CP-0, CP-1, CP-2) carry human sign-off; the `anchor-core` README exists as the authoritative public CLI/API/schema/file-format contract; **no axis in any integration report is "blocked" or "no-go"**; the single-validated-dispatch grep proof holds; and the four-horizon retention + iCloud delivery gates are closed.

---

## 5. Division of labor (who executes which action)

- **Claude / core owner** — the platform-agnostic Rust `anchor-core` (incl. the internal `anchor-editor-core` module) and **all** deterministic algorithms: `canonical_serialize` (JCS, no f64), content-addressed id, fractional order-key, op-log replay pure fold, HLC total order + per-actor HWM ingestion, `sub_rev` stale guard, body diff3 / keep-both, tag OR-Set, life lattice + `dominates_frontier`, location LWW + cycle-guard, journal identity, mirror/projection parity, segment budget, four-horizon retention. Owns the **DTO / error vocabulary and schema envelope** (DTO ownership = Rust core ONLY; Swift bindings are GENERATED), **spike groups 1 + 5**, the **editor-core intent/selection/patch contract within group 3**, fixture design, and integration-report synthesis. These algorithms execute **only** in Rust core, byte-identical cross-platform by construction — **never** re-implemented in Swift (D19 / D26 red line, grep-enforced).
- **Codex / Apple verifier** — prove the Apple mechanisms work, **consuming** true values (DTO, fixtures, `TransactionResult`, golden `snapshot_revision`) from Claude via `16-codex-apple-input.md`: **group 2** (binding: three-slice XCFramework, UniFFI bindgen, SwiftPM wrapper, C ABI bytes benchmark, Swift 6 strict-concurrency); **group 3 Apple runtime** (NSTextView/UITextView events, EditorPatch replay, IME/marked-text, accessibility, undo interception, UTF-16 conversion); **group 4** (iCloud: `OpSyncPort` Swift impl using NSFileCoordinator/NSMetadataQuery/ubiquity — all **outside** core, scale gates at 1K/10K/50K/100K, conflict materialization). Codex must **not** write merge/diff3/order-key in Swift and must **not** leak cloud types into core.
- **Coordination is one-directional.** Core hands the called surface + golden truth; the Apple side consumes and reports. Clock/entropy (`op_id` / HLC) are passed from Swift **into** core — core never self-sources (D36).
- **The human** is the approval authority for every checkpoint exit and every "Needs user approval" boundary item, and the operator who runs the paid-ADP / signed-device Apple verifier round.

---

## 6. Current cursor — where we are and the single next action

**PROJECT IS AT: all Claude/core-executable work through CP-1 / CP-2 / Stage-2 is DONE; the only remaining gates are human sign-off + Apple-runtime delivery, which a pure-Claude agent cannot self-execute.**

**Settled (do NOT re-open or re-prove as new progress):** core deterministic complete (**85 tests**; 1 ignored scale bench), multi-target compile (wasm32 + aarch64-linux-android) green, zero-cloud-symbol `rg` audit (0 matches, exit 1), golden `snapshot_revision 3ef88671…` / journal id `jnl_f99080…` / BLAKE3 vectors frozen, **B4 binding boundary approved 2026-06-07**, **B14 iCloud default transport approved 2026-06-07**, Option A layout approved. **CP-2 core landed** (single-validated-dispatch chokepoint + grep proof, all-or-nothing macros, `split_merge_structural` conflict materialization, D24 op-shape freeze golden `18582d53…`, native+wasm execution — `23`). **Stage-2** authoritative contract `suites/anchor/core/README.md` + concrete reference `OpSyncPort` adapter (`24`).

**THE SINGLE NEXT CONCRETE ACTION is now a human/operator action, not a Claude action** (per the user directive "do everything you can, document the rest" — done). To formally exit the checkpoints: (1) **human CP-1 sign-off** per `10 §8` style, (2) an **Apple operator round** (paid ADP + signed device + real iCloud, artifacts to `/tmp/anchor-apple-stage1` outside the repo) closing the remaining Apple-runtime delivery gates below, then CP-2 / Stage-2 checkpoint sign-off (core evidence already assembled in `22`/`23`/`24`). The still-open Apple/human gates:

- **Env:** macOS + Xcode 26.5, Swift 6.3.2, rustc/cargo 1.95.0, paid ADP team, signed verifier app, real iCloud account.
- **Artifacts:** to `/tmp/anchor-apple-stage1` **outside the repo**; probes only under `suites/anchor/apple/**`.

**Open gates the round must close:**

- **(a) iCloud** — remote `.icloud` placeholder download (currently `NSCocoaErrorDomain:4`); signed-out / over-quota account states; non-macOS (iOS) large-scale delivery; steady-state segment budget proving **N ops ≠ ~N segments**; million-op replay/compaction in iCloud context (core proved linear in isolation only); product conflict-resolution policy for the observed offline `NSFileVersion.unresolvedConflictVersionsOfItem = 1`.
- **(b) binding release gates** — UniFFI async `Sendable` surface; **final** production DTO/error vocabulary (core currently has `validation_error` as a typed `ValidationError` enum — lock the final vocab); product wrapper import surface; CI / fresh-machine reproduction.
- **(c) TextKit product-runtime** — real responder-chain undo suppression; IME marked-text commit path; accessibility range mapping; hit-testing on block geometry; EditorPatch replay over splitting/moving views; keyboard→EditorIntent; UTF-16 internal-unit conversion (D18 fixture: emoji / ZWJ / combining / CRLF / IME).
- **(d) cross-target EXECUTION CI wiring** — wasmtime + iOS-slice golden vectors (compile gate passed; **execution not yet run**).

After all gates close **and** model adjustments are backfilled to `04`/`05`/`06`, produce **`22-cp-1-exit-report.md`**, then **STOP for human CP-1 sign-off** before any CP-2 / persistent-write work.

> **Why you (a pure-Claude agent) cannot finish this alone:** the remaining gates require Codex/Apple capability + paid ADP + signed device runtime + a human approval. Do not attempt the Apple runtime yourself and do not fabricate Apple results. The realistic loop move is to **dispatch the Codex/Apple verifier** (or hand to the human operator), record what was dispatched as Observed, mark the Apple gates "Not run / pending Codex round," and yield. Any **core-side** sub-action you *can* run autonomously (e.g. wiring cross-target execution vectors that don't need Apple hardware, locking core DTO/error vocab on the Rust side, re-running the 0-match audit after a core-adjacent change) you may do and capture as Observed evidence.

---

## 7. Gate protocol — STOP vs proceed

There are **two gate classes**.

**(1) HUMAN SIGN-OFF gates — the agent MUST STOP and request approval:**
- Every **checkpoint exit** (CP-0 / CP-1 / CP-2 approval). CP-0 was such a sign-off (2026-06-07); **CP-1 whole-exit will be the next.**
- Every **"Needs user approval"** item: workspace/package/Apple-project boundary changes, new public CLI schema, crypto/key ownership, paid Apple Developer Program / entitlements / bundle-id / iCloud-container creation, any plan §13 pause condition.

**(2) MACHINE gates — the agent MAY proceed autonomously once green:**
- `cargo test` pass, `clippy` clean, multi-target compile (wasm32 + aarch64-linux-android), zero-cloud-symbol `rg` audit (0 matches, exit 1), cross-target determinism golden vectors, `assert_order_independent`. These are CI-enforceable and self-certifiable.

**Reading approval state.** Approval is recorded by dated gate letter (e.g. `B4 approved 2026-06-07`) inside the decision/approval docs (`10 §8`, `05`). Read these to know what is already cleared. **Current authoritative state: B4 and B14 are both user-approved 2026-06-07 — the binding direction and transport choice are settled; do NOT re-open them.**

**Verdict semantics:**
- **"compromise"** is **NOT** "blocked" and **NOT** a stop. The boundary/direction is approved but specific delivery sub-gates remain open (e.g. iCloud B14 = approved transport **with** compromise constraints: direct enumeration required; remote placeholder / account / policy / budget still open). You may continue closing the open sub-gates autonomously — but you must **NOT ship past the compromise shape** (no package-internal NSMetadataQuery, no silently dropping NSFileVersion conflicts, no CloudKit). Doing so trips a stop condition.
- **"blocked" / "no-go"** (e.g. a scale result where N ops produce ~N synced segments, defeating batching/compaction) **MUST stop** the loop and escalate to human review for a design reset or transport fallback (CloudKit / neutral object-store), per `21 §11` and `12 §13`.

**Default rule.** If the next action is a machine gate **or** closing an already-approved compromise sub-gate within the current checkpoint **AND** trips no stop condition **AND** no scope fence → proceed and write evidence. If it is a checkpoint exit, a "Needs user approval" item, a "blocked/no-go," or any stop condition → STOP, summarize state, request human sign-off.

---

## 8. Scope guardrails

Before acting, check the action against `11-cp-0-final.md §5` (ten standing prohibitions) and the `21 §11` a–g stop list. **Respect CLAUDE.md Boundaries:** do not change package boundaries, workspace structure, or generated lockfiles unless the task explicitly requires it; do not add tests or run test commands unless explicitly asked (core spike tests are already authorized for groups 1+5 per the spike plan — do not extend beyond that).

**Scope-creep fence — ten standing prohibitions (`11 §5`), any attempt PAUSES for a new human decision (plan §13):**
1. No persistent app writes before CP-1 exit.
2. No directory/project beyond the approved Option A/C layout; no placeholder `package.json` to satisfy a glob; no `package.json` / `bun.lock` / `tsconfig` / workspace-config change (unless an explicitly-authorized spike within the approved layout).
3. No CloudKit / CKSyncEngine before Phase 2; no CloudKit record schema in core; no CloudKit record before the op-shape freeze.
4. No standalone web / android client / iPadOS-specific optimization (World A protects core compilability, not a client).
5. No public `ConflictRecord` / `resolve` / `restore_order` / `restore_subtree` CLI schema (Phase 2).
6. No char-level text CRDT / full-convergence move / order CRDT / central sequencer.
7. No cross-block continuous native text selection as a first-phase UI promise (spike-only).
8. No client-side (Swift/TextKit) merge / normalization / op-creation / tree-invariant / diff3 / order-key (D37 — owned solely by `anchor-core::dispatch`).
9. No AI-agent / proposed-change subsystem (the op envelope reserves `actor` / `provenance` / `approvalState` as hooks only — do not repurpose them for human conflict re-review).
10. No treating any `Blocked` / `Not run` / `Unknown` item as verified fact.

**Hard stop conditions (`21 §11` / §9, a–g) — immediate pause for human decision regardless of progress:**
- **(a)** any need to change root workspace / `package.json` / `bun.lock` / lockfile, or add a placeholder `package.json`;
- **(b)** duplicating core deterministic semantics in Swift/TextKit;
- **(c)** iCloud relying on package-internal NSMetadataQuery, silently handling unresolved NSFileVersion conflicts, or bypassing placeholder/account-state gates;
- **(d)** introducing CloudKit schema / CKSyncEngine on the iCloud-Drive path;
- **(e)** changing public CLI schema;
- **(f)** turning an Apple probe into a product app shell;
- **(g)** `anchor-core` acquiring **ANY** Apple cloud / file-coordination / account / ubiquity type.

**After any core-adjacent change, re-run the 0-match cloud-symbol + Apple-type audit and require exit 1** before claiming the change clean:

```
rg "CloudKit|CKRecord|CKAsset|CKContainer|CKSyncEngine|NSFileCoordinator|NSMetadataQuery|ubiquit|iCloud|NSURLIsExcludedFromBackupKey" suites/anchor/core
# expected: 0 matches, exit 1
```

---

## 9. Document & evidence conventions

**Location.** All workbench docs live **flat** in `docs/workbench/20260606-anchor-v1/` (per CLAUDE.md the dated-task folder **is** `20260606-anchor-v1`). The 21 prior docs were rehomed/flattened here (commit `50fe81e`).

**Numbering.** `NN-semantic-name.md`. The workbench was **consolidated 2026-06-10** (76→25 docs): ~50 redundant per-iteration Apple-rerun / TextKit-floor / iCloud / binding reports (old `22`–`75`) were folded into thematic consolidated evidence docs, and **all device/account PII was scrubbed to placeholders** (`<TEAM_ID>`, `<DEVELOPER_NAME>`, `<DEVICE_UDID>`, `<PROFILE_UUID>`, `<SIGNING_HASH>`, `<HOME>`, `<BUNDLE_ID>`, `<ICLOUD_CONTAINER>`). Current sequence: `00` agent-loop (this driver), `01` apple-native-note-workbench, `02` conflict-resolution-model, `03` research-notes, `04` contract-baseline, `05` key-decisions (D01–D38), `06` fixture-set (F01–F43), `07` project-layout-options, `08` codex-verification-packet, `09` apple-verification (consolidated + sanitized), `10` cp-0-approval, `11` cp-0-final, `12` stage-1-spike-plan, `13` stage-1-entry-brief, `14` core-spike-report, `15` core-evidence, `16` codex-apple-input, `17` apple-binding-evidence (consolidated), `18` textkit-adapter-evidence (consolidated), `19` icloud-drive-evidence (consolidated), `20` cross-target-ci-evidence (consolidated), `21` stage-1-integration-report (cursor/ledger), `22` cp-1-exit-report, `23` cp-2-core-readiness, `24` stage-2-core-ground-floor. The **authoritative public CLI/API/schema/file-format contract now lives at `suites/anchor/core/README.md`** (Stage-2 deliverable).

**Frontmatter.** Each doc carries a Chinese block — **任务 / 日期 / 状态** (task/date/status) — and a mandatory **边界声明** restating that the doc does **not** authorize package/workspace/app/lockfile/code changes. Docs are bilingual: Chinese body + English for repo artifacts and gate identifiers.

**Stable identifier vocabulary — MUST be reused, never renumbered:** decisions **D01–D38** (incl. D18a / D21a / D38), fixtures **F01–F43** (incl. F41 / F42 / F43), checkpoints **CP-0 / CP-1 / CP-2**, spike groups **1–5**, approval gate letters **A1–A9 / B1–B16** (e.g. B4 = binding, B14 = iCloud). **Model adjustments are BACKFILLED into `04`/`05`/`06` under the existing D/F numbers — not appended as new docs.**

**Doc roles are typed.** `01`/`02` = history/spec. `10`/`11` = decision authority. `04`/`05`/`06`/`07` = responsibility matrix (**backfill targets**). `08`/`09` = evidence-record (left as-is, **not** retro-patched). `14`–`20` = per-owner evidence. `21` = synthesis + next-gate cursor (the ledger). Evidence-record docs are content, not patch-traces — do **not** retro-edit them.

**What counts as proof.** Evidence = **a command + its output** (cargo test count, `rg` audit with exact pattern + match count + exit code, `xcodebuild` result, benchmark ms/RSS, golden `snapshot_revision` hex). An assertion without a reproducible command/output is **not** evidence. Golden values (`snapshot_revision 3ef88671…`, journal id `jnl_f99080…`, BLAKE3 vectors) are **frozen truth** — re-use, never re-derive.

**Honesty rules (load-bearing taxonomy, uniform across all docs):** `Observed` (Codex on-device run or official docs) | `Inferred` (engineering reasoning) | `Recommended` (target state) | `Needs user approval` | `Needs Stage 1 spike` | `Blocked` | `Not run`. **`Not run` / `Blocked` / `Unknown` items may NEVER be claimed as verified fact — this is itself a gate.** Do not present settled facts (0-match audit, 74-test core, multi-target compile, golden values, B4/B14 approvals) as new progress; re-running them is a sanity check only.

> **Workbench docs are explicitly NOT public interface contracts.** The authoritative CLI/API/schema/file-format contract becomes the `anchor-core` package README only **after** implementation. Creating a workbench doc does not authorize any code/package/workspace/lockfile change.

---

## 10. Stop conditions and how to report back

**STOP-AND-ASK triggers (must surface to the human, never auto-pass):**
- any **checkpoint exit** (CP-N approval);
- any **"Needs user approval"** boundary item;
- any **"blocked" / "no-go"** axis;
- any of the **seven `21 §11` a–g stop conditions**;
- a **scale no-go** (N ops → ~N segments).

**How to report back when you STOP.** Write the evidence doc, update the ledger, then yield with a **crisp decision request** containing exactly:
1. **What checkpoint/gate** is blocking (e.g. "CP-1 whole-exit," or "stop condition (c): NSFileVersion unresolved-conflict policy undefined").
2. **What evidence is closed** (with doc + command pointers) and **what remains open** (tagged `Not run` / `Blocked` / `Needs user approval` with owner = Codex/Apple or human).
3. **The specific human decision or operator action requested** (e.g. "run the Codex/Apple verifier round per `21 §9`," or "approve CP-1 exit per `10 §8`").
4. **A pointer to the new evidence doc and the updated ledger entry.**

Do not proceed past the stop. Do not fabricate the missing Apple/human result. Do not self-certify a checkpoint exit.

---

## 11. Progress ledger

The integration / readiness report (`21`, and any future synthesis report) **is** the ledger. Each iteration, re-emit the per-axis verdict matrix and append a dated ledger entry. The current axis snapshot (from `21 §3`, as of 2026-06-07) for orientation:

| Axis | Verdict |
|---|---|
| core deterministic (groups 1+5) | **go** (complete) |
| multi-target compile | **go** |
| zero-cloud-symbol boundary | **go** |
| binding (B4) | **approved boundary / release-gated** (open: async Sendable, final DTO/error vocab, wrapper surface, CI repro) |
| TextKit (group 3 runtime) | **compromise / mechanism-only** (open: undo suppression, IME, accessibility, hit-testing, patch replay, UTF-16) |
| iCloud Drive (B14) | **approved default transport WITH compromise constraints** (open: `.icloud` placeholder, account states, iOS scale, segment budget, million-op compaction, conflict policy) |
| layout / retention | **compromise** (open: steady-state segment budget, million-op compaction, stale-peer watermark, conflict policy in scale context) |
| cross-target execution CI | **not run** (compile gate passed; wasmtime + iOS-slice golden vectors not yet wired) |
| **CP-1 whole-exit** | **未退出 (NOT exited)** |

### Copy-pasteable ledger entry template

Append one block per iteration (place it in the new evidence doc and reflect it in the synthesis report's open-gate checklist):

```markdown
### Ledger entry — <YYYY-MM-DD> — iteration <N> — doc <NN-kebab-name.md>

- **Checkpoint / cursor:** <CP-1 Apple half | CP-2 | Stage-N>
- **Action selected:** <one lowest-risk open gate; owner = Claude/core | Codex/Apple-dispatch | human-operator>
- **Owner classification:** <core-deterministic → executed here | Apple-runtime → dispatched to Codex/Apple | human-approval → escalated>
- **Scope-fence check:** <passed — trips none of 11 §5 (1–8) or 21 §11 (a–g)> | <PAUSED — tripped: __>
- **Evidence (Observed = command + output):**
  - `<command>` → `<output / count / exit code / ms·RSS / hex>`
  - <golden values re-used, not re-derived: snapshot_revision 3ef88671… / jnl_f99080… / BLAKE3 vectors>
  - <post-change 0-match cloud-symbol + Apple-type audit, exit 1 — if core-adjacent>
- **Gates closed this iteration:** <gate id(s) + evidence pointer> | none
- **Gates still open:** <gate id(s)> tagged <Not run | Blocked | Needs user approval | Needs Stage 1 spike> — owner <Codex/Apple | human | Claude>
- **Backfill to 04/05/06:** <D__ / F__ updated under existing number> | none
- **Axis matrix delta:** <axis: old verdict → new verdict> | unchanged
- **Gate evaluation:** <CONTINUE — next action: __> | <STOP — reason: checkpoint exit / Needs user approval / blocked-no-go / stop condition __>
- **Decision requested (if STOP):** <exact human decision or operator action, e.g. "run Codex/Apple verifier per 21 §9" / "approve CP-1 exit per 10 §8">
- **New doc:** `docs/workbench/20260606-anchor-v1/<NN-kebab-name.md>`
```

---

## 12. Quick reference card

- **Cursor doc / ledger:** `21-stage-1-integration-report.md` (§3 matrix, §6 open gates, §9 commands+env, §11 stops).
- **Exit criteria for current checkpoint:** `12-stage-1-spike-plan.md §6` (5 conditions).
- **What's already approved (do not re-open):** B4 binding + B14 iCloud (2026-06-07), Option A layout, 50 MB cap, journal identity — per `10 §0`/`§8`.
- **Scope fences:** `11 §5` (ten prohibitions) + `21 §11` (a–g stops).
- **Core→Apple truth surface:** `16-codex-apple-input.md`.
- **Backfill targets:** `04` / `05` / `06` (existing D/F numbers only).
- **Single next action:** dispatch the Codex/Apple verifier round (env in `21 §9`) to close iCloud / binding-release / TextKit-runtime / cross-target-execution gates; then write `22-cp-1-exit-report.md`; then **STOP for human CP-1 sign-off.**
- **You cannot finish CP-1 alone:** Apple runtime + paid ADP + signed device + human approval are required. Assemble closeable core/boundary evidence, delegate the rest, yield cleanly.
