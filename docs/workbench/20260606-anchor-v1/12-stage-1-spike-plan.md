# Anchor Phase 0 — Stage 1 探索验证（spike）计划

日期：2026-06-07
状态：CP-0 整合稿（Step 3，Claude 整合 Codex Apple 验证证据）。本文件**只规划 Stage 1 spike，不实现**。CP-0 已批准（见 `10-cp-0-approval.md` §0）；本文件是 CP-1 / Stage 1 的执行计划，启动 briefing 见 `13-stage-1-entry-brief.md`，CP-0 冻结结论与进入 Stage 1 禁止的顺手扩展见 `11-cp-0-final.md`。

> 边界声明（强制）：本文件是 workbench 工件，**不是公开接口契约**。创建 workbench 目录**不授权**任何 package / workspace / app / lockfile 改动，也不授权创建 `suites/anchor` / `apps/anchor-*` / `packages/anchor-*` / 顶层 `anchor-apple/` / Xcode project / Swift Package / Rust crate / entitlements / bundle id / iCloud container，更不授权改动 `package.json` / `bun.lock` / 任何 `tsconfig` / workspace 配置或写任何 Rust / Swift / TS 代码。本文件**不创建任何工程**，所有命令均为**目标态命令骨架**，标注其执行态（Observed / Recommended / Not run）。
>
> CP-1 对齐：所有 spike 须落成正式验证（`cargo test -p anchor-core` 把 core spike case 固化为测试，Apple spike 留可重复命令或 Xcode scheme + spike 报告）；**通过前不实现持久应用写入**（plan §11 CP-1、§12 验收）。Spike 通过即把任何「必须调整的模型点」回填 04-contract-baseline.md / 05-key-decisions.md。

标注语义：

- **Observed**：Codex 本机实跑或官方文档直接支持（证据见 09-apple-verification.md）。
- **Recommended**：建议的目标态命令骨架 / spike 设计。
- **Needs Stage 1 spike**：机制可行性已验证，但 Anchor 专属构建/运行未证，留待本 Stage 1。
- **Needs user approval**：触 workspace/package/Apple project 边界、新公开 CLI schema、加密所有权、付费 Apple Developer Program、entitlement/容器、plan §13 暂停条件。
- **Blocked**：当前环境无法验证，被硬门控。
- **Not run**：未执行项，不得当已验证事实。

引用：plan = `01-apple-native-note-workbench.md`；conflict = `02-conflict-resolution-model.md`；Phase 0 Codex 验证 = `09-apple-verification.md`；Stage 1 reports = `docs/workbench/20260606-anchor-v1/`。同目录姐妹文件以相对名引用（05-key-decisions.md、06-fixture-set.md、04-contract-baseline.md、07-project-layout-options.md）。

---

## 0. Owner 模型与全局前置

Stage 1 spike 严格二分两类 owner，**互不越界**：

- **Claude / core owner**：平台无关 Rust core（`anchor-core` 含内部模块 `anchor-editor-core`）的确定性工作——序列化、id、order-key、op-log replay、merge、lattice、身份、mirror/projection parity。所有 core 确定性算法（含 diff3 body merge、fractional order-key）**只在 Rust core 执行**，由同一编译产物经 binding 调用，跨 macOS/iOS/wasm 逐字节一致 by construction；不由 Swift/TextKit 各自实现。World A 取向下，core 额外承担**多目标可编译性**（wasm32 + android），见本组多目标编译 gate。
- **Codex / Apple verifier**：Apple/Xcode/Swift/TextKit/iCloud 现实验证——binding 工具链、XCFramework、TextKit 适配、iCloud Drive entitlement 与 runtime 行为。Codex 验证「机制可行」，core owner 提供被调用的 fixture / DTO / 算法真值。

**全局前置（Recommended，多组 spike 共享）：**

```fish
# Xcode/SDK/simulator 选择（不改全局 xcode-select）
set -x DEVELOPER_DIR /Applications/Xcode.app/Contents/Developer
# 安装 Rust Apple targets（Codex Observed：iOS / iOS-sim targets 未装，scratch ios-sim build 因此失败）
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
```

- **Observed**：Xcode 26.5 (Build 17F42)、macOS SDK 26.5、iOS SDK 26.5、iOS Simulator SDK 26.5、iOS 26.2/26.4/26.5 模拟器设备可用（经一次性 `DEVELOPER_DIR` 前缀；默认 `xcode-select` 指向 CommandLineTools）。详见 09-apple-verification.md §2.2、§4.1。
- **Observed**：Stage 1 本机已安装 `aarch64-apple-ios` / `aarch64-apple-ios-sim`，并完成 macOS / iOS / iOS-sim Rust builds 与 C ABI / UniFFI three-slice XCFramework creation（见 `./17-apple-binding-evidence.md`）。
- **Observed / scoped**：`suites/anchor/core` 与 `suites/anchor/apple` 为 Stage 1 最小验证工程；repo-local product app target build 仍不在 scope。任何产品 app shell、持久应用写入、workspace/root lockfile 改动仍需单独授权。
- **Needs user approval / 实现授权**：layout 已由用户批准 = Option A `suites/anchor`（2026-06-07，见 07-project-layout-options.md、05-key-decisions.md D02）；spike 实跑前仍须**目录 / 工程的实际创建动作**获实现授权。Apple 命令统一用 `-derivedDataPath` 避免 DerivedData 落进 repo；直接验证 Swift package 须在 package cwd 跑 `xcodebuild -list`（Codex Observed：本机 Xcode 26.5 不支持 `xcodebuild -list -packagePath`）。

---

## 1. Core deterministic spikes

**Owner：Claude / core。** 目标：把 plan §11 阶段1 确定性 core 产物与 conflict §13.2 全部冲突 fixture 落成跨运行/跨设备确定性可 replay 的正式测试。覆盖 06-fixture-set.md F01–F43 中的 core 项与 conflict fixture（F23–F35）。Codex 验证此组**无 Apple 依赖**：算法纯在 Rust core，跨平台一致由「同一编译产物」保证（09-apple-verification.md §5.3、§8.4 关于 diff3/order-key 的结论）。

**Commands（core owner observed; see `./15-core-evidence.md`）：**

```fish
cd suites/anchor
cargo test -p anchor-core
cargo clippy -p anchor-core --all-targets
# 多目标编译 gate（World A：core 在 Apple-first 阶段保持 wasm + android 可编译）
cargo build -p anchor-core --target wasm32-unknown-unknown
cargo build -p anchor-core --target aarch64-linux-android
```

| 子 spike | 目标 | 关联 fixture / 决策 |
|---|---|---|
| canonical_serialize | 跨运行 bytes 与 hash 稳定；JCS 风格（递归排序 key、固定转义、无无意义空白、禁 `f64`、数字规范十进制） | D30；plan §8.3 |
| id + fractional order | nanoid 普通 Note id；fractional-index base-N 任意精度字符串 order-key（绝不浮点） | F26；D26 |
| op-log replay | 从空状态纯 fold 重建同一物化树；到达顺序永不影响结果 | F34；D12；plan §11 |
| HLC LWW merge | move-vs-edit（独立 cell 全保留 + `location_relocated`）、edit-vs-delete（可逆 trashed + 编辑保留 + restore）、本地 `base_sub_rev` stale guard、同步 ingestion（per-actor 单调 HWM + `op_id` dedup） | F24、F31、F33、F34、F32；D11、D12 |
| diff3 body merge + mark re-clamp | 确定性 3-way diff3 / keep-both 永不静默 LWW；合并后每个 UTF-16 mark offset 重新 clamp（expand 长入 seam、non-expand 不长入）；N-way 同 base fan 折叠成单一 keep-both | F23；D19；conflict §6.1 |
| OR-Set tag | add-wins by `op_id`；remove 携 observed-add 集合；add/remove/re-add 生命周期顺序无关；observed-add id watermark-GC | F29；D28 |
| life lattice | 时钟无关优先级 lattice join、非级联、派生 root-reachability 可见性、终态 `deleted` 仅经显式 `trashed→deleted` 且 `dominates_frontier` 因果支配编辑可达；拒绝直接 `active→deleted`；trash/archive tie = archived-wins | F25、F31；D10、D20、D27 |
| journal 内容寻址身份 | `note_id = blake3("journal:" ‖ vault_id ‖ calendar_date)`；同 vault 同日恒为同一 Note（身份不变量，无运行时去重）；trashed 后重开 restore 不产生重复 | F03、F05、F06、F07、F08、F35；D08 |
| export mirror vs structured projection parity | 对真实查询样例比较 structured projection 与对 mirror 跑 ripgrep 的 parity；证明 mirror 写失败只影响 freshness/diagnostics、op-log 不回滚（详见 spike 组 5） | F36；D15、D16 |
| **diff3 + order-key 跨设备逐字节一致向量集** | **强制 CI gate**：pin diff3 实现 + `diff_algo_version`；macOS、iOS 与 **wasm32**（World A 非-Apple target）须产出逐字节相同 merge 结果与 fractional key。算法**只在 Rust core 执行**——证据来自 Rust core vectors，**不**来自 TextKit/Swift 专属实现；跨平台一致 by construction，但 CI 一致性向量集仍为强制门控 | F23、F26；D19、D26；conflict §12 |
| **core 多目标编译 gate（wasm32 + android）** | **CP-1 一道 gate**：证明 `anchor-core`（含 `anchor-editor-core`）编到 `wasm32-unknown-unknown` 与 `aarch64-linux-android`，不止 Apple slice；落实 core 依赖政策（每个依赖 wasm + android 可编译、确定性/merge 路径 `no_std`-friendly、不碰 OS 线程/fs/时钟/浮点）。**保护的是 core 在 Apple-first 阶段保持可复用，web/android client 仍延后** | D36；plan §8.1 |
| **client 零真理逻辑 CI 红线** | grep gate 证明 Apple 及未来任何 client 侧零 merge / normalization / op-creation / tree-invariant 校验（这些唯一归 `anchor-core::dispatch`）；client 只表达意图、消费 DTO/patch、传字节（World C 陷阱绊线） | D37；plan §8.5、§13 |
| **op-count scale（50K→10M+ logical ops）** | replay cost 曲线 = O(snapshot-load + ops-since-snapshot)；million-op 下两种 ingestion 顺序 ＋ 不匹配 watermark 逐字节相同物化 + `snapshot_revision`；**50K ops 仅 smoke、不足进 CP-1** | F34、F42；D06、D14；§6 |
| **segment batching ratio & steady-state budget** | 正常使用 op:segment 比、最坏 burst、compaction 后稳态 segment 文件数；**断言 N 个 logical op 不产生 ~N 个 synced segment（failure shape）**；候选 size/time/idle/前后台 flush + 本地 unsynced WAL staging + max 一 active unsealed segment | F42；D06、D13 |
| **四-horizon retention 正确性** | conflict horizon 不解 open-conflict pin；>time-travel-horizon 内 op 只 archive 不 hard-delete；离线超窗设备整快照重拉收敛；loser/tombstone/`op_envelope_version` 在 audit horizon 内保留；restore = 前向 dominating op；旧 envelope ops 经 read-time upcasting 重建出记录的 `snapshot_revision` | F43；D14、D38 |

**Evidence（通过证据）：**

- `cargo test -p anchor-core` 把上述 case 全部落成正式测试并通过；`cargo clippy --all-targets` 无 deny。
- 每个确定性断言在「两种 ingestion 顺序」**与**「不匹配的 per-device watermark」下均给出逐字节相同的物化态 + `snapshot_revision`（conflict §13.2 第1条）。
- 跨设备一致性向量集作为 CI gate 文件签入：golden 向量在 `aarch64-apple-darwin` 实跑捕获并通过，core 多目标编译 gate（`wasm32-unknown-unknown` + `aarch64-linux-android`）通过，故整数 / 无浮点 / 无平台分支下跨目标逐字节一致 by construction；`wasm32`（wasmtime）/ iOS slice 的跨目标**执行**接线为强制 CI gate，本轮未实跑执行。
- 多目标编译 gate 通过：`anchor-core` 编到 `wasm32-unknown-unknown` 与 `aarch64-linux-android` 均成功，core 依赖政策无违例（World A 受保护不变量，D36）。
- client 零真理逻辑 grep 红线通过：client 侧零 merge / normalization / op-creation（D37）。

**Failure conditions（失败条件）：**

- 任一 canonical 序列化或 `snapshot_revision` 因 actor 相关元数据 / 浮点 / locale 混入而跨运行或跨设备 fork。
- diff3 出现静默 LWW、重叠 hunk 丢一侧、或 macOS/iOS 同向量集结果不逐字节相同。
- order-key 出现 jitter / 精度 / 字母表漂移导致 sibling 顺序或子树 hash 跨平台分叉。
- 直接 `active→deleted` 被接受、并发编辑被陈旧 delete 不可逆销毁、或 journal 同日铸出第二 Note。

---

## 2. Apple binding spike

**Owner：Codex / Apple**（被调用的 Anchor DTO / fixture / `TransactionResult` 真值由 Claude / core 提供）。Binding 决策面采用 **UniFFI DTO / ordinary dispatch + C ABI bytes fast path**（05-key-decisions.md D01）。

**Codex status（09-apple-verification.md §4、§5；Stage 1 17-apple-binding-evidence.md）：**

- **Observed**：scratch host 路径已实跑——Rust staticlib + C ABI + SwiftPM executable link/run 成功；UniFFI 0.31.1 经 project-local `cargo run` 生成并运行 minimal record/bytes Swift binding（`Data` mapping 可运行）；one-slice macOS XCFramework creation 成功。
- **Observed**：Stage 1 installed Rust iOS targets; `anchor-core` builds for macOS / iOS / iOS-sim; C ABI and UniFFI wrappers build three staticlib slices; both XCFrameworks are created; SwiftPM wrapper imports; generated Swift smoke calls fixture summary, `EditorIntentDto`, `TransactionResultSummary`, typed `ValidationError`, post-dispatch snapshot revision, `SegmentId`, segment bytes, and blob bytes.
- **Observed**：C ABI bytes benchmark passes 1/4/16/64MB; 64MB around 38.22ms and max RSS around 96MB. UniFFI 64MB around 145.22ms and max RSS around 267MB in Stage 1 generated Swift smoke.
- **Observed**：Synchronous release-surface rerun creates both C ABI and UniFFI three-slice XCFrameworks and runs generated Swift with `-swift-version 6 -strict-concurrency=complete -warnings-as-errors`.
- **Approved boundary（B4，2026-06-07）**：Binding product boundary is `UniFFI DTO / ordinary dispatch + C ABI bytes fast path`. Release implementation gates cover UniFFI async `Sendable` surface, final production DTO/error vocabulary, product wrapper import surface, and CI/fresh-machine reproduction.

**Commands（Stage 1 observed; keep as reproducible skeleton）：**

```fish
# 前置：安装 iOS Rust targets（见 §0）
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
cd suites/anchor
cargo build -p anchor-core --release --target aarch64-apple-darwin
cargo build -p anchor-core --release --target aarch64-apple-ios
cargo build -p anchor-core --release --target aarch64-apple-ios-sim
# project-local UniFFI Swift bindgen（不依赖全局 uniffi-bindgen）
cargo run -p uniffi-bindgen-swift -- \
  target/aarch64-apple-darwin/release/libanchor_core.a \
  apple/Generated/AnchorCore --swift-sources --headers --modulemap --xcframework
# 三 slice XCFramework
xcodebuild -create-xcframework \
  -library target/aarch64-apple-darwin/release/libanchor_core.a -headers apple/Generated/AnchorCore/Headers/macos \
  -library target/aarch64-apple-ios/release/libanchor_core.a -headers apple/Generated/AnchorCore/Headers/ios \
  -library target/aarch64-apple-ios-sim/release/libanchor_core.a -headers apple/Generated/AnchorCore/Headers/ios-sim \
  -output apple/Artifacts/AnchorCore.xcframework
# SwiftPM wrapper import（package cwd 直接验证，非 -packagePath）
cd apple/AnchorCoreBindings
xcodebuild -list
xcodebuild -scheme AnchorCoreBindings -destination 'generic/platform=iOS Simulator' -derivedDataPath .build/xcode build
```

| 子 spike | 目标 |
|---|---|
| Rust Apple targets | `aarch64-apple-darwin` / `aarch64-apple-ios` / `aarch64-apple-ios-sim` 三 target 可构建 |
| UniFFI 对 Anchor DTO | `open_fixture_vault() -> FixtureSummary`、`dispatch(EditorIntent) -> TransactionResultSummary`、`read_segment(SegmentId) -> bytes`、blob bytes 经 generated Swift 调通；DTO 保持 versioned records/enums，避免高度递归/泛型 shape |
| structured errors + async-Sendable | `ValidationError` / `SyncStatus` / `MirrorStatus` 保持 structured（不退化成 strings）；Swift 6 strict concurrency flags 下不产生不可接受的 concurrency/import warning；sync adapter I/O 的 async 保留在 Swift 侧，不强迫 Rust core 拥有云 async runtime |
| 1·4·16·64MB bytes transfer 成本 | C ABI and UniFFI transfer time + peak RSS recorded; bulk bytes use C ABI fast path |
| XCFramework 三 slice + SwiftPM wrapper import | macOS / iOS device / iOS sim 三 slice，headers/modulemap 匹配 generated Swift；SwiftPM wrapper import 成功 |
| Apple target round-trip | Generated Swift smoke 经 UniFFI 调 core fixture / dispatch / segment / blob；repo-local product Apple target remains outside this spike |

**Evidence：**

- 三 slice XCFramework 构建成功且被 SwiftPM wrapper import。
- Generated Swift smoke validates fixture summary, dispatch result summary, validation error, post-dispatch revision, segment bytes, and blob bytes.
- Generated Swift synchronous smoke passes Swift 6 strict concurrency + warnings-as-errors against release artifacts.
- 1/4/16/64MB benchmark gives the primary/fast-path decision: UniFFI for DTO / ordinary dispatch, C ABI for bulk bytes.

**Failure conditions（09-apple-verification.md §5.2/§5.3）：** DTO shape 不被 UniFFI 干净支持；generated Swift 无法过 Swift 6 strict concurrency；structured errors 退化成 strings；C ABI bytes fast path 无法保留；async boundary 要求 Anchor 不能接受的 Rust runtime 假设；modulemap/header mismatch 或缺 slice 导致 XCFramework 不可 import。

---

## 3. Text surface adapter spike

**Owner：Codex / Apple + Claude `anchor-editor-core` 合约。** 目标：证明 NSTextView/UITextView/TextKit 事件可转 `EditorIntent`、`EditorPatch` 可回放到 native view model，且 TextKit buffer 始终是 projection 不是真理。覆盖 06-fixture-set.md F19–F22。`anchor-editor-core` 只拥有 portable selection / intent shaping / 提升降级 / paste-fragment shaping / 跨 block 拆分**建议** / platform patch 生成 / undo-intent 映射；tree invariant / normalization / op creation / 最终非法结构拒绝归 `anchor-core::dispatch`。

**Codex 现状（09-apple-verification.md §6）：**

- **Observed**：NSTextView/UITextView adapter 编译面 macOS + iOS sim 通过；macOS NSTextView runtime 可设 UTF-16 selection、layout manager/text container 可用、`UndoManager` semantic undo closure 可执行（`textkit:utf16=16`、`textkit:selected=1:8`、`textkit:undo_events=semantic-inverse-intent`）。
- **Not run**：real input event capture、hit-testing、IME marked text、direct buffer undo interception、undo grouping、accessibility range、patch replay、跨 view selection。

| 子 spike | 目标 | fixture |
|---|---|---|
| 事件 → EditorIntent | NSTextView/UITextView 输入事件 intercept/normalize 成 `EditorIntent`（insert text、split、merge backward、indent/outdent、transform、apply mark、paste fragment） | F19；plan §11 |
| EditorPatch 回放 → native view model | dispatch 后 adapter 应用 `EditorPatch` 重写 TextKit view model；`NSRange`/`NSTextRange`/view identity/focus/scroll/IME 保持 transient | F19、F20 |
| single-block text selection | `EditorSelection::Text { block_id, range_utf16, affinity }`；selection 经受 patch replay | F19 |
| block selection | hit-tested block ids → `EditorSelection::Block`；支持 move/wrap/delete/duplicate/tag/type/prop/copy-link/transclude | F20 |
| embedded editor selection | code payload 局部选择 → `EditorSelection::Embedded`；`Esc` 退到 block selection、重复 `Cmd+A` 从 code promote 到 block/workspace（promote/demote 归 editor-core） | F21 |
| undo via NSUndoManager semantic inverse intent | `NSUndoManager` 注册 semantic undo 调 `anchor-core::dispatch` 传 inverse intent/op；**suppress / isolate direct buffer undo**；buffer direct undo 仅限 commit 前 transient composition | F19；04-contract-baseline.md「Editor baseline」（anchor-editor-core undo-intent 映射，归 editor 合约面，不绑编号决策） |
| IME marked text / accessibility / hit-testing | composition 为 transient，commit point 成 `EditorIntent`；accessibility range 与 hit-testing 基础行为 | F19 |
| **跨 block 连续选择（spike-only，非首期承诺）** | editor-core 可对 cross-block edit intent 做 shape/split **建议**；**不**承诺 polished continuous native selection；难点：多 text view 连续选择、accessibility range、IME、跨 buffer undo grouping、跨 disappearing/splitting block 的 patch replay | F22 |
| UTF-16 offset 换算正确性 | emoji / ZWJ / combining mark / CRLF/newline / IME marked text fixture 下，对外 UTF-16 code unit 与 core 内部单位的换算逐字节正确（一次确定性换算于 binding 边界） | F19；D18 |

**Evidence：** spike 报告列出 single-block / block / embedded / 跨 block 选择各自的通过/失败证据（plan §11、§12）；UTF-16 fixture（emoji/ZWJ/combining/CRLF/IME）换算逐字节正确；undo 经 dispatch 产生 core op 且 buffer direct undo 被 suppress。

**Failure conditions：** undo 能在不产生 core op 的情况下修改 TextKit buffer（buffer 成隐藏真理，editor boundary 失效，09-apple-verification.md §6.4）；`NSAttributedString` attributes 被用来存 ref/tag/link 语义；platform range 跨 patch replay/IME/block movement 漂移未在 adapter 边界转换；UTF-16 换算在 composed character 下偏移。

---

## 4. iCloud Drive adapter spike

**Owner：Codex / Apple。** **前置：付费 Apple Developer Program team + signed app + iCloud container +真实 account。** Stage 1 结论为 **approved default transport with compromise constraints**：iCloud Drive 已获用户批准作为首期 default transport（2026-06-07），但交付仍受 scale、placeholder、account-state 与 conflict-resolution policy gate 约束；core 永不出现云类型。覆盖 06-fixture-set.md F34（iCloud Drive re-delivery / duplicate segment 面）。

**Codex status（09-apple-verification.md §2.6、§7；Stage 1 19-icloud-drive-evidence.md）：**

- **Observed（编译面 + 付费 team iCloud entitlement）**：iCloud adapter Foundation API（`url(forUbiquityContainerIdentifier:)`、`NSMetadataQuery`、`NSFileCoordinator`）编译面 macOS/iOS sim 可行（`ICloudAdapterProbe` 编译通过）；**用户已开通付费 ADP（Individual）team（`isFreeProvisioningTeam=0`）**，demo project 经 automatic signing 生成含 iCloud Documents entitlement 的 profile + signed device artifact，并在真机返回 **non-nil ubiquity container URL**（§2.6）。
- **Observed（signed runtime）**：physical iPhone probe passed explicit/implicit ubiquity container lookup, `.anchorvault` package type id, `NSFileCoordinator` read/write, current-item download call, 1024-file write subset, and online convergence. Real signed macOS app passed automatic signing/provisioning/build/runtime, package-level metadata discovery, direct package-internal enumeration, 10K/50K/100K package-internal scale direct enumeration, and offline `NSFileVersion` conflict materialization.
- **Compromise**：`NSMetadataQuery` discovers the `.anchorvault` package itself and package-external `.seg` files, but did not enumerate package-internal `.seg` files in the probe. Package-internal segment discovery uses direct enumeration under file coordination.
- **Open gates**：remote placeholder download, signed-out / over-quota, local-only path edge cases, iOS large-scale delivery, steady-state segment budget, repo-local product app entitlement, and product conflict-resolution policy.

| 子 spike | 目标 | 标注 |
|---|---|---|
| Anchor target iCloud-capability 签名 | Repo-external signed iPhone and macOS probes have CloudDocuments entitlements; repo-local product Anchor target entitlement remains separate | partial passed |
| ubiquity container | `url(forUbiquityContainerIdentifier:)` 在真实 signed-in iCloud account 下返回 container URL | passed |
| vault file package UTType | `.anchorvault` declares `<vendor>.anchor.vault` conforming to package semantics; package-level metadata discovery works | passed / compromise |
| coordinated write 可见性 | Coordinated read/write succeeds; current online cross-device runs converge | passed |
| NSMetadataQuery live notifications | Package-level metadata discovery works on macOS; package-internal `.seg` discovery via metadata does not | compromise |
| placeholder download | current local item download call succeeds on iOS; remote placeholder case not observed | partial |
| NSFileCoordinator 不阻塞 UI | read/write succeeds in probe; full UI-blocking profile not measured | partial passed |
| **manifest 并发写行为** | Online concurrent writes converge with 0 conflicts; offline iOS / online macOS fork materializes 1 unresolved `NSFileVersion` conflict after reconnect | passed for runtime detection; resolution policy open |
| signed-out / over-quota | 真实 account/device 上观测 signed-out 与 over-quota 状态（simulator 无法证明时） | Needs Stage 1 spike（付费 team 已开通） |
| **local-only 路径判定边界（D21 / D21a）** | resolved path 是否解析进 ubiquity 的判定：正常 iCloud Drive 路径、app ubiquity `Documents/`、指向 iCloud 的 symlink、iCloud 内指向外部的 symlink、外部卷、挪动后恢复的 security-scoped bookmark、Finder 挪动的 package 目录、`.icloud` placeholder、signed-out；判定可靠时 `sync="none"` 误放→ typed `local_only_vault_in_ubiquity`、拒开、不挂 adapter | Needs Stage 1 spike（判定不可靠则按 D21a 减弱 product claim） |
| **segment-file-count scale（1K/10K/50K/100K）** | 逐档真机测 direct enumeration + metadata discovery latency、duplicate re-delivery、CPU/RSS、UI 阻塞；记录每档 go/compromise/no-go（Apple **不文档化任何规模数字**，全须实测，apple-verification §7.5） | macOS direct enumeration passed 1K/10K/50K/100K; package-internal metadata returned 0; iOS large-scale delivery not run |
| **placeholder / cold-start replay** | 冷/新设备多少 segment 为 `.notDownloaded`、批量 materialize 成本、是否必须全下才能 replay、深度 time-travel 重建需 force-download archived/evicted segment 的成本（apple-verification §7.5；05-key-decisions.md D38） | Needs Stage 1 spike |
| **coordinated read/write at scale** | per-segment `coordinate()` vs 一次 `prepare()` 批量的延迟/阻塞；segment 读全程 off-main + 先 gate 下载状态；presenter 进后台 `removeFilePresenter` 防死锁（apple-verification §7.5） | Needs Stage 1 spike |
| **manifest 方案对比** | per-device immutable cursor（默认）vs shared mutable manifest（winner 不确定、requires explicit resolution policy）vs epoch manifest vs directory-listing 推导：conflict/文件数/GC 正确性/frontier 维护（apple-verification §7.5；本节 manifest 对比表） | runtime conflict materialization passed; product policy open |
| **blob in package at 50MB** | 50MB blob 在 file package 内 placeholder/materialize/上传/驱逐 + UI 阻塞；blob 与 op-segment 分目录/节奏/GC（cap=50MB，D17） | Needs Stage 1 spike |
| **account-switch 硬边界** | `ubiquityIdentityToken` nil 退化 local-only；`NSUbiquityIdentityDidChange` 账号切换**绝不跨 identity 合并 segment**（apple-verification §7.5） | Needs Stage 1 spike |
| core 云符号审计 | core 零云符号 | passed; cloud-symbol audit 0 matches |

**两条分离的 scale 轴：** op-count（50K smoke / 500K / 1M / 5M / 10M+ logical ops，core 面 replay/merge/compaction/retention，spike 组 1）与 synced-segment-file-count（1K/10K/50K/100K，同步层实际枚举的 filesystem objects，Apple 面上表）。同步压力看 segment 文件数，非 logical op 数。

**Manifest 方案对比（S4-F 评估，默认 per-device immutable cursor）：**

| 方案 | iCloud conflict | 文件数 | GC 正确性 | frontier 维护 |
|---|---|---|---|---|
| **per-device immutable cursor（默认）** | 极低（write-once 永不进 conflict 路径） | 中（随 compaction 收敛） | 低（frontier = 各 cursor 的 min，纯函数） | 中（维护 known-device 集，同 D12 HWM） |
| shared mutable manifest | 高（online converge; offline fork materializes unresolved `NSFileVersion` conflict） | 低（1 文件） | 高（需要读取 current + conflict versions） | 低但须显式 resolution policy |
| epoch manifest（周期整体重写、内容寻址命名） | 中（需 epoch 选举 / 确定命名） | 中 | 中 | 中 |
| directory-listing + segment-header 推导 | 无 manifest 即无 manifest conflict | 0 额外 | 低（永远从真理段推导） | 高（每次冷启动全扫，依赖 NSMetadataQuery 规模） |

权威 frontier 始终可由 directory-listing + segment-header 推导；KVS / per-device cursor 仅加速发现，失效则退化全扫、不丢数据。

**Commands（Observed for core audit）：**

```fish
rg -n "CloudKit|CKRecord|CKAsset|CKContainer|CKSyncEngine|NSFileCoordinator|NSMetadataQuery|ubiquit|iCloud|NSURLIsExcludedFromBackupKey" suites/anchor/core
rg -n "OpSyncPort|push_segment|pull_segment|SegmentId|BlobId" suites/anchor/core
```

**Evidence：** 付费 team 下生成含 iCloud entitlement 的 profiles；真实账户返回 container；vault package type id 可读；package-level metadata discovery works；package-internal direct enumeration works through 100K files on signed macOS app；package-internal metadata query does not discover `.seg` files; coordinated read/write succeeds；current local download call succeeds on iOS；online concurrent writes converge；offline fork exposes unresolved `NSFileVersion` conflict；core 审计第一条命令零命中（无云符号），第二条命中 `OpSyncPort` / `SegmentId` / `BlobId`。

**Failure conditions（09-apple-verification.md §7.4）：** core 需要 cloud/account/file-coordination types 才能 merge 或 read bytes（`OpSyncPort` boundary 失效）；package-internal segment discovery depends on `NSMetadataQuery`; unresolved file versions are silently ignored; transport delivery produces roughly one synced segment per logical op; vault package lacks `com.apple.package` declaration.

**二期前瞻（不进首期；路线已获用户批准 B8，2026-06-07）：** 单附件 cap = **50MB**（D17，对齐 archived CloudKit `CKAsset` 50MB 上限）。CloudKit 始终作为同一 `OpSyncPort` 后的 Swift adapter，record schema 永不进 core；op 形状须在任何 CloudKit 记录落地前冻结。

---

## 5. Mirror / search parity spike

**Owner：Claude / core。** 目标：证明 post-commit mirror 是有损派生导出、其失败只影响 freshness/diagnostics 而 op-log 不回滚；structured search/backlinks 与对 mirror 跑 ripgrep 的 parity。覆盖 06-fixture-set.md F36（及 F16/F17 backlink 面）。

**Commands（Recommended / Not run）：** 随 spike 组 1 同在 `cargo test -p anchor-core`；parity 报告对比 structured search 与 exported `.md` 上的 ripgrep（plan §12 手动/artifact 证据）。

| 子 spike | 目标 | fixture / 决策 |
|---|---|---|
| post-commit mirror 生成 + freshness | dispatch append + materialization 成功后的 post-commit job 生成 `.md`/`.json` mirror，并记录 freshness | F36；D15 |
| mirror 写失败隔离 | mirror 写失败只影响 freshness/diagnostics、UI 一等呈现 stale 状态；op-log 保持已提交不回滚；后续真理层编辑继续用当前 materialized state | F36；D15 |
| structured search/backlinks 后端对比 | SQLite FTS vs replay 后内存索引（阶段0定向 SQLite FTS，可重建本地缓存）；对真实查询样例与对 mirror 跑 ripgrep 比较 parity | F16、F17；D16、D04 |
| 打开的 body 冲突渲染 | 打开的 body 冲突在 `.md` 渲染为可见 git 式 fence、`.json` 携 `ConflictRecord`；解决仍经 op 流，绝不靠编辑 mirror；`.md`/`.json` mirror 与 SQLite projection 均不进同步 | F36；D15、conflict §10 |

**Evidence：** parity report 显示 structured search 结果与 exported `.md` ripgrep 结果一致；mirror 写失败注入后 op-log replay 仍重建同一物化树、freshness 标记可见；body 冲突在 `.md` 呈 git 式 fence 且 `.json` 携 `ConflictRecord`。

**Failure conditions：** mirror 失败导致 op-log 回滚或后续编辑读到不一致 state；mirror 被当 merge 输入；structured search 与 mirror ripgrep parity 不一致；mirror / projection 进入同步制造第二真理。

---

## 6. CP-1 退出条件

- spike 组 1、5（Claude/core）的 case 全部经 `cargo test -p anchor-core` 落成正式测试并通过，`cargo clippy --all-targets` 干净；diff3 + order-key 跨设备一致性向量集（含 `wasm32` target）作为强制 CI gate 通过。
- **World A 受保护不变量：** core 多目标编译 gate 通过（`anchor-core` 编到 `wasm32-unknown-unknown` + `aarch64-linux-android`，D36）；client 零真理逻辑 grep 红线通过（D37）。
- spike 组 2、3（Codex/Apple + editor 合约）有可重复命令或 Xcode scheme + spike 报告；Stage 1 reports 已覆盖 binding round-trip、bytes benchmark、synchronous Swift 6 strict-concurrency release smoke、TextKit macOS smoke 和 iOS compile。Binding 产品边界已批准（B4，2026-06-07）；release gates 是 final DTO/error vocabulary、UniFFI async `Sendable` surface、product wrapper/CI 复现、real app responder-chain undo/IME/accessibility proof。
- spike 组 4（iCloud）保留 runtime evidence matrix；Stage 1 report 已覆盖 signed container、package UTType、file coordination、package metadata, package-internal direct enumeration, online convergence, offline conflict materialization, and core cloud-symbol audit。未跑项必须标明，不当已验证事实。
- **iCloud Drive 作首期默认 transport 已批准（10-cp-0-approval.md B14，2026-06-07）：** 批准形状为 compromise constraints；CP-1 仍需 (a) million-scale operation history 的 replay / merge / compaction / snapshot-fallback / time-travel 证据，(b) batching + compaction 后明确的 steady-state segment-file budget（N 个 op 不产约 N 个 segment），(c) remote placeholder / account-state behavior，(d) product conflict-resolution policy，(e) 四-horizon retention 正确性测试通过；delivery no-go-like result triggers batching/transport design reset and user review.
- 任何「必须调整的模型点」回填 04-contract-baseline.md / 05-key-decisions.md / 06-fixture-set.md，决策编号沿用 D01–D38（含 D18a、D21a、D38 time travel）、fixture 编号沿用 F01–F43（含 F42 segment budget、F43 retention）。
- **通过前不实现持久应用写入**（plan §11 CP-1）。
