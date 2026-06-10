# Anchor Phase 0 — Key Decisions（CP-0 整合决策表）

日期：2026-06-07
状态：**workbench artifact**（非公开接口契约）。本文件是 Phase 0 → CP-0 packet 的 Step 3 整合稿（Claude 整合 Codex 在 09-apple-verification.md 的 Apple 现实性证据），用于 CP-0 审批。

> 范围声明：本文件仅记录待冻结的决策与其论证、状态、证据、风险与暂停条件。创建 workbench 目录**不授权**创建 `suites/anchor` / `apps/anchor-*` / `packages/anchor-*` / 顶层 `anchor-apple/` / Xcode project / Swift Package / Rust crate，**不授权**改动 `package.json` / `bun.lock` / 任何 `tsconfig` / workspace 配置，也**不授权**写 Rust / Swift 代码或落地 entitlement / bundle id / iCloud container（AGENTS：建工作台目录不授权 package/workspace/app/lockfile 变更）。

## AGREED SPINE（全 packet 共用的产品不变量）

- 平台序：macOS + iOS 首期 → iPadOS 第二 → 其他平台最后（plan §3、§11）。
- core = 平台无关 Rust crate `anchor-core`，拥有 truth / model / dispatch / merge / op-log / DTO+schema-envelope owner（plan §8.1、§8.4）。`anchor-editor-core` 是 `anchor-core` **内部无 UI 模块**（非独立 crate/package），只拥有 portable selection / intent shaping / 选择提升降级 / paste-fragment shaping / 跨 block 拆分**建议** / platform patch 生成 / undo-intent 映射；tree invariant / schema-aware normalization / op creation / merge / 最终非法结构拒绝归 `anchor-core::dispatch`（plan §8.1）。
- Apple 客户端进程内 binding 直调 core（无网络）；`anchor serve` + `/rpc` 仅可选 localhost 开发/测试 transport，非产品同步通道（plan §8.1）。
- 真理层 = append-only op-log；同步单元 = 不可变 per-device op-segment 文件（`.anchor/operations/<device_id>/<seq>.seg`，每设备命名空间、一封一密、永不修改）；`.md`/`.json` mirror 与 SQLite projection 均**不进同步**（plan §8.4）。
- 同步走 core trait `OpSyncPort`（仅 `SegmentId`/`BlobId` + 字节，无任何云类型）；首期 transport = iCloud Drive 文件适配器（core 永不出现 CloudKit / iCloud / `NSFileCoordinator` / `NSMetadataQuery` / ubiquity 类型）；CloudKit/CKSyncEngine 二期可选；跨平台/Web = 中立 object-store（S3/WebDAV），非 iCloud。
- 冲突模型保持「**恰好三个 dispatch register**」location/content/life 产品不变量；content **内部**分解 sub-field cell `{body, type_id, props[k], tags[t]}`（conflict §3.1–3.2）。
- journal 内容寻址身份：`note_id = blake3("journal:" ‖ vault_id ‖ calendar_date)`，同 vault 同日恒为同一 Note；普通 Note 仍随机 nanoid。
- CLI = 本地结构化命令契约（`apiVersion` 信封、固定退出码 0/1/2/3/4/5/6、`--format tsv|json`），**不是 MCP**。
- DTO 所有权：Rust core 拥有 DTO 词汇与版本；Swift 与 CLI 只消费（generated/projection 层），不得独立定义 Note / Block / op / validation-error 语义（09-apple-verification.md §3.4）。

## 标注语义

每项决策 Status 取下列值之一，触多条门控时取**最强门控**（触 workspace/package/Apple project 边界、新公开 CLI schema、加密所有权、付费 Apple Developer Program、entitlement/容器、plan §13 暂停条件 → **Needs user approval**；机制已验证但 Anchor 专属构建/运行未证 → **Needs Stage 1 spike**）：

- **Recommended**：目标状态/命令骨架；其 Apple 依赖已由 Codex 本机实跑或官方文档直接支持（Observed）。
- **Needs Stage 1 spike**：机制可行性已 Observed，但 Anchor 专属 DTO/构建/运行未证，留待 Stage 1。
- **Needs user approval**：触边界 / 新公开 CLI schema / 加密所有权 / 付费 Apple Developer Program / entitlement / 容器 / plan §13 暂停条件。
- **Blocked**：当前环境无法验证，被硬门控（如 Personal Team 下 iCloud entitlement runtime）。
- **Deferred to Phase 2（二期）**：用户已决定推迟到二期的项（如 D31 公开 `ConflictRecord` / `resolve` CLI schema），不在 CP-0 批准范围；其 Phase 0 前置（如 D24 op-envelope 预留）仍须守住。

证据标注：**Observed**（Codex 本机实跑/命令输出/官方文档直接支持）、**Recommended**（建议目标态/命令骨架）、**Not run**（未执行项，不得当已验证事实）。Codex Phase 0 本机证据集中在 09-apple-verification.md；Stage 1 Apple 证据集中在 2026-06-07 Stage 1 workbench reports。本表只吸收会改变契约/决策/风险/验证/批准的结论，细节指向对应报告。

引用：plan = `01-apple-native-note-workbench.md`；conflict = `02-conflict-resolution-model.md`；Phase 0 Codex 验证 = `09-apple-verification.md`；Stage 1 Apple 验证 = `17-apple-binding-evidence.md` / `18-textkit-adapter-evidence.md` / `19-icloud-drive-evidence.md`。同目录姐妹文件：05-key-decisions.md（本文件）、04-contract-baseline.md、07-project-layout-options.md、06-fixture-set.md、12-stage-1-spike-plan.md。

---

## A. 平台、绑定与工程边界

### D01 — Apple binding 机制

- **Decision**：Rust core 保持平台无关；Apple binding 产品边界已由用户于 2026-06-07 批准为 **UniFFI 生成 Swift API（DTO / 结构化 error / 普通 dispatch）+ XCFramework 打包 Rust static libraries + 本地 SwiftPM wrapper / binary target 消费 + C ABI bytes fast path**。**Bulk segment/blob bytes 使用 C ABI fast path**，不是 fallback-only，也不是 pure-UniFFI bulk bytes。批准覆盖 binding 机制与产品分发边界形状；Swift wrapper actor async surface、UniFFI generated async mechanism floor（含 iPhoneOS standalone `arm64` compile/link 与 physical iPhone verifier runtime）、repo-external SwiftPM path consumer、raw C ABI binary-target import、complete wrapper binary package、SwiftPM checksum mechanism、hosted/fresh-runner package reproduction、artifact provenance policy floor、development-signed verifier app-bundle/device runtime、最终生产 DTO/error vocabulary 已有 Stage 1 机制证据；remaining release implementation gates 为 product app binding integration、actual Developer ID notarization/App Store distribution 与 real release upload/distribution channel。**World A 取向下的多语言约束：把 UniFFI 视为多语言绑定生成器——Swift 首期，Kotlin 供 android 后用同一 DTO；web 走独立 wasm-bindgen / JS 路径。DTO / error / async 形状保持绑定生成器无关（干净 versioned records / enums，不为任一生成器 collapse 成 string），使同一 core 可被 Swift / Kotlin / JS 三侧消费而无需分叉 DTO。**
- **Status**：Approved（B4 user approval 2026-06-07；release implementation gates remain）
- **Rationale**：UniFFI 自动生成 Swift 侧类型 / error / async 桥，降低手写 FFI 成本，最契合 Anchor 演进型 DTO；C ABI 对 bulk bytes 控制最强、适合大 blob fast path。plan §8.4 把 binding 机制列为阶段0产物，plan §10/§13「Binding 成本低估」要求阶段1先做 binding spike。
- **Evidence**：plan §8.1、§8.4、§11。Phase 0 Codex 09-apple-verification.md §4/§5：**Observed** — host path C ABI + Rust staticlib + SwiftPM executable link/run 成功（输出 `ffi:add=42`）；UniFFI 0.31.1 经 project-local `cargo run --bin uniffi-bindgen-swift` 生成 record/bytes Swift binding 并跑通；minimal 64MB `bytes -> Data` debug 单次约 2.35s / max RSS 约 267MB。Stage 1 17-apple-binding-evidence.md：**Observed** — `aarch64-apple-ios` / `aarch64-apple-ios-sim` targets 已安装；`anchor-core` 构建通过 macOS / iOS / iOS-sim；C ABI wrapper 三 slice + XCFramework 创建成功；UniFFI wrapper 三 slice + generated Swift/header/modulemap + XCFramework 创建成功；generated Swift smoke 完成 fixture summary、`EditorIntentDto`、`TransactionResultSummary`、validation error、post-dispatch snapshot revision、`SegmentId`、segment bytes、blob bytes full round-trip；synchronous release-surface rerun 完成 C ABI/UniFFI 三 slice XCFramework packaging，generated Swift 通过 `-swift-version 6 -strict-concurrency=complete -warnings-as-errors`；C ABI 1/4/16/64MB benchmark 通过（64MB 约 38.22ms，max RSS 约 96MB）；UniFFI 64MB 约 145.22ms，max RSS 约 267MB。Stage 1 17-apple-binding-evidence.md：**Observed** — Swift wrapper DTO/error types are `Sendable`; `AnchorCoreClient` actor async surface returns fixture/dispatch/segment truth; macOS Release strict-concurrency + warnings-as-errors build and runtime pass; iOS Simulator Release strict-concurrency compile passes. Stage 1 17-apple-binding-evidence.md：**Observed** — repo-external SwiftPM path consumer imports `AnchorCoreBindings` and runs `AnchorCoreClient` under Release strict-concurrency + warnings-as-errors, returning fixture revision, `changed=blk_a`, and segment bytes. Stage 1 17-apple-binding-evidence.md：**Observed** — C ABI staticlib slices packaged into `/tmp/anchor-apple-stage1/AnchorCoreFFIBinary.xcframework`; repo-external SwiftPM `.binaryTarget` consumer imports `AnchorCoreFFI` and calls `anchor_core_fixture_summary_json()` under Release strict-concurrency + warnings-as-errors. Stage 1 17-apple-binding-evidence.md：**Observed** — `dto_surface` vocabulary regression passes; core-owned `ValidationError` vocabulary is exactly `invalid_utf16_offset` / `direct_active_to_deleted` / `structural_dispatch_deferred`; adapter-local `adapter_null_session` / `adapter_parse_error` are excluded from core vocabulary; Swift wrapper smoke decodes `direct_active_to_deleted`. Stage 1 17-apple-binding-evidence.md：**Observed** — repo-external SwiftPM package depends on `AnchorCoreC` binary XCFramework, compiles copied `AnchorCoreBindings.swift` under Release strict-concurrency + warnings-as-errors, and runs fixture/insert/structured error/segment reads. Stage 1 17-apple-binding-evidence.md：**Observed** — UDL `[Async]` generated Swift `asyncFixtureSummary()` plus RustFuture helpers; macOS Swift 6 strict-concurrency async smoke runs; iOS Simulator compile/link produces `platform IOSSIMULATOR` minOS 26.0 / SDK 26.5; first iPhoneOS standalone attempt failed because it targeted `arm64e` while the Rust iOS slice was `arm64`. Stage 1 17-apple-binding-evidence.md：**Observed** — same generated async surface links under `-target arm64-apple-ios26.0`; output is Mach-O arm64 with `LC_BUILD_VERSION platform IOS`, minOS 26.0, SDK 26.5; Rust staticlib, Rust dylib, and Swift smoke executable all report `arm64`. Stage 1 17-apple-binding-evidence.md：**Observed** — wrapper-compatible `AnchorCoreCBinary.xcframework` zipped to 17MB and `swift package compute-checksum` equals SHA-256 `6dab5c671ae33737a19462fc5452dff390bc0a6afa7c80b91b505bb6e063c890`. Stage 1 17-apple-binding-evidence.md：**Observed** — GitHub hosted `macos-15-arm64` run `<CI_RUN>` passed `apple-binding-package` job; hosted script built C ABI release slices, created wrapper-compatible `AnchorCoreCBinary.xcframework`, ran `WrapperConsumer` under Release strict concurrency, computed checksum `ae44684eed3e29e68e471125f4999405c0f4e30db61b6ecb77e1ba38e6b3abfd`, ran UniFFI async macOS smoke, and compiled UniFFI async iOS Simulator / iPhoneOS `arm64` smokes.
- **Risk**：Swift wrapper actor async surface、path-based external consumer、raw C ABI binary target import、complete wrapper binary package、final DTO/error vocabulary、UniFFI generated async mechanism floor（macOS runtime / iOS Simulator compile-link / iPhoneOS standalone arm64 compile-link / physical iPhone verifier runtime）、SwiftPM checksum mechanism、hosted/fresh-runner package reproduction、artifact provenance policy floor、development-signed verifier app-bundle/device runtime 已证可行；product app binding integration、actual Developer ID notarization/App Store distribution 与 real release upload/distribution channel 仍是 release implementation gates。高度递归/泛型 DTO 在 FFI 边界表达力存疑；bulk blob hot path 用 UniFFI `Data` 会付出更高复制与内存成本。
- **Stop condition**：若最终 Anchor DTO shape 不被 UniFFI 干净支持、final generated Swift surface 无法过 Swift 6 strict concurrency、structured error 语义无法保持、bulk bytes fast path 无法保留、或 async boundary 要求 Anchor 不可接受的 Rust runtime 假设 → 暂停并重评（含 C ABI primary）。

### D02 — 项目布局（workspace / package 边界）

- **Decision**：**用户已于 2026-06-07 批准以 `suites/anchor/` 为 Anchor 内聚归属（采纳 Option A）。** 内层 illustrative：`core`（Rust crate `anchor-core`，含 `anchor-editor-core` 模块）/ `cli`（Rust bin）/ `apple`（Xcode workspace，macOS+iOS targets）/ `fixtures/` / 嵌套 `Cargo.toml`。**Option C 降为实现期退路**：仅当实现期实测 Bun glob 容忍度或 Xcode 嵌套成本过高时，把 Apple 工程移到 glob 外顶层 `anchor-apple/`、core 仍留 `suites/anchor/core` 以保住 plan §12 的 cargo 验证路径。详见 07-project-layout-options.md。
- **Status**：Recommended（归属已由用户批准 = Option A `suites/anchor/`；实际目录 / 工程创建仍随实现授权执行）
- **Rationale**：Anchor 是 theme-scoped product suite（非 generic package、非 unrelated standalone app），`suites/anchor` 归属最 coherent，并匹配 plan §12 的 `cd suites/anchor; cargo test -p anchor-core` 验证命令；用户已据此拍板 Option A。
- **Evidence**：**用户批准（2026-06-07）：项目就放在 `suites/anchor` 下。** plan §12（验证命令本身写在 `suites/anchor`）、§9/§13（workspace/package/Apple project 边界变更须授权）。Codex §2.1/§3.1：**Observed** — `package.json` workspaces = `["apps/*","packages/*","suites/*/*"]`，root `tsconfig.json` include 仅 `src/**/*.ts(x)`（不扫 Rust/Swift），现有 5 个 workspace package 均有 `package.json`，无任何 Anchor 目录或 Apple/Rust 工程。**Unknown / Not run** — Bun 对 `suites/*/*` 下无 `package.json` 目录的行为未 scratch 实测，留 Stage 1 实现期实测。**Observed** — 本机无 `xcodegen` / `tuist` / Ruby `xcodeproj`。
- **Risk**：Rust cargo workspace + Xcode workspace 不契合 bun/TS 的 `suites/*/*` glob；Bun 对该 glob 下非-package 目录的容忍度未实测。**绝不**为适配 glob 添加 placeholder `package.json`（会变成 Bun workspace member 并触发 AGENTS package 义务）。
- **Stop condition**：归属已批准（Option A）；Xcode 工程 / bundle id / signing / entitlements 的创建已由用户经 CP-0 B2 批准（2026-06-07，见 10-cp-0-approval.md §8 B2）。`suites/anchor` 目录与 Rust crate 的实际创建仍随实现授权执行（plan §13 暂停条件：Package/workspace/Apple project 边界变更落地），本 packet 不自行创建任何目录 / 工程。若实现期实测 Bun glob 行为破坏 lockfile / 解析，落 Option C。

### D03 — 客户端 ↔ core 传输边界

- **Decision**：Apple 客户端**进程内 binding 直调 core**，不经网络；`anchor serve` + `/rpc` op 信封仅作**可选 localhost 开发/测试 transport**，与 CLI、Apple binding 共享同一 op registry / DTO 词汇 / 同一 dispatch 入口——是开发工具，**不是产品同步通道**。
- **Status**：Recommended
- **Rationale**：所有传输面只是 dispatch 的外壳；唯一已校验 dispatch 是不变量。
- **Evidence**：plan §8.1（原文如此）、§8.5（唯一已校验 dispatch 不变量）。Codex §1/§4.1：**Observed** — host SwiftPM 经 C ABI 实调 Rust staticlib，证明进程内 binding 直调可行；core boundary 可保持。纯内部架构边界，不依赖 Apple runtime。
- **Risk**：若把 `anchor serve` 误当产品同步/客户端通道，会引入第二真理层与额外契约面。
- **Stop condition**：若设计中出现把 `/rpc` 当产品同步通道，或引入第二写入真理路径 → 越界，须回到 dispatch-唯一不变量。

---

## B. Vault 落盘与同步单元

### D04 — Vault 落盘布局

- **Decision**：真理层 op-log 在 `.anchor/operations/`（被同步）；projection 在 `.anchor/cache/index.sqlite`（可重建本地缓存，**不**同步）；配置 `.anchor/config/vault.toml` 声明 `source_of_truth = "op-log"`、`sync`（adapter 选择，`none` = 纯本地）与 projection 路径。
- **Status**：Recommended
- **Rationale**：op-log 是真理，SQLite FTS / replay 索引是派生不是真理；布局常量须稳定。
- **Evidence**：plan §8.4（布局原文）、§8.6（SQLite 派生）。纯本地文件布局，不依赖 Apple runtime（Codex 未触此项）。
- **Risk**：路径常量一旦发布即成隐性 file-format 契约；projection 可重建语义须在诊断/重建命令中守住。
- **Stop condition**：若实现把 projection 当真理或纳入同步，则破坏单一真理层不变量，须停止。

### D05 — Mirror 目录组织 + 是否纳入版本库

- **Decision**（用户 2026-06-07 锁定，B12）：`.md` / `.json` mirror = **有损 post-commit 派生导出，不进同步**；mirror 目录组织 = **人类可读路径**、**不纳入版本库**（B12 批准的默认）。NoteId 寻址仅作实现期去歧义不可行时的备选。
- **Status**：Recommended（用户已批准 B12，2026-06-07）
- **Rationale**：同步 mirror 会制造第二真理；人类可读 + 不纳入版本库贴合 grep / 导出用户预期，且不把派生物 diff 噪声塞进版本库。
- **Evidence**：**用户批准（2026-06-07，B12）：人类可读路径 + 不纳入版本库。** plan §8.4（原文「阶段0仍需确定镜像目录组织与是否纳入版本库」）。纯本地派生物决策。
- **Risk**：人类可读路径在 rename / move / 同名 Note 下需稳定去歧义策略（实现期解决）。
- **Stop condition**：目录组织已定（人类可读 + 不纳入版本库）；若实现期去歧义策略不可行，回退 NoteId 寻址。

### D06 — Op-segment 作为同步单元 + segment 大小

- **Decision**：同步/提交单元 = op-log 的**不可变 op-segment 文件**（`.anchor/operations/<device_id>/<seq>.seg`，每设备独占命名空间、一封一密、**永不修改**），而非单个增长日志，也不是 mirror；segment 大小阈值为阶段0待定数值，与提交节奏（D13）共定，留待 Stage 1 iCloud 行为实测后收口。segment 大小、batching policy 与长期 segment-file budget 按两条分离的 scale 轴实测：logical-op-count（50K smoke / 500K / 1M / 5M / 10M+）与 synced-segment-file-count（1K / 10K / 50K / 100K，同步层实际枚举的 filesystem objects）；排除「每 op 一 segment」反模式（12-stage-1-spike-plan.md §4）。
- **Status**：Recommended / delivery gate（B14 default transport approved 2026-06-07；signed macOS 10K/50K/100K direct enumeration observed；default 1M-op steady-state 124-file budget observed；physical iPhone local container/file-coordination and 1024-file write subset observed；macOS/iOS package-internal placeholder/download and metadata delivery remain constrained）
- **Rationale**：iCloud Drive 无 delta 同步、任何改动整文件重传，不可变 segment 只上传一次、永不重传。
- **Evidence**：plan §8.4（不可变 segment 理由）、§11（同步单元 / segment 大小 / 提交节奏）。Codex §7.1：**Observed** — `ICloudAdapterProbe` 的 `NSMetadataQuery` / `NSFileCoordinator` adapter API 编译面 macOS + iOS sim 通过，core-only `SegmentId`/bytes 协议形态可保持；**Observed** — segment 写一次、新内容新 segment 形态可由 content hash + mtime 验证（设计层）。Stage 1 19-icloud-drive-evidence.md：**Observed** — signed app 在真实 account 写 1024 个 segment 文件（iOS ≈3720ms / macOS ≈3247ms），file-coordinated direct package-internal enumeration 见 1024 段，placeholder 下载行为 platform-sensitive（iOS `start_download=ok`、macOS `NSCocoaErrorDomain:4`）；signed macOS app 写 10K / 50K / 100K package-internal segment files，direct enumeration 分别见 10K / 50K / 100K，direct enumeration latency ≈27.70ms / 142.63ms / 299.51ms，package-internal metadata enumeration 仍为 0。Stage 1 19-icloud-drive-evidence.md：**Observed** — macOS loose iCloud file is ubiquitous/current, evict returns `NSCocoaErrorDomain:512`; package-internal segment is not ubiquitous and evict/start-download both return `NSCocoaErrorDomain:4`, while coordinated read still succeeds. Stage 1 19-icloud-drive-evidence.md：**Observed** — default 1M logical-op steady-state budget maps to 124 iCloud package-internal files under the verifier floor. Stage 1 19-icloud-drive-evidence.md：**Observed** — physical iPhone explicit/implicit ubiquity containers non-nil, vault package ubiquitous, coordinated segment read/write equal, 1024-file subset write observed; package-internal metadata gather remained false/count 0 and `start_download_error=NSCocoaErrorDomain:4`. **Not run** — true remote `.icloud` placeholder 下载、iOS remote metadata delivery、million-op product iCloud context（见 D14/D35、12-stage-1-spike-plan.md §4）。
- **Risk**：segment 过小 → 文件数爆炸、iCloud 元数据/枚举压力；过大 → 提交延迟与重传粒度变粗；阈值依赖 iCloud Drive direct enumeration / placeholder / account-state / delivery behavior。B14 默认 transport 已批准，但阈值与 batching 仍是交付 gate。
- **Stop condition**：immutable segment 单元不可动摇。若 Stage 1 实测 iCloud 对小文件枚举/placeholder 成本不可接受，须重设 segment 大小区间与提交节奏，但不得回退为可变增长日志。若正常编辑下 N 个 logical op 产生约 N 个 synced segment 文件，则 batching 失效、方案不可接受，须重设 batching/compaction。

---

## C. Note / Calendar / journal 身份与生命周期

### D07 — 顶层 Note 内部表示

- **Decision**：顶层 Note = **`parent_note_id = null` 的普通 Note**（非隐藏 root sentinel）；侧边栏 `Notes` 是其导航投影，非系统容器。conflict §5.2 规则 3 的 root sentinel 仅作 `location` register 内 dangling-parent 重挂的**物化期兜底落点**，不是持久父值。
- **Status**：Recommended（用户已批准 B11，2026-06-07）
- **Rationale**：避免持久 sentinel 与 `parent_note_id = null` 语义重叠产生双重真相。
- **Evidence**：plan §4.1、§8.2（明列为阶段0必须冻结项）；conflict §3.2、§5.2。纯 core 表示决策（Codex 未触此项）。
- **Risk**：若持久层引入 sentinel，会与 `null` 语义重叠并产生双重真相。
- **Stop condition**：plan §8.2 明列为阶段0冻结项，须用户签署；若实现把 sentinel 写入持久父值即越界。

### D08 — journal 内容寻址身份 + calendar_date 唯一性 + 默认 parent + trash/restore 边界

- **Decision**：journal `note_id = blake3("journal:" ‖ vault_id ‖ calendar_date)`（**内容寻址，已采纳承诺模型**）；普通 Note 仍铸随机 nanoid。同 vault 同日恒为同一 Note（去重是**身份不变量**，by construction，无运行时去重检查）。两设备并发离线创建当天 journal → 对**同一 target 的幂等 create**，body 经 §6.1 不相交 auto-merge。`calendar_date` 是隐藏属性，不拥有归属语义；journal `parent_note_id` 按普通 Note 规则（默认 null / 顶层）。**trash 后重开「今日」**解析回同一 `note_id` → dispatch **restore**（`life → active`），**不**铸造重复。rename / move **均不触身份**；刻意改日期 = create-new-id + move-content，surface。
- **Status**：Recommended（用户已批准 B10 + B11，2026-06-07：接受「同 vault 一日一 journal」取舍）
- **Rationale**：内容寻址使去重成为身份不变量；随机-id 结构化-merge 回退已否决（违反纯-fold replay、对称竞争 op 可致两 journal 皆 trashed）。
- **Evidence**：plan §4.3、§8.2；conflict §6.9、§13.1 #9。纯 core 身份模型（Codex 未触此项）。
- **Stage 1 evidence（2026-06-07，concretization，未反转模型）**：抽象 `‖` 具体化为冒号分隔 seed，并加 `jnl_` 前缀以与随机 nanoid 区分——`note_id = "jnl_" + hex(blake3("journal:" + vault_id + ":" + calendar_date))`（vault_id 为无冒号 nanoid、date 为 ISO `YYYY-MM-DD`，无歧义）。身份不变量（同 vault 同日恒同 id）不变。Ground truth：`journal_note_id("vault_demo_0001","2026-06-07") = jnl_f99080f823e0815a8e1440955eb896d1c82d4ec371e19b2e0df89ad581f96b89`。已落成 `suites/anchor/core` 测试 `identity` / `determinism_vectors`（Observed）。Codex 须沿用此字节格式（见 `16-codex-apple-input.md` §2）。
- **Risk**：「同 vault 一日一 journal」是主动接受的约束（用户想同日再开一篇须建普通 Note），是 plan §4.3 的真实模型变更。
- **Stop condition**：conflict §13.1 #9 留「一日一 journal」取舍的最终用户确认；且涉 plan §4.3 模型变更，须用户签署。

### D09 — Calendar projection 排序

- **Decision**：Calendar = journal 的**日期聚合 projection**；年/月/周/日期分组**由 projection 计算**，**不进 `parent_note_id`**；排序按 `calendar_date`（建议降序「今日在前」，具体方向为待定 UI 取舍）。
- **Status**：Recommended（用户已批准 B11，2026-06-07）
- **Rationale**：避免被误实现为持久父层级。
- **Evidence**：plan §4.3、§5、§8.2（明列冻结项）。纯 projection 决策（Codex 未触此项）。
- **Risk**：排序方向与「年/月/周仅 UI 分组」边界需明确，否则易被误实现为持久父层级。
- **Stop condition**：plan §8.2 明列为阶段0冻结项，须用户签署。

### D10 — `life` 枚举 vs 单 tombstone（4-state 优先级 lattice + 终态可达规则）

- **Decision**：`life` = 四态枚举 `active / archived / trashed / deleted`，保留 archive 与 trash 区分及可逆 restore。合并按**时钟无关优先级 lattice join**（取最高）：`active`(bottom) < {`trashed`, `archived`}(可逆 peers) < `deleted`(终态 top)。**`life` 不级联**；「子树消失」是**派生 root-reachability 可见性规则**，非命令式级联 op。`deleted` 终态**仅经「从 `trashed` 发起、其 op 因果支配任何并发编辑」的显式 `delete`** 到达；dispatch **拒绝直接 `active → deleted`**。`trashed` vs `archived` tie 默认 `archived`-wins（见 D27）。
- **Status**：Recommended
- **Rationale**：逆转 delete-wins-销毁-编辑反模式：edit-vs-delete 物化为可逆 trashed + 编辑保留。
- **Evidence**：plan §8.4；conflict §5.4、§3.2、§13.1 #10。纯 core 合并语义（Codex 未触此项）。
- **Risk**：终态可达需可实现的跨 register 支配机制（`dominates_frontier`，见 D20）；非级联可见性须在物化流水线相位固定。
- **Stop condition**：其依赖的 op 信封字段预留见 D20/D24，须随 op-shape 冻结一并签署；若实现引入命令式级联即越界。

---

## D. 合并、stale guard 与同步 ingestion

### D11 — target/register（sub_rev）stale guard

- **Decision**：保持**恰好三个 dispatch register** 产品不变量；`content` 内部分解具名 sub-field cell `{body, type_id, props[k], tags[t]}`，每 cell 携 `sub_rev = blake3(canonical_serialize(cell_value))`（排除 lww）。本地写入携**所触 cell** 的 `base_sub_rev`，仅当**该 cell** 在底下变化才返回 `Conflict`（CLI 退出码 3）；不同 cell 并发写保持独立可合并。register 级 rev 成为 sub_rev 的派生 hash，供 `snapshot_revision` / UI staleness，**不是**写入 guard。`location` / `life` 无 sub-field，保单一 register rev。
- **Status**：Recommended
- **Rationale**：对现有 per-`(target, register)` guard 的严格泛化，非新增 register 轴。
- **Evidence**：conflict §3.1、§3.4、§5.3、§11；plan §8.3、§8.5。纯 core（Codex 未触此项）。
- **Risk**：sub-field 分解是粒度变更；须守住「恰好 3 register」契约不被实现误扩成 5。
- **Stop condition**：若实现把 sub-field 提升为第 4/5 个 dispatch register，破坏「恰好 3 register」不变量即越界。

### D12 — 同步 ingestion（per-actor HWM + op_id dedup + 确定性铸造合并 op 收敛）

- **Decision**：同步 ingestion 把所有 op 按全序 **`T = (hlc.wall, hlc.logical, hlc.device, actor, op_id)`** fold；每 actor 维护单调 high-water-mark（`max_seen_hlc[actor]` + `seq`），按 `op_id` dedup 使重投递为 no-op；合并是对 op **集合**的 fold，**到达顺序永不影响结果**。**确定性铸造的合并 op** `op_id = blake3("merge" ‖ lower.op_id ‖ higher.op_id ‖ diff_algo_version)`、`hlc` 由输入派生、**仅由单一确定性 emitter 铸造**（最高-`T` 输入侧 actor），由 dedup 在 `op_id` 上收敛为一条——**绝不允许每台 ingest 设备各铸一条不同 op_id 的合并 op**。
- **Status**：Recommended
- **Rationale**：fold-集合 + 确定性铸造保证到达顺序无关收敛；杜绝草案被击穿的多铸根因。
- **Evidence**：conflict §4、§5.1、§7.3、§11；plan §8.4、§8.5。纯 core 合并语义；bit-reproducibility 的 macOS/iOS 一致性归 D19（Codex 未触此项）。
- **Risk**：确定性铸造要求 diff3 跨平台 bit-reproducible（见 D19）；HWM 与无 frontier 新设备处理需与 watermark 策略（D14）一致。
- **Stop condition**：若实现允许多设备各铸不同 op_id 的合并 op，收敛保证失效，须停止。

### D13 — 提交节奏 / op-log 粒度

- **Decision**：**每个语义 `EditorIntent` 一条 op**（句/段边界，防抖），**绝不 mid-keystroke**（Logseq+Syncthing 冲突爆炸反模式）。这决定 op-log 粒度、replay / mirror 开销，以及 §6.1 body 合并触发频率，**必须在冻结 op 形状前定下**。op 粒度经 batching policy 与同步单元（D06）解耦：segment 不是 per-op 文件。op:segment 比、最坏 burst、compaction 后稳态 segment count 须实测；候选策略含 size / time / idle / 前后台 flush、本地 unsynced WAL staging、单个 active unsealed segment（12-stage-1-spike-plan.md §4）。
- **Status**：Recommended
- **Rationale**：粗提交加宽 diff、制造重叠冲突；mid-keystroke 提交触发冲突爆炸。
- **Evidence**：plan §8.5；conflict §13.1 #3。防抖窗口与 segment 大小耦合（Codex 未触此项）。
- **Risk**：防抖窗口与 segment 大小（D06）耦合；过细则 op-log 膨胀、过粗则 body 重叠增多。
- **Stop condition**：若实现退化为 mid-keystroke 提交，即触发反模式，须停止。

### D14 — op-log compaction + GC 保留窗口 + manifest/cursor 协调 + causal-stability watermark + open-conflict pin

- **Decision**：定期物化快照 + 截断/分段，使 replay 从最近快照起算。GC 经 **manifest / cursor 协调**并**保留一个窗口**：不 GC 到所有已知 peer 都拥有的 snapshot 之下，否则 fallback 整快照重拉。引入单一共享 primitive **causal-stability watermark** = 所有已知设备各自已确认 HLC frontier 的 `min`（per-device frontier 的 `min`，**非**日历 epoch），门控 op-log 截断、archive、hard-delete eligibility，以及**硬规则：绝不截断任何属于 open `ConflictRecord` 成员的 op**（含 §6.3 登记的后代 content op）。retention 模型包含四个 horizon（conflict / replay-safety / audit / time-travel，见 D38 边界表）：(a) 7-day conflict horizon 仅是 UI 冲突呈现策略，**绝不作 op-retention / hard-delete / compaction 安全依据**；(b) < watermark、非 open-conflict、已被 snapshot 覆盖的 ops 只可 truncate-to-snapshot / archive（压缩 immutable segment，保持 reachable）；(c) loser-payload / trashed 节点 / OR-Set observed-add id 的 hard-delete 资格由 time-travel/audit horizon + explicit excise 门控；(d) stale-peer 退出规则使长期离线 peer 可移出 known-device 集合，并要求回归设备整快照重拉；(e) manifest 默认取 **per-device immutable cursor**，shared mutable manifest 只作为受控协调文件存在；任何 mutable manifest 出现 unresolved `NSFileVersion` conflict 或 materialized duplicate `manifest *.json` 时，adapter 状态为 `blocked_manifest_conflict`，必须 surface current / conflict-version / duplicate branches、preserve all branches、停止 manifest-derived frontier / GC / cursor 推进，且 `auto_resolve=false`。
- **Status**：Needs Stage 1 scale/policy gate（runtime conflict materialization passed；surfacing/preservation/blocking floor observed；explicit current-winner resolution mechanism observed；watermark/stale-peer/segment budget/product resolver integration 留 Stage 1）
- **Rationale**：watermark 提供单一因果稳定门控所有硬删；GC 保留窗口避免新设备无法重建；不可变 segment 与共享可变 manifest 须严格区分。
- **Evidence**：plan §8.4；conflict §10、§13.1 #6、§11。Phase 0 Codex §7.1/§7.4：**Observed** — `NSFileCoordinator` adapter API 编译面可用、无 entitlement CLI 下 `coordinated_bytes=7 coordinator_error=none`；付费 ADP team 已开通，entitlement / 真机 ubiquity lookup 前置满足。Stage 1 19-icloud-drive-evidence.md：**Observed** — shared-container macOS + iOS online concurrent manifest writes converged with `conflict_versions=0`; offline iOS / online macOS fork materialized 1 unresolved `NSFileVersion` conflict after reconnect; current file became `ios-offline`, retained conflict version contained `mac-online` JSON; no conflict resolution or deletion was performed. Stage 1 19-icloud-drive-evidence.md：**Observed** — repo-local signed macOS verifier read the historical offline-conflict run, found current `manifest.json` writer `ios-offline`, unresolved conflict version writer `mac-online`, materialized duplicate `manifest 2.json` writer `ios-base`, and returned `adapter_status=blocked_manifest_conflict`, `policy_surface_conflicts=true`, `policy_preserve_versions=true`, `policy_auto_resolve=false`, `resolution_executed=false`. Stage 1 19-icloud-drive-evidence.md：**Observed** — explicit `resolution_choice=current` archived current `ios-offline`, conflict version `mac-online`, and duplicate `ios-base`; moved duplicate materialization out of the live directory; `removeOtherVersionsOfItem(at:)` returned nil; same-run `after_conflict_versions=1` showed metadata lag; subsequent policy probe returned `conflict_versions=0`, `duplicate_manifest_files=0`, `adapter_status=ok_no_conflict`.
- **Risk**：shared mutable manifest winner 选择不具备产品语义保证；unresolved conflict versions 占用 document versions / quota；explicit resolution 必须保留审计证据并二次 re-check，因为 same-process `NSFileVersion` state may lag destructive calls；watermark 依赖 known-device 集合与 stale-peer 退出规则；package-internal segment discovery 不能依赖 `NSMetadataQuery`（D35）。
- **Stop condition**：watermark / GC 保留窗口机制不可动摇。任何方案不得从 blocked mutable manifest 推进 frontier / GC / cursor，不得自动删除 unresolved `NSFileVersion` conflict versions 或 duplicate manifests，不得回退为允许截断 open-conflict op。用户驱动的 destructive resolution execution 必须在归档 current/conflict/duplicate branches、执行显式 winner 选择、并经 post-resolution policy re-check 返回 clean 后，才允许恢复 manifest-derived frontier / GC / cursor；public `ConflictRecord` / `resolve` / `restore` CLI/DTO 面仍按 D31 留到 Phase 2。

---

## E. Mirror、搜索、blob 与 offset

### D15 — Mirror post-commit job + freshness

- **Decision**：Mirror 生成是 dispatch append + materialization 成功**之后**的 post-commit job；写入失败记录 freshness / diagnostics，op-log 保持已提交，后续真理层编辑继续用当前 materialized state。打开的 body 冲突在 `.md` 渲染为可见 git 式 fence、`.json` 携 `ConflictRecord`。
- **Status**：Recommended
- **Rationale**：mirror 永远是派生物，绝不作 merge 输入；freshness 须可见可测。
- **Evidence**：plan §8.6、§13「Mirror 可信度缺口」；conflict §10。纯本地派生流水线（Codex 未触此项）。
- **Risk**：mirror 若被误作 merge 输入即破坏单一真理层；freshness 须可见可测。
- **Stop condition**：若实现把 mirror 反向喂回 merge，即越界。

### D16 — 搜索 / backlinks 后端

- **Decision**：搜索与 backlinks 使用**结构化 projection**——**SQLite FTS** 或 **replay 后内存索引**，建议默认 SQLite FTS（与 D04 的 `.anchor/cache/index.sqlite` projection 一致，可重建）；对 mirror 跑 ripgrep 仅本地检查便利，非真理归属方。
- **Status**：Recommended
- **Rationale**：plan 已把它列为阶段0 core 内部决策，无新公开 schema。
- **Evidence**：plan §8.6、§11。纯本地 projection 选择（Codex 未触此项）。
- **Risk**：SQLite FTS 与内存索引在大 vault 下的重建成本/内存占用不同；选择影响 projection schema。
- **Stop condition**：若该选择被发现需要暴露新公开 CLI schema 才能服务，则升级为 user approval。

### D17 — blob 落盘 + 50MB cap 在 dispatch 强制（对齐 CloudKit CKAsset）

- **Decision**：附件为**内容寻址 blobs**，Note/Block 只存 `BlobRef`；**单附件上限 = 50MB（用户 2026-06-07 定），由 dispatch 在写入前校验并以独立失败态拒绝超限。** 50MB 同时兼容首期 iCloud Drive / 本地文件与二期 CloudKit `CKAsset`（archived CloudKit Web Services 限 `CKAsset` field 最大 50MB）。**二期 CloudKit / CKSyncEngine 路线已获用户批准（B8，2026-06-07，仍为二期实现）**，通过同一 `OpSyncPort` 接入，CloudKit record schema 绝不进 core；op 形状仍须在任何 CloudKit 记录落地前冻结。
- **Status**：Recommended（cap=50MB 已定；二期 CloudKit 路线 B8 已批准）
- **Rationale**：把 cap 统一压到 50MB 一步对齐 CKAsset 上限，首期与二期单一阈值、无分支决策，是最干净路径（用户取舍：超 50MB 附件须走外链 / 用户侧处理）。
- **Evidence**：**用户决定（2026-06-07）：最大附件 50MB + 批准 B8。** Codex §7.3：**Observed**（官方文档）— Apple archived CloudKit Web Services data size limits 写明 `CKAsset` field 最大 50MB、record 最大 1MB 不含 asset。首期 iCloud Drive file package 对单文件 50MB 的真实行为 = **Not run**（付费 ADP team 已开通、见 D35；待 Anchor signed app 实测）。
- **Risk**：50MB 上限对个别大附件偏紧——产品取舍，超限以独立失败态拒绝并引导外链；二期 CloudKit 仍须在 record schema 落地前冻结 op 形状。
- **Stop condition**：cap=50MB 已定且对齐 CloudKit。二期 CloudKit/CKSyncEngine 路线已批准（B8），但任何 CloudKit record schema 进入 user private database 前仍须冻结 op 形状；CloudKit record schema 绝不进 core。

### D18 — UTF-16 vs UTF-8 offset 换算边界

- **Decision**：行内 offset **对外以 UTF-16 code unit 表达**（对齐 Apple TextKit / Swift String bridging）；**core 内部存储单位在阶段0定下**，并在 binding 边界做一次确定性换算；导入既有 byte-offset span 时一并转换。
- **Status**：Partial observed; binding/core conversion freeze remains
- **Rationale**：UTF-16 对外是合理的 Apple 边界；内部单位与对外换算须有跨平台稳定性证明。
- **Evidence**：plan §8.2、§11；conflict §6.1（mark re-clamp 以 UTF-16 计）。Codex §1/§2.4/§6.1：**Observed** — macOS `NSTextView` runtime 可设 UTF-16 selection（`textkit:utf16=16 storage=16`、`textkit:selected=1:8`）。Stage 1 18-textkit-adapter-evidence.md：**Observed** — Swift-side fixture counts for emoji / ZWJ / combining mark / CRLF / mixed text; IME marked-text commit maps to `EditorIntent.insertText(... atUTF16:1 ...)`; macOS `NSTextView.accessibilitySelectedTextRange()` reads back `1:2`; iOS Simulator `AnchorTextKitProbe` compile passed. **Not run** — core 内部存储单位与 Swift/Rust binding 边界的最终换算仍须冻结并验证；`UITextView` runtime IME/accessibility 行为与产品 accessibility mapping 未测。
- **Risk**：内部单位与对外 UTF-16 不一致需在每个 binding/CLI 边界稳定换算；mark offset clamp 以 UTF-16 计，core 内部若用 byte 须严格映射，否则 mark 锚定漂移。
- **Stop condition**：对外 UTF-16 边界已定。若 Stage 1 fixture 揭示换算在 grapheme cluster / IME marked text 边界不稳定，须在冻结内部单位前重设映射方案。

### D18a — 字体来源（内置 JetBrains Mono + 系统字体，用户可在已安装系统字体中切换）

- **Decision**（用户 2026-06-07 定，混合方案）：**仅随包内置 `JetBrains Mono` 作为代码字体（`codeFont`）默认**；**正文 / 标题（`textFont` / `headingFont`）默认用系统字体**；用户可在**本机已安装的系统字体**中自由切换三个字体选择器。「未知字体被丢弃」normalize 语义因此分两类：代码字体回退到内置 `JetBrains Mono`；正文 / 标题对「不在本机已安装系统字体集」的值回退系统默认（**设备相关、主动接受**）。字体属外观 settings store、**不进 op-log 真理层**（见 F37–F40），故设备相关的字体可用性只影响渲染，不破坏 op-log 确定性或 `snapshot_revision`（D30 hash 物化输出，不含外观 settings）。
- **Status**：Recommended（用户已批准 B7，2026-06-07）
- **Rationale**：内置 `JetBrains Mono` 保证代码字体跨设备一致且 license（OFL）可随包分发；正文 / 标题用系统字体免维护跨平台字体集、贴合平台原生外观，用户切换满足个人偏好；因字体不进真理层，放弃正文 / 标题的封闭白名单（接受设备相关）成本可控。
- **Evidence**：**用户决定（2026-06-07）：内置 JetBrains Mono、其余系统字体、用户可在已安装系统字体中切换 + 批准 B7。** plan §7.2（三字体选择器 + 「未知字体被丢弃」normalize）。Codex：原生系统字体枚举 / 切换的真实行为（AppKit `NSFontManager` / CoreText `CTFontManager` 可用集、macOS 与 iOS 差异、TextKit 缺失字体回退）= **Not run**，留 Stage 1 由 Codex 验证「用户切换已安装字体」路径的实现。
- **Risk**：正文 / 标题「未知字体被丢弃」成设备相关语义（不在本机已安装集则回退系统默认）——主动接受；`JetBrains Mono` 须随包 bundle（包体积 + OFL license 合规）。
- **Stop condition**：字体来源已定（B7 批准）。原生系统字体枚举 / 切换的实现行为待 Stage 1 由 Codex 验证；若枚举无法稳定实现，正文 / 标题回退为单一系统默认字体（不影响 op-log）。

### D19 — 跨设备确定性 diff3（bit-reproducible CI gate）

- **Decision**：`body` 走**确定性 3-way merge / keep-both**（永不静默 LWW）；**diff3 推荐只在 Rust core 执行**（不由 Swift/TextKit 各自实现），同一编译产物经 binding 调用 → 跨平台逐字节一致 by construction；**pin diff3 实现 + 版本（`diff_algo_version`）+ 跨设备一致性向量集为一等 CI gate**（`zdiff3` 式 hunk 对齐；真理路径禁用 fuzzy patch-apply）——**强制，非可选**。**World A 取向下，一致性向量集须包含一个非-Apple target（`wasm32`），不止 macOS + iOS**——wasm 运行时浮点/行为不同，纳入可早抓跨平台分叉（既已禁 f64，本应成立）。auto-merge vs keep-both 的**选择是 op 集合的纯函数，与本地 compaction watermark 无关**。N-way 同 base body fan 折叠成单一 keep-both（绝不 pairwise diff3）。
- **Status**：Recommended
- **Rationale**：同一 Rust 编译产物经 binding 跨平台调用，逐字节一致是 by-construction 结果，无需 Swift/TextKit 各自实现；CI 一致性向量集作为强制 gate 守住。
- **Evidence**：conflict §6.1、§5.3、§10、§13.1 #4、§12；plan §8.2。Codex §1/§8.2：**Recommended（Observed-supported）** — diff3 / order-key 推荐只在 Rust core 执行，不由 Swift/TextKit 各自实现，跨平台一致由单一编译产物保证；fixture 的「双端逐字节一致」证据来自 Rust core vectors，不来自 TextKit/Swift 专属实现。Stage 1 `15-core-evidence.md` / `20-cross-target-ci-evidence.md`：**Observed** — deterministic vectors include diff3, order-key, canonical rev, fixture snapshot, conflict snapshot, merged snapshot; native cargo test passed 6/0; wasm execution returns `anchor_wasm_vector_status=0`; iOS Simulator execution returns `anchor_ios_vector_status=0`; Android emulator execution returns `anchor_android_vector_status=0`; historical GitHub Actions workflow wiring ran hosted `pull_request` run `<CI_RUN>` through Linux native+wasm, macOS native+wasm+iOS Simulator, Ubuntu Android emulator, and Apple binding package jobs. Stage 1 `20-cross-target-ci-evidence.md`：**Observed** — `.github/workflows/anchor-cross-target-vectors.yml` is removed at current head; historical vector evidence remains, but current-period hosted Android/wasm regression coverage is intentionally suspended.
- **Risk**：若 diff3 被某平台单独实现则 `snapshot_revision` 跨设备 fork；CI 向量集是真实工程负担。
- **Stop condition**：diff3 机制已由 conflict 模型确定。若 Stage 1 CI 一致性向量集无法对所选实现稳定通过，须更换/自实现并 pin diff3，不得放行平台特定实现。

---

## F. 位置语义、加密与跨平台同步

### D20 — `life` 终态可达跨 register 支配机制（`dominates_frontier`）

- **Decision**：终态 `delete` op 携显式 **`dominates_frontier`**（删除设备已观察到的 actor HLC frontier）；终态 `trashed → deleted` 只能销毁「生成 op 的 hlc ≤ 该 frontier」的后代/自身 content；任何并发（尚未被观察）的 content 编辑**阻断**终态坍缩，强制回退可逆 `trashed` 并 emit 跨级 `ConflictRecord`。dispatch 拒绝直接 `active → deleted`。
- **Status**：Recommended
- **Rationale**：使「因果支配编辑」成为可实现机制，堵死陈旧 delete 不可逆销毁编辑。
- **Evidence**：conflict §5.4、§6.3、§13.1 #10。纯 core（Codex 未触此项）。
- **Risk**：`dominates_frontier` 是 op 信封字段，必须随 op-shape 一并冻结（见 D24），否则需 op-log 迁移。
- **Stop condition**：字段预留随 D24 签署；若 op-shape 冻结遗漏 `dominates_frontier`，须 op-log 迁移。

### D21 — local-only vault 位置语义 + 防误放断言

- **Decision**（用户 2026-06-07 firming）：**`sync = "none"`（local-only）的 vault 严禁置于任何 iCloud ubiquity container 下——硬产品规则，不是建议。** Local-only vault 放**非 ubiquity 目录**（OS 同步守护进程不可见、字节无法离开设备），标 **`NSURLIsExcludedFromBackupKey`** 排除备份；core 不挂任何 adapter，唯一出网点 `OpSyncPort::push` 受 adapter 门控、可 grep 审计。**vault-open 时强制断言路径不在任何 ubiquity container 下，否则拒绝打开并报警**（该断言是上述硬规则的执行点）。**`synced → local-only` 切换不可逆**（已离开设备的字节无法收回，local-only 保证只对此后写入成立）。路径-in-ubiquity 判定由 **Swift adapter 拥有**（core 不出现 ubiquity 类型）。
- **Status**：Recommended
- **Rationale**：path-in-ubiquity detection 必须由 Swift adapter 拥有（core 不出现 ubiquity 类型）；断言守住 local-only 保证。
- **Evidence**：plan §8.4、§11。Codex §7.1/§7.2/§8.2：**Observed** — 无 entitlement CLI 下 `url(forUbiquityContainerIdentifier:nil)` 返回 nil（`icloud:container_nil=true`），ubiquity lookup / resource keys（`isUbiquitousItem` 等）API 可用；adapter 拥有 URL / ubiquity / file coordination 边界形态可行；§2.6 付费 team entitled app 在真机返回 non-nil ubiquity container URL，进一步佐证「adapter 拥有 ubiquity 边界、core 不出现 ubiquity 类型」可行。Stage 1 19-icloud-drive-evidence.md：**Observed** — signed macOS verifier 的 local sandbox vault 不在 ubiquity container、`isUbiquitousItem=false`、`isExcludedFromBackup=true`、`blocked_local_only_open=false`；direct iCloud Documents vault raw/resolved path 均在 container 且 `isUbiquitousItem=true`，blocked；local symlink→iCloud 因 resolved path/ubiquity blocked；iCloud symlink→local 因 raw path/ubiquity blocked。**Not run** — external volume、security-scoped bookmark restoration、`.icloud` placeholder path classification、signed-out/unavailable account path classification。
- **Risk**：「路径是否在 ubiquity container 下」的判定边界情形仍依赖 Apple 真实 API；本轮关闭 normal local / direct iCloud / symlink 两向的机制下限，但 external volume、bookmark、placeholder、signed-out 状态仍不能作为已验证 product claim。
- **Stop condition**：local-only 语义已定。若 local-only 作为 product claim 发布，须先关闭 remaining path/account cases，或把公开保证限缩为已观察的 local/direct-iCloud/symlink 分类范围。

### D21a — local-only vault 被手动挪入 iCloud（误放 + blocked open）

- **Decision**：被用户绕过 Anchor、经 Finder / Files / shell **手动挪入 iCloud Drive / ubiquity container** 的 local-only vault（配置仍 `sync = "none"`）**不自动转换为 iCloud synced vault**。Anchor 在 vault-open 时把它识别为 **blocked misplacement**：拒绝打开、不挂载 `OpSyncPort` adapter、不上传 / 不拉取 / 不 merge 远端 segment、不视其为合法 synced vault；返回可恢复的 typed blocked 状态 `local_only_vault_in_ubiquity`，并提供两个显式动作：**Move Back**（移回非 ubiquity 目录后重开）与 **Convert to iCloud Sync**（进入显式迁移流程，创建合规 iCloud synced vault）。合法 iCloud synced vault 必须经显式迁移 / 创建流程并满足 file package 的 `com.apple.package` UTType 约束（D34）。
- **Status**：Recommended（D21 的明确化；normal local / direct iCloud / symlink classifier floor observed，remaining path/account cases still open）
- **Rationale**：local-only 的产品语义不是「当前没打开同步开关」，而是「Anchor 不把该 vault 放在 OS 同步守护进程可见的位置、也不为它挂载同步 adapter」。手动挪入 iCloud 后 Anchor 已无法保证字节从未离开本机（OS 可能已开始上传），但仍能守住自己的边界：不继续打开、不继续写入、不把该状态升级为同步。正确分类是**误放位置 + blocked open**，不是隐式同步启用，也不是自动迁移成功。
- **Evidence**：**用户提出（2026-06-07）。** 关联 D21（local-only 硬规则）、D34（`com.apple.package` UTType）。Codex §7.1/§7.2：**Observed** — ubiquity lookup / `isUbiquitousItem` 等 resource-key API 可用，adapter 拥有 URL / ubiquity / file coordination 边界可行。Stage 1 19-icloud-drive-evidence.md：**Observed** — conservative classifier blocks direct iCloud Documents vault, local symlink whose resolved target is in iCloud, and iCloud-visible symlink whose resolved target is local; it allows only the non-ubiquity local vault and verifies backup exclusion. **Not run** — external volume、security-scoped bookmark、Finder UI move surface、`.icloud` placeholder、signed-out/unavailable account。
- **Risk**：**隐私边界**——OS 可能在 Anchor 下次观察路径前已上传文件，故 Anchor 不能声称「local-only vault 被手动挪入 iCloud 后字节绝不离开设备」，只能声称「Anchor 不会从 iCloud 管理的位置打开或继续写入 local-only vault」。本轮把 symlink 两向纳入 conservative blocked policy；remaining path/account cases 未验证前，product claim 须保留范围限定。
- **Stop condition**：若 Anchor 无法可靠判定 local-only vault 的 raw path 或 resolved target 是否落在 ubiquity 存储，product claim 须减弱为「Anchor 阻止 local-only vault 的已知 iCloud 管理路径，但未验证路径/账号边界不支持」。

  **User-facing behavior（打开该 vault 时）：** ① 检测 `sync = "none"`；② Apple adapter 检测 resolved path 位于 ubiquity container 下；③ 返回 typed blocked `local_only_vault_in_ubiquity`；④ UI 显示「该 vault 是 local-only，但当前位置受 iCloud 管理」；⑤ 提供 **Move Back** 与 **Convert to iCloud Sync** 两个显式动作。

  **CLI behavior：** 打开返回 blocked——exit code `4 blocked`、error code `local_only_vault_in_ubiquity`、machine-readable payload 含 `vaultPath` / `sync = "none"` / `detectedContainerKind = "ubiquity"` / `recommendedActions = ["move_back", "convert_to_icloud_sync"]`。CLI 不自动修复、不写配置、不创建 iCloud container、不改 op-log。

  **Responsibility boundary：** Apple adapter 拥有 URL / bookmark resolution、symlink resolution、ubiquity container lookup、`isUbiquitousItem` 等 resource-key 检查、user-visible sync account / quota / placeholder 状态、typed blocked 状态映射；`anchor-core` 拥有 vault config 解释、dispatch 不变量、op-log 真理层、merge / replay / materialization、结构化 error / status 词汇；`anchor-core` **不**拥有 iCloud / CloudKit 类型、`NSFileCoordinator`、`NSMetadataQuery`、ubiquity container API、OS file package 行为。

  **Migration rule（`local-only → iCloud synced` 是显式转换流程）：** 须 ① 要求用户意图；② 校验目标 iCloud container 可用；③ 创建 / 移动进合规 Anchor iCloud synced vault package；④ 保证 package UTType conform `com.apple.package`；⑤ SQLite projection 留在 ubiquity container 外；⑥ 只经 `OpSyncPort` 同步不可变 op-segment 文件与 blob；⑦ `.md` / `.json` mirror 与 SQLite projection 不进同步。**单纯路径挪动不满足此规则。**

  **Stage 1 路径判定验证项（发布 local-only 作为 product guarantee 前必验，owner Codex/Apple）：** normal local path / app ubiquity container `Documents/` / 指向 iCloud 的 symlink / iCloud 内指向外部的 symlink 已有机制下限（doc 46）；外部卷路径、挪动后恢复的 security-scoped bookmark、Finder 挪动的 package UI surface、`.icloud` placeholder 状态、signed-out / unavailable iCloud account 状态仍需验证。

### D22 — 加密与密钥所有权

- **Decision**（用户 2026-06-07 定）：**首期不实现 zero-knowledge（ZK）加密。** 但阶段0**必须锁定两件事**：(a) **encryption envelope 边界**——在 `OpSyncPort` 与持久化之间预留一个明确的加密信封缝（segment / blob 字节离开 adapter 前的唯一可插入点），首期为 no-op / pass-through，使日后客户端加密层可在**不迁移 op-log、不改 core merge** 的前提下接入；(b) **non-ZK 文案**——首期对所有同步路线一律如实呈现「**非零知识**」，**绝不允许对中立 object-store 暗示 zero-knowledge**。首期 iCloud Drive 依赖 Apple 账户级保护、不自建加密；中立 object-store 默认非零知识，且无自托管服务时向新设备分发密钥是真实阻塞——完整 ZK 与密钥分发方案延后到 ZK 真被需要时再评估。
- **Status**：Recommended（Phase-0 锁定项已定：首期非 ZK + envelope 边界 + non-ZK 文案；完整 ZK / 密钥分发延后）
- **Rationale**：把 ZK 实现延后但**现在锁定信封缝与文案**，既不背上首期不必要的加密复杂度，又避免日后接 ZK 时被迫 op-log 迁移或对用户做过的「零知识」暗示翻车（诚实披露非 ZK 是产品安全底线）。
- **Evidence**：**用户决定（2026-06-07）：首期不实现 ZK；Phase 0 锁定 encryption envelope 边界 + non-ZK 文案；不允许对 object-store 暗示 zero-knowledge。** plan §8.4、§11。Codex 未把密钥分发 / iCloud Keychain runtime 列为已验证项 = **Not run**（完整 ZK 路线日后另验）。
- **Risk**：envelope 缝若首期未预留，日后接 ZK 须改 `OpSyncPort` 边界 / op-log 迁移；若任何文案对 object-store 暗示 ZK 而实为非 ZK，是安全误导。
- **Stop condition**：Phase-0 锁定项（首期非 ZK + envelope 边界 + non-ZK 文案 + 禁止 object-store ZK 暗示）已定。完整 ZK / 密钥分发为延后决策；若日后承诺 ZK，须先有可行密钥分发方案，且 envelope 缝须确为已预留（否则触 op-log 迁移）。

### D23 — Web 同步适配器（中立 object-store，非 iCloud）

- **Decision**：跨平台/Web 同步 = **中立 object-store 适配器（S3 / WebDAV）**，**不是 iCloud**（iCloud 对第三方 app 无 Web/Windows/Android 同步 API）；同一 `OpSyncPort` 接口。**Web 整体后置**；记 **OPFS / Safari WebKit ITP 耐久性 caveat 为 deferred**：ITP 会定期清除 OPFS，「绝不同步的 local-only」保证在 Web 上**无法兑现**，Web 端以同步作为耐久性后盾。
- **Status**：Recommended
- **Rationale**：仅记录 deferred 非目标 reserved hook，未引入首期边界变更。
- **Evidence**：plan §3、§8.4、§9；conflict 文末（watermark 是 HLC frontier，传输无关）。Codex §8.7：Web / Windows / Android iCloud sync 明列 first-release scope 之外。
- **Risk**：Web 是 plan §9 明列的非目标/后置，此处仅作 reserved hook，不得拉回首期范围。
- **Stop condition**：若任何决策试图把 Web 客户端或 iCloud 跨平台同步拉回首期，即越界。

---

## G. Op-shape 冻结项（conflict §7 / §13.1，op-shape 硬截止）

### D24 — 预留完整 op 信封字段（NON-NEGOTIABLE）

- **Decision**：op-shape 冻结时**预留全部 §7.1 字段**：`op_id`（最高优先级预留：全序 tie-break + 幂等 dedup key + keep-both loser / 结构标记 / tag OR-Set add-identity）、**`op_envelope_version`（不可协商）**、`sub_field_key`（`body|type_id|props:<k>|tags:<t>`）、`base_sub_rev`/`new_sub_rev`、`op_kind`（`set|move|tag_add|tag_remove|life_set|restore|create|split|merge|renormalize`）、`supersedes_rev`、`dominates_frontier`、`observed_adds`、`macro_op_id`、`diff_algo_version`、每 actor `seq`。保留 `{target_id, target_kind, register, base_register_rev, new_register_rev, hlc, actor}` 与预留 `provenance, approvalState`（**不**复用于人工冲突复审）。
- **Status**：Recommended
- **Rationale**：缺任一即需后续 op-log 迁移；零迁移未来-CRDT 钩子依赖这些预留。
- **Evidence**：conflict §7.1、§7.4、§13.1 #1、§11。纯 core schema（Codex 未触此项）。**Stage 1 / CP-2（23-cp-2-core-readiness.md）：** `op::op_envelope_canonical` 规范序列化完整 op 信封（每字段 + payload by `kind`），并新增 `macro_size: Option<u32>`（D29 原子性）一并纳入冻结；golden freeze 测试 `op_shape_freeze.rs` pin `op_envelope_rev = 18582d53…e75dfe0` 并逐一证明 25 个字段任改其一即改字节（任何 omit/rename/re-type 强制 op-log migration）；`OP_ENVELOPE_VERSION = 1` 未变。正式冻结签字仍是 human gate。
- **Risk**：op 信封一旦发布即成 file-format 契约；遗漏字段 = 强制迁移；`op_id` / `op_envelope_version` 缺失代价最高。
- **Stop condition**：冲突模型已定为非协商。若 op-shape 冻结遗漏任一字段，须 op-log 迁移；`op_envelope_version` 缺失即不可演进。

### D25 — `content` sub-field 集合 `{body, type_id, props, tags}` 完整性

- **Decision**：批准 `content` sub-field 集合 **`{body, type_id, props[k], tags[t]}`** 为完整。
- **Status**：Recommended
- **Rationale**：cell map 设计允许逐 key 扩展，集合冻结不阻塞未来扩展。
- **Evidence**：conflict §3.2、§5.3、§13.1 #2。纯 core（Codex 未触此项）。
- **Risk**：日后新增 sub-field 类型需谨慎，但 cell map 设计允许逐 key 扩展。
- **Stop condition**：若发现遗漏 sub-field 类型需在 op-shape 冻结前补入，否则后续扩展受限。

### D26 — pin fractional-index order-key 生成器（跨设备一致性 gate）

- **Decision**：**pin fractional-index order-key 生成器为一等跨设备一致性 gate**（与 diff3 pin 并列）；**推荐只在 Rust core 执行**，macOS、iOS 与 **wasm32**（World A 下的非-Apple target）对相同 `(observed-base, target-gap)` 输入须铸出**逐字节相同**的 fractional key；**禁 jitter / 精度 / 字母表漂移**。key 是 base-N 任意精度字符串（**绝不浮点**）。order tie 由 `(hlc.device, actor, op_id)` 破除。
- **Status**：Recommended
- **Rationale**：同一 Rust 编译产物经 binding 调用应天然一致；逐字节相等 tie-break 否则仅纸面保证。
- **Evidence**：conflict §5.2、§6.4、§13.1 #5、§12；plan §8.2。Codex §1/§8.2：**Recommended（Observed-supported）** — order-key 与 diff3 同推荐只在 Rust core 执行，跨平台一致由单一编译产物保证（须核验无平台相关浮点/locale 介入）。Stage 1 `15-core-evidence.md` / `20-cross-target-ci-evidence.md`：**Observed** — order-key vectors execute in native cargo test, wasm WebAssembly runtime, iOS Simulator slice, and hosted Android emulator binary; historical GitHub Actions workflow wiring ran hosted `pull_request` run `<CI_RUN>` through Linux native+wasm, macOS native+wasm+iOS Simulator, Ubuntu Android emulator, and Apple binding package jobs. Stage 1 `20-cross-target-ci-evidence.md`：**Observed** — current head removes the hosted cross-target workflow; current-period order-key guard relies on retained historical evidence and local Apple-first verification unless the workflow is reintroduced.
- **Risk**：若生成器跨平台不一致，逐字节相等 tie-break 仅纸面保证，sibling 顺序与子树 hash 永久分叉。
- **Stop condition**：order-key 机制已定。若 Stage 1 一致性向量集发现浮点/locale 介入致跨平台分叉，须改用纯整数 base-N 实现并重 pin。

### D27 — trash-vs-archive tie = archived-wins

- **Decision**：确认 `trashed` vs `archived` 不可比 tie 默认 **`archived`-wins**（keep-biased 单用户默认；两态皆可逆，任一都不丢），按 `T` 确定性落定并 surface 低优先级可恢复冲突。
- **Status**：Recommended
- **Rationale**：keep-biased 单用户默认，与 D10 lattice 一致；两态皆可逆。
- **Evidence**：conflict §5.4、§13.1 #7。纯 core（Codex 未触此项）。
- **Risk**：默认偏好取舍；与 D10 lattice 一致。
- **Stop condition**：若产品决定改默认偏好，须同步更新 D10 lattice tie 规则。

### D28 — tag OR-Set add-wins

- **Decision**：批准 **真 OR-Set add-wins**：复用 `op_id` 作 add-identity，`tag_remove` 携 `observed_adds`；tag `t` 存在 iff 存在一条 add 其 `op_id` 未被任何 remove 的 observed-set 包含；「对已存在 tag 的 add」= 铸造新 add-identity；`T` 序硬兜底。observed-add id 在 watermark 之下 GC。OR-Set 语义拥有有界 per-add identity 存储。
- **Status**：Recommended
- **Rationale**：scalar `base_tag_rev` + zero new storage 无法表达 add/remove/re-add 生命周期、replica 分叉。
- **Evidence**：conflict §5.3、§6.7、§13.1 #8、§11。纯 core（Codex 未触此项）。
- **Risk**：observed-add id 须由 watermark-GC 保持有界。
- **Stop condition**：若 watermark-GC 规则未定，observed-add id 会无界增长。

### D29 — split/merge macro_op_id + intent-rebase

- **Decision**：批准 split / merge 为**在 dispatch 分解为既有 primitive、作用于稳定 `target_id`** 的 macro-op（绝不 opaque delete+create），发出的每条 primitive 盖同一 `macro_op_id`；replay 把任一 leg 上的并发 body 冲突视为**整组冲突**；split 记录为单一 intent，merge 时对 merge 后的 `bX.body` 重放（offset 经同一 diff 重 clamp）；merge（Y→X）= append + 对 Y 设 `life=trashed`（可逆，绝不静默 delete）；派生块纳入无丢失检测。
- **Status**：Recommended; Stage 1 lower bound observed for normal-path split / merge-backward dispatch
- **Rationale**：leg-LWW 草案会致重复 tail 文本 / 静默降级；macro-op + intent-rebase 守住无丢失。
- **Evidence**：conflict §6.8、§7.2、§13.1 #11。Stage 1 23-cp-2-core-readiness.md：**Observed** — `SplitBlock` normal path dispatches primitive ops with shared `macro_op_id`, creates a right sibling, and moves selection to the new block start; `MergeBackward` appends current body to the previous living sibling and sets current block `life=trashed`; Swift bridge smoke observes `textkit:core_dispatch_bridge=structural split=changed:blk_a,blk_op_split_block_10003 merge=changed:blk_a,blk_b`; `cargo test --manifest-path suites/anchor/Cargo.toml` 现 passed 83/0 with 1 ignored（CP-2 后）。**CP-2 已落地（见 `23-cp-2-core-readiness.md`）：** split/merge macro 原子消费（op 信封 `macro_size` + replay `drop_incomplete_macros`，半交付 macro 整组丢弃）、`split_merge_structural` 冲突物化（并发 split-vs-edit surface 为一条冲突并 pin 双方全部 op，no silent loss）、D24 op-shape 全信封冻结、单一已校验 dispatch chokepoint。**仍 open：** 确定性 intent-rebase（auto-resolve，基于 diff3 不重复 tail / 不静默 LWW）与 product editor integration。The full auto-rebase rule still depends on deterministic diff3（D19）.
- **Risk**：intent-rebase 依赖确定性 diff3（D19）；macro_op_id 是信封字段（随 D24 冻结）。
- **Stop condition**：macro_op_id 随 D24 冻结；若实现退化为 opaque delete+create 或 leg-LWW，即破坏无丢失保证。

### D30 — `snapshot_revision` canonicalization

- **Decision**：`snapshot_revision` over **物化输出**（最终文本 + 排序合并后 marks + 最终 order key + 最终 scalar/life 值），**排除 jitter / actor 相关合并元数据**，含全序 tie-break 输入；附**跨设备 snapshot-equality 一致性测试**。`canonical_serialize` 遵 JCS 风格（递归排序 key、固定转义、无无意义空白，禁 `f64`，数字用规范十进制字符串）。
- **Status**：Recommended
- **Rationale**：任何 actor 相关元数据混入 hash 即致跨设备 fork。
- **Evidence**：plan §8.3；conflict §4、§13.1 #12。纯 core；其跨设备一致性测试与 D19/D26 同属 Stage 1 一致性向量集（Codex 未单独触此项）。
- **Risk**：任何 actor 相关元数据混入 hash 即致跨设备 fork。
- **Stop condition**：若 `snapshot_revision` 纳入 jitter / actor 元数据，跨设备 snapshot 必然 fork，须停止。

### D31 — ConflictRecord / resolve 公开 CLI schema 放二期（Phase 2）

- **Decision**：**用户已于 2026-06-07 决定：`ConflictRecord` 与 `resolve` / `restore` / `restore_order` / `restore_subtree` 的公开 CLI/DTO 面放二期（Phase 2），Phase 0 / 首期不暴露。** Phase 0 只在 op-envelope 层预留所需字段（D24，含 `restore` op_kind、`op_id`、`sub_field_key`、`observed_adds`、`dominates_frontier`、`macro_op_id` 等）；冲突调和 / keep-both / lattice 等**核心机制**仍在 Phase 0/1 的 `anchor-core::dispatch` / merge 内（不受影响）。`ConflictRecord` 是**派生读模型**（replay 重算、绝非持久 op），故二期才暴露其 CLI/DTO **无 op-log 迁移成本**。首期 CLI 的冲突可见面仅为既有退出码 3（conflict）。
- **Status**：Deferred to Phase 2（二期；用户已决定）
- **Rationale**：CLI 公开 conflict/resolve schema 是超出阶段0 DTO 草图的新公开面，用户决定推迟到二期；因 `ConflictRecord` 派生而非持久，推迟无迁移代价——conflict §12/§13.1 #13「现在预留形状以免迁移」的前提（**持久**数据需提前定形）对派生读模型不成立，故可安全延后。
- **Evidence**：**用户决定（2026-06-07）：CLI schema 放二期。** conflict §9（ConflictRecord 字段 + kind union：`body_overlap | scalar | tag | move_skipped | location_relocated | reorder_blend | life_tie | ancestor_life_vs_descendant_edit | split_merge_structural | journal_merge`）、§12、§13.1 #13；plan §13 暂停条件「CLI 契约需暴露阶段0 DTO 草图未覆盖的新公开 schema」。op-envelope 预留归 D24（Phase 0 非协商）。
- **Risk**：二期暴露时须能从 D24 已预留的 op-envelope 干净派生全部 `ConflictRecord` kind——故 D24 字段集（`op_id` / `sub_field_key` / `observed_adds` / `dominates_frontier` / `macro_op_id` / `diff_algo_version` 等）必须在 Phase 0 完整冻结，否则二期暴露会反过来要求 op-log 迁移。
- **Stop condition**：二期实现 conflict/resolve CLI 时，若发现某 `ConflictRecord` kind 无法从 D24 已冻结的 op-envelope 派生，须回到 D24 在 op-shape 冻结前补预留——这是 D31 安全推迟到二期的唯一硬前提。

### D32 — 签署 Kleppmann 祖先检查为在范围内（§13 边界决策）

- **Decision**：**签署** §5.2 的 Kleppmann 祖先 / 成环检查为**在范围内**，并在设计文档记为**有意识的 §13 边界决策**（非静默发布）；它不加任何数据类型、不加元数据、不保留 move 历史——是对 `T` 序前缀 + 当前物化树的纯 tree-invariant 校验。实现须验证 skip 只需有序前缀 + 当前物化树；**若哪天需要 move 历史，即滑向完整收敛 move = 暂停**。
- **Status**：Recommended（用户已签署 B9，2026-06-07：Kleppmann 祖先 / 成环检查为在范围内的有意识 §13 边界决策）
- **Rationale**：取自标「CRDT」论文，须诚实标注为有意识的 §13 边界决策。
- **Evidence**：conflict §12、§5.2、§13.1 #14。纯 core 算法（Codex 未触此项）。
- **Risk**：若实现引入 per-move 元数据保留，即越界进入 plan §13 暂停条件（实时协作/CRDT 存储）。
- **Stop condition**：conflict §13.1 #14 / §12 要求作为有意识 §13 边界决策签署。若实现引入 move 历史保留，即滑向完整收敛 move，须暂停。

---

## H. 新增决策（Codex 验证 + World A 取向，续编 D33+）

> D33–D35 源自 Codex Apple 现实核验；D36–D37 源自 World A（committed 平台无关 Rust core）取向——把「core 跨平台可复用」从延后项升级为现在就守住的不变量（client 仍延后）。

### D33 — Rust Apple targets 与三-slice build gate

- **Decision**：Apple binding 构建环境必须具备 `aarch64-apple-darwin`、`aarch64-apple-ios`、`aarch64-apple-ios-sim` 三个 Rust targets；Apple binding / XCFramework 证据必须覆盖 macOS、iOS device、iOS Simulator 三 slice。
- **Status**：Recommended（Stage 1 target install + three-slice builds passed on this machine）
- **Rationale**：三 slice 是 Apple 分发边界的最小真实面；缺任一 target 时不得声称 iOS 或 multi-platform XCFramework 已验证。
- **Evidence**：Phase 0 Codex §2.2/§2.4/§4.1 记录 host target 已装、iOS targets 未装的前置缺口。Stage 1 17-apple-binding-evidence.md：**Observed** — `rustup target add aarch64-apple-ios aarch64-apple-ios-sim` 执行完成；`rustup target list --installed` 包含三 Apple targets；`anchor-core`、C ABI wrapper、UniFFI wrapper 均完成 macOS / iOS / iOS-sim 构建；C ABI 与 UniFFI 三-slice XCFramework 创建成功。
- **Risk**：后续机器、CI runner 或新开发者环境仍需显式 target check；单机通过不替代 CI bootstrap。
- **Stop condition**：任何缺 slice 的 artifact 只能标为 partial，不得作为 Apple binding 冻结证据。

### D34 — Anchor vault file package 声明符合 `com.apple.package` 的 UTType

- **Decision**：Anchor iCloud Drive synced vault file package 必须声明符合 `com.apple.package` 的 **exported document type / UTType**，使 iCloud 把 file wrapper 当单个用户可见 document 处理。Vault/package discovery 使用 package-level metadata；package 内部 segment discovery 使用 file-coordinated direct enumeration，不依赖 `NSMetadataQuery` 枚举 package internals。
- **Status**：Recommended（用户已批准 B13，2026-06-07）
- **Rationale**：缺 package UTType 会破坏 vault 作为单一 document 的同步语义，并使内部 segment 文件被当作 loose files 暴露。
- **Evidence**：Codex §7.1（官方文档 + contract correction）：**Observed**（官方文档）— 仅当 app 导出符合 `com.apple.package` 的 package UTI 时，file wrappers/packages 才作单个 document 处理。Stage 1 19-icloud-drive-evidence.md：**Observed** — signed iPhone probe 的 `.anchorvault` package 报告 `<vendor>.anchor.vault` 且 `isUbiquitousItem=true`；signed macOS app 的 `NSMetadataQuery` 发现 `.anchorvault` package 本身（`package_metadata_count=1`）；direct enumeration 能看到 package-internal segment files；`NSMetadataQuery` 在本 probe 中未枚举 package-internal `.seg` files，package-external `.seg` files 可被发现。
- **Risk**：缺声明会使 vault package 被暴露为普通目录；把 package-internal segment discovery 建在 `NSMetadataQuery` 上会漏段；direct enumeration 必须与 `NSFileCoordinator`、download state 和 UI 非阻塞策略配套。
- **Stop condition**：UTType / exported document type 声明落在 Apple project 的 Info.plist / entitlements 面，触 Apple project 边界，须用户签署。

### D35 — iCloud entitlement / capability + approved runtime compromise

- **Decision**：iCloud Documents / ubiquity 能力由付费 Apple Developer Program team、signed app、matching iCloud container 和真实 account 共同成立。Anchor app 自身的 bundle id / iCloud container id / capability 设置属于实现期动作（会在 Apple Developer 侧创建 / 绑定 App ID 与 iCloud container）。首期 iCloud Drive adapter 的可批准形状是 **metadata discovers vault packages; `NSFileCoordinator` protects reads/writes; package-internal segments are discovered by direct enumeration; manifest conflicts surface through `NSFileVersion` and duplicate `manifest *.json` materialization; conflict surfaces block adapter decisions until explicit resolution archives all branches and a post-resolution policy re-check is clean**。
- **Status**：Approved default transport with compromise constraints（user approval on 2026-06-07；signed runtime passed）
- **Rationale**：付费 ADP + signed probes 证明 entitlement/container/runtime 入口可用；package-internal metadata enumeration 不可依赖，package-internal placeholder/download 在 macOS local-current probe 中不可依赖，首期默认 transport 采用 package-level metadata discovery + file-coordinated direct package-internal enumeration/read + conflict-surface blocking for `NSFileVersion` / duplicate manifest cases。Remote placeholder/account states、iOS large-scale delivery、steady-state segment budget 和 product resolver integration at scale 是交付 gate。
- **Evidence**：Codex §2.6：**Observed** — `teamType = Individual`、`isFreeProvisioningTeam = 0`；demo project 含 iCloud Documents entitlement，device app 签名含匹配 iCloud entitlements；真机 iPhone 返回 non-nil ubiquity container URL。Stage 1 19-icloud-drive-evidence.md：**Observed** — physical iPhone signed runtime passed explicit/implicit container lookup, package type id, `NSFileCoordinator` read/write, current segment download call, and 1024-file write subset; real signed macOS app automatic signing/provisioning/build/runtime passed; macOS package-level metadata discovery passed; package-internal direct enumeration saw 1024 hidden `.anchor` segment files, 128 visible package-internal segment files, and 10K / 50K / 100K scale counts; package-internal `NSMetadataQuery` returned 0 at every tested scale; package-external metadata query found `.seg` files; online macOS+iOS concurrent writes converged with 0 conflicts; offline iOS / online macOS fork materialized 1 unresolved `NSFileVersion` conflict after reconnect; core cloud-symbol audit returned 0 matches. Stage 1 19-icloud-drive-evidence.md：**Observed** — signed macOS verifier surfaced current `ios-offline`, unresolved conflict `mac-online`, duplicate `manifest 2.json` `ios-base`; policy floor returned `blocked_manifest_conflict`, preserve/surface true, auto-resolve false, resolution not executed. Stage 1 19-icloud-drive-evidence.md：**Observed** — signed macOS verifier executed explicit current-winner resolution for that conflict, archived current/conflict/duplicate branches, moved the duplicate manifest out of the live directory, observed same-run conflict metadata lag, and then observed a subsequent policy read with `conflict_versions=0`, `duplicate_manifest_files=0`, `adapter_status=ok_no_conflict`. Stage 1 19-icloud-drive-evidence.md：**Observed** — current physical iPhone lock state allowed launch; Xcode device build/install succeeded with CloudDocuments entitlements; runtime returned explicit/implicit ubiquity containers non-nil, vault package ubiquitous, coordinated segment read/write equal, and 1024-file subset write observed; package-internal metadata gather remained false/count 0 and package-internal start-download returned `NSCocoaErrorDomain:4`. Stage 1 19-icloud-drive-evidence.md：**Observed** — after the user stated the iOS Simulator is logged into iCloud, the Xcode-managed iOS 26.5 Simulator verifier build/install/launch succeeded with simulated CloudDocuments entitlement surface, but app-side explicit/implicit ubiquity lookup returned nil and `bird` logged `BRCloudDocsErrorDomain:153` / `iCloud Drive not supported`; this rejects current Simulator as a substitute for physical iOS runtime proof. Stage 1 19-icloud-drive-evidence.md：**Observed** — macOS loose iCloud file is ubiquitous/current but evict did not create an observable remote placeholder; package-internal segment is not ubiquitous and evict/start-download return `NSCocoaErrorDomain:4`, while coordinated read succeeds.
- **Risk**：iCloud Drive default transport carries unresolved delivery gates: true remote placeholder behavior, signed-out / over-quota states, iOS remote metadata/delivery behavior beyond local container availability, local-only path-in-ubiquity edge cases, product resolver UX/core integration, and million-op core replay/compaction budget. Current iOS 26.5 Simulator CloudDocuments runtime is not a valid substitute for physical iOS runtime evidence. Package-internal discovery via `NSMetadataQuery` and package-internal availability via successful `startDownloadingUbiquitousItem` are not approved design assumptions.
- **Stop condition**：Any design that requires cloud/file-coordination types in `anchor-core`, depends on `NSMetadataQuery` for package-internal segment discovery, treats unresolved `NSFileVersion` conflicts or duplicate manifest files as silently resolved, advances from a blocked mutable manifest without archived explicit resolution and a clean post-resolution re-check, or produces roughly one synced segment per logical op must pause.

### D36 — Core 多目标可编译性政策（wasm32 + android，World A 受保护不变量）

- **Decision**：`anchor-core`（含内部 `anchor-editor-core`）必须**始终可编译到非-Apple target**——至少 `wasm32-unknown-unknown`（web）与 `aarch64-linux-android`（android），与 Apple slice 并列为 CP-1 一道 gate。**core 依赖政策：** 每个 core 依赖须能编到 wasm + android；确定性/merge 路径尽量 `no_std + alloc`，**不碰 OS 线程 / 文件系统 / 时钟 / 浮点**（canonical_serialize 禁 `f64` 已涵盖）。选 diff3 / blake3 / fractional-index / HLC 等 crate 时，「wasm + android 可编译」是硬筛选条件。区分清楚：**受保护的是 core 的可编译性，web/android 的 client 仍是延后非目标（见范围守护、D23）。**
- **Status**：Recommended
- **Rationale**：World A 的全部回报押在「core 到处复用」。Apple-first 阶段的 core 依赖必须保持 wasm/android 可编译，否则后续移植会从「编译+绑定」退化为「重写+反向工程」。多目标编译 gate 是 CP-1 的低成本防线。
- **Evidence**：plan §8.1（core 平台无关）、§3（UI 平台化、核心平台无关）；Codex §2.2：**Observed** — Rust host target `aarch64-apple-darwin` 已装。Stage 1 15-core-evidence.md §3/§4：**Observed** — `anchor-core`（`#![no_std]`+alloc、零外部依赖）`cargo build --target wasm32-unknown-unknown` 与 `--target aarch64-linux-android` 均 `Finished`；core 依赖政策以「零运行时依赖」满足；client 零真理逻辑 / core 零云符号 grep 红线 0 命中。Stage 1 `20-cross-target-ci-evidence.md`：**Observed** — repo-local runner executes native + wasm + iOS Simulator vectors; `ANCHOR_SKIP_IOS=1` supports Linux native+wasm CI path; historical `.github/workflows/anchor-cross-target-vectors.yml` wired Linux native+wasm, macOS iOS Simulator, and Ubuntu Android emulator jobs; hosted `pull_request` run `<CI_RUN>` passed all cross-target jobs, including Android emulator with `anchor_android_vector_status=0`. Stage 1 `20-cross-target-ci-evidence.md`：**Observed** — current head deletes `.github/workflows/anchor-cross-target-vectors.yml`; Android and wasm are not current-period support targets, and iOS/macOS build verification is local for the current period.
- **Risk**：某依赖不支持 wasm/no_std 时需替换或自实现；wasm 浮点/运行时差异须靠 D19/D26 向量集兜住。暂时移除 hosted workflow 接受一个明确折中：当前 head 不再有每次 push / PR 的 Android/wasm hosted regression guard；如果在重新引入 workflow 前 core 依赖形状重新开始变化，D36 漂移风险会上升。
- **Stop condition**：若某必需 core 能力无任何 wasm + android 可编译实现且无法自实现，须暂停并重评 World A 的跨平台承诺（而非把该逻辑塞进平台侧——那是 World C 陷阱）。

### D37 — Client 零真理逻辑 CI 红线（merge / normalization / op-creation）

- **Decision**：Apple 客户端及未来任何 client（web / android / iPadOS）**不得含**任何 merge / schema-aware normalization / op-creation / tree-invariant 校验逻辑——这些唯一归 `anchor-core::dispatch`。设一条 CI grep 红线证明 client 侧零真理逻辑；client 只表达意图（`EditorIntent`）、消费 DTO / `EditorPatch`、实现 `OpSyncPort` 传字节。
- **Status**：Recommended
- **Rationale**：把真理逻辑塞进 Swift/TextKit「为了快」是 World C 陷阱，会直接毁掉 core 跨平台复用并制造隐藏真理（plan §13「核心被 Apple UI 绑死」「TextKit 被误当模型」）。一条 CI 红线把 World A 的核心承诺变成可机械验证的不变量。
- **Evidence**：plan §4.3（所有写入经 core dispatch）、§8.1（client 不复制 core 领域规则）、§8.5（单一已校验 dispatch，对写入点 grep 可证）、§13；Codex §8.4（任何独立于 Rust core 的 Swift-side diff3/order-key semantics 列为移出首期）。CI 红线本身 = **Recommended（命令骨架）**，Anchor 工程创建后落地。
- **Risk**：grep 红线须覆盖到位，否则真理逻辑可能从 view model 或 attribute 处理悄悄渗入。
- **Stop condition**：若某 UI 行为「必须」在 client 侧持久化 platform editor state 或自行创建 op，即触 plan §13 暂停条件（要求持久化平台 editor state / 非 dispatch 写入路径），须暂停。

### D38 — Time travel 一等能力 + 四-horizon retention model（用户 2026-06-07 批准 B15）

- **Decision**（用户 2026-06-07 定，B15）：**Time travel 是一等产品能力（非普通审计日志）。** 范围 = **per-note**（时间轴键于 semantic commit `macro_op_id`，snapshot 作重建锚点，raw op 作 snapshot 间 replay substrate，segment 作存储/archive/GC 单元）；保留期 = **用户可配 + 安全下界**（默认 ≥ audit/restore horizon；合规场景可使 audit > time-travel，二者独立、无普适序）；模式 = **read-only 查看 + restore**，restore **= emit 前向 dominating `set`/`restore`/`resolve` op（绝不倒带/重写/分叉 op-log，否则 fork `snapshot_revision`，与 conflict §8、D20 一致）**。time travel **反向约束 D14**：>time-travel-horizon 之外才可硬删，horizon 之内只能 compact-to-snapshot-delta-chain / archive（压缩 immutable segment）/ checkpoint chain（保持 reachable）。**最小保留集**：op payload **或** snapshot delta（每个 horizon 覆盖区间至少其一）＋ 每保留 checkpoint 的 `snapshot_revision`（D30，可验证跨设备逐字节一致）＋ tombstone（D10，否则删除内容在过去重建复活）＋ `op_envelope_version`（D24，read-time **upcasting** 重解释旧 envelope，**绝不重写存储字节**）。time-travel 查询：用户以 wall-clock 选目标，重建按全序 `T` 取 `hlc.wall ≤ target` 的 op 集合（**非严格 T 前缀**，时钟偏斜下近似）；**watermark 之下 as-of 视图稳定/canonical、之上可能随迟到 op 改变**，UI 须诚实标注历史时间戳来自原始设备 wall clock。「永久删除/被遗忘权」是**独立 excise 路径**（非 compaction 副作用），须连带清除对应 loser payload / tombstoned content / 嵌入字节的 snapshot delta。

  **四-horizon 边界（hard-delete 须分别尊重，不得以其一蕴含其二）：**

  | Horizon | 决定者 | 到期后 |
  |---|---|---|
  | conflict（候选 7 天，B16） | 产品 UX（wall-clock） | 停 surface 新冲突；**不据此硬删、不解 open-conflict pin** |
  | replay-safety | causal-stability watermark + snapshot 覆盖 + open-conflict pin | 可 truncate-to-snapshot |
  | audit / restore | retention 策略（≥ replay-safety） | 截断 loser op 后须 resolve op 记录弃值 |
  | time-travel | 独立产品选择（默认 ≥ audit；合规场景 audit 可反超） | 可 compact-to-snapshot-delta / archive，保持 reachable |

  关系：`conflict ≤ replay-safety` 恒成立；`audit` 与 `time-travel` 互不蕴含。**硬删资格 = 五个数据安全条件全部成立（① < watermark；② 非 open-conflict 成员；③ 已被全 peer snapshot 覆盖；④ 超 audit horizon；⑤ 超 time-travel horizon）＋ 一个流程门（⑥ 经显式 excise，非 compaction 默认路径）**；否则只能 archive。
- **Status**：Recommended（B15 用户 2026-06-07 批准 time travel 为一等能力 + per-note + 可配保留期 + 查看&restore；具体保留期数值、stale-peer 退出规则、archive 压缩格式、time-travel 重建在 iCloud 下的 placeholder 下载成本留 Stage 1，见 12-stage-1-spike-plan.md §1/§4）
- **Rationale**：time travel 若需重建 7 天以前状态，则 >7d ops 不能仅因超过 conflict horizon（D14）或低于 watermark 就 hard-delete——只能压缩为可验证历史表示。把它现在锁为一等能力 + 在 op-envelope（D24 `op_envelope_version`/`macro_op_id`）与 `snapshot_revision`（D30）层备齐重建/验证/upcasting 钩子，避免日后被迫 op-log 迁移。
- **Evidence**：**用户决定（2026-06-07，B15）。** Anchor 已有 `snapshot_revision`（D30）/ tombstone（D10）/ `op_envelope_version`（D24）三块；缺的「time-travel horizon 内 op payload 不得硬删、只能 archive」策略由本决策补齐。prior-art（Datomic as-of/excision、Git/Dolt reachability GC + archive、event-sourcing snapshot+upcasting）见 apple-verification §7.5（标 Inferred）；retention 四 horizon 边界见本决策上表。
- **Risk**：time-travel retention horizon 是独立产品选择、可远超 conflict/replay-safety horizon，是硬删的真正约束；保留期过长放大 iCloud/object-store 文件数与配额压力（apple-verification §7.5）、放大「首期非 ZK」披露义务（D22）；archive 段在 iCloud 下可能被 placeholder-evict，深度重建需 force-download（成本 Not run）。
- **Stop condition**：若实现把 time-travel-horizon **之内**的 op hard-delete（而非 archive），或把 restore 实现为倒带/重写 op-log，即破坏 time travel 与无丢失保证，须停止。time-travel 范围若从 per-note 升级为需保留 move 历史的结构重演，须复核是否触 plan §13（完整收敛 move）暂停条件。

---

## 范围守护（非目标 / reserved hook，勿拉回首期）

以下保持为**显式非目标 / reserved hook**，本决策表不得将其拉回首期 in-scope（plan §9、§13；Codex §8.7）：Markdown 字节保真；note-centric route / payload / UI parity；应用内 AI agent / proposed-change 子系统（op 信封仅预留 `actor` / `provenance` / `approvalState` 作 reserved hook，**不复用**于人工冲突复审）；实时多人协作 / CRDT / Loro / 字符级文本 CRDT（FugueMax 仅作 §13 暂停后的唯一可接受替换，信封已预留零迁移钩子）；完整收敛 move / order CRDT / 中央 sequencer；独立 Web 客户端与 iPadOS 首期专项优化；**跨 block 连续原生文本选择**（仅 Stage 1 spike，非首期 UI 承诺——editor-core 可对 cross-block edit intent 做 shape/split，但在 spike proof 前不承诺 polished continuous native selection）；CloudKit / CKSyncEngine 实现（二期）；**`ConflictRecord` / `resolve` / `restore_order` / `restore_subtree` 的公开 CLI schema（二期，用户已决定 D31；op-envelope 预留 D24 留 Phase 0，ConflictRecord 为派生读模型、二期暴露无迁移成本）**；任何独立于 Rust core 的 Swift-side diff3/order-key semantics；会在 product app build 期间编译 Rust 的 source Swift Package；任何直接 persist domain semantics 的 TextKit / `NSAttributedString` model。CLI 始终是本地结构化命令契约，**非 MCP**。

> **World A 区分（重要）：** 以上是 **client / 能力层面**的非目标。`anchor-core`（含 `anchor-editor-core`）的 **wasm32 + android 可编译性**是 D36 **受保护的不变量**，**不**在此非目标之列——受保护的是「core 现在就保持可复用」，而非「提前实现 web/android client」。两者并行不悖：core 可编译性历史证据保留；按 2026-06-10 当前期范围，Android/wasm 不作为本期支持目标的 hosted gate，client 仍延后到 macOS + iOS 跑通之后评估（D23、plan §9）。
