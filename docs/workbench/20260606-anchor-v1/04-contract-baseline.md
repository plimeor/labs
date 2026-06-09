# Anchor Phase-0 Contract Baseline

任务：`docs/workbench/20260606-anchor-v1/`
日期：2026-06-07
状态：**workbench artifact** —— 非公开接口契约。本文件是 6 文件 Phase-0 packet 的整合稿（Step 3：Claude 吸收 Codex 的 Apple/Xcode/Swift-Rust/TextKit/iCloud 验证证据），作为可批准 CP-0 的责任基线。

> 边界声明（AGENTS 工作台规则）：创建本 workbench 目录**不授权**任何 package / workspace / app / 生成 lockfile 改动，**不**创建 `suites/anchor`、`apps/anchor-*`、`packages/anchor-*`、顶层 `anchor-apple/`，**不**写 Rust/Swift/TS 代码，**不**改 `package.json` / `bun.lock` / 任何 `tsconfig` / workspace 配置。本文件唯一落盘动作就是它自身。权威且稳定的 CLI / API / schema / file-format 契约在实现后归 `anchor-core` 包 README；本文件只是 Phase-0 责任基线的对齐稿。
>
> 引用约定：`[plan §X]` 指 `01-apple-native-note-workbench.md`；`[conflict §X]` 指 `02-conflict-resolution-model.md`；Phase 0 Codex 验证证据指同目录 `09-apple-verification.md`；Stage 1 实测证据指 `docs/workbench/20260606-anchor-v1/`。同目录姐妹文件用相对名引用（如 `05-key-decisions.md`、`06-fixture-set.md`、`07-project-layout-options.md`）。
>
> 标注词汇：**Observed**（Codex 本机实跑或官方文档直接支持）、**Recommended**（建议的目标状态/命令骨架）、**Needs user approval**（触 workspace/package/Apple project 边界、新公开 CLI schema、加密所有权、付费 Apple Developer Program、entitlement/容器、plan §13 暂停条件）、**Needs Stage 1 spike**（机制可行性已验证但 Anchor 专属构建/运行未证）、**Blocked**（当前环境无法验证，被硬门控）、**Not run**（未执行项，不得当已验证事实）。

---

## Strongest conclusion

**单一最可辩护的 Phase-0 结论（CP-0 基线判断）：**

Anchor 是一个 **Note 原生（非 Markdown 文本壳）、Apple 原生优先（macOS + iOS 首期）、核心平台无关（platform-agnostic Rust `anchor-core`）** 的本地知识工作台；其真理层是 **append-only op-log**（物化 state、`.json`/`.md` mirror、SQLite projection 全为 replay 派生，不是真理）[plan §2、§8.4]；所有持久写入收敛到**单一已校验 dispatch** 这一首期必须建立并守住的不变量 [plan §8.5]；冲突调和保持**恰好三个 dispatch register（`location` / `content` / `life`）作为产品不变量** [plan §4.3、§8.4；conflict §3.1]；Apple 客户端通过**进程内 binding 直接调用 core**（非网络），客户端不拥有任何业务真理 [plan §8.1]。

五条支柱**可进入 CP-0**（Observed，apple-verification §1）：Apple-native 首期路线、Rust `anchor-core` 真理层、Apple 客户端进程内 binding、TextKit mechanism-only、iCloud Drive adapter 只给 core 喂 `SegmentId` / `BlobId` + 字节。在此之上，Stage 1 Apple evidence 给出三条当前基线：binding 产品边界已由用户于 2026-06-07 批准为 **UniFFI DTO / ordinary dispatch + C ABI bytes fast path**；Apple 工程位置 = **用户已批准 Option A `suites/anchor/*`（2026-06-07）**，Option C 仅作实现期 Bun-glob / Xcode 嵌套成本过高时的退路；iCloud Drive runtime 为 **approved default transport with compromise constraints**，可观察 signed container / file package / coordinator / conflict materialization / macOS 10K-100K direct enumeration，但 package-internal segment discovery 不依赖 `NSMetadataQuery`，package-internal placeholder/download 在 macOS local-current probe 中返回 `NSCocoaErrorDomain:4`，explicit manifest conflict resolution 机制可保留 current/conflict/duplicate branches 后清理 adapter-visible conflict；remote `.icloud` placeholder、account-state、iOS large-scale delivery、steady-state segment budget 与 product resolver integration/scale policy 保持为交付 gate。

**显式限定：实现仍需单独授权。** 本结论是契约方向的对齐，不是产品 app 实现许可；plan §10 把「授权后的第一个实现单元」定义为阶段0，§13 保留若干必须用户决策的岔口（package/workspace/Apple project 边界变化、binding 成本不可接受、同步路线产品级选择等）[plan §13]。Stage 1 已在 `suites/anchor/core` 与 `suites/anchor/apple` 落成最小验证工程，并在 repo 外 Xcode probes 验证 signing/runtime；这些 spike 不是产品 app shell，不授权持久应用写入。B14 已批准 iCloud Drive 作首期 default transport，但不授权绕过 delivery gates 或把 Apple probe 升级为产品 app shell。

---

## Platform baseline

平台顺序（产品不变量，全 packet 一致）：

1. **macOS + iOS** 首期。
2. **iPadOS** 第二（在 macOS + iOS 跑通后进入）。
3. **其他平台**最后评估。

依据 [plan §3、§11]。核心判断 [plan §3]：**UI 可以平台化；核心必须平台无关。** Apple 客户端可用 SwiftUI / AppKit / UIKit 与原生系统能力，但 `anchor-core` 的模型、操作语义、规范化、校验、replay、导入导出、合并、同步逻辑**不绑定**其中任何一个 [plan §2]。

首期非 Apple 客户端、独立 Web 客户端、iPadOS 专项优化均为**显式非目标** [plan §9]；它们只能作为 reserved hook 存在（op 信封预留、core ABI / 同步传输边界稳定后再评估 [plan §3、§11]），不得拉回首期 in-scope。

**Core 跨平台可编译性 = CP-1 受保护不变量（区分于延后的 client）。** 在 platform-agnostic Rust core 取向下，**`anchor-core`（含 `anchor-editor-core`）的 wasm32 + android 可编译性**不是延后项，而是 Apple-first 阶段的主动不变量：core 依赖须能编到非-Apple target，确定性 / merge 路径保持 `no_std`-friendly、不碰 OS 线程 / 文件系统 / 时钟 / 浮点；多目标编译（macOS slice + wasm32 + android）作为 CP-1 一道 gate，diff3 / order-key 一致性向量集纳入 wasm target。Stage 1 已有 native / wasm / iOS Simulator 执行 runner、GitHub Actions workflow wiring，并观察到 hosted `pull_request` workflow 通过 Linux native+wasm 与 macOS native+wasm+iOS Simulator jobs；Android execution 因当前本机缺少有效 Android SDK/runtime 且 workflow 未覆盖 Android runtime 仍 open。受保护的是「core 在 Apple-first 阶段保持可复用」，**web / android 的 client 仍延后**到 macOS + iOS 跑通之后 [05-key-decisions.md D36、D37、D19、D26]。

---

## Core responsibility baseline

`anchor-core` 拥有真理层、共享模型与全部不变量 [plan §8.1；conflict §3、§5]：

- **领域模型**：`Note` / `Block` / `Inline` / `PropDef` / `Type` / `Tag` / `BlobRef`。Note 与 Block 是**唯一**的一阶持久对象；公开模型、op target、DTO 字段、CLI 词汇固定为 Note / Block；tree item / cursor / projection row 等只是私有实现 [plan §8.1、§8.2]。
- **规范序列化与修订**：`canonical_serialize`（JCS 风格、确定性、禁 `f64`、数字用规范十进制字符串）；`rev = blake3(canonical_serialize(self))` 覆盖自身规范字段、**排除 `lww`**、非 Merkle hash；`snapshot_revision` 为派生子树 hash 供读缓存 / UI stale / 导出快照标识 [plan §8.3]。
- **校验与规范化**：tree invariants、schema-aware normalization、非法结构最终拒绝。
- **Append-only op-log**：真理层；replay 与物化 Note/block tree。
- **合并语义（冲突模型，全部归 core）**[conflict §3-§7]：
  - 恰好三个 dispatch register `location` / `content` / `life`（产品不变量，**不**扩成 5）[conflict §3.1]。
  - `content` 内部分解为具名 sub-field cell `{body, type_id, props[k], tags[t]}`，每 cell 携 `sub_rev`，是对 per-`(target, register)` guard 的严格泛化、非新增 register 轴 [conflict §3.1-§3.4]。
  - `body` = 确定性 3-way **diff3** merge / keep-both（不相交 hunk auto-merge，重叠或 base 不可恢复则 keep-both，**永不**静默 LWW），并对合并文本重 clamp UTF-16 mark offset [conflict §5.3、§6.1]。
  - `props[k]` / `type_id` = causality-aware per-cell LWW（一侧因果支配取该侧，仅真并发回退 wall-clock）[conflict §5.3、§6.6]。
  - `tags[t]` = OR-Set add-wins，复用 `op_id` 作 add-identity，`tag_remove` 携 `observed_adds`，存储 watermark-bounded GC [conflict §5.3、§6.7]。
  - `life` = 时钟无关优先级 lattice（`active < {trashed, archived} < deleted`），非级联、派生子树可见性（root-reachability over merged tree）、终态 `deleted` 仅经显式 `trashed → deleted` 且 `dominates_frontier` 因果支配编辑可达；dispatch 拒绝直接 `active → deleted` [conflict §5.4、§6.3]。
  - 全局全序键 `T = (hlc.wall, hlc.logical, hlc.device, actor, op_id)`，保证无 tie、replay 为纯 fold、跨 replica 逐字节一致 [conflict §4]。
  - **content-addressed journal identity**：`note_id = blake3("journal:" ‖ vault_id ‖ calendar_date)`，同 vault 同日恒为同一 Note（去重是**身份不变量**，by construction，无运行时去重检查）；普通 Note 仍铸造随机 nanoid；这是已采纳的承诺模型 [plan §4.3、§8.2；conflict §6.9、§13.1 #9]。
- **HLC / LWW** 机制与上述 merge 规则。
- **Replay / materialization**：从空状态 replay 重建同一棵 materialized tree。
- **SQLite projection**（或等价本地 projection）：派生、可重建、**不是真理归属方**、不进入同步 [plan §8.1、§8.4]。
- **导入 / 导出 + mirror queue + freshness**：Markdown importer、`.json`/`.md` exporter；mirror 是 post-commit job 写出的有损派生物、记录 freshness，mirror 写失败只影响 freshness/diagnostics、不回滚 op-log [plan §8.6]。
- **单一已校验 dispatch**：首期要建立并守住的不变量——每条持久写入路径都调用「append 前校验」的 core 私有 helper，对 core 写入点 grep 必须能证明 [plan §8.5]。
- **`OpSyncPort` trait**：传输无关（list / pull / push segment + blob，仅 `SegmentId` / `BlobId` + 字节，**不含任何云类型**）[plan §8.1]。
- **DTO / schema envelope owner**：Rust core **拥有** DTO 词汇与版本（schema version envelope）；Swift binding 层与 CLI 只**消费** generated/projection DTO，不得独立定义 `Note` / `Block` / op / validation-error 语义（Observed-supported，apple-verification §3.4）[plan §8.1]。

> `anchor-editor-core` 是 `anchor-core` 内部的无 UI 编辑语义模块，**非独立 crate/package**；其职责与边界见下文 Editor baseline 与 Responsibility boundary matrix [plan §8.1]。

---

## Apple client baseline

Apple 客户端拥有原生产品表面，且**不复制 core 领域规则**——它可以预检明显 UI 约束，但 **core 校验始终是权威关卡** [plan §8.1]：

- 原生窗口、导航、菜单、输入、拖拽、快捷键、分享、文件、安全权限、系统外观（macOS / iOS / iPadOS）[plan §8.1、§7.1]。
- 原生编辑器 surface、原生 Settings（主题 / 字体 / 排版，语义见 [plan §5.1、§7.2]）。
- 原生离线存储位置与文件访问。
- **实现 `OpSyncPort`**：首期 transport = **iCloud Drive 文件适配器** —— `NSFileCoordinator` 协调读写、`.icloud` placeholder 下载、`NSMetadataQuery` 发现远端 segment，把**已下载已协调的字节**喂给 core；**core 永不出现 CloudKit / iCloud 类型** [plan §8.1、§3、§8.4]。
- 对 core DTO 的展示、错误呈现、交互状态。
- 一等呈现失败态（unsupported / newer schema / 校验错误 / replay conflict / stale mirror / blob 缺失 / sync pending / not-yet-downloaded / over-quota / iCloud unavailable）[plan §6.8]。

**Apple 编辑器 adapter**（属客户端侧、非 core）：把 `NSTextView` / `UITextView` / TextKit / 原生键盘事件转换为 `EditorIntent`，把 `EditorPatch` 转换为原生 view model 更新 [plan §8.1]。详见下文 Editor baseline。

Codex 已确认 Apple 客户端是 native shell、不拥有 business truth（Observed，apple-verification §1）；具体 Apple 工程位置、target、bundle、entitlement、签名行为见下文 Apple build baseline 与 Sync baseline。

---

## Apple build baseline

Apple 构建表面的证据态：工具链环境 **Observed**；Stage 1 spike build **Observed**；repo-local product Anchor app target build **Not run**。

- **Toolchain 可用 = Observed（apple-verification §2.2、§4.1）。** 默认 `xcode-select` 指向 `/Library/Developer/CommandLineTools`，该默认态下 `xcodebuild` 失败；但用一次性命令前缀 `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` 观察到 Xcode 26.5（Build 17F42）、macOS SDK 26.5、iOS SDK 26.5、iOS Simulator SDK 26.5，以及 iOS 26.2 / 26.4 / 26.5 模拟器设备；`iPhone 17` 模拟器可 bootstatus 到 Finished 并 shutdown。SwiftPM（Swift 6.3.2）可用。
- **Apple build surface 关键路径 = Observed（apple-verification §2.4、§4.1）。** SwiftPM library 可在 Xcode 26.5 下针对 `platform=macOS` 与 `generic/platform=iOS Simulator` 编译同源 `NSTextView` / `UITextView` adapter 与 iCloud adapter API；one-slice macOS staticlib XCFramework 创建成功。
- **Stage 1 spike build = Observed（17-apple-binding-report.md / 18-textkit-adapter-report.md / 19-icloud-drive-report.md / 28-binding-async-wrapper-report.md / 29-binding-external-consumer-report.md / 30-binding-binary-target-report.md / 34-dto-error-vocabulary-report.md / 35-binding-wrapper-binary-package-report.md / 36-uniffi-generated-async-report.md / 40-uniffi-iphoneos-packaging-report.md）。** `anchor-core` builds for macOS / iOS / iOS-sim; C ABI and UniFFI wrappers create three-slice XCFrameworks; SwiftPM wrapper imports; TextKit and iCloud adapter compile surfaces pass; Swift wrapper actor async surface passes macOS Release strict concurrency runtime and iOS Simulator Release strict compile; UniFFI generated async surface passes macOS runtime, iOS Simulator compile/link, and iPhoneOS standalone `arm64` compile/link; repo-external SwiftPM path consumer imports `AnchorCoreBindings` and runs the async surface; repo-external binary-target consumer imports raw C ABI XCFramework and runs fixture lookup; repo-external wrapper binary package consumes `AnchorCoreBindings` over a binary XCFramework and runs fixture/dispatch/error/segment truth; core-owned `TransactionResult` / `ValidationError` vocabulary is frozen as a structured envelope plus exactly three core validation codes. Repo-local product Anchor app target / scheme remains outside this spike and is **Not run**.
- **Rust Apple targets = Observed（17-apple-binding-report.md）。** `aarch64-apple-darwin`、`aarch64-apple-ios`、`aarch64-apple-ios-sim` are installed on this machine. CI/dev machines require explicit target checks.
- **binding host demo = Observed（apple-verification §2.4、§5.1）。** macOS 上 Rust staticlib 经 C ABI 被 SwiftPM executable link 并实际调用成功；项目内 `uniffi 0.31.1` 可生成并运行 minimal record/bytes Swift binding。详见 Binding baseline。

> 本机无 `xcodegen` / `tuist` / Ruby `xcodeproj`，`xcodebuild` 无 create-project 子命令；自动生成 `.xcodeproj` 须 Apple 工程被批准创建后另行解决（apple-verification §2.2）。任何 Apple project / workspace / target / bundle id / entitlements 的创建均 **Needs user approval**。

---

## Binding baseline

继续把 Rust core 作为平台无关核心是首选；binding 机制候选不是四选一，而是组合方案（apple-verification §5.1）：

- **Recommended path = UniFFI（structured DTO / error / normal dispatch）+ generated Swift + Rust static libraries 打成 XCFramework + 由 local SwiftPM wrapper / binary target 消费；bulk segment/blob bytes 使用 C ABI fast path**（17-apple-binding-report.md）。
- **可行性证据 = Observed（apple-verification §2.4、§5.1、§5.3；17-apple-binding-report.md；28-binding-async-wrapper-report.md）：** C ABI + Rust staticlib + SwiftPM host path 实际跑通；UniFFI 0.31.1 经项目内 `cargo run -p uniffi-bindgen-swift` 生成并运行 minimal record/bytes Swift binding；Stage 1 完成 Anchor DTO / fixture / `TransactionResultSummary` / typed `ValidationError` / segment bytes / blob bytes full round-trip，C ABI 与 UniFFI 三 slice XCFramework 均创建成功，generated Swift synchronous smoke 通过 Swift 6 strict concurrency + warnings-as-errors；SwiftPM wrapper 层 `AnchorCoreClient` actor async surface 通过 macOS Release strict concurrency runtime 与 iOS Simulator Release strict compile。
- **C ABI bytes fast path = Recommended（17-apple-binding-report.md）。** C ABI 64MB bytes path 约 38.22ms / max RSS 约 96MB；UniFFI 64MB 约 145.22ms / max RSS 约 267MB。DTO / ordinary dispatch 走 UniFFI，bulk bytes 走 C ABI。
- **Caveat（必须随 binding 决策携带）：** Swift wrapper actor async surface 已证可行；core-owned final DTO/error vocabulary 已冻结；complete wrapper binary package mechanism floor 已证可行；UniFFI generated async surface 已过 macOS runtime + iOS Simulator compile/link + iPhoneOS standalone `arm64` compile/link 机制下限；SwiftPM binary checksum mechanism 已证可行；先前 iPhoneOS `arm64e` standalone link failure 是 target 与 Rust `aarch64-apple-ios` slice 不匹配，不再作为 `arm64` iPhoneOS 机制 blocker；signed app bundle、physical-device install/runtime、release build/CI/fresh-machine 复现与 artifact signing/notarization/provenance policy 仍未关闭。
- **DTO 约束（Recommended，apple-verification §5.3）：** 避免在 FFI 边界暴露高度递归/泛型 DTO；`TransactionResult` / `ValidationError` / `SyncStatus` / `MirrorStatus` / `EditorPatch` 保持 structured，不为 binding 便利而 collapse 成 strings。
- **Binding 机制作为产品分发边界冻结 = Approved（B4，2026-06-07）。** 批准形状为 `UniFFI DTO / ordinary dispatch + C ABI bytes fast path`；Swift wrapper actor async surface、UniFFI generated async mechanism floor（含 iPhoneOS standalone `arm64` compile/link）、repo-external SwiftPM path consumer、raw C ABI binary-target import、complete wrapper binary package、SwiftPM checksum mechanism、core-owned final DTO/error vocabulary 已有 Stage 1 机制证据；release implementation gates 为 signed app-bundle/device runtime integration, release build/CI/fresh-machine 复现与 artifact signing/notarization/provenance policy。

---

## CLI baseline

CLI 是**本地结构化命令契约（NOT MCP）**，与 Apple binding 共享同一 dispatch 入口、同一 op registry、同一 DTO 词汇 [plan §8.1]：

- **`apiVersion` 信封**的稳定命令。
- **vault 解析**：`--vault` / `$ANCHOR_VAULT` / 向上发现。
- **全局 I/O 契约**：`--format tsv|json`、`--fields`、`--limit`、`--count`。
- **固定退出码**：`0` ok、`1` usage、`2` not_found、`3` conflict、`4` blocked、`5` vault_not_open、`6` io [plan §8.1]。
- **typed blocked 错误（exit `4` 下的具名原因）**：例如 local-only vault 被误放入 iCloud → error code `local_only_vault_in_ubiquity` + machine-readable payload（`vaultPath` / `sync` / `detectedContainerKind` / `recommendedActions`）；CLI 不自动修复、不写配置、不创建 iCloud container、不改 op-log [05-key-decisions.md D21a]。
- **结构化 Note / Block 读取**；**写入一律通过 core dispatch**；面向 replay / mirror / schema / 校验状态的**诊断命令** [plan §8.1]。
- **公开词汇以 Note / block op 为对象**；net-new 动词：**MOVE**（Note reparent 或 block reparent + fractional order）、**EXPORT / IMPORT**、**TYPE**（PropDef / Type schema）、PropDef-backed **PROP**、真实 **DELETE / tombstone** [plan §9]。

`anchor serve` + `/rpc` 仅是**可选 localhost 开发 / 测试传输**，共享同一 op registry / DTO / dispatch，**不是产品同步通道** [plan §8.1]。

> 冲突模型新增的 `ConflictRecord` 与 `resolve` / `restore` / `restore_order` / `restore_subtree` 的公开 CLI/DTO 面**放二期（Phase 2）**——用户已于 2026-06-07 决定。Phase 0 / 首期**不暴露**此 CLI schema，只在 op-envelope 层预留所需字段（`05-key-decisions.md` D24，含 `restore` op_kind / `observed_adds` / `dominates_frontier` 等）；因 `ConflictRecord` 是**派生读模型**（replay 重算、非持久 op），二期暴露**无 op-log 迁移成本**。首期 CLI 的冲突可见面仅为既有退出码 `3`（conflict）[conflict §9、§12、§13.1 #13；05-key-decisions.md D31]。

---

## Sync baseline

- **op-log 是真理**；物化 state、`.json`/`.md` mirror、SQLite projection 都是 replay 派生，**mirrors + SQLite 不进入同步** [plan §8.4；conflict §10]。
- **同步 / 提交单元 = 不可变 per-device op-segment 文件**（`.anchor/operations/<device_id>/<seq>.seg`，每设备独占命名空间、一封一密、**永不修改**）；选不可变 segment 而非单增长日志，是因为 iCloud Drive 无 delta 同步、任何改动整文件重传，不可变 segment 只上传一次 [plan §8.4]。
- **`OpSyncPort` 传输无关**：仅 `SegmentId` / `BlobId` + 字节，不含任何云类型；任何适配器只负责传输 / 持久化，**不拥有 merge 语义** [plan §8.1、§8.4、§13]。
- **iCloud Drive vault file package 必须声明符合 `com.apple.package` 的 exported document type / UTType（Observed-supported，apple-verification §7.1；19-icloud-drive-report.md）。** Vault/package discovery 使用 package-level metadata；package-internal segment discovery 使用 file-coordinated direct enumeration，不能依赖 `NSMetadataQuery` 枚举 package internals。
- **iCloud Drive 首期**（零配置、core 纯文件 I/O、无 CloudKit 代码）。Codex 已确认 iCloud adapter 的 Foundation API 编译面对 macOS / iOS simulator 可行（Observed：`ICloudAdapterProbe` 编译通过；无 entitlement CLI 下 `url(forUbiquityContainerIdentifier:)` 返回 nil、`NSMetadataQuery` / `NSFileCoordinator` API 可用，apple-verification §7.1）。
- **iCloud Documents / ubiquity runtime = approved default transport with compromise constraints（apple-verification §2.6、§7；19-icloud-drive-report.md；26-icloud-conflict-policy-floor-report.md；32-ios-device-icloud-launch-report.md；33-icloud-placeholder-report.md；37-ios-device-icloud-rerun-report.md；39-icloud-conflict-resolution-report.md；42-ios-device-icloud-locked-rerun-report.md；user approval 2026-06-07）。** 用户已开通付费 Apple Developer Program（Individual）team（`isFreeProvisioningTeam=0`）；signed iPhone and macOS probes returned non-nil ubiquity containers, validated package type id, coordinated read/write, 1024-file write subset, macOS 10K/50K/100K package-internal direct enumeration, package-level metadata discovery, package-internal metadata miss, and offline `NSFileVersion` conflict materialization. Mutable manifest conflict surfaces include unresolved `NSFileVersion` conflicts and duplicate `manifest *.json` materialization; the minimum adapter policy is surface current/conflict/duplicate branches, preserve them, block manifest-derived frontier/GC/cursor decisions, and never auto-resolve. Explicit current-winner resolution has been observed preserving current/conflict/duplicate branches into an archive, moving the duplicate manifest out of the live directory, and reaching `adapter_status=ok_no_conflict` on a subsequent policy read; same-run `NSFileVersion` metadata may lag destructive calls, so adapters must re-check before advancing. 2026-06-10 physical iPhone rebuild/install chain passed with CloudDocuments entitlements, but runtime launch remained blocked by locked device state across three launch attempts. macOS placeholder probe observed loose iCloud file as ubiquitous/current while package-internal segment remained non-ubiquitous and returned `NSCocoaErrorDomain:4` for evict/start-download. Remote `.icloud` placeholder, signed-out / over-quota, physical iOS runtime after unlock, iOS large-scale delivery, local-only path edge cases, product resolver UX/core integration, and steady-state segment budget remain delivery gates.
- **单附件上限 = 50MB（D17，对齐 CloudKit `CKAsset`）。** 由 dispatch 写前校验、以独立失败态拒绝超限。50MB 同时兼容首期 iCloud Drive / 本地与二期 CloudKit `CKAsset`（archived CloudKit Web Services 限 `CKAsset` field 最大 50MB）（用户 2026-06-07 定）。
- **CloudKit / CKSyncEngine 后置二期可选（路线已获用户批准 B8，2026-06-07，仍为二期实现）**：通过同一 `OpSyncPort` 接入，不成为真理归属方，**core 永不出现 CloudKit record schema**；op 形状须在任何 CloudKit 记录落地前冻结（apple-verification §7.3）。
- **跨平台 / Web 用中立 object-store（S3 / WebDAV）适配器，非 iCloud**（iCloud 无 Web API）[plan §3、§8.4、§9]。
- **local-only 语义（硬规则，用户 2026-06-07 firming）**：**`sync = "none"` 的 vault 严禁置于任何 iCloud ubiquity container 下**；放非 ubiquity 目录、标 `NSURLIsExcludedFromBackupKey` 排除备份、core 不挂任何 adapter、唯一出网点 `OpSyncPort::push` 受 adapter 门控可 grep 审计；**vault-open 强制断言路径不在任何 ubiquity container 下，否则拒开报警**；**`synced → local-only` 不可逆**（已离开设备的字节无法收回）[plan §8.4；05-key-decisions.md D21]。
- **local-only 误放入 iCloud = blocked open（D21a）。** 用户绕过 Anchor 手动把 `sync = "none"` vault 挪进 ubiquity container 后，Anchor **不自动转同步**，而识别为 **blocked misplacement**：拒开、不挂 `OpSyncPort` adapter、不上传 / 拉取 / merge，返回 typed `local_only_vault_in_ubiquity`（CLI exit 4、payload 含 `recommendedActions = ["move_back","convert_to_icloud_sync"]`），提供 **Move Back** / **Convert to iCloud Sync** 两动作。**隐私边界**：OS 可能已上传，故只声称「Anchor 不从 iCloud 管理位置打开 / 续写 local-only vault」，**不**声称「字节绝不离开设备」[05-key-decisions.md D21a]。
- **causal-stability watermark 门控 compaction**：watermark = 所有已知设备各自已确认 HLC frontier 的 `min`（非日历 epoch）；门控 op-log 截断进快照、loser-payload / trashed 节点 / OR-Set observed-add id 的硬删；**硬规则：绝不截断属于 open `ConflictRecord` 成员的 op**（含祖先删除 / 后代编辑登记的后代 content op）——把「无静默丢失」直接绑到 compaction [conflict §10、§13.1 #6；plan §8.4]。retention 含四 horizon（conflict / replay-safety / audit / time-travel，D14/D38）：watermark 稳定**不是**硬删 loser-payload / trashed / observed-add 的充分条件——< watermark 只可 truncate-to-snapshot / archive（保持 reachable），hard-delete 仅在 time-travel/audit horizon 之下且经显式 excise；7-day conflict horizon 仅是 UI 呈现、**绝不作硬删依据**；time travel（D38）反向约束硬删；stale-peer 退出规则使 watermark 可推进（D14/D38；apple-verification §7.5）。
- **无 Anchor 自有云服务** [plan §2、§8.4]。

> **加密信封边界（D22，已锁定 Phase-0 范围）：** 首期不实现 zero-knowledge；阶段0 锁定 `OpSyncPort` 与持久化之间的 **encryption envelope 缝**（首期 no-op / pass-through，日后接客户端加密层不迁移 op-log）+ **non-ZK 文案**，**绝不对中立 object-store 暗示 zero-knowledge**；完整 ZK / 密钥分发延后。**Mirror 目录组织（D05，已批准 2026-06-07）：** 人类可读路径 + 不纳入版本库（默认锁定）。**segment 大小与提交节奏、compaction GC 保留窗口与 manifest / cursor 协调**仍为 Phase-0 / Stage 1 收口项；其中**不可变 segment 文件**与**任何可变 manifest** 的区分须明确。Stage 1 证明 offline fork 可 materialize `NSFileVersion` unresolved conflict；product conflict policy floor 是 surface / preserve / block / no-auto-resolve；explicit current-winner resolution 机制已证实可先归档 current/conflict/duplicate branches 再清理 live conflict surface，但 product resolver UX/core integration 与 scale context 仍是 gate。**Sync 路线作为首期产品选择（B14）已由用户批准（2026-06-07）；local-only「sync=none 严禁置 iCloud」已由 D21 firm。** segment 大小 / batching policy / 长期 segment-file budget 须按 op-count 与 synced-segment-file-count 两轴分离实测（排除每 op 一 segment，D06/D13）；manifest 默认取 per-device immutable cursor；**iCloud Drive 作首期 default transport 的交付 gated on delivery gates**（remote placeholder、account states、iOS large-scale delivery、steady-state segment budget、product resolver integration at scale；no-go-like delivery failure triggers design reset, not silent CloudKit migration）。macOS package-internal placeholder/download 当前证据为 `NSCocoaErrorDomain:4`，adapter 必须保留 direct enumeration/read 路径，不得依赖 package-internal `startDownloadingUbiquitousItem` 成功。详 12-stage-1-spike-plan.md §4/§6、19-icloud-drive-report.md、26-icloud-conflict-policy-floor-report.md、33-icloud-placeholder-report.md、39-icloud-conflict-resolution-report.md。

---

## Editor baseline

**`anchor-editor-core` 是 `anchor-core` 内部的无 UI 编辑语义模块，NOT a separate package/crate** [plan §8.1]。它只拥有可移植的 selection / intent shaping / patch 映射；持久化、schema 校验、op 创建、merge、最终非法结构拒绝**唯一边界是 `anchor-core::dispatch`** [plan §8.1]。

`anchor-editor-core` 拥有的类型与职责 [plan §8.1]：

- `EditorSnapshot`：面向编辑器的 Note / block tree 投影。
- `BlockProjection`：block 到可编辑 / 嵌入 / 装饰块的投影。
- `InlineRun`：文本 + typed range marks 的显示与命中测试片段。
- `EditorSelection`：文本选择 / block 选择 / 嵌入编辑器选择的可移植表示。
- `EditorIntent`：insert text、replace range、split block、merge backward、exit-container-on-empty、indent / outdent（reparent）、move block、transform block、apply mark、insert code block、paste fragment。
- `EditorPatch`：dispatch 接受事务后返回给平台 adapter 的最小视图更新。
- `TransactionResult`：changed ids、selection hint、validation error、new target/register revisions、projection freshness、mirror freshness、stale snapshot conflict。
- 行为职责：portable selection、intent shaping、选择提升 / 降级规则、paste fragment shaping、跨 block 文本编辑**拆分建议**、platform patch 生成、undo intent 映射。

**归 `anchor-core::dispatch`（不归 editor-core）：** tree invariant、schema-aware normalization、op creation、merge、最终非法结构拒绝 [plan §8.1]。

**Apple 编辑器 adapter**（客户端侧）：把 `NSTextView` / `UITextView` / TextKit / 原生键盘事件 → `EditorIntent`，把 `EditorPatch` → 原生 view model；负责渲染、文本 / block 选择、intent 提取、代码 block 局部编辑器、表格交互 [plan §8.1]。

**TextKit = mechanism-only（Observed，apple-verification §6；27-textkit-runtime-floor-report.md）。** Apple 文档把 TextKit 定位为 text storage/layout infrastructure，匹配 Anchor 对其 input / layout / selection / hit-testing / IME surface 的角色。Codex 已证：`NSTextView` / `UITextView` adapter 编译面在 macOS + iOS simulator 通过；macOS `NSTextView` runtime 可设 UTF-16 selection、layout manager / text container 可用、`UndoManager` semantic undo closure 可执行（`textkit:undo_events=semantic-inverse-intent`）；controlled macOS probe 可观察 IME marked-text commit 到 `EditorIntent.insertText`、hit-testing insertion index、以及 `allowsUndo=false` 下直接 buffer mutation 不被 `textView.undoManager?.undo()` 回滚。**TextKit / `NSTextView`-`UITextView` / `NSRange`-`NSTextRange` / 平台 selection / view identity / 滚动-焦点-IME state 只作输入、排版、显示、命中测试机制，永不作持久化或文档模型**；`anchor-editor-core` 同样不拥有它们 [plan §8.1、§4.2、§13]。Undo 接 `NSUndoManager`，但 undo 动作 dispatch inverse intent / op，不直接改 TextKit buffer [plan §8.1]；若 undo 能在不产生 core op 的情况下改 TextKit buffer，则 editor boundary 失效（apple-verification §6.4）。

**TextKit runtime status = partial observed（18-textkit-adapter-report.md；27-textkit-runtime-floor-report.md）。** Stage 1 covers macOS UTF-16 emoji/ZWJ/combining/CRLF offset smoke, layout, selection, semantic undo through adapter-owned `UndoManager`, controlled IME marked-text commit mapping, TextKit hit-testing insertion index, controlled direct-buffer undo suppression, and iOS simulator compile. Real app view hierarchy, input event capture, accessibility range mapping, product responder-chain undo suppression, `UITextView` runtime IME/accessibility behavior, and full patch replay over splitting/moving views remain runtime gates.

**首期选择能力**：单块文本选择 + block 选择 + 嵌入编辑器选择。**跨 block 连续文本选择 = spike-only，非首期 UI 能力（apple-verification §6.3、§8.1）。** editor-core 可对 cross-block edit intent 做 shape/split 建议，但在 spike proof 前**不**承诺 polished continuous native selection；其难点（跨多 text view 连续选择、accessibility range、product IME composition edges、跨多 buffer undo grouping、选择横跨 disappearing/splitting blocks 时的 patch replay）留 Stage 1。

**UTF-16 边界（apple-verification §8.1 D18；27-textkit-runtime-floor-report.md）。** 行内 offset 对外以 UTF-16 code unit 表达（对齐 Apple TextKit / Swift String bridging）为合理 Apple 边界；Stage 1 已观察 Swift-side emoji / ZWJ / combining mark / CRLF / mixed fixture 计数与 IME marked-text commit offset。core 内部存储单位与 Swift/Rust binding 边界的最终换算仍须冻结并验证。

**diff3 + fractional order-key 只在 Rust core 执行（Recommended，apple-verification §1、§8.4）。** 不由 Swift / TextKit 各自实现；同一编译产物经 binding 调用 → 跨 macOS / iOS 逐字节一致 by construction。fixture 的「双端逐字节一致」证据来自 Rust core consistency vectors，**不**来自 TextKit/Swift 专属实现；native / wasm / iOS Simulator execution runner 与 GitHub Actions workflow wiring 已落地，hosted Linux native+wasm 与 macOS native+wasm+iOS Simulator jobs 已通过，Android execution 仍 open（见 `06-fixture-set.md` F23 / F26；`31-cross-target-ci-wiring-report.md`；`41-hosted-cross-target-ci-report.md`）。

---

## Responsibility boundary matrix

下表澄清五个责任面之间的边界——谁拥有什么、谁被禁止拥有什么。依据 [plan §8.1、§8.4、§8.5；conflict §3、§5、§6、§9；apple-verification §1、§3.4、§5、§6、§7]。

| 责任面 | 拥有（owns） | 禁止拥有（forbidden from owning） |
|---|---|---|
| **`anchor-core`** | Note/Block/Inline/PropDef/Type/Tag/BlobRef 模型；`canonical_serialize` + blake3 `rev`；校验 / 规范化；append-only op-log + replay/materialization；三 register（location/content/life）merge 全部规则（content sub-field cell、diff3 body、OR-Set tags、causality-aware props/type_id LWW、life lattice、全序 `T`、content-addressed journal identity）[conflict §3-§6]；diff3 + fractional order-key 算法的**唯一**执行处（跨平台逐字节一致 by construction）；SQLite projection（派生、可重建）；import/export + mirror queue + freshness；**单一已校验 dispatch**；`OpSyncPort` trait（仅 id + 字节）；**DTO 词汇 + 版本 + schema envelope owner** [plan §8.1] | 任何 UI / 平台框架（SwiftUI/AppKit/UIKit）作为语义拥有者 [plan §9、§13]；TextKit/NSRange/view identity 作为持久化 [plan §4.2、§8.1]；任何云类型（CloudKit/CKRecord/CKAsset/zone/token、iCloud account state、`NSFileCoordinator`/`NSMetadataQuery`/`.icloud` placeholder）[plan §8.1、§8.4、§13；apple-verification §7.2]；diff3/order-key 在 Swift/TextKit 侧的另一份实现（apple-verification §8.4）；传输 / merge 之外的设备本地冲突 state（冲突态是派生读模型，非持久 sidecar）[conflict §2 原则7、§9] |
| **`anchor-editor-core`**（core 内部模块，非独立 crate/package） | portable `EditorSnapshot`/`BlockProjection`/`InlineRun`/`EditorSelection`/`EditorIntent`/`EditorPatch`/`TransactionResult`；selection promote/demote；paste-fragment shaping；跨 block 文本编辑**拆分建议**；platform patch 生成；undo-intent 映射 [plan §8.1] | tree invariant / schema-aware normalization / op creation / merge / 最终非法结构拒绝（全归 `anchor-core::dispatch`）[plan §8.1]；TextKit / NSTextView / NSRange / 平台 selection / view identity [plan §8.1]；持久化真理；polished cross-block continuous native selection 作首期承诺（spike-only，apple-verification §6.3） |
| **Apple 客户端 + 编辑器 adapter** | 原生产品表面（窗口/导航/菜单/输入/拖拽/分享/文件/外观/Settings/原生编辑器 surface/原生存储位置）；TextKit/NSTextView/UITextView 事件 → `EditorIntent`、`EditorPatch` → 原生 view model；**实现 `OpSyncPort`**（首期 iCloud Drive：NSFileCoordinator/.icloud/NSMetadataQuery + ubiquity container lookup / placeholder/download state / quota/account state / user-visible sync state → 字节给 core）[plan §8.1；apple-verification §7.2] | core 领域规则的副本（可预检明显 UI 约束，但 core 校验是权威）[plan §8.1]；任何持久写入的非 dispatch 路径（所有写入经 core dispatch）[plan §4.3、§13]；把 TextKit/selection/view identity/`NSAttributedString` attributes 当作模型或持久化 [plan §13；apple-verification §6.2]；business truth [plan §4.3] |
| **CLI** | `apiVersion` 信封；vault 解析（`--vault`/`$ANCHOR_VAULT`/向上发现）；`--format tsv\|json`/`--fields`/`--limit`/`--count`；固定退出码（0/1/2/3/4/5/6）；结构化 Note/Block 读取；net-new MOVE/EXPORT/IMPORT/TYPE/PROP/DELETE；诊断命令 [plan §8.1、§9] | 任何绕过 core dispatch 的写入（写入一律通过 dispatch）[plan §8.1]；独立于 core 的 DTO 词汇（消费 core DTO，不独立定义 Note/Block/op/validation-error 语义，apple-verification §3.4）；MCP 语义（CLI 是本地结构化命令契约，**NOT MCP**） |
| **`OpSyncPort` 适配器**（core 之外按平台实现） | segment + blob 的 list/pull/push 传输 / 持久化（仅 `SegmentId`/`BlobId` + 字节）[plan §8.1、§8.4] | merge / 冲突调和语义（全归 core）[plan §8.4、§13]；向 core 泄漏任何云 / 文件协调类型（CloudKit/CKRecord/CKAsset/zone/token、iCloud account state、`NSFileCoordinator`/`NSMetadataQuery`/`.icloud` placeholder、record shape）——**core 永不出现 CloudKit / iCloud 类型**，适配器只把已下载已协调的字节交给 core [plan §8.1、§8.4、§13；apple-verification §7.2]；成为真理归属方（op-log 是真理）[plan §8.4] |

**边界主轴（一句话）：** 真理、模型、校验、merge、op 创建、DTO/schema 所有权、diff3/order-key 执行唯一归 `anchor-core`（含其内部 `anchor-editor-core` 仅做 selection/intent/patch 映射）；Apple 客户端、CLI、`OpSyncPort` 适配器都是 dispatch 的外壳，表达意图 / 呈现 / 传输字节，**都不拥有业务真理** [plan §4.3、§8.1、§8.5；apple-verification §1]。
