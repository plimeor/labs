# Anchor Phase 0 — Project Layout Options（项目落地位置候选）

日期：2026-06-06
状态：阶段0 workbench 候选分析。Codex 现实核验已完成（见 `apple-verification.md`）；**用户已于 2026-06-07 批准 Primary = Option A（`suites/anchor/`）**，Option C 降为实现期退路（仅当实测 Bun glob 容忍度或 Xcode 嵌套成本过高时启用）。
范围：本文件只回答「Anchor 的 Rust core / Apple app / CLI / fixtures / 契约 README / Xcode 工程落在仓库何处」这一个布局问题；本文下方各 Option 的 `Needs user approval` / `Needs Codex verification` 标注描述各候选的**固有门控**，最终采纳状态以本状态行与 `cp-0-approval.md` / `key-decisions.md` D02 为准。

> 本文件是 `docs/workbench/anchor/2026-06-06-phase-0/` 下的 workbench 工件，**不是**公开接口契约。按 AGENTS / CLAUDE，创建 workbench 目录**不授权**任何 package / workspace / app / 生成 lockfile 改动。本文不创建任何目录、不改 `package.json` / `bun.lock` / 任何 `tsconfig` / workspace 配置，也不写 Rust / Swift 代码。所有结构建议一律带 **Needs user approval**；所有涉及 Apple / Xcode 工程现实的判断一律带 **Needs Codex verification**。

---

## 1. 为什么布局是一个阶段0问题

主计划把「Apple 工程边界建议：工程位置、target、bundle、共享代码方式、验证命令」列为阶段0产物（plan §11 阶段0），并把「Package / workspace / Apple project 边界需要改变」列为必须暂停让用户决策的条件（plan §13 line ~748）。实现范围里也明确写了「Workspace / package 重组，除非阶段0明确需要并另行授权」为排除项（plan §9 line ~504）。因此选择落地位置本身就是一个需要用户签署的边界决策，本文只产出**带标注的候选与推荐**，不擅自落盘。

布局必须同时容纳四类**异构**产物，这是所有候选的共同张力来源：

- **平台无关 Rust core** `anchor-core`，内含无 UI 的 `anchor-editor-core` 内部模块（plan §8.1）。`anchor-editor-core` 是 `anchor-core` **内部模块**，不是独立 crate / package，只拥有 portable selection / intent shaping / patch 生成 / undo-intent 映射；tree invariant、schema-aware normalization、op 创建、merge、最终非法结构拒绝归 `anchor-core::dispatch`（plan §8.1 line ~354–364）。
- **Apple 原生 app**（macOS + iOS 首期，iPadOS 二位，其他平台最后；plan §3、§11），SwiftUI + AppKit / UIKit + TextKit，需要 Xcode 工程 / workspace 与 macOS / iOS target（plan §8.1、§12 line ~700 「Apple 工程创建后，阶段0补充 macOS 和 iOS 的实际 `xcodebuild` 命令」）。
- **CLI**：本地结构化命令契约（`apiVersion` 信封、固定退出码、`--format tsv|json`），是 Rust 二进制，**不是** `@plimeor/command-kit` 改写（plan §9 line ~505「将 Rust CLI 改写为 `@plimeor/command-kit`」列为排除），也**不是 MCP**。
- **fixtures + 契约 README**：阶段0 fixture set（plan §11 阶段0 line ~538）与权威 CLI / API / schema / file-format 契约。按 AGENTS「Package READMEs own public CLI, API, schema, file format」，契约 README 实现后归 `anchor-core` 包 README（plan 顶部 line ~6 也这么写）。

仓库现状（已核对，Observed）：`package.json` 的 `workspaces = ["apps/*", "packages/*", "suites/*/*"]`，三层都是 **bun/TS** workspace glob；`tsconfig.json` 的 `include` 只含 `apps/*/src`、`packages/*/src`、`suites/*/*/src` 下的 `**/*.ts(x)`（**TS/TSX only**）；`bun run check` = `tsc --noEmit`。现有 `apps/` 为空、`suites/` 只有 `imprint/react`、`packages/` 为 `{browser-peek, claudify, command-kit, git-kit, skills}`；**全仓库无 Rust / Cargo、无 Swift / Xcode**，Anchor 至今零代码、仅两份 plan 文档存在。

> 研究 caveat（Inferred / Unknown）：存在一条**陈旧** auto-memory 称 Anchor 已位于 `suites/anchor/{web,desktop,editor,core}`、为 React 19 + HeroUI v3 + CM6 实现。文件系统与 2026-06-06 的 Apple 原生 plan 都与之矛盾。本文以新 plan 为权威，把该旧记录仅记为**研究 caveat**，不作为事实。

核心张力（贯穿全文，对每个候选都要回答）：**Rust cargo workspace 与 Xcode 工程都不是 bun/TS package**——它们没有 `package.json`、其源码不是 `src/**/*.ts(x)`、不参与 `tsc --noEmit`，也不定义 AGENTS 要求的 `prepack`。任何把它们放进 `apps/*` / `packages/*` / `suites/*/*` glob 之下的方案，都依赖「bun 能否容忍 glob 命中的非-package 目录」这一未验证前提（**Needs Codex verification**），并构成 workspace 边界改动（**Needs user approval**）。

---

## 2. 候选一览（评估维度）

每个候选回答同一组维度：Rust core（含 `anchor-editor-core` 内部模块）落点、Apple app（macOS + iOS）落点、CLI 落点、fixtures 落点、docs / 契约 README 落点、Xcode 工程 / workspace 落点、是否符合 bun globs + TS-only `tsconfig` include（以及如何处理 Rust / Xcode 非-TS 的失配）、风险 / 验证成本 / 是否构成需批准的边界改动。

---

## 3. Option A — `suites/anchor/*`（内聚 suite 之家）

把 Anchor 整体放进一个新 suite `suites/anchor/`，作为产品的内聚之家。

| 维度 | 落点 |
|---|---|
| Rust core（含 `anchor-editor-core` 内部模块） | `suites/anchor/core/`：单一 cargo crate `anchor-core`，`anchor-editor-core` 是其内部 module（非独立 crate，对齐 plan §8.1）。 |
| Apple app（macOS + iOS） | `suites/anchor/apple/`：单一 Xcode 工程 / workspace，含 macOS + iOS（首期）两个 target，预留 iPadOS（plan §3 二位）；内含 Swift 编辑器 adapter 与 `OpSyncPort` 的 iCloud Drive 文件适配器实现。 |
| CLI | `suites/anchor/cli/`：Rust bin crate，与 `core` 同属一个**嵌套 cargo workspace**（`suites/anchor/Cargo.toml`）。 |
| fixtures | `suites/anchor/fixtures/`：跨 core / CLI / Apple 共用的 fixture vault 与 case 数据（plan §11 阶段0 fixture set）。 |
| docs / 契约 README | 契约 README 实现后随 `anchor-core` 落 `suites/anchor/core/README.md`（AGENTS：package READMEs own CLI/API/schema/file-format）。阶段0 草稿留在本 workbench 目录。 |
| Xcode 工程 / workspace | `suites/anchor/apple/`（同 Apple app 落点）。 |

**是否符合 bun globs + TS-only tsconfig：** 部分符合，且有真实失配。`suites/anchor/` 本身被 `suites/*/*` glob 命中，但其成员 `core` / `cli` / `apple` 是 cargo crate 与 Xcode 工程，**不是 bun/TS package**：无 `package.json`、源码非 `src/**/*.ts(x)`、不进 `tsc --noEmit`、不定义 `prepack`。处理方式只能是「让这些目录作为 glob 命中下的**非-package 目录**存在」，前提是 **bun 对 `suites/anchor/*` 下没有 `package.json` 的目录是否报错 / 是否拖累 `bun install` 仍未验证（Needs Codex verification）**。AGENTS 的 depth 规则（`suites/<suite>/*` 的 TS 包 extend `../../../tsconfig.json`）在此**不适用**，因为这些不是 TS 包——这本身说明 Anchor 与现有 suite（`imprint/react` 这类纯 TS 包）模型不同质。

**支撑此候选的硬证据：** plan 自己的验证命令就预设了 `suites/anchor` 这个路径——「在 `suites/anchor` 运行 `cargo test -p anchor-core`」「在 `suites/anchor` 运行 `cargo clippy -p anchor-core --all-targets`」（plan §12 line ~698–699）。这是文档中唯一被写死的目录线索，直接指向 Option A。

**风险：**
- bun/TS workspace glob 与 cargo workspace / Xcode 工程的范式冲突（见上）——是否触发 `bun install` 警告 / 失败属 **Needs Codex verification**。
- 把 Xcode 工程嵌套在 `suites/anchor/apple/` 是否符合 Xcode 对工程根、`DerivedData`、scheme、签名与相对路径 SPM 依赖的人体工学，**未验证**（Needs Codex verification）。
- 嵌套 cargo workspace（`suites/anchor/Cargo.toml`）与仓库根之间无父 cargo workspace，需确认 cargo 与 bun 各自的根发现互不干扰。

**验证成本（必须测）：** ① `bun install` / `bun run check` 在 `suites/anchor/*` 含非-package 目录时是否清洁通过；② `cd suites/anchor; cargo test -p anchor-core` / `cargo clippy -p anchor-core` 是否如 plan §12 所写可跑；③ Xcode 在该嵌套位置能否建出 macOS + iOS target 并产出可重复的 `xcodebuild` 命令（plan §12 line ~700）。

**边界判定：** 新建一个 suite = **workspace 边界改动 → Needs user approval**（plan §13 line ~748、§9 line ~504）。

---

## 4. Option B — `apps/anchor-*`（Apple 壳）+ `packages/anchor-*`（core / CLI 为跨 suite 包）

把 Apple app 放进 `apps/`，把 Rust core 与 CLI 当作 `packages/` 下的跨 suite 通用包。

| 维度 | 落点 |
|---|---|
| Rust core（含 `anchor-editor-core` 内部模块） | `packages/anchor-core/`：cargo crate `anchor-core`，`anchor-editor-core` 仍是其内部 module。 |
| Apple app（macOS + iOS） | `apps/anchor-macos/` 与 `apps/anchor-ios/`，或合并为 `apps/anchor-apple/`（共享 Swift 代码 + 两 target）；含 Swift 编辑器 adapter 与 iCloud Drive `OpSyncPort` 实现。 |
| CLI | `packages/anchor-cli/`：Rust bin crate。 |
| fixtures | `packages/anchor-core/fixtures/`（随 core）或独立 `packages/anchor-fixtures/`。 |
| docs / 契约 README | `packages/anchor-core/README.md`（AGENTS：契约归 core 包 README）。 |
| Xcode 工程 / workspace | 落在 `apps/anchor-apple/`（或分散在各 `apps/anchor-*`，更碎）。 |

**是否符合 bun globs + TS-only tsconfig：** 失配最广。`apps/*` 与 `packages/*` 这两层 glob 在 AGENTS 中明确是「standalone apps（TS）」与「cross-suite generic packages（TS）」——它们的成员被假设为 TS 包（extend `../../tsconfig.json`、定义 `prepack`、源码进 `tsc`）。把 cargo crate 塞进 `packages/*`、把 Xcode 工程塞进 `apps/*`，会让**两条** glob 同时命中非-package 目录，失配面比 Option A 更大（A 只污染一条 `suites/*/*`）。处理方式同样是「非-package 目录靠 bun 容忍」，但分布在两层，**Needs Codex verification** 的范围更广。

**额外语义错配：** AGENTS 把 `packages/*` 定义为「cross-suite generic packages」（跨套件通用），把 `apps/*` 定义为「standalone apps with no suite affiliation」（无套件归属的独立 app）。Anchor 的 core / CLI / Apple app 是**强耦合的同一产品**，不是跨套件复用的通用件，也不是彼此无关的独立 app——把它们拆进 `packages/*` + `apps/*` 会割裂这种内聚性，且与 plan §12 写死的 `suites/anchor` 验证路径直接冲突（那条命令假定 core 在 `suites/anchor` 下）。

**风险：**
- 同 Option A 的所有 Rust / Xcode × bun glob 失配，且横跨 `apps/*` + `packages/*` 两层。
- 产品内聚性被拆散，core 与 Apple app 的相对路径（Swift 包对 `anchor-core` 的 FFI 产物引用、XCFramework 输出位置）跨越 `packages/` ↔ `apps/` 顶层，路径更脆。
- 与 plan §12 验证命令的路径假设冲突（`suites/anchor`），需要改写 plan 的验证命令或额外说明。

**验证成本（必须测）：** 同 A 的 ①②③，外加确认 `apps/*` 与 `packages/*` 两层同时含非-package 目录时 bun 的行为，以及跨顶层目录的 FFI / XCFramework 产物引用路径是否可维护。

**边界判定：** 同时新建 `apps/*` 与 `packages/*` 成员 = **更大范围的 workspace 边界改动 → Needs user approval**。

---

## 5. Option C — 独立 Apple 工程树（Xcode 完全在 bun glob 之外）+ Rust core 入仓

把 Xcode 工程放到**完全不被 bun glob 命中**的顶层非-workspace 目录，只让 Rust core（及随其的 CLI）以受控方式入仓。

| 维度 | 落点 |
|---|---|
| Rust core（含 `anchor-editor-core` 内部模块） | 二选一：`packages/anchor-core/`（跨 suite 包位）**或** `suites/anchor/core/`（suite 位）。无论哪种，仍是单 crate + 内部 `anchor-editor-core` module。 |
| Apple app（macOS + iOS） | **顶层非-workspace 目录**，例如 `anchor-apple/`（与 `apps` / `packages` / `suites` 平级，**不**匹配任何 `apps/*` / `packages/*` / `suites/*/*` glob）。 |
| CLI | 作为 Rust bin 落在 core 的 cargo workspace 内（`<core-dir>/../cli` 或同 workspace 的 `cli` crate）。 |
| fixtures | 随 core（`<core-dir>/fixtures/`）。 |
| docs / 契约 README | 随 `anchor-core` 的 `README.md`。 |
| Xcode 工程 / workspace | `anchor-apple/`（顶层非-workspace 目录）。 |

**是否符合 bun globs + TS-only tsconfig：** 失配面最小且最干净。Xcode 工程位于顶层 `anchor-apple/`，**不匹配任何 glob**，因此 bun `workspaces` 与 `tsc include` 从不尝试把它当 TS 包——Xcode 工程的非-TS 性质从根上被隔离开，无需依赖「bun 容忍 glob 下非-package 目录」这一未验证假设来安放 Apple 工程。残留失配只剩 Rust core 本身：若 core 放 `packages/anchor-core/` 或 `suites/anchor/core/`，core crate 仍是 glob 下的非-package 目录，仍需 Codex 验证 bun 是否容忍（但这是单点失配，且 Rust 工具链对相对路径远比 Xcode 宽容）。

**与 plan §12 验证命令的关系：** 若把 core 放 `suites/anchor/core/`，则 plan §12 的 `cd suites/anchor; cargo test -p anchor-core` 仍成立；若放 `packages/anchor-core/`，验证命令路径需改写。因此 Option C 的「core 放 suites」变体在验证命令上与 Option A 一致，差别只在 Apple 工程被提到顶层 glob 之外。

**风险：**
- 顶层非-workspace 目录脱离 bun workspace 的统一治理（不被 `bun install` / `bun run check` 触及），需要单独的构建 / CI 入口与文档，团队需接受「Apple 工程不在 bun 工作流内」这一事实。
- Rust↔Swift 的 FFI 产物（UniFFI 生成的 Swift binding，推荐打成 XCFramework / Swift Package；plan §8.4 line ~453「UniFFI 为自然选择」，**Needs Codex verification**）需要跨「入仓 core 目录」与「顶层 `anchor-apple/`」传递，产物路径 / SPM 本地依赖 / XCFramework 引用需明确约定。
- 顶层新目录是否被仓库其他工具（lint / format / 根脚本）误扫，需确认（但不改 glob 即不进 bun 工作流）。

**验证成本（必须测）：** ① 确认顶层 `anchor-apple/` 不被任何 glob 命中、不拖累 `bun install` / `bun run check`；② Rust core（无论 packages 还是 suites 位）的 `cargo test` / `cargo clippy` 可跑；③ UniFFI → XCFramework / Swift Package 产物从入仓 core 跨到顶层 Xcode 工程的引用链可重复构建（Needs Codex verification）；④ Apple 工程的独立 CI / `xcodebuild` 入口。

**边界判定：** 新增顶层非-workspace 目录 + 新增 core 包 = **workspace 边界改动 → Needs user approval**（即便 Xcode 树不进 glob，新增 core 包与顶层目录仍触 plan §13 line ~748）。

---

## 6. 三候选对比小结

| 维度 | Option A（suites/anchor/*） | Option B（apps/* + packages/*） | Option C（顶层 Apple 树 + 入仓 core） |
|---|---|---|---|
| glob 失配面 | 一条（`suites/*/*` 下含非-package 目录） | 两条（`apps/*` + `packages/*` 同时含非-package 目录） | 最小（Apple 工程在所有 glob 之外；仅 core 单点失配） |
| 产品内聚性 | 最强（单 suite 之家） | 最弱（core/CLI/app 拆三处） | 中（core 入仓，Apple 工程分离） |
| 与 plan §12 `suites/anchor` 验证命令 | 直接吻合 | 冲突（需改写） | core 放 suites 变体吻合；放 packages 变体需改写 |
| Xcode 嵌套人体工学风险 | 高（嵌在 glob 下，Needs Codex verification） | 高（嵌在 `apps/*` 下） | 低（顶层独立工程） |
| AGENTS 语义贴合 | 贴合（suite = theme-scoped group） | 错配（core/CLI 非「跨套件通用」，app 非「无套件归属」） | 中 |
| 是否边界改动 / 需批准 | 是 / Needs user approval | 是（更大） / Needs user approval | 是 / Needs user approval |

---

## 7. Recommended structure（推荐结构）

**推荐 Option A：`suites/anchor/*` 作为 Anchor 的内聚之家。整条推荐标注 Needs user approval；Xcode 嵌套现实性标注 Needs Codex verification。本文不创建任何目录。**

推荐理由（与 AGREED SPINE 与 plan 自身一致）：

1. **plan 自己的验证命令写死了这个路径。** plan §12（line ~698–699）要求「在 `suites/anchor` 运行 `cargo test -p anchor-core`」与「在 `suites/anchor` 运行 `cargo clippy -p anchor-core --all-targets`」。这是文档中唯一被写死的目录线索，直接、唯一地指向 `suites/anchor`。Option B 与「core 放 packages」的 C 变体都会与这条命令冲突。
2. **产品内聚性最强。** Anchor 的 core（含 `anchor-editor-core` 内部模块）、CLI、Apple app、fixtures、契约 README 是同一产品的强耦合组成，AGENTS 把 `suites/<suite>/*` 定义为「theme-scoped groups of related packages」，语义上正是为这种内聚而设；而 `packages/*`（跨套件通用）与 `apps/*`（无套件归属的独立 app）都与 Anchor 的耦合形态错配。
3. **失配面比 Option B 小。** 只污染一条 `suites/*/*` glob，而非 `apps/*` + `packages/*` 两条。

推荐结构（**illustrative，Needs user approval，本文不落盘**）：

```text
suites/anchor/
  Cargo.toml          # 嵌套 cargo workspace（Needs user approval；非 bun/TS）
  core/               # Rust crate anchor-core（含 anchor-editor-core 内部 module）
    README.md         # 实现后为权威 CLI/API/schema/file-format 契约（AGENTS）
    fixtures/         # 阶段0 fixture set（可上提为 suites/anchor/fixtures/）
  cli/                # Rust bin crate（结构化本地命令契约，非 command-kit、非 MCP）
  apple/              # Xcode 工程/workspace：macOS + iOS target（首期），预留 iPadOS
                      #   Swift 编辑器 adapter + OpSyncPort 的 iCloud Drive 文件适配器实现
  fixtures/           # 跨 core/CLI/apple 共享 fixtures（与 core/fixtures 二选一，阶段0定）
```

**必须诚实陈述的张力（不掩盖）：**

- **bun/TS glob vs Rust/Xcode 的范式冲突是真实的，不是纸面问题。** `suites/anchor/{core,cli,apple}` 都不是 bun/TS package：无 `package.json`、源码非 `src/**/*.ts(x)`、不进 `tsc --noEmit`、不定义 AGENTS 要求的 `prepack`。本推荐依赖「bun 容忍 `suites/anchor/*` 下的非-package 目录而不报错 / 不拖累 `bun install` / `bun run check`」这一**未验证前提** → **Needs Codex verification**。
- **把 Xcode 工程嵌套在 `suites/anchor/apple/` 是否符合 Xcode 人体工学未验证**（工程根、`DerivedData`、scheme、签名、相对路径 SPM / XCFramework 引用）→ **Needs Codex verification**。若 Codex 验证表明 Xcode 嵌套在 glob 下不可行或代价过高，**fallback 是 Option C**：把 Apple 工程提到顶层非-workspace 目录 `anchor-apple/`、core 仍留 `suites/anchor/core/`，从而既保住 plan §12 的验证路径，又把 Xcode 工程移出 glob——这是失配面更小的退路。
- **UniFFI → XCFramework / Swift Package 是推荐的 binding / 打包路径，但是阶段0待定决策。** plan §8.4 line ~453 写「UniFFI 为自然选择」，候选还包括 C ABI / Swift Package / XCFramework（plan §8.1 line ~341）。binding 机制与产物布局相互影响（产物落在 `suites/anchor/core/` 下何处、Apple 工程如何引用），需与 binding 决策一起在 CP-0 敲定 → **Needs Codex verification**。
- **采纳 Option A = workspace / 边界改动**，触发 plan §13 line ~748「Package / workspace / Apple project 边界需要改变」的暂停条件与 plan §9 line ~504「Workspace / package 重组……另行授权」→ **整条推荐 Needs user approval**。本 workbench 文件不构成该授权，也不创建任何目录。

**留给 CP-0 的并入项（与本布局耦合）：** binding 机制（UniFFI vs 其他）与产物打包形态（XCFramework / Swift Package）、`suites/anchor` 下 bun 与 cargo 双根发现的兼容性、Xcode 嵌套可行性的 Codex 实测结论、以及 fixtures 是随 core 还是上提为 suite 级目录。
