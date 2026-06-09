# Anchor Stage 1 — Hosted Cross-Target CI Report

任务：CP-1 cross-target execution CI gate，观察 GitHub hosted `pull_request` workflow 对 native / wasm / iOS Simulator deterministic vectors 的真实运行结果。
日期：2026-06-10
状态：**workbench artifact** —— 非公开接口契约；本轮关闭 hosted native+wasm+iOS Simulator workflow run，不关闭 Android execution、CP-1 whole-exit 或 human sign-off。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**package / workspace / 产品 app / 生成 lockfile / public CLI schema 改动；本轮没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；没有改 `suites/anchor/core/src/**` production source；没有创建 repo 内 product app shell。外部副作用限于把当前 `anchor-v1` 分支推送到 GitHub 并创建 draft PR `#9` 以触发 hosted `pull_request` workflow。

---

## 1. 结论

**Strongest conclusion：the hosted GitHub Actions workflow ran successfully for the Anchor cross-target vectors on pull request #9; native+wasm and macOS iOS Simulator jobs both passed.**

Observed run:

```text
workflow: Anchor Cross-Target Vectors
run_id: 27225972591
event: pull_request
head_sha: 5cbc5a174bfad2da4243d70772e240d2eec6d885
conclusion: success
url: https://github.com/plimeor/labs/actions/runs/27225972591
```

Observed jobs:

```text
native-wasm    pass    26s
ios-simulator  pass    7m27s
```

This closes the hosted CI run for the workflow shape added in `31-cross-target-ci-wiring-report.md`: Linux native+wasm and macOS iOS Simulator execution. It does not close Android execution, because the workflow intentionally does not run Android; local environment screening still found no Android execution runtime.

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| root workspace / package / lockfile | not changed |
| `suites/anchor/core/src/**` | not changed |
| public CLI schema | not changed |
| product app shell | not created |
| GitHub side effect | draft PR `#9` + hosted workflow run |
| checkpoint exit | not reached |

---

## 3. Observed evidence

### 3.1 PR and run creation

Command:

```sh
git commit -m "Advance Anchor CP-1 verifier evidence"
git push -u origin anchor-v1
gh pr create --draft --base main --head anchor-v1 \
  --title "[codex] Advance Anchor CP-1 verifier evidence" \
  --body-file /tmp/anchor-cp1-pr-body.md
git commit --amend --no-edit
git push --force-with-lease origin anchor-v1
```

Observed:

```text
[anchor-v1 5cbc5a1] Advance Anchor CP-1 verifier evidence
To github.com:plimeor/labs.git
 + 7bae698...5cbc5a1 anchor-v1 -> anchor-v1 (forced update)
https://github.com/plimeor/labs/pull/9
```

Command:

```sh
gh run list --branch anchor-v1 --limit 10 \
  --json databaseId,workflowName,event,status,conclusion,headSha,url,createdAt
```

Observed:

```text
databaseId=27225972591
workflowName=Anchor Cross-Target Vectors
event=pull_request
headSha=5cbc5a174bfad2da4243d70772e240d2eec6d885
status=queued
url=https://github.com/plimeor/labs/actions/runs/27225972591
```

### 3.2 Checks summary

Command:

```sh
gh pr checks 9
```

Observed:

```text
ios-simulator  pass  7m27s  https://github.com/plimeor/labs/actions/runs/27225972591/job/80393126858
native-wasm    pass  26s    https://github.com/plimeor/labs/actions/runs/27225972591/job/80393127037
```

Command:

```sh
gh run view 27225972591 --json databaseId,workflowName,event,status,conclusion,headSha,url,createdAt,updatedAt,jobs
```

Observed summary:

```text
conclusion=success
status=completed
native-wasm: conclusion=success, started=2026-06-09T18:06:25Z, completed=2026-06-09T18:06:51Z
ios-simulator: conclusion=success, started=2026-06-09T18:06:26Z, completed=2026-06-09T18:13:53Z
```

### 3.3 Hosted native+wasm job output

Command:

```sh
gh run view 27225972591 --job 80393127037 --log
```

Observed key output:

```text
Run bash suites/anchor/core/tests/run-cross-target-vectors.sh
env:
  ANCHOR_SKIP_IOS: 1
running 6 tests
test diff3_merge_vector ... ok
test hash_and_identity_vectors ... ok
test order_key_vector ... ok
test fixture_vault_snapshot_vector ... ok
test conflict_vault_snapshot_vector ... ok
test merged_vault_snapshot_vector ... ok
test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
anchor_wasm_vector_status=0
anchor_ios_vector_status=skipped
```

### 3.4 Hosted iOS Simulator job output

Command:

```sh
gh run view 27225972591 --job 80393126858 --log
```

Observed key output:

```text
Boot first available iOS Simulator
Finished
Run bash suites/anchor/core/tests/run-cross-target-vectors.sh
env:
  ANCHOR_IOS_SIMULATOR_ID: 57DAC7D7-5067-4346-9860-CEEBA84AE630
  DEVELOPER_DIR: /Applications/Xcode.app/Contents/Developer
running 6 tests
test diff3_merge_vector ... ok
test fixture_vault_snapshot_vector ... ok
test hash_and_identity_vectors ... ok
test conflict_vault_snapshot_vector ... ok
test order_key_vector ... ok
test merged_vault_snapshot_vector ... ok
test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
anchor_wasm_vector_status=0
anchor_ios_vector_status=0
```

---

## 4. Gate evaluation

| Gate | Result |
|---|---|
| hosted Linux native vectors | closed / observed |
| hosted Linux wasm vectors | closed / observed |
| hosted macOS native vectors | closed / observed |
| hosted macOS wasm vectors | closed / observed |
| hosted macOS iOS Simulator vectors | closed / observed |
| Android execution | open / not run |
| CP-1 whole-exit | **not exited** |

Gate evaluation: **CONTINUE**. Hosted native+wasm+iOS-sim CI is now closed; Android execution and remaining Apple runtime/delivery gates remain open.
