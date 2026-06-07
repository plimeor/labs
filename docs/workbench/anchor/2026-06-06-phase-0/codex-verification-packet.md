# Anchor Phase 0 — Codex Verification Packet

日期：2026-06-06
状态：DRAFT（workbench artifact，非接口契约）
角色：collaboration step 2 输入 — 交给 Codex 做 Apple / Xcode / Swift-Rust / TextKit 现实性核验
读者：Codex（执行者）；step-3 Claude（把 Codex 证据回填进可批准的 CP-0）

> 这是 `docs/workbench/anchor/2026-06-06-phase-0/` 下的 workbench 草稿。按 AGENTS / CLAUDE，创建 workbench
> 目录**不授权**任何 package / workspace / app / lockfile 改动。本 packet 也**不**授权实现。

---

## 0. 给 Codex 的总指令（先读）

**你的任务是核验现实性、产出命令 / 成本 / 失败条件，并报告，供 step-3 整合——不是实现。**

明确的边界（违反即任务失败）：

- **不要**创建 `suites/anchor`、`apps/anchor-*`、`packages/anchor-*`；**不要**修改 `package.json`、`bun.lock`、任何
  `tsconfig`、workspace 配置或任何生成文件；**不要**写 Rust / Swift 产品代码；**不要**实现 `anchor-core`、editor 或任何 app shell。
- **不要**真的跑一次 Apple spike（不创建 Xcode 工程、不 `xcodebuild` 真实 target）。你可以在本机查询**工具链版本与能力**
  （`xcodebuild -version`、`xcrun simctl list`、`cargo --version` 等只读探测）来佐证命令的真实性，但产物是**命令 / 成本 / 失败条件清单**，不是工程。
- 凡是你能在本机只读验证的，标 **Observed** 并附命令与输出摘要；凡是基于文档 / 经验的推断，标 **Inferred**；凡是无法确定的，标 **Unknown** 并说明需要什么才能确定。
- 每个 Vn 任务按固定结构回报：**context / 确切问题 / 需产出的证据与命令 / pass-fail 判据 / 你的结论（Observed·Inferred·Unknown）**。

**为什么交给你：** 本项目今天**没有任何 Rust / Cargo，也没有任何 Swift / Xcode**（已核验：仓库只有 bun/TS workspace，
`packages/{browser-peek, claudify, command-kit, git-kit, skills}` 与 `suites/imprint/react`，无 `suites/anchor`）。
两份方案文档是仅有的 Anchor 物料。因此 Apple / 工具链一侧的现实性必须由你在 Apple 工具链环境里核验，Claude 无法凭空断言。

> **研究 caveat（务必当作 Inferred/Unknown，不要当事实）：** 存在一条**陈旧** auto-memory，声称 Anchor 位于
> `suites/anchor/{web,desktop,editor,core}`，技术栈是 React 19 + HeroUI v3 + CM6。**文件系统与 2026-06-06 的两份 Apple-native
> 方案与之矛盾。** 以这两份新方案为权威，把旧记忆当作需要纠正的研究噪声。

---

## 1. 输入材料（自含，Codex 必读）

1. **主方案：** `docs/plans/2026-06-06-anchor-apple-native-note-workbench.md`
   （Apple 原生优先的 Note 知识工作台；§3 平台路线、§8 架构、§11 阶段0产物、§12 验收命令、§13 风险）。
2. **冲突方案：** `docs/plans/2026-06-06-anchor-conflict-resolution-model.md`
   （v1 冲突处置模型，增强主方案 §8.3–8.5；§3 register 模型、§5 各 register 合并、§7 op 信封、§9 ConflictRecord）。
3. **本仓规则：** `AGENTS.md` / `CLAUDE.md`（workspace 三层、tsconfig 深度规则、prepack、publishable 字段、workbench 规则）。
4. **同目录配套草稿（与本 packet 同属 6 文件 Phase-0 packet，文件名以本目录实际为准）：**
   - `project-layout-options.md` —— 推荐布局 `suites/anchor/*` 与张力分析；**V1/V4 的布局核验以此为锚点。**
   - `contract-baseline-draft.md` —— Phase-0 责任基线；其 `Editor baseline`（含 `anchor-editor-core` 模块边界、`EditorIntent`/`EditorPatch`、UTF-16 offset 对外单位）支撑 V5/V6，其 `Sync baseline`（`OpSyncPort`、iCloud Drive 适配器、core 纯文件 I/O）支撑 V7。
   - `key-decisions-draft.md` —— 待冻结决策表（即 CP-0 决策包草案，含 binding 机制 D01、布局 D02、blob cap D17、UTF-16 边界 D18、selection 相关条款等）；V8 的 clause-impact 须回指此表的对应 Dnn。
   - `fixture-set-draft.md` —— Phase-0 fixture 设计（id / name / 锻炼什么 / 支撑哪条验收断言，不写测试代码），供你判断验证手段是否有 fixture 锚点。
   - `research-notes.md` —— Observed / Inferred / Unknown 调研分桶；你新增的 Observed/Inferred/Unknown 应与此对齐。

**已核验的 ground-truth（你可视为 Observed，无需重验，但欢迎反证）：**

- `package.json` 的 `workspaces = ["apps/*", "packages/*", "suites/*/*"]`，三者都是 bun/TS workspace glob。
- 根 `tsconfig.json` 的 `include` **只含 TS/TSX**（`apps/*/src`、`packages/*/src`、`suites/*/*/src` 下的 `**/*.ts(x)`）。
- `bun run check` = `tsc --noEmit`；`test` 脚本 filter `./packages/*` 与 `./suites/*/*`。
- AGENTS 深度规则：`packages/*` 与 `apps/*` extend `../../tsconfig.json`；`suites/<suite>/*` extend `../../../tsconfig.json`。
  每个 workspace package 定义 `prepack`；publishable package 需 `repository.directory` / `homepage` / `bugs` / `files` 白名单。
- 仓库今天**无** Rust/Cargo、**无** Swift/Xcode、**无** `suites/anchor`。

---

## 2. 被核验的 Phase-0 spine（每个 Vn 都以此为前提，发现矛盾请明确指出）

- **平台顺序：** macOS + iOS 首期；iPadOS 第二；其他平台最后（主方案 §3、§11）。
- **Core 是平台无关 Rust**（§8.1）；**Apple binding 机制是 Phase-0 决策**，候选 C ABI / UniFFI / Swift Package / XCFramework，
  **§8.4 line ~453「绑定机制在阶段0定，UniFFI 为自然选择」**；spine 推荐打包形态 = UniFFI 生成 Swift bindings、以 XCFramework / Swift Package 分发（**需你核验或修正**）。
- **`anchor-editor-core` 是 `anchor-core` 内部的无 UI 模块**（§8.1），**不是**独立 package/crate；它只拥有 portable selection /
  intent shaping / patch 生成 / undo-intent 映射；tree invariant、schema-aware normalization、op creation、merge、最终非法结构拒绝归 `anchor-core::dispatch`。
- **客户端 ↔ core 传输：** Apple 客户端经 binding **进程内**直接调用 core，**不经网络**（§8.1 line ~343）；`anchor serve` + `/rpc` 仅是
  **可选 localhost 开发 / 测试传输**，与 CLI / binding 共享同一 op registry / DTO / dispatch，**不是产品同步通道**。
- **真理层 = append-only op-log**；**同步单元 = 不可变 op-segment 文件**，每设备独占命名空间
  （`.anchor/operations/<device_id>/<seq>.seg`，一封一密、永不修改，§8.4）；`.md`/`.json` 镜像是有损派生导出、**不同步**；
  SQLite projection 是可重建本地缓存、**不同步**。
- **同步经 core trait `OpSyncPort`**（list/pull/push segment+blob，仅 `SegmentId`/`BlobId` + 字节，**无任何云类型**）。Apple
  首期 transport = **iCloud Drive 文件适配器**（ubiquity container file package；`NSFileCoordinator` + `.icloud` placeholder 下载
  + `NSMetadataQuery`），**core 只做普通文件 I/O、无 CloudKit**；CloudKit / CKSyncEngine 为二期可选、同一 `OpSyncPort`；跨平台 / Web
  同步用中立 object-store（S3/WebDAV），**非** iCloud。local-only：`sync="none"`、非 ubiquity 目录、`NSURLIsExcludedFromBackupKey`、
  vault-open 断言路径不在任何 ubiquity container 下；`synced → local-only` 不可逆。
- **冲突模型（冲突方案）：** dispatch **恰好 3 register**（location/content/life）为产品不变量；content **内部**分解为具名 sub-field
  cell `{body, type_id, props[k], tags[t]}`，各带 `sub_rev`；body = 确定性 3-way diff3 merge / keep-both（绝不静默 LWW）；
  props/type_id = causality-aware per-cell LWW；tags = OR-Set add-wins by `op_id`；life = 时钟无关优先级 lattice
  （active < {trashed, archived} < deleted），不级联、派生子树可见性、终态 deleted 仅经显式 trashed→deleted 且因果支配编辑可达。
  全序 `T = (hlc.wall, hlc.logical, hlc.device, actor, op_id)`。
- **journal 身份内容寻址：** `note_id = blake3("journal:" ‖ vault_id ‖ calendar_date)`（同 vault 同日恒为同一 Note，去重是身份不变量）；
  普通 Note 仍铸随机 nanoid。**已采纳的承诺模型。**
- **行内 offset 对外以 UTF-16 code unit 表达**（对齐 Apple TextKit / Swift String bridging，§8.2 line ~413）；core 内部存储单位与换算边界 Phase-0 定。
- **单附件上限 64MB**，dispatch 写入前校验（§8.2 line ~423）；该 cap 超过 CKAsset 上限（§8.4 line ~451，CloudKit 档需在分片 / 降 cap / out-of-band 中先定一种）。
- **布局推荐（primary，但 MARK「Needs user approval」）：** `suites/anchor/` 作为 cohesive home，因为方案**自己**的验证命令（§12 line ~698–700）
  在 `suites/anchor` 内跑 `cargo test -p anchor-core` / `cargo clippy -p anchor-core`。illustrative 内层：
  `suites/anchor/{core(Rust crate: anchor-core，含 anchor-editor-core 模块), cli(Rust bin), apple(Xcode 工程/workspace，macOS+iOS targets，Swift adapters + OpSyncPort impls), fixtures/, Cargo.toml(nested cargo workspace)}`。
  **KEY TENSION：** Rust cargo workspace + Xcode 工程**不适配** bun/TS 的 `suites/*/*` glob，也不适配 TS-only 的根 tsconfig include；
  bun 是否容忍 glob 下的非 package 目录、Xcode 工程嵌套在 `suites/anchor` 下是否符合工程直觉，都是 open question = 边界改动 + Needs user approval + Needs Codex verification。

---

## 3. 验证任务（V1–V8）

> 通用回报格式（每个 Vn 都要）：**(a) context 复述 → (b) 你执行 / 建议的确切命令（可复制） → (c) 实测或预期输出摘要 →
> (d) pass/fail 判据逐条判定 → (e) 结论标 Observed / Inferred / Unknown → (f) 若该项发现会反向修改 Phase-0 契约，指向 V8 的对应 clause。**

---

### V1 — 推荐目录结构在 bun/TS workspace 下的现实性

**Context：** spine 推荐 `suites/anchor/{core, cli, apple, fixtures, Cargo.toml}`（见 `project-layout-options.md`）。但
`package.json` 的 `workspaces` 含 `suites/*/*`，根 `tsconfig.json` 的 `include` 只匹配 `suites/*/*/src/**/*.ts(x)`。
`suites/anchor` 下将出现 Rust crate（`core`、`cli`）、Xcode 工程目录（`apple`）、`Cargo.toml`、`fixtures/`——**全是非 TS/非 bun-package 目录**。

**确切问题：**

1. bun install / bun workspace 解析在 `suites/*/*` glob 下遇到**没有 `package.json` 的目录**（如 `suites/anchor/core` 是 Rust crate）时，行为是什么？是静默忽略、warning、还是 error？是否会把 `suites/anchor/apple`（Xcode 工程目录）误当 workspace member？
2. 根 `tsconfig.json` 的 TS-only `include` 是否会被 Rust/Swift 文件干扰（应当不会，但 `bun run check` = `tsc --noEmit` 是否对这些目录无副作用）？`bun run` 的 `test` filter（`./suites/*/*`）遇到非 JS 目录是否报错？
3. 若要让 `suites/anchor` 既被 cargo 视为 nested workspace、又不污染 bun/TS 解析，最小可行形态是什么？候选：(i) 在 `suites/anchor` 下**只放一个**形式上的 `package.json` 把整个 anchor 收成一个 bun workspace member、Rust/Xcode 作为其子目录（非独立 member）；(ii) 把 anchor 放在 workspace glob **覆盖不到**的路径（如顶层 `anchor/` 而非 `suites/anchor/*`），代价是偏离方案 §12 的 `suites/anchor` 验证命令；(iii) 调整 `package.json` workspaces / 加 `.bunignore` 类机制（**这属于边界改动，需 user approval，仅作可行性分析，不要实施**）。
4. 把 Xcode 工程（`.xcodeproj`/`.xcworkspace`、`DerivedData`、`Package.swift`）嵌套在 `suites/anchor/apple` 下是否有工程学摩擦：DerivedData 路径、SPM 解析、git ignore 体量、与 cargo target 目录共存。

**需产出的证据 / 命令（只读探测，**不要**真的建目录或改 workspaces）：**

- 解释 bun 当前对 workspace glob 命中目录的成员判定规则（有 `package.json` 才算 member？引用 bun 文档 / 实测）。可在临时**仓外** scratch 目录复现一个最小 `workspaces: ["suites/*/*"]` + 一个无 `package.json` 子目录，报告 `bun install` 行为；**不要在本仓内做**。
- `bun pm ls` / `bun install --dry-run` 在当前仓的输出，确认现状 member 集合，作为对照基线。
- 列出三种布局候选 (i)/(ii)/(iii) 的具体代价与对方案 §12 命令的影响。

**Pass/Fail 判据：**

- **Pass：** 给出一个**不改 `package.json`/`tsconfig`** 即可让 `suites/anchor` 容纳 Rust+Xcode 的形态（或明确证明做不到、必须改 workspaces），并指明 bun 对无-`package.json` 目录的确切行为。
- **Fail：** 只给「应该可以」的泛泛结论，无 bun 行为实证，或未回答 Xcode 嵌套的工程学摩擦。

---

### V2 — macOS / iOS target 的实际构建验证命令

**Context：** 主方案 §12 line ~700 留白：「Apple 工程创建后，阶段0补充 macOS 和 iOS 的实际 `xcodebuild` 命令」。CP-0 需要这组命令落定，作为 CP-3 / CP-4「target 构建命令通过」的可执行基线。

**确切问题：** 一个 macOS target 与一个 iOS-simulator target 各自「能构建」的**确切** `xcodebuild`（及必要的 `xcrun simctl`）调用是什么？包括 scheme / destination / SDK 选择、CI（无 GUI、无登录开发者账号）下的可重复形态。

**需产出的证据 / 命令：**

- 本机工具链 Observed 探测：`xcodebuild -version`、`xcodebuild -showsdks`、`xcrun simctl list devices available`、`xcrun --sdk macosx --show-sdk-path`、`xcrun --sdk iphonesimulator --show-sdk-version`。报告版本号。
- 给出 macOS target 的规范命令骨架，例如：
  `xcodebuild -workspace Anchor.xcworkspace -scheme Anchor-macOS -destination 'platform=macOS' -configuration Debug build`（占位 scheme 名需在 Apple 工程建立后确定）。
- 给出 iOS-simulator target 的规范命令骨架，例如：
  `xcodebuild -workspace Anchor.xcworkspace -scheme Anchor-iOS -destination 'platform=iOS Simulator,name=iPhone 15,OS=latest' -configuration Debug build`，并说明如何用 `xcrun simctl` 选择 / 启动可用模拟器。
- 说明**无开发者签名**（`CODE_SIGNING_ALLOWED=NO` / `CODE_SIGNING_REQUIRED=NO`）能否在 CI 上 build；iOS 真机 target 与模拟器 target 的差异（首期 spine 用 simulator 即可）。
- 说明这些命令如何嵌进 nested cargo workspace 后还要先 `cargo build` 出 binding 静态库 / XCFramework 的依赖顺序（与 V3/V4 衔接）。

**Pass/Fail 判据：**

- **Pass：** macOS 与 iOS-simulator 各有一条可复制、destination / scheme / signing 明确、CI 可跑的命令骨架，并标注哪些字段在 Apple 工程建立前是占位、建立后如何确定。
- **Fail：** 只给 `xcodebuild build` 一行而无 destination / 模拟器选择 / signing 说明，或未探测本机实际 SDK / 模拟器可用性。

---

### V3 — Swift/Rust binding 候选的成本与失败条件

**Context：** §8.1 把 binding 机制列为 Phase-0 决策，候选 C ABI / UniFFI / Swift Package / XCFramework；§8.4 称「UniFFI 为自然选择」；§13「Binding 成本低估」风险点要求 ABI / 错误类型 / 异步 / 内存 / 二进制分发被认真评估。注意 binding 还要承载 §11/CP-1 的「segment 字节批量跨 FFI 的 marshaling 成本」性能验证。

**确切问题：** 对 **UniFFI、手写 C ABI、Swift Package、XCFramework** 四个候选（注意它们不完全互斥——后两者更多是**分发 / 打包**形态，UniFFI / C ABI 是**生成 / 调用**机制；请在回报中先澄清这层关系），逐项比较 setup cost、async 处理、error 类型映射、内存 / 所有权（谁持有、谁释放、跨 FFI 生命周期）、二进制分发，以及**什么情况会让该候选对 Anchor FAIL**。

**需产出的证据 / 命令：**

- 本机探测：`cargo --version`、`rustup target list --installed`（确认 aarch64-apple-darwin / aarch64-apple-ios / aarch64-apple-ios-sim 是否就绪，否则 `rustup target add` 是哪几个）、`uniffi-bindgen --version`（若装了）、Swift 版本 `swift --version`。
- 一张对照表：候选 × {setup 成本、async/await 能否跨界、error 如何映射 Swift `Error`、内存所有权模型、二进制分发形态（静态库 / 动态库 / XCFramework / SPM binaryTarget）、对 Anchor 的 FAIL 条件}。
- 针对 Anchor 特有负载点逐一评估：(a) `OpSyncPort` 把**裸字节 segment + blob**（单 blob 上限 64MB）跨 FFI 传递的拷贝 / 零拷贝可行性与成本；(b) `EditorIntent` / `EditorPatch` 高频小事务跨界的延迟；(c) UTF-16 offset 在 Rust（UTF-8 内部）↔ Swift `String`（UTF-16 视图）边界的转换归属与开销；(d) dispatch 返回 `TransactionResult`（changed ids / validation error / revisions）的结构化错误如何不退化成字符串。
- 指明每个候选的 FAIL 触发：例如 UniFFI 对某类递归 / 泛型 DTO 不支持；C ABI 手写在 async / 复杂 enum 上维护成本爆炸；纯 SPM source 分发要求用户机器装 Rust 工具链（对终端 app 不可接受）等。

**Pass/Fail 判据：**

- **Pass：** 四候选各有 setup / async / error / 内存 / 分发 / FAIL 条件六栏的具体填充，且明确回答 64MB blob 字节跨界与 UTF-16 边界两处 Anchor 特有成本。
- **Fail：** 笼统说「UniFFI 最方便」而无 FAIL 条件，或回避内存所有权 / async 错误映射 / 字节 marshaling 成本。

---

### V4 — 推荐 binding 打包形态（确认或修正 spine）

**Context：** spine 推荐 = UniFFI 生成 Swift bindings、以 **XCFramework / Swift Package** 分发。这是 §8.4「UniFFI 为自然选择」的具体化，但 spine 显式 MARK「Needs Codex verification」。

**确切问题：** 综合 V3 结论，确认或修正「UniFFI + XCFramework（或 SPM binaryTarget）」这一推荐。给出理由与最强反对意见。

**需产出的证据 / 命令：**

- 一个推荐结论 + 排序的备选（含「在什么条件下应改选 X」）。
- 推荐形态下的**最小验证路径骨架**（不实现，只列步骤命令）：例如 `cargo build --release --target aarch64-apple-ios-sim` → UniFFI 生成 `.swift` + `modulemap` → `xcodebuild -create-xcframework -library libanchor.a -headers ... -output Anchor.xcframework` → SPM `binaryTarget(path:)`。标注每一步在 CP-1「Apple binding 最小调用 spike」里对应哪条证明。
- 与 V2 的 `xcodebuild` 命令、V1 的目录布局如何咬合（XCFramework 产物落在 `suites/anchor/apple` 还是 cargo target？）。

**Pass/Fail 判据：**

- **Pass：** 明确「确认」或「修正为 X」，附触发改选的条件，并给出从 cargo 产物到 Xcode 可消费的 XCFramework/SPM 的命令骨架。
- **Fail：** 只复述 spine 推荐而不判断，或推荐形态无可复现的产物链路。

---

### V5 — NSTextView / UITextView / TextKit 作为机制（而非模型）的适配性

**Context：** §8.1 / §13「TextKit 被误当模型」明确：TextKit、`NSTextView`/`UITextView`、`NSAttributedString`/`AttributedString`、
`NSTextRange`/`NSRange`、平台 selection、view identity、IME state **只作输入 / 排版 / 显示 / 命中测试机制，不作存储格式或文档模型**。§8.1
首期编辑器是 **block list 形态**：paragraph / heading / quote / list-item 用原生 text surface；code / table / embed / file / callout / diff 用独立原生 block view。
不用 SwiftUI `TextEditor` 作主编辑器，不用一个巨型 `NSTextView` 加隐藏分隔符伪装 block tree，不自研完整文本渲染引擎。Undo 接 `NSUndoManager`，但 undo dispatch inverse intent/op、不直接改 TextKit buffer。

**确切问题：** NSTextView / UITextView / TextKit 是否适合作为 block-list 编辑器的**输入 / layout / selection / hit-test 机制**（每个文本块一个 text surface，非文本块用独立 native view）？TextKit 在哪些点**最容易**偷偷变成隐藏模型？如何把它约束在 mechanism-only？

**需产出的证据 / 命令：**

- 评估 TextKit 2（`NSTextLayoutManager` / `NSTextContentStorage`）与 TextKit 1 在「每块一个小 text view」下的取舍：性能（一个 Note 几十到上百块）、selection / hit-test 精度、IME（中日韩输入法 marked text）、accessibility、`NSAttributedString` ↔ Anchor `InlineRun`（文本 + typed range marks）的双向转换成本。
- 枚举 TextKit「偷偷成为模型」的高危点，并给出约束手段，至少覆盖：
  - **撤销：** `NSUndoManager` 默认会把文本 buffer 变更注册为可撤销 → 必须改为「undo 触发 dispatch inverse intent/op，TextKit buffer 由回放的 `EditorPatch` 重建」，而非让 TextKit 自己 undo。
  - **selection / range：** `NSRange` / `NSTextRange` 是平台对象，必须在 adapter 边界转成 `EditorSelection`（portable）+ UTF-16 offset，**永不持久化**（§4.2）。
  - **属性即真理诱惑：** 用 `NSAttributedString` 的 attribute 存语义（如把 ref / tag 塞进 attribute）会让 attributed string 变成隐藏文档模型 → marks 真理在 core `InlineRun`，attribute 仅为渲染派生。
  - **跨块 / 软换行：** `\n` 是行内软换行、硬 block 边界另起 block（§8.2 line ~413）；不能让一个 text view 跨越多个 block。
- 说明首期**单块文本选择 / block 选择 / 嵌入编辑器选择**（§6.1）在「每块独立 text view」架构下如何实现 selection 提升 / 降级；**跨 block 文本选择**为何作为独立 spike 后置（§6.1、§13「跨 block 选择低估」），以及在多 text view 架构下它的真实难点（连续 selection、IME、undo、accessibility）。

**Pass/Fail 判据：**

- **Pass：** 明确判定 TextKit 适合作 mechanism；逐条给出「成为隐藏模型」的高危点 + 约束手段（尤其 undo、selection、attribute-as-truth、跨块）；指出 TextKit 1 vs 2 选择倾向与理由。
- **Fail：** 只回答「能用」而不识别隐藏模型风险点，或未覆盖 undo / IME / 多 text view selection。

---

### V6 — EditorIntent / EditorPatch 边界对首期编辑行为的表达力

**Context：** §8.1 列 `EditorIntent` = insert text、replace range、split block、merge backward、exit-container-on-empty、indent/outdent（reparent）、
move block、transform block、apply mark、insert code block、paste fragment；`EditorPatch` = dispatch 接受事务后返回给 adapter 的**最小视图更新**；
`TransactionResult` 含 changed ids / selection hint / validation error / new revisions / freshness / stale snapshot conflict。§6.2 结构编辑与 §6.3 嵌套容器给出每个行为的语义。

**确切问题：** `EditorIntent` / `EditorPatch` 边界是否足以表达全部首期编辑行为，并把 patch 干净回放到 native view？哪些首期行为**无法**干净映射？

**需产出的证据 / 命令：**

- 一张映射表：每个首期行为（§6.2 的 `Enter` 拆分 / `Shift+Enter` 软换行 / 空 paragraph `Backspace` 合并删除 / 空 list-item·quote `Enter` 退出容器 / `Tab`·`Shift+Tab` reparent·reorder / 拖拽 handle move / 命令菜单 insert·wrap·transform / 粘贴进 importer / transform 保 block id 与 marks）→ 映射到哪个 `EditorIntent` → dispatch 产出哪类 op → `EditorPatch` 如何回放。
- 逐条 flag 映射困难点，至少检查：
  - **paste fragment：** 粘贴先进 importer / normalizer 再成 block tree 片段（§6.2）——`EditorPatch` 能否表达「一个 intent 产出多块 + 选择落点」的批量更新？
  - **transform：** paragraph→heading / paragraph→callout 必须**保留 block id 与可保留行内 marks**（§6.2 line ~204）——intent 是否携带足够信息让 dispatch 保 id？
  - **split / merge：** 冲突方案 §6.8 把 split/merge 定义为带 `macro_op_id`、作用于稳定 `target_id`、分解为既有 primitive 的 macro-op（绝不 opaque delete+create）——`EditorIntent` 的 split/merge-backward 是否与这套 macro-op 语义对齐？
  - **insert code block：** code block 内是嵌入编辑器选择（§6.1）、用平台专属 code 编辑 adapter（§6.3）——intent/patch 能否表达「进入 / 退出嵌入编辑器」的 selection 提升降级？
  - **indent/outdent：** 是 reparent（改 location register），不是文本缩进（§6.2 line ~199）——patch 回放是否会与 TextKit 的文本缩进混淆？
  - **selection hint round-trip：** `TransactionResult.selection_hint` 回到 native view 时，UTF-16 offset → `NSRange`/`NSTextRange` 的换算是否无歧义（与 V5 衔接）。
- 对每个 flag 给出「可表达 / 需扩展 intent / 落入 §13 暂停」三态判定。

**Pass/Fail 判据：**

- **Pass：** 全部首期行为有 intent→op→patch 映射；困难点（paste / transform 保 id / split-merge macro-op / 嵌入编辑器 selection / indent reparent / selection hint round-trip）逐条判定；任何无法干净映射的行为被明确 flag。
- **Fail：** 笼统说「够用」而不逐行为映射，或漏掉 paste / split-merge / transform 保 id 任一难点。

---

### V7 — iCloud Drive 文件包 spike 的验证方法

**Context：** §8.1 / §8.4 / §13「同步传输污染 core」：首期 transport = iCloud Drive 文件适配器（vault 作为 file package 放进 ubiquity
container 的 `Documents/`，`NSFileCoordinator` 协调读写、`.icloud` placeholder 下载、`NSMetadataQuery` 发现远端 segment）；**core 永不出现
CloudKit / iCloud 类型，只做普通文件 I/O**。§6.8 失败态要求一等呈现 sync pending / not-yet-downloaded / over-quota / iCloud unavailable·signed-out。
同步单元是不可变 op-segment 文件（§8.4 line ~447，iCloud Drive 无 delta 同步、改动整文件重传，故 segment 一封一密永不重传）。

**确切问题：** 如何在 Phase-1 验证 iCloud Drive file-package + `NSFileCoordinator` + `NSMetadataQuery` spike？需要哪些 entitlements / 配置？如何**证明 core 保持纯文件 I/O（无 CloudKit）**？如何制造并观测 `.icloud` placeholder 下载、sync-pending、not-yet-downloaded、over-quota、signed-out 各状态？

**需产出的证据 / 命令：**

- 列出所需 entitlements / Info.plist / 配置：iCloud capability、`NSUbiquitousContainers`（document file package 形态）、ubiquity container identifier、首启需登录的 iCloud 账户；说明哪些在 simulator 上可验证、哪些必须真机 / 真账户。
- 给出验证手段：
  - 用 `xcrun simctl` 或本机文件系统观察 ubiquity container 路径（如 `~/Library/Mobile Documents/...`）下 segment 文件的出现 / placeholder 化。
  - 触发 `.icloud` placeholder 下载（`startDownloadingUbiquitousItemAtURL:`）并用 `NSMetadataQuery` / `brctl`（`brctl log`、`brctl monitor`）观察下载与上传状态。
  - 制造 over-quota（填满配额或用受限测试账户）、signed-out（设置里登出 iCloud）、not-yet-downloaded（清本地副本只留 placeholder）并观测 app 是否一等呈现这些态（对应 §6.8）。
- **证明 core 纯文件 I/O 的方法（关键）：** 给出可执行的审计手段——对 Rust core 源码 grep（`CloudKit`、`CKRecord`、`CKAsset`、`NSMetadataQuery`、`NSFileCoordinator`、`ubiquit` 等符号必须**零命中** core，只在 Swift adapter 出现）；`OpSyncPort` 的接口只暴露 `SegmentId`/`BlobId` + 字节；core 唯一出网点是 adapter 门控的 `OpSyncPort::push`、可 grep 审计（§8.4 line ~449）。给出具体 grep 命令模式。
- 说明「不可变 segment、一封一密、永不重传」如何在 iCloud Drive 语义下验证（segment 文件写一次后 mtime / 内容不再变；新内容总是新 `<seq>.seg`）。

**Pass/Fail 判据：**

- **Pass：** entitlements / 配置清单完整；五个状态（pending / not-yet-downloaded / over-quota / signed-out / placeholder 下载）各有可制造 + 可观测的手段；给出可执行的「core 无 CloudKit 符号」grep 审计命令；区分 simulator vs 真机可验证范围。
- **Fail：** 只说「用 iCloud Drive」而无 entitlements / 状态制造方法，或未给出证明 core 纯文件 I/O 的审计手段。

---

### V8 — 哪些 Apple 侧事实会反向修改 Phase-0 契约

**Context：** 本 packet 是 step-2，step-3 要把你的证据回填进可批准的 CP-0。因此你必须**显式列出**：你的发现一旦为真，会强制改动 CP-0 的哪几条具体条款。

**确切问题：** 枚举具体的契约 clause，逐条说明「若发现 X，则该 clause 必须改为 Y」。至少覆盖以下 clause，并补充你认为遗漏的：

- **binding 机制（V3/V4）：** 若 UniFFI 在某 DTO / async / 字节 marshaling 上 FAIL → 改选 C ABI / 手写桥 / 改 DTO 形状；这会回写 §8.1 binding 边界与 spine 推荐。
- **布局（V1）：** 若 bun 不容忍 glob 下的 Rust/Xcode 目录 → 必须改 workspaces 或把 anchor 移出 `suites/*/*`（边界改动，Needs user approval），并回写方案 §12 的 `suites/anchor` 验证命令路径。
- **sync 状态（V7）：** 若某状态（over-quota / signed-out / placeholder）无法在 simulator 验证、或 iCloud Drive 无法在不碰 CloudKit 的前提下满足某需求 → 改 §6.8 失败态契约或同步 spike 计划。
- **UTF-16 offset 边界（spine / §8.2 line ~413）：** 若 Swift `String` ↔ Rust 字节的 UTF-16 换算在 marks clamp（冲突方案 §6.1「mark 存活」）上有歧义或成本不可接受 → 改 core 内部存储单位 / 换算边界 / offset 对外单位。
- **font source（§7.2 line ~321）：** 若「枚举原生 OS 字体」与「随包内置跨平台字体」二选一影响「未知字体被丢弃」语义 → 改 §7.2 字体来源决策。
- **blob cap vs CKAsset（§8.2 line ~423 / §8.4 line ~451）：** 若 64MB 单 blob cap 与 CKAsset 上限冲突在二期不可调和 → 现在就需在分片 / 降 cap / out-of-band 中预定一种，因为「op 形状须在任何 CloudKit 记录落地前冻结」（§8.4 line ~451）。
- **selection model（V5/V6 / §6.1）：** 若跨 block 文本选择在多 text view 架构下无法稳定（selection/IME/undo/accessibility）→ 维持 §6.1「首期只承诺单块 + block + 嵌入编辑器选择，跨 block 作独立 spike」；若连单块 selection 都有 round-trip 歧义 → 改 `EditorSelection` / UTF-16 offset 契约。

**需产出的证据 / 报告：**

- 一张 clause-impact 表：`clause → 触发发现 → 强制变更 → 关联 Vn`。
- 对每条标注严重度（blocking CP-0 批准 / 需 user approval / 可在 CP-1 spike 再定）。

**Pass/Fail 判据：**

- **Pass：** 上述每个 clause（binding / 布局 / sync 状态 / UTF-16 offset / font source / blob cap / selection）都有「发现→变更」映射并标严重度；补充任何额外 clause。
- **Fail：** 只泛泛说「可能要调整」而不绑定到具体 clause 与 Vn。

---

## 4. 交付与回报要求（给 Codex）

- 按 V1–V8 顺序，每项用 §3 的 (a)–(f) 六段结构回报。
- 所有命令必须**可复制**；本机只读探测结果标 **Observed** 并附输出摘要；推断标 **Inferred**；不可确定标 **Unknown** + 所需条件。
- **不产出任何实现**（不建工程、不写 Rust/Swift、不改 workspace / lockfile / tsconfig）。你的产物是**命令 + 成本 + 失败条件 + clause-impact**，供 step-3 整合进 CP-0。
- 若你发现 spine（§2）任一条与 Apple / 工具链现实矛盾，**显式标出矛盾**并指向 V8 对应 clause，不要静默顺从 spine。
