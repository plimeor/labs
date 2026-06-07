# Anchor Phase 0 → CP-0 — 用户批准稿（Approval Packet）

日期：2026-06-07
状态：**workbench artifact** —— 非公开接口契约。本文件是 Phase 0 / Stage 1 当前面向用户审阅、可逐条勾选批准的整合稿。它是 packet 的对外封面，所有断言由同目录四份责任文件与 Stage 1 reports 支撑，本文件不重复其细节、只承载可批准结论与勾选清单。

**CP-0 status：Approved。Approved date：2026-06-07。Stage 1 integration status：current.** 全部 CP-0 核心检查点（A1–A9）与边界项（B1–B16）已批准，B6 据 D22 firm 锁定。A2 / B4 的 Apple binding 产品边界已由用户于 2026-06-07 批准为 `UniFFI DTO / ordinary dispatch + C ABI bytes fast path`。B14 的「iCloud Drive 作首期默认 transport」已由用户于 2026-06-07 批准；批准形状为 **approved default transport with compromise constraints**。结构化摘要见 §0，逐条勾选证据见 §8，当前 Stage 1 入口见 `../2026-06-07-stage-1/stage-1-integration-report.md`。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本 workbench 目录**不授权**任何 package / workspace / app / 生成 lockfile 改动。具体而言，本文件**不**授权创建 `suites/anchor`、`apps/anchor-*`、`packages/anchor-*`、顶层 `anchor-apple/`、任何 Xcode project / workspace、Swift Package、Rust crate、entitlements、bundle id、iCloud container，也**不**授权写 Rust / Swift / TS 代码或改动 `package.json` / `bun.lock` / 任何 `tsconfig` / workspace 配置。本文件唯一落盘动作就是它自身。权威且稳定的 CLI / API / schema / file-format 契约在实现后归 `anchor-core` 包 README；本文件只是可批准 CP-0 的封面。

> **引用约定：** `[plan §X]` 指 `docs/plans/2026-06-06-anchor-apple-native-note-workbench.md`；`[conflict §X]` 指 `docs/plans/2026-06-06-anchor-conflict-resolution-model.md`；Codex 验证证据指同目录 `apple-verification.md`。同目录姐妹文件以相对名引用：`contract-baseline.md`、`key-decisions.md`、`fixture-set.md`、`stage-1-spike-plan.md`、`project-layout-options.md`。

> **标注词汇（全 packet 一致）：** **Observed**（Codex 本机实跑或官方文档直接支持）、**Recommended**（建议的目标状态 / 命令骨架）、**Needs user approval**（触 workspace / package / Apple project 边界、新公开 CLI schema、加密所有权、付费 Apple Developer Program、entitlement / 容器、plan §13 暂停条件）、**Needs follow-up gate**（Stage 1 后仍需产品 runtime、CI、scale、account-state 或用户签署）、**Blocked**（当前环境无法验证，被硬门控）、**Not run**（未执行项，不得当已验证事实）。

---

## 0. Final approval summary（最终批准摘要）

> 本节是 CP-0 的可执行结论摘要；逐条批准证据见 §8，完整论证见同目录责任文件。所有落地动作仍受第 8/9 节门控，本 packet 不自行创建任何东西。

- **CP-0 status：** Approved。
- **Approved date：** 2026-06-07。
- **Approved project layout：** Primary = Option A `suites/anchor/*`（内层 `core` = Rust crate `anchor-core` 含 `anchor-editor-core` module、`cli` = Rust bin、`apple` = Xcode workspace macOS+iOS targets、`fixtures/`、嵌套 `Cargo.toml`）；Fallback = Option C 顶层 glob 外 `anchor-apple/` + core 仍留 `suites/anchor/core`（仅实现期 Bun glob 容忍度 / Xcode 嵌套成本过高时启用）。绝不为适配 glob 添加 placeholder `package.json`（第 3 节；key-decisions.md D02）。
- **Approved contract baseline：** 以 contract-baseline.md 的 Strongest conclusion + 五责任面 Responsibility boundary matrix 为准——Note 原生、Apple 原生优先、平台无关 Rust `anchor-core`；append-only op-log 真理层；单一已校验 dispatch；恰好三 dispatch register（location/content/life），content 内部分解 sub-field cell `{body, type_id, props[k], tags[t]}`；冲突模型（body 确定性 diff3 / keep-both、props/type_id causality-aware LWW、tags OR-Set add-wins、life 时钟无关 lattice、全序 `T`、journal 内容寻址身份）；Apple 客户端 / CLI / `OpSyncPort` 适配器均为 dispatch 外壳、不拥有业务真理；DTO + schema envelope 归 core（第 2 节；contract-baseline.md）。
- **Decisions frozen for CP-1：** 平台路线（A1）；core / editor / 客户端↔core 传输 / CLI / sync 责任边界（第 2 节）；冲突模型全部规则与 op-envelope 完整字段预留（D24，非协商；conflict §7.1）；journal 内容寻址身份与「一日一 journal」取舍（B10/D08）；顶层 Note 表示 / Calendar 排序 / journal 默认 parent / trash-restore 边界（B11/D07–D09）；`life` 4-state lattice + 终态可达 + 非级联（D10/D20/D27）；sub_rev stale guard（D11）、同步 ingestion（D12）、提交节奏（D13）；diff3 + order-key 跨设备一致性 gate（D19/D26）；snapshot_revision canonicalization（D30）；附件 cap = 50MB 对齐 `CKAsset`（D17/B8）；字体来源 = 内置 JetBrains Mono + 系统字体（D18a/B7）；mirror 组织 = 人类可读路径 + 不纳入版本库（D05/B12）；vault file package `com.apple.package` UTType（D34/B13）；local-only 防误放硬规则 + blocked-open（D21/D21a）；加密 envelope 缝 + non-ZK 文案（D22/B6）；World A core `wasm32` + android 可编译性 + client 零真理逻辑红线（A9/D36/D37）；time travel 一等能力 + 四-horizon retention（B15/D38）；7-day conflict horizon = 纯 UI（B16）；Kleppmann 祖先检查在范围内（B9/D32）；公开 `ConflictRecord` / `resolve` CLI schema 延后二期（B5/D31，op-envelope 预留留 Phase 0）。
- **Stage 1 current state：** A2 / B4 is approved as the Apple binding product boundary（`UniFFI DTO / ordinary dispatch + C ABI bytes fast path`）after Anchor DTO round-trip, typed `ValidationError`, Swift 6 synchronous strict-concurrency release smoke, three-slice XCFramework packaging, and 1/4/16/64MB bytes benchmarks. Release implementation gates remain final DTO/error vocabulary, UniFFI async `Sendable` surface, product wrapper import surface, and CI/fresh-machine reproduction. B14 is approved as default transport with compromise constraints: signed runtime, package-level discovery, file coordination, package-internal direct enumeration through macOS 100K files, online convergence, and offline `NSFileVersion` conflict materialization are observed; remote placeholder behavior, signed-out / over-quota states, iOS large-scale delivery, steady-state segment budget, and product conflict-resolution policy remain implementation gates.
- **Boundary changes authorized / not authorized：**
  - **Authorized（随实现授权落地，本 packet 不自行创建）：** 创建 `suites/anchor*` 目录 / 工程结构（B1）；Anchor Xcode 工程 / target / bundle id / signing team / entitlements（B2）；Anchor iCloud container / capability（B3，付费 ADP team 已开通）；vault file package `com.apple.package` UTType 声明落 Info.plist（B13）。
  - **Not authorized（需后续批准或永久排除）：** 绕过 B4 批准形状的 binding 发布（如 pure-UniFFI bulk bytes 作为默认、删除 C ABI bytes fast path、把 DTO/error collapse 成 string、在 Swift/TextKit 侧复制 core 确定性语义）；绕过 B14 compromise constraints 的 iCloud Drive 发布（如依赖 package-internal `NSMetadataQuery`、静默处理 unresolved `NSFileVersion` conflict、忽略 account/placeholder gates）；完整 ZK / 密钥分发（延后）；任何 CloudKit record schema 落地（B8 是二期路线批准、非 schema 落地许可，op 形状须先冻结）；公开 conflict/resolve CLI schema（二期）；任何超出 Option A/C 的 package / workspace 重组；为适配 glob 添加 placeholder `package.json`（永久禁止）；在本 packet 范围内写任何 Rust / Swift / TS 代码或改 `package.json` / `bun.lock` / `tsconfig` / workspace 配置。
- **Stop condition satisfied：** 是。本 packet 唯一落盘动作是 workbench 文档自身；未创建任何 `suites/anchor*` / `apps/anchor-*` / `packages/anchor-*` / `anchor-apple/` / Xcode / Swift Package / Rust crate / entitlements / bundle id / iCloud container，未改任何 lockfile / workspace 配置，未写任何 Rust / Swift / TS 代码，未把任何 Blocked / Not run / Unknown 项当已验证事实（第 9 节）。
- **Current CP-1 gate：** core side complete; binding is approved as product boundary; TextKit is mechanism-go; iCloud Drive is approved as default transport with compromise constraints. Remaining gates are binding release implementation gates, iCloud implementation delivery gates, TextKit product-runtime proof, Bun glob behavior, and cross-target execution CI wiring. Through CP-1, persistent app writes remain out of scope（plan §11 CP-1；stage-1-spike-plan.md §6）。

---

## 1. Strongest conclusion（单一最可辩护结论）

**Anchor 是一个 Note 原生（非 Markdown 文本壳）、Apple 原生优先（macOS + iOS 首期）、核心平台无关（platform-agnostic Rust `anchor-core`）的本地知识工作台；其真理层是单一的 append-only op-log，所有持久写入收敛到单一已校验 dispatch，冲突调和保持恰好三个 dispatch register（`location` / `content` / `life`）这一产品不变量，Apple 客户端通过进程内 binding 直接调用 core、不拥有任何业务真理。**

该结论的每一支柱都站得住：op-log 是真理，物化 state、`.json` / `.md` mirror、SQLite projection 全为 replay 派生而非真理 [plan §2、§8.4]；每条持久写入路径都调用 append-前校验的 core 私有 helper，对 core 写入点 grep 必须能证明这一不变量 [plan §8.5]；三 register 不扩成五、`content` 仅在内部分解为 sub-field cell `{body, type_id, props[k], tags[t]}` [conflict §3.1；contract-baseline.md「Responsibility boundary matrix」]；Apple 客户端、CLI、`OpSyncPort` 适配器都是 dispatch 的外壳 [plan §8.1]。五条支柱均有 Codex 证据支撑、可进入 CP-0（Observed，apple-verification §1）：Apple-native 首期路线、Rust `anchor-core` 真理层、Apple 客户端进程内 binding、TextKit mechanism-only、iCloud Drive adapter 只给 core 喂 `SegmentId` / `BlobId` + 字节。

**显式限定：本结论是契约方向的对齐，不是实现许可。** 平台无关 Rust core 是已选定的 World A 取向——core 的 `wasm32` + android 可编译性作为 CP-1 受保护不变量守住，web/android client 仍延后（见第 2 节、第 8 节 A9）。CP-0 只能批准目标边界、命令骨架与 Stage 1 验证计划。当前仓库没有 `suites/anchor`、没有任何 Anchor 代码、没有 Rust / Cargo crate、没有 Swift / Xcode 工程（Observed，apple-verification §1、§2.1）；批准本结论**不**等于授权创建任何目录 / 工程 / 包，也**不**得被解读为「Anchor app 已可构建」或「iCloud 已可用」。所有创建动作另由第 4 节与第 8 节的逐条批准项门控。

---

## 2. Approved baseline candidates（可纳入 CP-0 的稳定基线项）

以下为 contract-baseline.md 与 key-decisions.md 中 Status=Recommended、可作为 CP-0 稳定基线纳入的项；其 Apple 依赖已由 Codex 本机实跑或官方文档直接支持（Observed）。触边界 / follow-up gate / 已延后二期的项**不**在本节，集中在第 4、5 节及二期。

- **平台路线（Recommended）：** macOS + iOS 首期 → iPadOS 第二 → 其他平台最后；UI 可平台化，core 必须平台无关 [plan §3、§11；contract-baseline.md「Platform baseline」]。
- **Core 责任边界（Recommended）：** `anchor-core` 拥有 Note/Block/Inline/PropDef/Type/Tag/BlobRef 模型、`canonical_serialize` + blake3 `rev`、校验 / 规范化、append-only op-log + replay/materialization、全部 merge 规则、diff3 + fractional order-key 的唯一执行处、SQLite projection、import/export + mirror queue、单一已校验 dispatch、`OpSyncPort` trait、**DTO 词汇 + 版本 + schema envelope owner** [plan §8.1；key-decisions.md D03、D11、D12、D19、D26、D30；apple-verification §3.4]。
- **Editor 边界（Recommended）：** `anchor-editor-core` 是 `anchor-core` 内部无 UI 模块（非独立 crate/package），只拥有 portable selection / intent shaping / 选择提升降级 / paste-fragment shaping / 跨 block 拆分**建议** / platform patch 生成 / undo-intent 映射；tree invariant / schema-aware normalization / op creation / merge / 最终非法结构拒绝归 `anchor-core::dispatch` [plan §8.1；contract-baseline.md「Editor baseline」]。
- **客户端 ↔ core 传输（Recommended，D03）：** Apple 客户端进程内 binding 直调 core，不经网络；`anchor serve` + `/rpc` 仅可选 localhost 开发 / 测试传输，非产品同步通道 [plan §8.1；key-decisions.md D03]。
- **CLI 边界（Recommended）：** 本地结构化命令契约（**非 MCP**）——`apiVersion` 信封、固定退出码 0/1/2/3/4/5/6、`--format tsv|json`、净增动词 MOVE/EXPORT/IMPORT/TYPE/PROP/DELETE；写入一律经 core dispatch，消费 core DTO、不独立定义 Note/Block/op/validation-error 语义 [plan §8.1、§9；contract-baseline.md「CLI baseline」]。
- **Sync 边界（基线方向 Recommended）：** op-log 是真理；同步单元 = 不可变 per-device op-segment 文件（`.anchor/operations/<device_id>/<seq>.seg`，一封一密、永不修改）；mirror 与 SQLite projection 不进同步；`OpSyncPort` 传输无关，仅 `SegmentId` / `BlobId` + 字节、core 永不出现云类型 [plan §8.4；contract-baseline.md「Sync baseline」]。（iCloud runtime 证明与加密所有权另需第 4 节批准。）
- **冲突模型方向（Recommended）：** 恰好三 register；全序键 `T = (hlc.wall, hlc.logical, hlc.device, actor, op_id)`；body = 确定性 diff3 / keep-both 永不静默 LWW；props/type_id = causality-aware per-cell LWW；tags = OR-Set add-wins（复用 op_id）；life = 时钟无关优先级 lattice + 非级联 + 派生可见性 + 终态可达；journal 内容寻址身份 `note_id = blake3("journal:" ‖ vault_id ‖ calendar_date)` [conflict §3-§7；key-decisions.md D10、D11、D12、D19、D26、D27、D28、D29、D30]。
- **Binding 产品边界（B4 approved，2026-06-07）：** Rust core 保持平台无关，批准路径 = UniFFI 生成 Swift API（DTO / 结构化 error / 普通 dispatch）+ XCFramework 打包 Rust static libraries + 本地 SwiftPM wrapper 消费，C ABI bytes 作 bulk blob fast path [key-decisions.md D01；apple-binding-report.md]。**World A 多语言约束：** UniFFI 作多语言绑定生成器（Swift 首期、Kotlin 供 android 后用），web 走 wasm-bindgen / JS；DTO 形状保持绑定生成器无关，同一 core 可被三侧消费而不分叉 DTO。Stage 1 已观察 Anchor DTO round-trip、typed `ValidationError`、Swift 6 synchronous strict-concurrency release smoke、three-slice XCFramework packaging、1/4/16/64MB bytes benchmarks；release implementation gates 为最终 DTO/error vocabulary、UniFFI async `Sendable` surface、product wrapper/CI 复现。
- **Core 跨平台可编译性（受保护不变量 Recommended）：** 在 World A（committed 平台无关 Rust core）取向下，`anchor-core`（含 `anchor-editor-core`）的 **wasm32 + android 可编译性是 CP-1 受保护不变量**——core 依赖须 wasm + android 可编译、确定性 / merge 路径 `no_std`-friendly 且不碰 OS 线程 / fs / 时钟 / 浮点；diff3 / order-key 一致性向量集纳入 wasm target；并设 client 零真理逻辑 CI 红线。受保护的是「core 现在就保持可复用」，**web / android client 仍延后** [key-decisions.md D36、D37、D19、D26；contract-baseline.md「Platform baseline」]。

> 这些基线项构成「契约方向已对齐、可作为后续实现的责任锚点」的集合；它们**不**单独授权落盘，落盘动作由第 8 节勾选清单统一门控。

---

## 3. Recommended project layout（推荐项目布局）

详见 project-layout-options.md（候选 A/B/C 与对比）。**用户已于 2026-06-07 批准 Primary = Option A `suites/anchor/*`**；Option C 降为实现期退路。剩余待门控的仅是后续**目录 / 工程的实际创建动作**（随实现授权，见第 4 节 #1）。

- **Primary = Option A：`suites/anchor/*` 作为 Anchor 的内聚之家。** 内层 illustrative：`core/`（Rust crate `anchor-core`，含 `anchor-editor-core` 内部 module）、`cli/`（Rust bin）、`apple/`（Xcode 工程 / workspace，macOS + iOS target，预留 iPadOS）、`fixtures/`、嵌套 `Cargo.toml`。推荐依据：plan §12 的验证命令写死 `cd suites/anchor; cargo test -p anchor-core`，是文档中唯一被写死的目录线索；产品内聚性最强（suite = theme-scoped group）；glob 失配面只污染一条 `suites/*/*`（project-layout-options.md §7）。
- **Fallback = Option C：** 若 Bun glob 或 Xcode 嵌套成本过高，Apple 工程移到 glob 外的顶层非-workspace 目录 `anchor-apple/`，**core 仍留 `suites/anchor/core`** 以保住 plan §12 的 cargo 验证路径。这是失配面更小的退路（apple-verification §3.2、§8.3；project-layout-options.md §5、§7）。
- **Bun 非-package 目录行为 = Unknown（Not run）。** Bun 对 `suites/*/*` 下没有 `package.json` 的目录是否报错 / 是否拖累 `bun install` / `bun run check` 未经 scratch 实测（apple-verification §3.1；key-decisions.md D02）。
- **硬约束：绝不为适配 glob 添加 placeholder `package.json`。** 那会使该目录成为 Bun workspace member 并触发 AGENTS 的 package 义务（`prepack`、`repository.directory` 等）（project-layout-options.md §3、§7；key-decisions.md D02）。

> 本节不创建任何目录。**Option A 已由用户采纳（2026-06-07）**；Option C 仅在实现期 Bun glob / Xcode 嵌套成本过高时启用。Bun 对 `suites/*/*` 下非 Bun package 目录的行为为 Unknown，实测在 Stage 1 收口；目录 / 工程的实际创建动作随实现授权执行（第 4 节 #1、第 8 节 B1）。

---

## 4. Boundary changes requiring user approval（触边界、需用户签署的逐条项）

以下每项触 workspace / package / Apple project 边界、新公开 CLI schema、加密 / 密钥所有权、付费 Apple Developer Program、entitlement / 容器，或 plan §13 暂停条件。**未签署项在签署前一律不得落地；已批准项以「已批准（日期）」标注，其落地仍随实现授权执行，本 packet 不自行创建任何东西。**

1. **创建 Anchor 目录 / 工程结构。** **布局已由用户批准 = Option A `suites/anchor/`（2026-06-07）**；本项剩余待门控的是后续**实际创建** `suites/anchor*` / Xcode project / workspace / Swift Package / Rust crate 的落地动作（随实现授权，plan §13；key-decisions.md D02；apple-verification §3.5、§8.5）。Option C 仅作实现期退路；是否接受 `suites/*/*` 下存在非 Bun package 目录在 Stage 1 实测收口。
2. **Xcode 工程 / target / bundle id / signing team / entitlements（用户已批准，2026-06-07）。** 用户已授权创建 Anchor Apple project / workspace / target、bundle id、signing team、entitlements、Info.plist；实际创建在用户给出实现指令后进行，本 packet 不自行创建（apple-verification §8.5；stage-1-spike-plan.md §2、§4）。
3. **iCloud container / capability（付费 ADP team 已开通）。** **付费成员资格已开通（Observed，apple-verification §2.6）。** 本项待门控的是 **Anchor 自身**的 bundle id、iCloud container id、iCloud capability / entitlement 设置、automatic/manual signing mode——这些在实现期创建 / 绑定 Apple Developer 侧 App ID / container（key-decisions.md D35；apple-verification §2.6、§7.1、§8.5）。
4. **Binding 机制作为产品分发边界冻结（B4，用户已批准，2026-06-07）。** 批准形状 = `UniFFI DTO / ordinary dispatch + C ABI bytes fast path`。Release implementation gates 为 final DTO/error vocabulary、product wrapper import surface、release/CI/fresh-machine reproduction；UniFFI async `Sendable` surface 是剩余 release-surface gate（key-decisions.md D01；apple-binding-report.md）。
5. **`ConflictRecord` / resolve / restore_order / restore_subtree 的公开 CLI schema = 已决定放二期（Phase 2）。** 用户已于 2026-06-07 决定推迟到二期，**不在 CP-0 批准范围**。Phase 0 只在 op-envelope 层预留所需字段（D24）；因 `ConflictRecord` 是派生读模型（非持久 op、replay 重算），二期暴露**无 op-log 迁移成本**（key-decisions.md D31；conflict §9、§12）。
6. **加密与密钥所有权（D22 已锁定 Phase-0 范围，2026-06-07）。** 首期不实现 ZK；阶段0 锁定 encryption envelope 边界（首期 no-op 缝、日后接客户端加密层不迁移 op-log）+ non-ZK 文案，**绝不对中立 object-store 暗示 zero-knowledge**。完整 ZK / 密钥分发延后，其最终签署仍待（key-decisions.md D22；plan §8.4）。
7. **字体来源 = 已批准（B7，2026-06-07）。** 内置 `JetBrains Mono`（代码字体）+ 正文 / 标题用系统字体、用户可在已安装系统字体中切换；「未知字体被丢弃」对正文 / 标题成设备相关（不在本机已安装集则回退系统默认）——主动接受，因字体属外观 settings、不进 op-log（key-decisions.md D18a；apple-verification §8.5）。
8. **CloudKit 二期路线 = 已批准（B8，2026-06-07）。** 单附件 cap 已由用户定为 **50MB**（D17，对齐 archived CloudKit `CKAsset` 50MB 上限）——二期 CloudKit / CKSyncEngine **无需**分片 / 降 cap / out-of-band。路线已批准（仍为二期实现）；CloudKit record schema 绝不进 core，op 形状须在任何 CloudKit 记录落地前冻结（key-decisions.md D17；apple-verification §7.3、§8.5）。
9. **签署 Kleppmann 祖先 / 成环检查为在范围内 = 已批准（B9，2026-06-07）。** 作为有意识的 §13 边界决策签署（非静默发布）；若实现引入 move 历史保留即滑向完整收敛 move，须暂停（key-decisions.md D32；conflict §5.2、§12、§13.1 #14）。
10. **journal「一日一 journal」取舍 = 已批准（B10，2026-06-07）。** 内容寻址身份使「同 vault 同日恒为同一 Note」成为身份不变量；用户想同日再开一篇须建普通 Note（plan §4.3 模型变更，用户已确认接受）（key-decisions.md D08；conflict §13.1 #9）。
11. **顶层 Note 表示 / Calendar 排序 / journal 默认 parent / trash-restore 边界 = 已批准（B11，2026-06-07）。** 顶层 Note = `parent_note_id = null` 普通 Note（非持久 sentinel）、Calendar 是日期聚合 projection（分组不进 `parent_note_id`）、journal 默认 parent 按普通 Note 规则、trashed 重开「今日」→ restore 不铸重复（key-decisions.md D07、D08、D09；plan §8.2、§11）。
12. **mirror 目录组织 + 是否纳入版本库 = 已批准（B12，2026-06-07）。** `.md` / `.json` mirror = 有损 post-commit 派生导出、不进同步；目录组织 = **人类可读路径**、**不纳入版本库**（锁定默认，NoteId 寻址仅作备选）（key-decisions.md D05；plan §8.4）。
13. **Anchor vault file package 的 `com.apple.package` UTType 声明 = 已批准（B13，2026-06-07）。** vault file package 须声明符合 `com.apple.package` 的 exported document type / UTType，否则 iCloud 把 file wrapper 当普通目录枚举、`NSMetadataQuery` 可能返回 package 内部文件；该声明落在 Apple project 的 Info.plist 面，随实现授权落地（key-decisions.md D34；apple-verification §7.1）。
14. **Sync 路线作为首期产品选择 + local-only 防误放语义。** **local-only 防误放已由 D21 / D21a firm（2026-06-07）：`sync = "none"` 严禁置于任何 iCloud ubiquity container 下，vault-open 强制断言、`synced → local-only` 不可逆；手动挪入 iCloud 的 local-only vault 按 blocked misplacement 处理——拒开 + typed `local_only_vault_in_ubiquity`、不挂 adapter、不 merge，提供 Move Back / Convert to iCloud Sync（D21a）。** iCloud Drive 作为首期 `OpSyncPort` 默认 transport 已由用户批准（2026-06-07）（key-decisions.md D21、D21a；plan §8.4、§13；icloud-drive-report.md）。批准形状 = compromise constraints：signed runtime、package-level discovery、file coordination、package-internal direct enumeration through macOS 100K files、online convergence、offline `NSFileVersion` conflict materialization 已观察；remote placeholder、account states、iOS large-scale delivery、steady-state segment budget、product conflict policy 仍是实现 gate。

---

## 5. Stage 1 spike list（Stage 1 探索验证摘要）

摘要引用 stage-1-spike-plan.md 的五组 spike，严格二分 owner。CP-1 退出前所有 core spike 经 `cargo test -p anchor-core` 落成正式测试、Apple spike 留可重复命令或 Xcode scheme + 报告；通过前不实现持久应用写入（stage-1-spike-plan.md §6；plan §11 CP-1）。

1. **Core deterministic spikes（Owner：Claude / core）：** canonical_serialize、id + fractional order、op-log replay、HLC LWW merge、diff3 body merge + mark re-clamp、OR-Set tag、life lattice、journal 内容寻址身份、mirror/projection parity、**diff3 + order-key 跨设备逐字节一致向量集（强制 CI gate，含 `wasm32` target）**、**core 多目标编译 gate（`wasm32` + android，World A 受保护不变量 D36）**、**client 零真理逻辑 CI 红线（D37）**。覆盖 F01–F43 的 core 项与 F23–F35（stage-1-spike-plan.md §1）；并覆盖 op-count scale（50K→10M+）、segment batching ratio & steady-state budget、四-horizon retention 正确性（F42/F43）。
2. **Apple binding spike（Owner：Codex / Apple，被调 DTO/fixture 真值由 core 提供）：** Stage 1 已完成 Rust iOS targets、Anchor DTO full round-trip、typed validation error、1·4·16·64MB bytes transfer、C ABI/UniFFI three-slice XCFramework、SwiftPM wrapper import、Swift 6 synchronous strict-concurrency release smoke。Decision recommendation = `UniFFI DTO / ordinary dispatch + C ABI bytes fast path`（stage-1-spike-plan.md §2；D01；apple-binding-report.md）。
3. **Text surface adapter spike（Owner：Codex / Apple + Claude editor 合约）：** 事件 → `EditorIntent`、`EditorPatch` 回放、single-block / block / embedded 选择、undo via `NSUndoManager` semantic inverse intent、IME marked text / accessibility / hit-testing、跨 block 连续选择（spike-only，非首期承诺）、UTF-16 offset 换算正确性。覆盖 F19–F22（stage-1-spike-plan.md §3）。
4. **iCloud Drive adapter spike（Owner：Codex / Apple）：** Stage 1 已完成 signed iPhone + signed macOS `.app` container lookup、vault package UTType、coordinated read/write、package-level metadata discovery、package-internal direct enumeration、macOS 10K/50K/100K direct enumeration、online convergence、offline `NSFileVersion` conflict materialization、core 云符号审计。Current state = approved default transport with compromise constraints；remaining implementation gates = remote placeholder、signed-out / over-quota、iOS large-scale delivery、steady-state segment budget、product conflict policy、repo-local signed Anchor target（icloud-drive-report.md）。
5. **Mirror / search parity spike（Owner：Claude / core）：** post-commit mirror 生成 + freshness、mirror 写失败隔离（op-log 不回滚）、structured search/backlinks 后端对比、打开的 body 冲突渲染。覆盖 F36（及 F16/F17 backlink 面）（stage-1-spike-plan.md §5）。

---

## 6. Verification evidence summary（验证证据摘要）

区分 Observed 与 Not run / Blocked / Unknown，绝不过度声称。Phase 0 工具链证据见 `apple-verification.md`；Stage 1 实测命令与输出见 `../2026-06-07-stage-1/` 下各报告。

**Observed：**

- **Xcode / SDK / simulator 可用：** 经一次性前缀 `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` 观察到 Xcode 26.5 (Build 17F42)、macOS SDK 26.5、iOS SDK 26.5、iOS Simulator SDK 26.5，及 iOS 26.2/26.4/26.5 模拟器设备（默认 `xcode-select` 指向 CommandLineTools）。
- **Apple binding：** Rust macOS / iOS / iOS-sim targets 构建通过；C ABI and UniFFI wrappers build three staticlib slices；both XCFrameworks are created；SwiftPM wrapper imports；UniFFI generated Swift full round-trip covers fixture summary, dispatch, typed `ValidationErrorCode`, post-dispatch snapshot revision, `SegmentId`, segment bytes, and blob bytes；synchronous release-surface smoke passes `-swift-version 6 -strict-concurrency=complete -warnings-as-errors`；C ABI and UniFFI 1/4/16/64MB bytes benchmarks recorded.
- **TextKit mechanism-only runtime：** macOS `NSTextView` runtime passes UTF-16 selection/layout/semantic undo smoke；iOS Simulator compile passes；adapter maps events to intent-shaped values and replays patches to projection rather than truth buffer.
- **iCloud adapter runtime：** signed iPhone and signed macOS `.app` pass container lookup, vault package UTType, coordinated write/read, package-level metadata discovery, package-internal direct enumeration, macOS 10K/50K/100K direct enumeration, online convergence, and offline `NSFileVersion` conflict materialization. Package-internal `.seg` discovery uses direct enumeration; `NSMetadataQuery` is not approved for package internals.
- **付费 ADP（Individual）team iCloud 能力：** 用户开通付费 Apple Developer Program（`isFreeProvisioningTeam=0`、`teamType = Individual`）后，demo project 经 automatic signing 生成含 iCloud Documents entitlement 的 development provisioning profile + signed device artifact（签名含 `CloudDocuments` + iCloud container / ubiquity ids），并在真机（iOS 26.5、Developer Mode、登录 iCloud）经 `devicectl` 启动返回 **non-nil ubiquity container URL**；simulator 启动无 `Security policy issue`（sim ubiquity lookup 仍 nil，因未登录 iCloud）（apple-verification §2.5、§2.6）。
- **外部文档支持：** CloudKit `CKAsset` field 上限 50MB；file wrappers 仅当导出 `com.apple.package` UTI 才作单 document 处理。

**Blocked / Not run / Unknown（不得当已验证事实）：**

- **Repo-local signed Anchor app target = Not run。** Stage 1 used repo-local SwiftPM probes and repo-external signed runtime probes; no product app shell, entitlement, bundle id, or iCloud container was created in repo.
- **UniFFI async `Sendable` surface = Not run。** Synchronous generated Swift strict-concurrency smoke passed; async generated surface remains a release-surface gate.
- **TextKit product runtime = Not run。** Real-app responder-chain direct buffer undo suppression, IME marked text commit, accessibility range behavior, hit-testing over rendered geometry, patch replay over moving views, and keyboard→`EditorIntent` remain product gates.
- **iCloud remote/account/product gates = Not run / Blocked.** Remote `.icloud` placeholder download, signed-out / over-quota states, iOS large-scale delivery, product conflict-resolution policy, and repo-local signed Anchor target are open.
- **Bun 非-package 目录行为 = Unknown。** 未 scratch 实测 Bun 对 `suites/*/*` 下无 `package.json` 目录的行为（apple-verification §3.1）。
- **本机无 `xcodegen` / `tuist` / Ruby `xcodeproj`。** `xcodebuild` 无 create-project 子命令；自动生成 `.xcodeproj` 须 Apple 工程被批准创建后另行解决（apple-verification §2.2）。

---

## 7. Known unknowns（仍开放的现实 / 设计未决项）

以下为已识别、Stage 1 后仍开放的现实与产品决策项；它们不阻塞当前 core/binding/TextKit mechanism 基线，也不撤销 B4 binding 产品边界批准或 B14 默认 transport 批准，但会阻塞 CP-1 整体退出、binding release delivery 或 iCloud transport 交付。

- **Bun 非-package glob 行为：** `suites/*/*` 下非 Bun package 目录是否拖累 `bun install` / `bun run check`（Unknown，apple-verification §3.1）。
- **iCloud remote/account/product gates：** remote `.icloud` placeholder download, signed-out / over-quota states, iOS large-scale delivery, repo-local signed Anchor target, and product conflict-resolution policy remain open（icloud-drive-report.md；key-decisions.md D14、D35）。
- **UniFFI async / product wrapper release gates：** Stage 1 synchronous generated Swift passes Swift 6 strict concurrency; async `Sendable` surface, final DTO/error vocabulary, product wrapper import surface, and release/CI/fresh-machine reproduction remain open（apple-binding-report.md；key-decisions.md D01）。
- **内部 offset 单位：** 对外 UTF-16 已定；Stage 1 counted emoji / ZWJ / combining mark / CRLF fixtures at adapter surface, but product TextKit IME/accessibility/runtime conversion remains open（key-decisions.md D18；textkit-adapter-report.md）。
- **manifest 并发协调：** 不可变 segment 与可变共享 manifest 的区分、manifest 多写竞争与 conflict-version 行为（key-decisions.md D14；stage-1-spike-plan.md §4）。默认取 per-device immutable cursor（免 conflict），shared mutable manifest 是文档级多 writer 隐患（apple-verification §7.5；stage-1-spike-plan.md §4）。
- **iCloud Drive op-segment scale / 同步性能：** macOS direct enumeration observed 10K / 50K / 100K package-internal files; package-internal metadata enumeration returned 0. Steady-state segment budget, million-op compaction under signed-app/iCloud context, iOS large-scale delivery, placeholder behavior, and over-quota convergence remain open（icloud-drive-report.md；key-decisions.md D14/D38）。
- **完整 ZK / 加密密钥分发（延后）：** Phase-0 已锁定首期非 ZK + encryption envelope 边界 + non-ZK 文案（D22）；完整 ZK 与无自托管服务下向新设备分发密钥延后到 ZK 真被需要时评估（key-decisions.md D22）。
- **系统字体枚举 / 切换实现：** 字体来源已定（B7：内置 `JetBrains Mono` 代码字体 + 正文 / 标题用系统字体、用户可切换已安装系统字体，D18a）；原生系统字体枚举 / 切换的实现行为（`NSFontManager` / `CTFontManager` 可用集、缺失回退）本身 = Not run，留 Stage 1 由 Codex 验证（key-decisions.md D18a）。
- **CloudKit 二期实现细节：** blob cap 已统一为 50MB（D17，对齐 `CKAsset`，B8 已批准），cap 冲突已消除；剩余仅二期 runtime（CKSyncEngine change-token / zone schema 设计、op 形状冻结）待二期评估（key-decisions.md D17；apple-verification §7.3）。
- **Core 跨目标执行 wiring（World A）：** `wasm32-unknown-unknown` + `aarch64-linux-android` 编译 gate 已过；wasmtime / android emulator 执行 golden wiring 留 CI（key-decisions.md D36）。

---

## 8. CP-0 approval checklist（可逐条勾选批准清单）

对应 plan §11 CP-0 检查点（line 547：平台路线、Apple binding 方案、`anchor-editor-core` 合约、交互契约、信息架构、DTO 草图、关键技术决策、fixture set 已批准），加上本次新增的边界批准项。**每项二选一：[批准] / [暂缓]；已由用户于 2026-06-07 决定的项以 [x] 标注其结论——B1（布局=Option A）、B2（Xcode 工程等创建已授权）、B3（付费 ADP team 已开通）、B4（binding 产品边界 = UniFFI DTO / ordinary dispatch + C ABI bytes fast path）、B5（CLI schema 放二期）、B7（字体来源）、B8（CloudKit 二期路线）、B9（Kleppmann 签署）、B10（一日一 journal）、B11（Note/Calendar/journal 边界）、B12（mirror 组织）、B13（UTType 声明）、B14（iCloud Drive 默认 transport with compromise constraints）、B15（time travel 一等能力 + retention 模型）、B16（7-day horizon = 纯 UI 冲突呈现）；B6（加密）已据 D22 firm 锁定（见各项）。** 任一项暂缓不阻塞其余项，但触边界项暂缓则对应落地动作不得进行。

**A. plan §11 CP-0 核心检查点**

- [x] 批准（2026-06-07）/ [ ] 暂缓 — **A1 平台路线：** macOS + iOS 首期 → iPadOS 第二 → 其他平台最后（第 2 节；plan §11）。
- [x] 批准（B4，2026-06-07）/ [ ] 暂缓 — **A2 Apple binding 方案（方向）：** `UniFFI DTO / ordinary dispatch + C ABI bytes fast path`；typed `ValidationError`、Anchor DTO round-trip、Swift 6 synchronous strict-concurrency release smoke、three-slice XCFramework packaging、bytes benchmark 已观察（第 2、5 节；key-decisions.md D01；apple-binding-report.md）。机制作为产品分发边界的批准见 B4。
- [x] 批准（2026-06-07）/ [ ] 暂缓 — **A3 `anchor-editor-core` 合约：** core 内部无 UI 模块边界（第 2 节；contract-baseline.md「Editor baseline」）。
- [x] 批准（2026-06-07）/ [ ] 暂缓 — **A4 交互契约：** 选择 / 结构编辑 / Note 行为 / 引用 / props·type / 命令 / Settings / 失败态，经 fixture set 复查通过（fixture-set.md F01–F43；plan §11）。
- [x] 批准（2026-06-07）/ [ ] 暂缓 — **A5 信息架构：** 顶层 Note / 子 Note / journal / Calendar projection 的 macOS / iOS 信息架构草图（contract-baseline.md；key-decisions.md D07–D09）。
- [x] 批准（2026-06-07）/ [ ] 暂缓 — **A6 DTO 草图：** Note / block / op / projection / search result / validation error / mirror status / settings / sync status 的 core DTO 草图（清单取自 plan §11 line 547），DTO 词汇与版本归 Rust core 所有（所有权由 contract-baseline.md「Responsibility boundary matrix」支撑；apple-verification §3.4）。
- [x] 批准（2026-06-07）/ [ ] 暂缓 — **A7 关键技术决策：** key-decisions.md D01–D38（含 D18a、D21a、D38 time travel）的 Status=Recommended 项作为 CP-0 基线纳入（第 2 节；key-decisions.md）。
- [x] 批准（2026-06-07）/ [ ] 暂缓 — **A8 fixture set：** F01–F43（含 F42 segment budget、F43 四-horizon retention）作为 CP-0 设计产物冻结（fixture-set.md）。
- [x] 批准（2026-06-07）/ [ ] 暂缓 — **A9 World A core 跨平台可编译性（受保护不变量）：** `anchor-core` 的 `wasm32` + android 可编译性作为 CP-1 gate、diff3/order-key 一致性向量集纳入 wasm target、client 零真理逻辑 CI 红线；web/android client 仍延后（第 2、5 节；key-decisions.md D36、D37）。

**B. 本次新增的边界批准项（对应第 4 节）**

- [x] 批准（布局，2026-06-07）/ [ ] 待实现授权（创建动作）— **B1 项目布局与目录创建：** **布局已批准 = Option A `suites/anchor/*`**（Option C 仅实现期退路）；实际目录 / 工程创建随实现授权执行（第 3 节；第 4 节 #1）。
- [x] 批准（2026-06-07）— **B2 Xcode 工程 / target / bundle id / signing team / entitlements：** 用户已授权创建 Anchor Xcode 工程 / target / bundle id / signing team / entitlements；实际创建在用户给出实现指令后进行（第 4 节 #2）。
- [x] 已开通（付费 ADP team，2026-06-07）/ [ ] 待实现授权（Anchor container / capability）— **B3 iCloud container / capability：** 付费成员资格已开通；Anchor 自身 bundle id / iCloud container id / capability 随实现授权创建（第 4 节 #3；key-decisions.md D35）。
- [x] 批准（2026-06-07）/ [ ] 暂缓 — **B4 binding 机制作为产品分发边界冻结**（第 4 节 #4；key-decisions.md D01）。**批准形状为 `UniFFI DTO / ordinary dispatch + C ABI bytes fast path`；release implementation gates 为 final DTO/error vocabulary、UniFFI async `Sendable` surface、product wrapper import surface、release/CI/fresh-machine reproduction。**
- [x] 已决定：放二期（Phase 2，2026-06-07）— **B5 `ConflictRecord` / resolve 等公开 CLI schema：** 推迟到二期，**不在 CP-0 批准范围**；Phase 0 仅 op-envelope 预留（D24），二期暴露无迁移成本（第 4 节 #5；key-decisions.md D31）。
- [x] Phase-0 已锁定（2026-06-07）/ [ ] 完整 ZK / 密钥分发延后 — **B6 加密与密钥所有权 / 零知识范围决策：** 首期非 ZK + encryption envelope 边界 + non-ZK 文案（不对 object-store 暗示 ZK）已锁定（D22）；完整 ZK / 密钥分发延后（第 4 节 #6；key-decisions.md D22）。
- [x] 批准（2026-06-07）— **B7 字体来源：** 内置 `JetBrains Mono`（代码字体）+ 正文 / 标题用系统字体、用户可在已安装系统字体中切换（第 4 节 #7；key-decisions.md D18a）。
- [x] 批准（2026-06-07）— **B8 CloudKit 二期路线：** cap 已定 50MB 对齐 `CKAsset`、冲突消除，二期 CloudKit 路线获批（仍二期实现）（第 4 节 #8；key-decisions.md D17）。
- [x] 批准（2026-06-07）— **B9 签署 Kleppmann 祖先 / 成环检查为在范围内**（第 4 节 #9；key-decisions.md D32）。
- [x] 批准（2026-06-07）— **B10 journal「一日一 journal」取舍**（第 4 节 #10；key-decisions.md D08）。
- [x] 批准（2026-06-07）— **B11 顶层 Note 表示 / Calendar 排序 / journal 默认 parent / trash-restore 边界**（第 4 节 #11；key-decisions.md D07–D09）。
- [x] 批准（2026-06-07）— **B12 mirror 目录组织 + 是否纳入版本库**（默认锁定：人类可读路径 + 不纳入版本库）（第 4 节 #12；key-decisions.md D05）。
- [x] 批准（2026-06-07）— **B13 Anchor vault file package 的 `com.apple.package` UTType 声明**（第 4 节 #13；key-decisions.md D34）。
- [x] local-only 防误放已 firm（D21，2026-06-07）/ [x] iCloud Drive 默认 transport 已批准（2026-06-07）— **B14 sync 路线 + local-only 防误放语义：** `sync="none"` 严禁置于任何 iCloud ubiquity container 已 firm；iCloud Drive 作首期 `OpSyncPort` 默认路线的整体确认已批准，批准形状为 compromise constraints。Signed runtime、package-level discovery、file coordination、macOS 10K/50K/100K direct enumeration、online convergence、offline conflict materialization 已观察；remote placeholder、account states、iOS large-scale delivery、steady-state segment budget、product conflict policy 仍是实现 gate（第 4 节 #14；key-decisions.md D21；icloud-drive-report.md）。
- [x] 批准（2026-06-07）— **B15 Time travel 一等能力 + 四-horizon retention model：** per-note + 用户可配保留期 + read-only 查看&restore；restore = 前向 dominating op；>time-travel-horizon 内 op 只 archive 不 hard-delete；watermark 单独不足以硬删 loser-payload/trashed/observed-add（由 time-travel/audit + excise 门控制）（第 4 节；key-decisions.md D38、D14）。
- [x] 批准（2026-06-07）— **B16 7-day conflict horizon = 纯 UI 冲突呈现策略：** 绝不作 op-retention / hard-delete / compaction 安全依据；硬删仍由因果稳定 + snapshot 覆盖 + retention + time-travel 各自独立论证（第 4 节；key-decisions.md D14、D38）。

---

## 9. Stop condition（停止条件）

**CP-0 / Stage 1 批准状态不授权越界落地动作。** 具体而言，在第 8 节相应项被用户明确批准前：

- 不创建任何 `suites/anchor*` / `apps/anchor-*` / `packages/anchor-*` / 顶层 `anchor-apple/` / Xcode project / workspace / Swift Package / Rust crate / entitlements / bundle id / iCloud container（plan §13；apple-verification §8.5）。**其中 B1（布局 = Option A）、B2（Xcode 工程 / bundle id / signing / entitlements）、B14（iCloud Drive default transport with compromise constraints）已获用户批准，对应创建动作可在用户给出实现指令后进行；但本 packet 本身不自行创建任何目录 / 工程，且其余 B 项（如 Rust crate 落地依赖的完整布局收口、iCloud container 等）仍按各自批准状态门控。**
- 不改动 `package.json` / `bun.lock` / 任何 `tsconfig` / workspace 配置或任何生成的 lockfile，**绝不**为适配 glob 添加 placeholder `package.json`（key-decisions.md D02）。
- 不写任何超出已授权 spike / implementation scope 的 Rust / Swift / TS 代码；Stage 1 probe 文件已按 Option A 授权落地，产品 app shell / 持久应用写入仍未授权。
- 不把任何标 Blocked / Not run / Unknown 的项当已验证事实陈述。
- 第 8 节中被暂缓的项，其对应落地动作保持冻结，直至用户在后续轮次明确批准。

Stage 1 后任何「必须调整的模型点」回填 contract-baseline.md / key-decisions.md / fixture-set.md（决策编号沿用 D01–D38（含 D18a、D21a、D38 time travel）、fixture 编号沿用 F01–F43（含 F42 segment budget、F43 retention）），且通过 CP-1 前不实现持久应用写入（plan §11 CP-1）。
