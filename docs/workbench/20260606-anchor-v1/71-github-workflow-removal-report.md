# Anchor Stage 1 — GitHub Workflow Removal Report

任务：按 2026-06-10 用户指令，暂时移除 Anchor cross-target GitHub Actions workflow，停止本期 Android/WASM hosted gate 消耗。
日期：2026-06-10
状态：**workbench evidence** —— 非公开接口契约。本文件记录 workflow 删除与当前 gate 口径；不倒写历史 hosted run 证据，不退出 CP-1。

> 边界声明（AGENTS 工作台规则）：本轮没有改 root workspace / package / lockfile / public CLI schema；没有改 `suites/anchor/core/src/**` production source；没有改 repo-local runner 脚本；没有创建 Apple product app shell。代码/配置变更限于删除 `.github/workflows/anchor-cross-target-vectors.yml`，文档变更限于当前 workbench gate 口径。

---

## 1. Strongest conclusion

**The Anchor cross-target GitHub workflow is intentionally removed at current head.** The repository no longer has `.github/workflows/anchor-cross-target-vectors.yml`; only `check-package-versions.yml` and `publish.yml` remain under `.github/workflows`.

The scope reason is explicit: Android and WASM are not current-period support targets, and iOS/macOS build verification can be run locally. This saves hosted CI time.

The tradeoff is also explicit: historical cross-target evidence remains valid as historical evidence, but the current head no longer has per-push / per-PR hosted regression coverage for Android emulator or WASM vectors. 如果在重新引入 workflow 前 core 依赖形状重新开始变化，D36 漂移风险会上升。

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| deleted workflow | `.github/workflows/anchor-cross-target-vectors.yml` |
| retained workflows | `.github/workflows/check-package-versions.yml`, `.github/workflows/publish.yml` |
| root workspace / package / lockfile | not changed |
| `suites/anchor/core/src/**` | not changed |
| cross-target runner script | not changed |
| public CLI schema | not changed |
| Apple project / product app shell | not changed / not created |
| checkpoint exit | not reached |

---

## 3. Observed evidence

### 3.1 Pre-change workflow list

Command:

```sh
find .github/workflows -maxdepth 1 -type f -print | sort
```

Observed before deletion:

```text
.github/workflows/anchor-cross-target-vectors.yml
.github/workflows/check-package-versions.yml
.github/workflows/publish.yml
```

### 3.2 Post-change workflow list

Command:

```sh
find .github/workflows -maxdepth 1 -type f -print | sort
```

Observed after deletion:

```text
.github/workflows/check-package-versions.yml
.github/workflows/publish.yml
```

### 3.3 Workflow diff scope

Command:

```sh
git diff --name-status -- .github/workflows docs/workbench/20260606-anchor-v1/04-contract-baseline.md docs/workbench/20260606-anchor-v1/05-key-decisions.md docs/workbench/20260606-anchor-v1/21-stage-1-integration-report.md
```

Observed immediately after workflow deletion, before doc backfill:

```text
D	.github/workflows/anchor-cross-target-vectors.yml
```

Interpretation:

- Only the Anchor cross-target workflow was removed under `.github/workflows`.
- Historical reports `31`, `41`, `61`, and `62` remain historical evidence of prior hosted runs.
- Current PR head should no longer expect an `Anchor Cross-Target Vectors` hosted run unless the workflow is reintroduced.

---

## 4. Gate result

| Gate | Status |
|---|---|
| hosted Android/WASM cross-target workflow | **paused / removed for current period** |
| historical hosted native/wasm/iOS Simulator/Android evidence | retained as historical evidence |
| current iOS/macOS build verification | local path |
| CP-1 whole-exit | open |

Gate evaluation: **CONTINUE** for Apple-first local iOS/macOS verification and remaining iCloud/product/distribution gates. Do not claim current hosted Android/WASM regression coverage at this head.
