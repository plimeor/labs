# Anchor Apple Verification — Consolidated Evidence (Phase-0 → Stage-1 CP-1 Apple half)

任务：合并并脱敏 Anchor Apple 现实性核验证据（Phase-0 toolchain/binding/TextKit/iCloud 现实性 + Stage-1 CP-1 Apple-half verifier round）。
日期：2026-06-10
状态：**workbench evidence（consolidated）—— 非公开接口契约**

> **边界声明（AGENTS 工作台规则，强制）：** 本文件**不授权**任何 package / workspace / 产品 app / 生成 lockfile / core 改动；它只汇总 Apple 侧现实性证据。权威接口契约属于未来的 `anchor-core` README，不在本文件。本文件没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置，没有创建产品 app shell，没有向 `suites/anchor/core` 引入 Apple / iCloud / file-coordination 类型。生成产物位于 `/tmp/anchor-apple-stage1/**` 与 `/tmp/anchor-apple-verification-demo-20260607` 等 repo 外路径；repo-local Apple 工程是 **verifier-only** macOS project，不是 Anchor 产品 target。**CP-1 Apple half 尚未退出。**

标注约定：

- **Observed** — 本机命令输出或本仓文件直接支持。
- **Source-supported** — Apple / 第三方官方文档支持（developer.apple.com 等），非本机 Observed。
- **Inferred** — 由 Observed 推出的工程判断。
- **Not run** — 未执行的验证项，不能当作已验证事实。
- **Blocked** — 尝试过但被环境/能力边界拦下，不能作为 evidence。

---

## 1. Executive conclusion

**Apple-native 路线在本机可执行；其中最 load-bearing 的发现是：付费 ADP Individual team 可以为一个 demo bundle id 配置 iCloud Documents entitlement，并在已登录 iCloud 的物理设备上拿到 non-nil ubiquity container；free Personal Team 做不到（Xcode capability library 直接 `No Matches`）。但 Anchor 产品 target build 与完整 iCloud Drive runtime 行为仍未退出，CP-1 Apple half 留在 compromise 形状。**

- **Phase-0 已被本机证明：** 完整 Xcode 26.5（经 `DEVELOPER_DIR` 启用）、macOS/iOS/iOS-Simulator SDK 26.5；SwiftPM + C ABI + Rust `staticlib` link/run；UniFFI 0.31.1 minimal record/bytes binding 生成/编译/运行；`NSTextView` 运行时 UTF-16 selection/layout/semantic-undo；iCloud adapter API（`NSMetadataQuery` / `NSFileCoordinator` / ubiquity）的 macOS+iOS compile surface。
- **iCloud capability 边界（核心结论）：** iCloud Documents entitlement **不是** free Personal Team 能力，也**不能**用手写 entitlement blob 或 ad-hoc 签名替代。只有付费 ADP team 的 provisioning profile + 最终 app signature 同时携带匹配 iCloud entitlements 才算 proof。ad-hoc + iCloud entitlement 的 app 会被 SpringBoard 拒绝启动（`Security policy issue`）。
- **Stage-1 已扩到 runtime：** 物理 iPhone 上 signed iCloud app 拿到 non-nil ubiquity container，并通过 container lookup、package UTType、coordinated read/write、current-segment download call、1024-file 子集写入；macOS signed `.app` 进一步证明 `.anchorvault` package 级元数据发现、package-internal direct enumeration 到 100K 文件、online convergence、offline `NSFileVersion` conflict 物化。
- **仍未退出（Stage 1 / 产品 runtime）：** Anchor 产品 app target、完整 Anchor iCloud runtime、remote `.icloud` placeholder、iOS/非-macOS large-scale delivery、signed-out / over-quota、product conflict-resolution policy、TextKit 产品 runtime、binding async/CI 门、cross-target execution CI。

---

## 2. Observed environment

### 2.1 Repo / Anchor code state

**Observed：**

- `cwd = <HOME>/Documents/labs`；`package.json` workspaces = `["apps/*", "packages/*", "suites/*/*"]`；`tsconfig.json` `include` 只匹配 `src/**/*.ts(x)` 路径，不扫描 Rust/Swift source。
- Phase-0 时 `suites/anchor` 不存在；Stage-1 时 Codex 在 `suites/anchor/apple/**` 落地 verifier-only 工程与 reports（详见 §3.1）。
- `find suites/anchor -name package.json -print | wc -l` → `0`；`bun install --dry-run --frozen-lockfile --ignore-scripts` Bun glob check 通过，没有写 lockfile。
- `git status --short` 在 rerun 时为空（验证产物全在 `/tmp`）。

**Inferred：** root TypeScript checking 不扫 Rust/Swift；未解析风险是 Bun workspace/filter 行为而非 TS。给 Rust/Xcode 目录加 placeholder `package.json` 会把它们变成 Bun workspace member 并触发 AGENTS package 义务——不要为适配 glob 这么做。

### 2.2 Toolchain (Observed)

| 项 | Observed |
|---|---|
| Xcode（经 `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`） | `Xcode 26.5`, `Build version 17F42` |
| 默认 `xcode-select -p` | `/Library/Developer/CommandLineTools`（默认态下 `xcodebuild` 失败，须用 `DEVELOPER_DIR` 前缀） |
| SDKs | macOS 26.5, iOS 26.5, iOS Simulator 26.5（+ tvOS/visionOS/watchOS 26.5） |
| Simulators | iOS 26.2 / 26.4 / 26.5 设备可用（含 iPad Pro M5、iPad mini A17 Pro 等，初始均 Shutdown） |
| Swift | `Apple Swift version 6.3.2`, target `arm64-apple-macosx26.0` |
| SwiftPM | `Swift Package Manager - Swift 6.3.2` |
| Rust | `rustc 1.95.0`, `cargo 1.95.0` |
| Rust targets | Phase-0：仅 `aarch64-apple-darwin`；Stage-1 起已安装 `aarch64-apple-ios` / `aarch64-apple-ios-sim` |
| UniFFI | global `uniffi-bindgen` 不存在；`uniffi 0.31.1` 可经 project-local `cargo run --bin uniffi-bindgen-swift` 使用 |
| codesign identity | Xcode account/team 配好后 `security find-identity -v -p codesigning` 报 1 个 valid `Apple Development: <DEVELOPER_NAME> (<TEAM_ID>)`（cert SHA-1 = `<SIGNING_HASH>`） |
| Xcode account state | ADP 开通后 `defaults read com.apple.dt.Xcode` 报 `teamID = <TEAM_ID>`, `teamName = <DEVELOPER_NAME>`, `teamType = Individual`, `isFreeProvisioningTeam = 0` |
| 项目生成器 | `xcodegen` / `tuist` / Ruby `xcodeproj` 均不可用；`xcodebuild` 无 create-project 子命令 |
| bun | `1.3.14` |

**Inferred：** 验证命令用 `DEVELOPER_DIR` 前缀（不改全局 `xcode-select`，持久 `sudo xcode-select -s` 是用户环境选择，不是仓库要求）。本机无 scratch `.xcodeproj` 自动生成工具，所以工程须 Xcode GUI 或手写 `.pbxproj`。

### 2.3 Phase-0 scratch demo (Observed)

Repo 外 scratch：`/tmp/anchor-apple-verification-demo-20260607`（Rust `staticlib` + SwiftPM executable C-ABI link + SwiftPM TextKit/iCloud adapter library + minimal UniFFI crate + `NSTextView`/iCloud runtime probes），及两个 minimal UIKit simulator app 对照组 `/tmp/anchor-icloud-{entitlement,noentitlement}-app-probe-20260607`。

| 路径 / 探针 | Observed result |
|---|---|
| Rust `aarch64-apple-darwin` staticlib build | exit 0 |
| Rust `aarch64-apple-ios-sim` build（Phase-0，target 未装） | exit 101 `can't find crate for std`（须 `rustup target add`） |
| SwiftPM executable C-ABI link+run Rust staticlib | exit 0；输出 `ffi:add=42`、`ffi:summary blocks=4 bytes=4096`（真 link 到 Rust symbol，非仅编译 header） |
| SwiftPM TextKit/iCloud adapter library，macOS build | exit 0 |
| 同一 SwiftPM package，`generic/platform=iOS Simulator` build | exit 0 `** BUILD SUCCEEDED **`（用 `iPhoneSimulator26.5.sdk`） |
| `xcodebuild -create-xcframework`（单 macOS slice + headers） | exit 0 `xcframework successfully written out` |
| `xcodebuild -list -packagePath <path>` | exit 64（本机 Xcode 26.5 不接受 `-packagePath`；须从 package cwd 跑 `xcodebuild -list`） |
| UniFFI minimal：bindgen 生成 Swift/header/modulemap + compile/link/run | exit 0；smoke 输出 fixture summary、`segment=16`、1/4/16/64MB transfer timing |
| UniFFI 64MB `bytes -> Data` debug transfer（`/usr/bin/time -l`） | 1MB 37ms / 4MB 152ms / 16MB 588ms / 64MB 2353ms；max RSS `266895360`（≈267MB） |
| `NSTextView` runtime probe | `textkit:utf16=16 storage=16`、`textkit:selected=1:8`、`textkit:layout=true container=true`、`textkit:undo_events=semantic-inverse-intent` |
| 无-entitlement CLI iCloud probe | `icloud:container_nil=true`、`metadata_query scopes=1`、`coordinated_bytes=7 coordinator_error=none`、`is_ubiquitous=false`、`start_download_error=NSCocoaErrorDomain:512` |
| simulator boot/shutdown（`<DEVICE_MODEL>`，id `<DEVICE_ID>`） | exit 0；bootstatus `Finished` at `00:40`，随后 `Shutdown` |

**Inferred：** SwiftPM + C ABI + Rust staticlib host path 不是理论路径；UniFFI minimal record+bytes path 也跑通（比"推荐但未尝试"强）。但 64MB 单次 UniFFI `Data` transfer ≈2.35s / 267MB RSS — UniFFI 适合 DTO/normal dispatch，bulk blob hot path 须 Stage 1 再决策。Multi-platform XCFramework 仍需 iOS Rust slices + 匹配 headers。

### 2.4 Phase-0 signing/provisioning demo (Observed)

用户授权保留的 demo project `<HOME>/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj`（Platform iOS, App template, bundle id `<BUNDLE_ID>`, org id `<ORG_PREFIX>`）。

- **Free Personal Team 阶段：** Xcode automatic signing 初次报 `Invalid trust settings`（`Apple Development: <DEVELOPER_NAME> (<TEAM_ID>)`）。用户点 `Repair Trust Settings` 后，普通 development provisioning 成功：generic iOS device build exit 0，profile `iOS Team Provisioning Profile: <BUNDLE_ID>`（UUID `<PROFILE_UUID>`），signed `.app` 通过 `codesign --verify`。
- **关键负向边界：** 同一 Personal Team target 下 Xcode `+ Capability` 搜 `iCloud` 返回 `No Matches`。→ 普通 development provisioning 已证，**iCloud capability provisioning 未证，且本环境 free team 不可用**。

**Inferred：** signing identity 在 `security find-identity` 可 valid，但 trust settings 非 system-default 时 automatic signing 仍会拒签。Apple 文档说 capability library 按 membership 过滤；free team 看不到 iCloud 足以把 iCloud 视为该层不可用能力。

### 2.5 ADP iCloud entitlement — physical-device runtime (Observed, load-bearing)

用户开通 ADP（team → paid Individual）后，同一 demo project 增加 iCloud capability 配置（`SystemCapabilities.com.apple.iCloud.enabled = 1`，entitlements 声明 `com.apple.developer.icloud-services = [CloudDocuments]` + container/ubiquity ids = `[<ICLOUD_CONTAINER>]`，`icloud-container-environment = Development`）。

| Command | Observed result |
|---|---|
| `plutil -lint ...entitlements` | exit 0 |
| `xcodebuild ... -destination 'generic/platform=iOS' -allowProvisioningUpdates build` | exit 0；profile `iOS Team Provisioning Profile: <BUNDLE_ID>`（`<PROFILE_UUID>`） |
| `security cms -D -i ...<PROFILE_UUID>.mobileprovision` | TeamName `<DEVELOPER_NAME>`；profile entitlements 含 `application-identifier`、`team-identifier`、`get-task-allow`、`icloud-services`、`icloud-container-identifiers`、`icloud-container-development-container-identifiers`、`icloud-container-environment`、`ubiquity-container-identifiers`、`ubiquity-kvstore-identifier` |
| `codesign -d --entitlements :- ...<BUNDLE_ID>.app`（device） | exit 0；签名 app entitlements 含 `application-identifier=<TEAM_ID>.<BUNDLE_ID>`、`team-identifier=<TEAM_ID>`、`get-task-allow=true`、`icloud-services=[CloudDocuments]`、iCloud + ubiquity container ids |
| `devicectl list devices` | `<DEVICE>` connected；CoreDevice id `<DEVICE_ID>`；model `<DEVICE_MODEL>` |
| `devicectl device info details ...` | 物理 iPhone，UDID `<DEVICE_UDID>`，iOS 26.5，Developer Mode enabled，paired，wired，booted |
| `xcodebuild ... -destination 'platform=iOS,id=<DEVICE_UDID>' -allowProvisioningUpdates build` | exit 0（physical-device build） |
| `devicectl device install app ...` | exit 0（bundle id `<BUNDLE_ID>`） |
| `devicectl device process launch ... --icloud-runtime-probe` | exit 0；app 打印 `icloud-runtime:explicit_nil=false`、`implicit_nil=false`；两路径均 `/private/var/mobile/Library/Mobile Documents/<ICLOUD_CONTAINER>`；exit 0 |
| simulator install + launch（同 app） | install exit 0；launch exit 0（pid 观察到）；但 simulator runtime `icloud-runtime:explicit_nil=true`、`implicit_nil=true`（推测 simulator 未登录 iCloud / 无真实 Drive context） |

**ad-hoc 对照组（Observed Blocked）：** `/tmp/anchor-icloud-noentitlement-app-probe-20260607`（无 entitlement）build/sign/install/launch 成功，app 内 ubiquity lookup 返回 nil。`/tmp/anchor-icloud-entitlement-app-probe-20260607`（手工嵌 iCloud entitlement）`codesign --verify` 通过、`simctl install` 成功，但 `simctl launch` 被 SpringBoard 拒（`FBSOpenApplicationServiceErrorDomain`），`simctl spawn` 报 exit 163 `Security policy issue`。

**Inferred（核心）：** 手写 entitlements file 单独不构成权限证明；关键证据是 provisioning profile **与**最终 app signature 同时携带匹配 iCloud entitlements。ADP Individual team + automatic signing 能为该 demo bundle id 生成授权 iCloud Documents 的 development profile，paired/Developer-Mode/已登录 iCloud 的物理 iPhone 能返回 non-nil ubiquity container URL。

---

## 3. Stage-1 CP-1 Apple-half evidence

### 3.1 Codex Apple spike files (repo-local, verifier-only)

**Observed — added under `suites/anchor/apple/`：** C ABI FFI wrapper（`ffi/Cargo.toml`、`ffi/include/AnchorCoreFFI.h`、`ffi/src/lib.rs`）；SwiftPM `AnchorAppleSpike`（C shim + `AnchorCoreBindings.swift` + smoke/TextKit/iCloud probe sources）；UniFFI wrapper（`uniffi/Cargo.toml`、`build.rs`、`anchor_core_uniffi.udl`、`SwiftSmoke/smoke.swift`）；macOS iCloud probe sources；**repo-local Xcode project `AnchorMacICloudProbe`（`SUPPORTED_PLATFORMS = macosx`，verifier-only）**。Workbench reports `17`/`18`/`19`/`20`.

**Generated artifacts kept out of repo（`/tmp/anchor-apple-stage1/`）：** `ffi-target`、`AnchorCoreFFI.xcframework`、`uniffi-target`、`uniffi-generated`、`AnchorCoreUniFFI.xcframework`、`swift-build*`、`DerivedData/*`。

**Repo-external runtime probes（under `<HOME>/Documents`）：** `AnchorMacICloudProbe.xcodeproj`（bundle id `<BUNDLE_ID>`，初始 container `<ICLOUD_CONTAINER>`），及 shared-container conflict 测试用的 `AnchorProvisionProbe` / `AnchorMacICloudProbe` 扩展（shared container `<ICLOUD_CONTAINER>`，conflict launch flag `--icloud-conflict-probe <runID> <startEpochMs> <writer> <mode> <iterations> <settleSeconds>`）。

**Intentionally NOT changed by Codex：** root `package.json` / `bun.lock` / Bun workspace config；`suites/anchor/Cargo.toml`；`suites/anchor/core/**`；任何产品 app shell、产品 app entitlement/bundle id/provisioning profile/iCloud container；任何 repo-local 产品 app target（repo-local Xcode project 是 verifier-only macOS project）。

### 3.2 Build / binding / multi-target (Observed, passed)

- `anchor-core` builds for macOS、iOS、iOS Simulator。
- 独立 C ABI FFI wrapper builds 三个 staticlib slices；三-slice XCFramework 创建成功。
- 独立 UniFFI wrapper builds 三个 staticlib slices；generated Swift source/header/modulemap 成功；三-slice XCFramework 成功。
- UniFFI generated Swift smoke 调用 fixture summary、`EditorIntentDto`、`TransactionResultSummary`、typed `ValidationErrorCode`、post-dispatch snapshot revision、`SegmentId`、segment bytes、blob bytes。
- Release-surface rerun 创建 C ABI + UniFFI 两套三-slice XCFramework，并以 `-swift-version 6 -strict-concurrency=complete -warnings-as-errors` 跑 generated Swift；generated Swift compiles for macOS / iOS device SDK / iOS Simulator SDK。
- SwiftPM wrapper imports FFI surface；macOS Swift smoke 调 fixture summary、dispatch insert、typed `ValidationErrorCode`、segment bytes、blob bytes。
- **C ABI bytes benchmark** 1/4/16/64MB 通过：64MB ≈ **38.22ms**，max RSS ≈ **96MB**（对比 Phase-0 UniFFI 64MB ≈2.35s / 267MB → C ABI 是 bulk bytes 的合理 fast-path）。

### 3.3 TextKit (Observed)

- macOS smoke 通过 UTF-16 selection / layout / semantic-undo probe；iOS Simulator compile 通过；iCloud adapter macOS/iOS compile 通过。
- **Not run（产品 runtime gate）：** real app responder-chain direct-buffer undo suppression、IME marked text、accessibility、full patch replay、cross-view selection。TextKit 运行时工作 MainActor-bound。

### 3.4 macOS signed `.app` iCloud runtime (Observed, repo-local verifier reproducible)

Rerun（2026-06-10）复跑 repo-local signed macOS verifier，形状不变：

| 命令 / 项 | Observed |
|---|---|
| `xcodebuild ... AnchorMacICloudProbe ... -allowProvisioningUpdates build` | `** BUILD SUCCEEDED **`；`Signing Identity: "Apple Development: <DEVELOPER_NAME> (<TEAM_ID>)"`；`Mac Team Provisioning Profile: <BUNDLE_ID>`（`<PROFILE_UUID>`） |
| `codesign -d --entitlements :- ...AnchorMacICloudProbe.app` | `application-identifier = <TEAM_ID>.<BUNDLE_ID>`、`icloud-container-identifiers = <ICLOUD_CONTAINER>`、`icloud-services = CloudDocuments`、`team-identifier = <TEAM_ID>`、`ubiquity-container-identifiers = <ICLOUD_CONTAINER>`、`app-sandbox = true` |
| `plutil -p ...Info.plist` | `CFBundleIdentifier = <BUNDLE_ID>`；`NSUbiquitousContainers.<ICLOUD_CONTAINER>`；`UTTypeIdentifier = <ORG_PREFIX>.anchor.vault`；`UTTypeConformsTo = com.apple.package`；`public.filename-extension = anchorvault` |
| `security cms -D -i ...embedded.provisionprofile` | `Mac Team Provisioning Profile: <BUNDLE_ID>`；UUID `<PROFILE_UUID>`；TeamName `<DEVELOPER_NAME>`；`IsXcodeManaged = true` |
| `AnchorMacICloudProbe --icloud-runtime-probe` | `explicit_nil=false`、`implicit_nil=false`；`container_path=<HOME>/Library/Mobile Documents/<ICLOUD_CONTAINER>`；`vault_type_identifier=<ORG_PREFIX>.anchor.vault`；`vault_is_ubiquitous=true`；`coordinated_segment_bytes=30`、`coordinated_segment_equal=true`；`segment_is_ubiquitous=false`、`segment_download_status=nil`；`evict_segment_error` / `start_download_error` = `NSCocoaErrorDomain Code=4`；`manifest_conflict_versions=0`；`metadata_initial_gathered=true`、`metadata_seg_count=0`；`scale_subset_files=1024`、`scale_subset_direct_count=1024` |
| `--icloud-scale-probe 10000` | `direct_count=10000`、`enum_ms=24.46`、`metadata_count=0`、`write_ms≈3341`、`cleanup_ms≈1225` |

**更早 Stage-1 scale 证据（Observed，不重复 rerun）：** package-internal direct enumeration 10K `3634.66ms` write / `22.53ms` enum、50K `18455.09ms` / `124.70ms`、100K `38509.85ms` / `269.50ms`；signed `.app` 证明 `.anchorvault` `package_metadata_count=1`、1024 hidden `.anchor` segment + 128 visible package-internal segment、`NSMetadataQuery` 不枚举 package-internal `.seg`（能枚举 package-external `.seg`）；package-internal placeholder/download 返回 `NSCocoaErrorDomain:4`。

**Shared-container conflict harness（Observed，更早 Stage-1）：** coordinated mode 两端收敛 macOS `seq=79`、`conflict_versions=0`；raw-write mode 两端收敛 iOS `seq=119`、`conflict_versions=0`；offline fork：iPhone offline 后 iOS 写 `ios-offline`、macOS 写 `mac-online`，reconnect 选 `ios-offline` 为 current 并暴露 1 个未解决 `NSFileVersion` conflict（含 `mac-online` JSON）。**Resolution/removal 仍 open。**

### 3.5 iOS Simulator iCloud runtime (Blocked — not valid evidence)

Rerun 尝试用手工 simulator app 跑 iCloud runtime：

- 无 entitlement simulator executable `simctl spawn` exit 0 但 `explicit_nil=true` / `implicit_nil=true`（**因无 app entitlement，不是 iCloud account 失败证明**）。
- ad-hoc signed simulator app bundle：`codesign` 可读出 iCloud entitlements、`simctl install` 成功，但 `simctl launch` 被 SpringBoard 拒（`SBMainWorkspace` / `Launchd job spawn failed`），log 报 `Executable ... had no entitlements` + `NSPOSIXErrorDomain Code=163`。

**Interpretation：** 手工/ad-hoc simulator bundle **不是** iOS iCloud runtime 的可接受证据。下一轮最低风险 action = 用 **Xcode-managed iOS app target / project** 跑 simulator iCloud runtime。

### 3.6 Boundary audits (Observed, passed)

- core cloud-symbol grep（`CloudKit|CKRecord|CKAsset|CKContainer|CKSyncEngine|NSFileCoordinator|NSMetadataQuery|ubiquit|iCloud|NSURLIsExcludedFromBackupKey` over `suites/anchor/core`）→ **0 matches**（exit 1）。
- Apple-side deterministic-semantics grep（`diff3|order-key|key_between|merge|normaliz|canonical_serialize|blake3` over `suites/anchor/apple`）→ exit 1（无泄漏）。Apple spike code 不含 merge / normalization / op creation / tree invariants / diff3 / order-key / persistent app writes。
- `find suites/anchor -name package.json` → `0`；`git status --short` → empty。

---

## 4. Decision state (CP-1 Apple half)

| 决策 | 状态 | Evidence 摘要 |
|---|---|---|
| **D01 binding** | `UniFFI DTO / ordinary dispatch + C ABI bytes fast path` | UniFFI 覆盖 fixture summary / dispatch / typed `ValidationErrorCode` / changed snapshot / segment id / segment+blob bytes round-trip；synchronous generated Swift 过 Swift 6 strict concurrency + warnings-as-errors（release artifacts）；bulk segment/blob bytes 走 C ABI（64MB≈38ms）。async `Sendable` / wrapper / CI gates 未跑。 |
| **DTO / error vocab** | structured envelope 保持 | Core DTO 暴露 typed `ValidationError`（stable `code/message`）；C ABI 与 UniFFI Swift 均 assert `direct_active_to_deleted`。 |
| **TextKit** | compromise / mechanism-only | macOS UTF-16 selection/layout/semantic-undo + iOS simulator compile 已证；direct-buffer undo suppression / IME / accessibility / full patch replay = 产品 runtime gate。 |
| **iCloud Drive (B14)** | compromise；approved default transport with constraints | container lookup / package UTType / coordinated R-W / package-level metadata discovery / macOS 100K direct enumeration / online convergence / offline `NSFileVersion` conflict 物化 已证；package-internal `.seg` discovery **不依赖** `NSMetadataQuery`，须 direct enumeration。 |
| **iCloud 剩余门** | open | product conflict-resolution policy、remote placeholder、signed-out / over-quota、local-only edge cases、iOS large-scale delivery、million-op core replay/compaction + steady-state segment budget。 |
| **Core boundary** | go | Apple spike 无 merge/normalization/op-creation/tree-invariants/diff3/order-key/persistent writes；cloud-symbol audit 0 matches。 |

### 4.1 Axis matrix（current verdict，dedup of reruns）

| Axis | Verdict |
|---|---|
| core deterministic | go |
| multi-target compile | go |
| zero-cloud-symbol boundary | go（live audit exit 1） |
| binding (B4) | approved boundary / release-gated |
| TextKit | compromise / mechanism-only |
| iCloud Drive (B14) | approved default transport with compromise constraints |
| layout / retention | compromise |
| cross-target execution CI | not run |
| **CP-1 whole-exit** | **未退出** |

---

## 5. Source-supported scale / mechanics caveats

iCloud adapter 机制面有官方文档支持，但 Apple 对**规模 / 性能数字一律不文档化** → "API 编译面可行" ≠ "iCloud 同步在 Anchor 规模下可行"，规模须实测。下列为 Source-supported（developer.apple.com），与本机 Observed 区分：

- **`NSMetadataQuery`**：两相（initial gathering → live-update）；`notificationBatchingInterval` 默认 1.0s（合并窗口非延迟保证）；`results` 整份 copy 有性能/内存问题，应用 `result(at:)`。未文档化：任意文件数下的延迟/内存上限/重投递/主线程阻塞。
- **Placeholder / dataless / eviction**：`URLUbiquitousItemDownloadingStatus`、`startDownloadingUbiquitousItem`、`evictUbiquitousItem`（只删本地）；读 dataless 触发同步 materialize（"can take a long time"，可致 watchdog crash）；OS 按 LRU 自动驱逐不通知。无 batch/预取 API。
- **`NSFileCoordinator`**：同步阻塞；未下载项 coordinated read "blocks (potentially for a long time)"；后台带 presenter 跨进程死锁须 `removeFilePresenter`。
- **`NSFileVersion` / conflict**：iCloud 自动建版本，winner "on some basis"（不透明）、**无自动内容 merge**、loser 持续占配额直到 `removeOtherVersions`。→ 不可变 write-once-per-device segment 永不进 conflict 路径；共享可变 manifest 是文档级多 writer 隐患（默认 per-device cursor）。
- **quota / account**：`ubiquityIdentityToken`（nil=未登录）、`NSUbiquityIdentityDidChange`（账号切换硬边界，绝不跨 identity 合并 segment）；over-quota 仅反应式错误（`NSUbiquitousFileNotUploadedDueToQuotaError`），无预查 API、无收敛保证。
- **file package（`com.apple.package`）**：声明后 iCloud + `NSMetadataQuery` 当单 document（否则枚举内部文件）；增量"only changed elements"但 element 未定义；只整包原子写。
- **`NSUbiquitousKeyValueStore`**：硬上限 1MB 总 / 1024 key / 1MB 单值；服务端 recency check、无 merge hook。→ 只配作极小 per-device cursor hint。
- **CloudKit / CKSyncEngine（scale gate no-go 时转向候选）**：server change-token + push（免文件枚举）、内建 batching；CKRecord ~1MB、CKAsset 50MB（仅 archived 文档）。→ 结构上更适合 million 小对象；但 64MB blob cap 与 50MB Asset field 冲突，CloudKit route 进 schema 前须 split/lower/out-of-band 决策。CloudKit 保持二期，schema 不进 core。

> **Prior-art（Inferred，非 Apple）：** log compaction 用 causal stability + min-of-known-frontiers（非 wall-clock；Kafka lagging-consumer 教训）；time-travel retention 用 snapshot+delta / archive 而非硬删（Datomic excision、Git/Dolt reachability GC、event-sourcing snapshot + read-time upcasting）。

---

## 6. Repo-local Apple project boundary

- `suites/anchor/apple/AnchorMacICloudProbe` 是 Xcode 创建的 **macOS-only verifier**（`SUPPORTED_PLATFORMS = macosx`），不是 Anchor 产品 target。
- 它用 CloudDocuments-only entitlement，container `<ICLOUD_CONTAINER>`，经 `CODE_SIGN_ENTITLEMENTS=AnchorMacProbe.entitlements` / `INFOPLIST_FILE=AnchorMacProbeInfo.plist` / `GENERATE_INFOPLIST_FILE=NO`。
- standalone signed macOS CLI 对 restricted iCloud entitlements 仍 invalid，必须用真实 `.app`。
- 任何 `suites/anchor/{core,cli,apple,fixtures}`、`apps/anchor-*`、`packages/anchor-*`、顶层 fallback `anchor-apple/`、Xcode project/workspace、Swift Package、entitlements、bundle id、iCloud container、root workspace/lockfile/tsconfig 改动，**均需用户批准**后才能创建。

---

## 7. Remaining work / open gates

去重后的 open gates（每项只列一次）。Owner 标注：**Apple-runtime** = 需本机 Apple 运行时执行；**Human** = 需用户批准/账号能力；**Codex/core** = Rust/binding 侧。

| Gate | 状态 | Owner |
|---|---|---|
| Repo-local signed **Anchor 产品 app target**（当前仅 verifier） | Not run | Human（批准 target/bundle id/entitlement）→ Codex |
| 完整 Anchor target iCloud runtime | Not run | Apple-runtime（产品 target 创建后） |
| iOS / 非-macOS iCloud runtime（Xcode-managed iOS app，非手工 bundle） | Blocked → Needs Xcode-managed iOS target | Apple-runtime |
| iOS physical-device `NSMetadataQuery`（probe 窗口内 0 segment 结果） | Not run / re-observe | Apple-runtime |
| remote `.icloud` placeholder download（当前仅 local package-internal `Code=4`） | Blocked（无真实 remote placeholder） | Apple-runtime |
| product conflict-resolution policy（`NSFileVersion` 物化已观察，resolution/removal 未定） | Not run | Human（policy）→ Codex |
| signed-out / over-quota states | Not run | Apple-runtime + Human（真实 account） |
| non-macOS large-scale delivery + steady-state segment budget | Not run | Apple-runtime |
| million-op core replay / compaction | Not run | Codex/core |
| TextKit 产品 runtime（responder-chain undo suppression / IME / accessibility / patch replay / cross-view selection） | Not run | Apple-runtime |
| binding async `Sendable` / wrapper / CI release gates | Not run | Codex |
| cross-target execution CI wiring | Not run | Codex/CI |
| paid ADP Team / bundle id / iCloud container / capability / signing mode for **Anchor product** | Needs human approval | Human |
| **CP-1 whole-exit** | **未退出** | — |

**Next lowest-risk action：** 用 Xcode-managed iOS app target / project 跑 simulator iCloud runtime（替换手工 bundle），或在 iOS 工程创建被推迟时先 wire cross-target execution CI。本轮未学到 model 调整，无 backfill 到 `04` / `05` / `06`。
