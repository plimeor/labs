# Anchor — CP-1 Whole-Exit Report (assembly)

任务：把所有可关闭的 core / boundary / Apple-verifier 证据装配成 CP-1 whole-exit 报告，按 `12-stage-1-spike-plan.md §6` 的 5 条退出准则逐条收口，并诚实记录仍 open 的 Apple-runtime / human-approval gate。
日期：2026-06-10
状态：**workbench evidence（CP-1 exit assembly）—— 非公开接口契约**

> **边界声明（AGENTS 工作台规则，强制）：** 本文件**不授权**任何 package / workspace / 产品 app / 生成 lockfile / 代码改动；不创建产品 app shell / entitlement / bundle id / iCloud container。它是把已得证据装配成 exit 报告，不伪造任何 Apple 真机结果。CP-1 whole-exit 的形式退出是 human sign-off gate。

> **诚实性声明：** 纯 Claude agent **不能**自证 CP-1 whole-exit——它需要 signed device + 付费 ADP + 真实 iCloud 的 Apple 真机 runtime 与一个 human approval。本文件的作用是：把 Claude/core 可关闭的证据全部收口、引用 Apple verifier 已得的真机证据（脱敏后存于 `09`/`17`/`18`/`19`/`20`），并把仍需真机/人审的项精确列出。`Not run` / `Blocked` 项**不得**当已验证事实。

---

## 1. 结论

**CP-1 的 core-owned 退出准则（§6 条件 1、2、5、6）已满足；boundary 准则（条件 3 binding、条件 4 iCloud）边界已由用户批准（B4 / B14，2026-06-07）但仍有 Apple-runtime / 交付 open gate；CP-1 whole-exit 的形式退出 = human sign-off。** 本轮无 axis 被 blocked，无 stop condition 触发。

读法：下表「Claude-closeable」列 = 纯 core/确定性可关闭项（已关闭）；「Apple/human gate」列 = 需真机或人审项（精确列出，未伪造）。

---

## 2. 按 §6 五条退出准则逐条收口

### 条件 1 — spike 组 1+5（确定性 core）作 CI gate

**状态：MET（core side）。**
- `cargo test --manifest-path suites/anchor/Cargo.toml` → **83 passed; 0 failed; 1 ignored**（`scale_bench` 默认门控；Stage-1 起点 74 → CP-2 后 83）。
- `cargo clippy … --all-targets -- -D warnings` → `Finished`（clean）。
- 跨设备逐字节一致向量集：native + wasm（Node WebAssembly）**EXECUTION** 逐字节一致（`anchor_wasm_vector_status=0`，6 determinism vectors）；iOS Simulator slice 执行 Observed（`19`/`20`）；golden `snapshot_revision 3ef88671…a877b63` / journal `jnl_f99080…` / BLAKE3 向量复用未变。
- **Apple/human gate：** iOS-slice 的跨目标 EXECUTION（vs wasm）仍 Apple-gated；hosted 持久 CI wiring 本期已移除（`20`），repo-local runner 在 `/tmp`。

### 条件 2 — World A 多目标编译 gate + client 零真理 grep 红线

**状态：MET。**
- `cargo build … --target wasm32-unknown-unknown` 与 `--target aarch64-linux-android` → 均 `Finished`（零依赖使 gate by construction 不被 transitive crate 打破）。
- core 云符号 audit：`rg "CloudKit|CKRecord|…|iCloud|…" suites/anchor/core` → **0 matches, exit 1**。
- client 零确定性语义：`rg "diff3|order-key|merge|normaliz|op-creation|tree-invariant|blake3" suites/anchor/apple` → **0 matches**。

### 条件 3 — 组 2（binding）+ 组 3（TextKit runtime）

**状态：binding = approved / release-distribution-gated；TextKit = compromise / mechanism-go。**
- **binding（B4，2026-06-07 approved）：** UniFFI DTO/dispatch + C ABI bytes fast path（64MB benchmark：C ABI ≈38.22ms/96MB RSS vs UniFFI ≈145.22ms/267MB RSS，3.8×/2.8×）；synchronous + UniFFI-generated async Swift 通过 `-swift-version 6 -strict-concurrency=complete -warnings-as-errors`；三 slice XCFramework + SwiftPM checksum；physical-device generated-async runtime + development-signed verifier app-bundle runtime exit `0`（`17`）。production DTO/error vocabulary 冻结为 core-owned envelope + 3 个 ValidationError code（`17`）。
- **TextKit（D18）：** macOS AppKit + iOS UIKit 的 selection / marked-text / keyboard-intent / menu / undo-suppression / view-lifecycle / accessibility mechanism floor 已 Observed；probe-level structural intent → real core dispatch bridge Observed（`18`）。
- **Apple/human gate：** Developer ID / App Store distribution、product app 集成（非 verifier）、`NSUndoManager` grouping/redo、VoiceOver / 产品 UI runtime、moving-view replace replay。

### 条件 4 — 组 4（iCloud 交付 gate）

**状态：approved default transport（B14，2026-06-07）WITH compromise constraints。**
- signed macOS app + repo-local Xcode verifier 通过 ubiquity / package / coordinator / direct-enumeration / build-signing；package-internal `.seg` 发现**不依赖** `NSMetadataQuery`（direct enumeration，100K ~270–300ms）；manifest conflict floor = surface/preserve/block/no-auto-resolve；physical iPhone CloudDocuments container + file-coordinated segment write/read floor Observed；1M-op steady-state segment-budget file-count floor Observed（N ops ≠ ~N segments）（`19`）。
- **Apple/human gate（交付 open）：** remote `.icloud` placeholder download（macOS package-internal 返回 `NSCocoaErrorDomain:4`）、signed-out / over-quota account states、iOS / 非-macOS 大规模 delivery、iCloud-语境 million-op replay/merge/compaction、product conflict-resolution UX（绝不静默处理 `NSFileVersion`）。four-horizon retention 模型内部一致且 core `retention`/`segment_budget` 测试通过，但 iCloud-语境 compaction 未实测。

### 条件 5 — 模型调整回填 04/05/06

**状态：MET。** CP-2 调整已回填既有 D/F 号：D24（op-shape 全信封冻结 + golden + `macro_size`）、D29（macro 原子消费 + `split_merge_structural` 冲突物化 surfacing）、单一已校验 dispatch（plan §8.5）chokegrep 不变量、F26c（renormalize reserved）、F30。详见 `23-cp-2-core-readiness.md` §7。

### 条件 6 — exit 前无持久应用写入

**状态：MET。** 仅 spike/测试；无产品 app target，无持久落盘。`git diff --check` clean；`find suites/anchor -name package.json` → 0；`bun install --dry-run --frozen-lockfile` passed（Bun 未把 `apple/` 拉入 workspace）。

---

## 3. CP-1 退出准则汇总

| §6 条件 | Claude-closeable | Apple/human gate |
|---|---|---|
| 1 确定性 core CI gate | **closed**（83/0、clippy、native+wasm execution、golden 复用） | iOS-slice execution；hosted 持久 CI |
| 2 多目标编译 + 零真理红线 | **closed**（wasm+android Finished、audit 0/exit1、apple 0） | — |
| 3 binding + TextKit | binding vocabulary/strict-concurrency/checksum **closed**；TextKit mechanism floors **closed** | distribution identity、product app 集成、undo/redo、VoiceOver |
| 4 iCloud 交付 | adapter 形状 / enumeration / segment-budget floor / conflict floor **closed** | remote placeholder、account states、iOS scale、iCloud compaction、product resolver |
| 5 回填 04/05/06 | **closed** | — |
| 6 无持久写入 | **closed** | — |
| **CP-1 whole-exit** | 全部 Claude-closeable 项已关闭 | **human sign-off + Apple runtime（remote iCloud / distribution）** |

---

## 4. 请求的 human / operator 动作（形式退出 CP-1 所需）

1. **Apple operator round**（付费 ADP + signed device + 真实 iCloud，产物落 `/tmp/anchor-apple-stage1` repo 外）关闭条件 3/4 的 Apple-runtime gate：remote `.icloud` placeholder download、signed-out/over-quota account states、iOS CloudDocuments 大规模 delivery、product conflict-resolution policy、Developer ID/App Store distribution identity。
2. **human CP-1 sign-off**：依 `10-cp-0-approval.md §8` 的 per-item 风格，对 binding(B4)/iCloud(B14)/TextKit/确定性 core/退出准则签署 CP-1 whole-exit。
3. 上述完成后，CP-1 形式退出；CP-2 whole-exit（`23-cp-2-core-readiness.md`）随之解锁其 checkpoint 形式退出（core 证据已就绪）。

> 本文件不自证 checkpoint 退出、不伪造 Apple/人审结果。所有 `closed` 项均为机制/core/verifier-runtime 证据，**不**蕴含 product release。Cursor / ledger 见 `21-stage-1-integration-report.md`。
