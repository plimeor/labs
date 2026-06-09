# Anchor Stage 1 — Developer ID Signing Availability Rerun Report

任务：CP-1 binding / distribution release gate，重新检查本机 keychain 是否已有 Developer ID / Apple Distribution signing identity。
日期：2026-06-10
状态：**workbench evidence** —— 非公开接口契约。本文件不关闭 Developer ID notarization、App Store/TestFlight distribution、signed product archive 或 CP-1 whole-exit gate。

> 边界声明（AGENTS 工作台规则）：本轮只读取本机 keychain signing identities；没有改 root workspace / package / lockfile / public CLI schema；没有改 repo 内 Apple project、bundle id、entitlement、iCloud container 或产品 app；没有创建、签名、上传、notarize 或分发任何 artifact。

---

## 1. Strongest conclusion

**本机仍只有 Apple Development identities；没有观察到 `Developer ID Application`、`Developer ID Installer` 或 `Apple Distribution` identity。**

Observed:

```text
  1) <SIGNING_HASH> "Apple Development: <DEVELOPER_NAME> (<TEAM_ID_ALT>)"
  2) <SIGNING_HASH> "Apple Development: <DEVELOPER_NAME> (<TEAM_ID_ALT>)"
     2 valid identities found
```

Precise distribution-identity grep:

```text
exit=1
```

This preserves the prior policy boundary from `44-binding-artifact-provenance-policy.md`: development-signed verifier probes can run, but Developer ID notarization / macOS release distribution is not runnable from this local keychain today. This is independent of user authorization; the missing input is a suitable distribution identity and a product archive/distribution artifact.

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| keychain mutation | not performed |
| root workspace / package / lockfile | not changed |
| repo code / Apple project config | not changed |
| public CLI schema | not changed |
| product app shell | not created |
| signing / notarization / upload | not performed |

---

## 3. Observed evidence

### 3.1 All code-signing identities

Command:

```sh
security find-identity -p codesigning -v
```

Observed:

```text
  1) <SIGNING_HASH> "Apple Development: <DEVELOPER_NAME> (<TEAM_ID_ALT>)"
  2) <SIGNING_HASH> "Apple Development: <DEVELOPER_NAME> (<TEAM_ID_ALT>)"
     2 valid identities found
```

### 3.2 Distribution identity grep

Command:

```sh
security find-identity -p codesigning -v |
  rg "Developer ID Application|Developer ID Installer|Apple Distribution"
printf 'exit=%s\n' "$?"
```

Observed:

```text
exit=1
```

Interpretation:

- No `Developer ID Application` identity is visible for macOS Developer ID distribution / notarization.
- No `Developer ID Installer` identity is visible.
- No `Apple Distribution` identity is visible for App Store / TestFlight-style distribution.
- The two visible identities are development identities and are sufficient for development-signed verifier probes, not release distribution gates.

---

## 4. Gate result

Closed this iteration:

- Current local signing identity availability has been refreshed.

Still open:

- Developer ID Application signing identity.
- macOS product app archive and notarization.
- App Store / TestFlight distribution identity and upload path.
- Signed app-bundle/device runtime integration beyond development-signed probes.
- CP-1 whole-exit.

---

## 5. Ledger entry

### Ledger entry — 2026-06-10 — iteration 47 — doc 68-developer-id-signing-availability-rerun-report.md

- **Checkpoint / cursor:** CP-1 Apple half, binding/distribution release gate.
- **Action selected:** refresh local signing identity availability before treating Developer ID / distribution gates as runnable.
- **Owner classification:** Apple distribution verifier → read-only keychain inspection; no signing, notarization, upload, project mutation, or product app creation.
- **Scope-fence check:** passed — no root workspace / package / lockfile changes; no public CLI schema; no product app shell; no keychain mutation.
- **Evidence (Observed = command + output):**
  - `security find-identity -p codesigning -v` → two `Apple Development: <DEVELOPER_NAME> (<TEAM_ID_ALT>)` identities; 2 valid identities found.
  - `rg "Developer ID Application|Developer ID Installer|Apple Distribution"` over the identity output → no matches, exit `1`.
- **Gates closed this iteration:** none for release distribution; signing identity availability refreshed only.
- **Gates still open:** Developer ID identity, macOS product app archive/notarization, App Store/TestFlight distribution path, signed app-bundle/device runtime integration beyond development-signed probes.
- **Backfill to 04/05/06:** none; doc 44 policy already carries the same boundary.
- **Axis matrix delta:** none; binding remains `approved boundary / partially release-gated`.
- **Gate evaluation:** CONTINUE for non-distribution gates. Do not claim Developer ID notarization or App Store/TestFlight distribution without a distribution identity and a product archive/upload artifact.
- **New doc:** `docs/workbench/20260606-anchor-v1/68-developer-id-signing-availability-rerun-report.md`
