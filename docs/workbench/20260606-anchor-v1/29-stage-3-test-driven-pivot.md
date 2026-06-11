# Anchor — Stage-3 test-driven pivot + Apple code-review hardening evidence

任务：D42/D43——Apple 侧 code-review 优化 + 冗余 spike/smoke 清理 + 验证方式从 computer-use 截图转向 Swift 测试体系
日期：2026-06-11
状态：**evidence doc（iteration 13）** —— 非公开接口契约；消费方为 `21` ledger、`05` D42/D43、`00` cursor

> **边界声明（AGENTS 工作台规则，强制）：** 本文件记录 D42/D43 授权范围内的 code-review、清理与测试落地证据；不授权 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置 / generated lockfile 改动，不授权 entitlement / iCloud container / CloudKit / 持久应用写入 / Developer ID / App Store distribution / notarization。Swift 测试只断言 Swift 端对 core 输出的解码/映射/UI 投影与 intent 转发，不实现 merge / diff3 / order-key / normalization / op-shape / BLAKE3 等 deterministic core semantics（D24 golden 仍由 Rust core 测试拥有）。产品写入与同步入口保持 disabled。

---

## 1. Verdict

**Observed：** 本轮把 macOS/iOS app 的迭代验证主路径从 Codex computer-use 反复截图改为 Swift 自动化测试体系（D43），并完成一轮 Apple 侧 code-review 硬化 + 冗余清理（D42）。落地三个测试 target：`AnchorCoreBindingsTests`（包内，10 tests，含 macOS C-ABI round-trip）、`AnchorUnitTests`（app 投影映射 + 样本不变量，4 tests）、`AnchorUITests`（XCUITest，以 accessibility identifier 取代截图断言，3 tests）。三层全绿 = 17 tests。`xcode-select` 指向 Xcode 后命令无需 `DEVELOPER_DIR` 前缀；UI 运行所需的本机签名由用户在 Xcode 登录 `<TEAM_ID>` 账号解决。敏感信息（D44）：全部真实账号标识（Team ID / dev-name / cert-hash / iCloud container）改占位符，工作区 0 account PII，git 历史 scrub 已 prepared（pending 用户执行）。清理：删除 `AnchorAppleSpike/`、`macos-icloud-probe/`、`AnchorMacICloudProbe/`。

**Not closed：** product editor write dispatch、TextKit 编辑（非只读）、persistence、iCloud、release signing/distribution、UI 测试在 signed machine/CI 上的运行。

---

## 2. ultracode 多维 review（对抗验证）

**Observed：** 以 Workflow 跑 4 维 review（secrets / swift-quality / deletion-safety / test-strategy）+ secrets/deletion 维度的对抗验证（11 agents）。要点：

- **SEC-1（confirmed）**：`Anchor/project.yml:41` 硬编码 `DEVELOPMENT_TEAM: <TEAM_ID>`（真实 10 位 Team ID，untracked-即将提交；构建用 `CODE_SIGNING_ALLOWED=NO` 不需 team）。
- **SWIFT-1**：`AnchorCoreClient` actor 为 dead/valueless 复制整个 `AnchorSession` 面 → 删除。
- **SWIFT-2/4/5/6/7**：`View.init` 阻塞投影加载、`try?` 静默吞错、`ValidationErrorCode` 未知码崩解码、`TextKitNoteBodyView` 冗余 Coordinator、`blobID` DTO 不一致。
- **deletion（confirmed）**：`macos-icloud-probe/` 零引用→remove；`AnchorAppleSpike/`→remove-after-repoint（`build-binding-release-artifacts.sh:75` 改指向正式包）；`AnchorMacICloudProbe/`、`uniffi/SwiftSmoke/smoke.swift`→keep（仍 live）。

原始结构化结果与 verdict 见本轮 workflow 运行记录（session subagents 目录）。

---

## 3. 账号 PII 外置与清理（D42 SEC-1 + D44）

```console
$ rg -n 'DEVELOPMENT_TEAM|<TEAM_ID>' suites/anchor/apple/Anchor/project.yml suites/anchor/apple/Anchor/Signing.xcconfig
suites/anchor/apple/Anchor/Signing.xcconfig:3:// DEVELOPMENT_TEAM is intentionally NOT committed: ...
suites/anchor/apple/Anchor/Signing.xcconfig:11://     DEVELOPMENT_TEAM = YOUR_TEAM_ID
```

```console
$ git check-ignore -v suites/anchor/apple/Anchor/Signing.local.xcconfig
.gitignore:154:**/Signing.local.xcconfig  suites/anchor/apple/Anchor/Signing.local.xcconfig
```

```console
$ rg -n '<TEAM_ID>' --glob '!**/Signing.local.xcconfig' --glob '!**/.build/**' --glob '!**/*.xcodeproj/**' .
# (no Team ID in tracked content)
```

**Verdict：** `project.yml` 通过 `configFiles` 引用 committed `Signing.xcconfig`，后者用 `#include?` 可选引入 gitignored `Signing.local.xcconfig`（含真实 Team ID，本机签名用）。CI/缺失该文件时项目仍可生成、可无签名构建。生成的 `.xcodeproj`（ignored）也不含 Team ID（xcconfig 在 build 期解析）。

**D44 全量账号-PII scrub（2026-06-11）：** 签名诊断过程中真实 Team ID 一度被写入 `21`/`29`（均未提交），已全部改占位符；又发现仍硬编码账号标识的 `AnchorMacICloudProbe/` 探针，按用户选择移除。复跑确认工作区 0 account PII：

```console
$ rg -n -i '<team-id>|<team-id-alt>|<dev-name>|<icloud-container>' \
    --glob '!**/Signing.local.xcconfig' --glob '!**/.build/**' --glob '!**/*.xcodeproj/**' .
# (实际命令用真实标识；输出 clean — 0 account PII in working tree)
```

git 历史中的旧值（Team ID 9/10 commits、dev-name 12、cert-hash 4/3、container）由 `git filter-repo --replace-text`（6 项替换表）清除——**prepared，pending 用户执行**（`brew install git-filter-repo` + 先提交工作区 + force-push；破坏性）。私钥从未入库（存 keychain），故为隐私 scrub 非凭证泄露。`dev.plimeor.*` bundle 命名空间按用户意保留。

---

## 4. 冗余 spike/smoke 删除（D42）

```console
# D42 冗余 spike/smoke；AnchorMacICloudProbe 为 D44 账号-PII 移除（见 §3）
$ git rm -r --quiet suites/anchor/apple/AnchorAppleSpike \
    suites/anchor/apple/macos-icloud-probe suites/anchor/apple/AnchorMacICloudProbe
$ rg -l 'AnchorAppleSpike|macos-icloud-probe|AnchorMacICloudProbe' --glob '!docs/**' --glob '!**/.build/**' .
# (no non-doc references remain)
```

```console
$ rg -n 'AnchorCoreClient|await|AnchorAppleSpike' suites/anchor/apple/build-binding-release-artifacts.sh
# (clean — none; release script binding source repointed to formal AnchorCoreBindings package)
```

**Verdict：** spike 与重复 iCloud scratch 删除后无 live 引用残留；release artifact 脚本的 binding 源指向正式包，WrapperConsumer 所用符号（openFixtureVault / AnchorSession / dispatch* / readSegment）在正式包齐备。

---

## 5. Swift 测试 target 落地（D43）

新增（全部只断言 Swift 对 core 输出的解码/映射/UI 投影，不重算 core 语义）：

| Target | Host | Kind | 内容 |
|---|---|---|---|
| `AnchorCoreBindingsTests` | AnchorCoreBindings 包 | unit + integration | DTO snake_case CodingKeys、嵌套/可选解码、`ValidationErrorCode` 词表 + `.unknown` 前向兼容；macOS：`AnchorSession` summary/segment/insert/直接删除 typed error/`blobID` 真 C-ABI round-trip（仅断言结构自洽与非空，不硬编码 golden hash） |
| `AnchorUnitTests` | Anchor app（XcodeGen，`@testable`） | unit | `AnchorCoreProjectionClient.note(from:segmentBytes:)` 纯映射、样本唯一性、`WorkspacePreviewStore` 默认选择/查找 |
| `AnchorUITests` | Anchor app（XCUITest，`-uiTestUseSampleStore`） | ui | toolbar New Note/Sync disabled、sidebar 选择驱动 inspector revision、TextKit body accessibility id 存在——取代截图/`get_app_state` 断言 |

---

## 6. 测试运行证据（machine gate）

`xcode-select` 指向 `/Applications/Xcode.app/Contents/Developer`，命令无需 `DEVELOPER_DIR` 前缀。

```console
$ ANCHOR_CORE_FFI_LIB_DIR=.../suites/anchor/apple/ffi/target/release \
  swift test --package-path suites/anchor/apple/AnchorCoreBindings
✔ Test run with 10 tests in 2 suites passed.        # exit 0
```

```console
$ xcodebuild test -project suites/anchor/apple/Anchor/Anchor.xcodeproj -scheme Anchor \
    -only-testing:AnchorUnitTests -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO
✔ Test run with 4 tests in 2 suites passed.         ** TEST SUCCEEDED **   # exit 0
```

```console
$ xcodebuild test -project suites/anchor/apple/Anchor/Anchor.xcodeproj -scheme Anchor \
    -only-testing:AnchorUITests -destination 'platform=macOS' -allowProvisioningUpdates
Test Case AnchorShellUITests testToolbarWriteActionsAreDisabled passed
Test Case AnchorShellUITests testSidebarSelectionUpdatesInspectorRevision passed
Test Case AnchorShellUITests testEditorExposesTextKitBody passed
Executed 3 tests, with 0 failures                   ** TEST SUCCEEDED **   # exit 0
```

签名前置：项目 team 由 gitignored `Signing.local.xcconfig` 提供（`DEVELOPMENT_TEAM = <TEAM_ID>`，即拥有 `dev.plimeor.*` 命名空间的原 team），用户已在 Xcode 登录该 Apple 账号，`-allowProvisioningUpdates` 自动取得 macOS development profile。

**Verdict：** 三层测试全绿 = 17 tests（10 binding + 4 app unit + 3 UI），构成新 machine gate；UI 测试以 accessibility identifier 断言 UI shell，取代 computer-use 截图。CI 侧 signing 接线仍 open（见 §8）。

---

## 7. Build + boundary redline（删除/改动后复跑）

```console
$ xcodebuild ... -destination 'generic/platform=macOS' CODE_SIGNING_ALLOWED=NO build
# exit 0, 0 warnings
$ xcodebuild ... -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
# exit 0
$ rg "diff3|order-key|merge|normaliz|op-creation|tree-invariant|blake3" suites/anchor/apple/Anchor; echo exit=$?
exit=1                         # Swift product app 零确定性语义
$ rg "CloudKit|CKRecord|...|NSMetadataQuery|ubiquit|iCloud|..." suites/anchor/core suites/anchor/cli; echo exit=$?
exit=1                         # core/cli 零云符号
$ bun install --dry-run --frozen-lockfile --ignore-scripts
[29.00ms] done
$ git diff --check
# clean
$ cargo test --manifest-path suites/anchor/Cargo.toml   # 回归基线未动
TOTAL: passed=145 failed=0 ignored=2 across 35 suites
```

**Verdict：** 删除 + Swift 改动后 macOS/iOS 编译 clean，product 零确定性语义、core/cli 零云符号红线保持，Bun dry-run / diff-check clean，core 145 测试基线未回退。

---

## 8. Gate Effects

**Gates closed this iteration:**

- 验证方式 pivot 落地：Swift 测试体系（unit/integration/UI 三 target）取代 computer-use 截图作回归门（D43）。
- 三层测试全绿 = 17 tests：`swift test` 10/10 + `AnchorUnitTests` 4/4 + `AnchorUITests` 3/3（本机签名由用户登录 `<TEAM_ID>` 账号解决，`xcode-select` 已指向 Xcode）。
- Apple Team ID 从 tracked 配置外置到 gitignored local xcconfig（SEC-1 关闭）。
- dead `AnchorCoreClient` actor + `View.init` 阻塞加载 + 静默吞错 + 脆弱 enum 解码 + 冗余 TextKit Coordinator 等 code-review 优化落地。
- 冗余 `AnchorAppleSpike/` spike + 重复 `macos-icloud-probe/` 删除，release 脚本 binding 源 repoint 到正式包。

**Gates still open:**

- CI 上的 signing 接线（让 `AnchorUITests` 在 hosted runner 上运行）— **Not run**（本机已通过）
- product editor write dispatch / TextKit 非只读编辑 / persistence — **Not run**
- `NSUndoManager` grouping/redo、VoiceOver、conflict UX — **Not run**
- iCloud runtime / entitlement / signed distribution / notarization — **Not run**

---

## 9. Ledger Entry

### Ledger entry — 2026-06-11 — iteration 13 — doc 29-stage-3-test-driven-pivot.md

- **Checkpoint / cursor:** Stage-3 macOS product app integration；验证方式 pivot（D43）；CP-1 Apple delivery gates remain open
- **Action selected:** D42 code-review 硬化 + 冗余 spike/smoke 清理；D43 落地 Swift 测试体系并设为回归门
- **Owner classification:** Claude/core-adjacent（Apple presentation/binding 层 + 测试，非 Apple runtime delivery）；用户为 D42/D43 批准权威
- **Scope-fence check:** passed —— 无 root workspace / lockfile / package config 变更；无 entitlement/container/CloudKit/持久写入；Swift 测试不实现 deterministic core semantics（grep exit 1）；Team ID 已离开 tracked 内容
- **Evidence (Observed = command + output):**
  - `swift test`（AnchorCoreBindings）→ 10 tests in 2 suites passed, exit 0
  - `xcodebuild test -only-testing:AnchorUnitTests ... CODE_SIGNING_ALLOWED=NO` → 4 tests in 2 suites, `** TEST SUCCEEDED **`
  - `xcodebuild test -only-testing:AnchorUITests ... -allowProvisioningUpdates` → 3 tests（toolbar-disabled / sidebar→inspector / TextKit-body）passed, `** TEST SUCCEEDED **`, exit 0
  - macOS build exit 0 / 0 warnings；iOS Simulator compile exit 0
  - `rg ... suites/anchor/apple/Anchor` 确定性语义 → exit 1；`rg ... core cli` 云符号 → exit 1
  - `rg <TEAM_ID>`（排除 gitignored local）→ 0 matches；`git check-ignore Signing.local.xcconfig` → ignored
  - `git rm -r AnchorAppleSpike macos-icloud-probe` + `rg`（非-doc）→ no references remain
  - `cargo test`（core 基线）→ 145 passed / 0 failed / 2 ignored
  - `bun install --dry-run ...` → done；`git diff --check` → clean
- **Gates closed this iteration:** 验证方式 pivot（Swift 测试门）；三层 17-test machine gate green（含 UI 3）；Team-ID 外置；spike/smoke 清理；Apple code-review 优化；本机 UI signing 解决
- **Gates still open:** CI signing 接线（hosted runner 跑 UI）、product write dispatch / TextKit 编辑 / persistence / iCloud / release distribution tagged Not run
- **Backfill to 04/05/06:** `05` D42 + D43 added；`00` cursor/§5/§6 更新；`21` state block/§6/§7/§8 更新
- **Axis matrix delta:** Stage-3 macOS product shell `xcodegen-config-go` → `test-harness-go`；新增 verification-method = Swift 测试体系（17 tests，替代截图）
- **Gate evaluation:** CONTINUE — next action: macOS product TextKit runtime lower bound，先写覆盖该改动的 Swift 测试（D43 门），再实现
- **Decision requested:** none
- **New doc:** `docs/workbench/20260606-anchor-v1/29-stage-3-test-driven-pivot.md`
