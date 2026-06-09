# Anchor Phase 0 — Apple/Xcode/Swift-Rust/TextKit 现实性核验

日期：2026-06-07
状态：Step 2 Codex verification artifact；只验证现实性，不批准实现，不创建工程。

范围：

- 本文件只回填会影响 CP-0 contract 的 Apple / Xcode / Swift-Rust / TextKit / iCloud Drive 证据。
- 本文件没有在 repo 内创建 `suites/anchor`、Xcode project、Swift Package、Rust crate 或 app。
- Repo 外验证资产包括 `/tmp/anchor-apple-verification-demo-20260607`、`/tmp/anchor-icloud-entitlement-app-probe-20260607`、`/tmp/anchor-icloud-noentitlement-app-probe-20260607`，以及用户授权保留的 `~/Documents/AnchorProvisionProbe` Xcode UI demo。它们只验证本机 Apple toolchain / SwiftPM / Rust staticlib / C ABI / TextKit API / iCloud adapter API 编译面、simulator app signing / entitlement 边界、Xcode UI automatic signing/provisioning 行为，以及 paid Apple Developer Program team 下的 iCloud entitlement provisioning，不是 Anchor 项目目录。
- 本文件没有修改 `package.json`、`bun.lock`、workspace、package boundary 或 Claude draft 文件。

标注：

- **Observed**：本仓文件、命令输出或官方文档直接支持。
- **Inferred**：由 Observed 推出的工程判断。
- **Recommended**：建议写入 CP-0 的目标状态或命令骨架。
- **Unknown**：现有证据不足，需用户批准、未来项目文件或 Stage 1 spike。
- **Not run**：未执行的验证项，不能当作已验证事实。

---

## 1. Executive conclusion

**结论：Claude 草案的 Apple 方向总体可执行；本机已证明 paid Apple Developer Program team 可以为 demo app 生成 iCloud Documents entitlement profile，但 Anchor app 构建和 iCloud Drive runtime 行为仍只能留给 Stage 1。**

- **可进入 CP-0：** Apple-native 首期路线、Rust `anchor-core` 真理层、Apple 客户端进程内 binding、TextKit mechanism-only、iCloud Drive adapter 只给 core 喂 `SegmentId` / `BlobId` + bytes。
- **已被本机证明：** Xcode 26.5 / SDK / simulator 可用；SwiftPM + Rust staticlib C ABI 可 build/link/run；UniFFI 0.31.1 minimal record/bytes binding 可生成并运行；TextKit adapter compile/runtime 最小面可用；普通 iOS development signing/provisioning 可用；paid ADP Individual team 下 iCloud Documents entitlement profile、device app signature、simulator launch smoke 和 physical iPhone ubiquity container lookup 均可用。
- **必须修改：** iCloud entitlement 不是 free Personal Team 能力，也不是手写 entitlement blob 能替代的能力；CP-0 应写成 user-approved ADP team + App ID + iCloud container + provisioning profile 约束，而不是普通本地 build fact。
- **仍是 Unknown / Stage 1：** Anchor macOS/iOS target build、Anchor DTO/error/async binding 成本、TextKit 多 text surface selection、Anchor target iCloud entitlement/container proof、file package placeholder/conflict/quota/runtime 行为。

**Observed：默认开发目录是 Command Line Tools，但 `/Applications/Xcode.app` 可用。** `xcode-select -p` 仍指向 `/Library/Developer/CommandLineTools`；在这个默认状态下 `xcodebuild -version` / `-showsdks` 会失败。但用一次性 `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` 后，观察到 `Xcode 26.5 (Build 17F42)`、macOS SDK 26.5、iOS SDK 26.5、iOS Simulator SDK 26.5，以及 iOS 26.2 / 26.4 / 26.5 simulator 设备列表。因此 CP-0 可以记录 Xcode/SDK/simulator availability 为 Observed；未来 target build 仍只能写为 **Recommended command skeleton / Not run**，因为 Anchor Xcode project 尚不存在。

**Observed：scratch demo 证明了 Apple build surface 的关键路径。** macOS 上 Rust `staticlib` 可以被 SwiftPM executable 通过 C ABI link 并实际调用；`xcodebuild -create-xcframework` 可以把该 Rust staticlib + headers 打成 macOS slice XCFramework；一个 SwiftPM library 可以在 macOS 编译 `NSTextView` adapter 形态和 `NSMetadataQuery` / `NSFileCoordinator` adapter API；同一个 SwiftPM library 可以用 Xcode 26.5 针对 `generic/platform=iOS Simulator` 编译 `UITextView` / iCloud adapter API。这个 demo 仍没有证明 Anchor DTO、iOS Rust slice 或真实 iCloud Drive account/runtime 行为。

**Observed：targeted probes 覆盖了 binding、TextKit 和 signing 边界。** UniFFI minimal binding 可以生成、编译、链接并传输 `bytes -> Data`；64MB 单次 debug transfer 约 2.35s，max RSS 约 267MB。macOS `NSTextView` runtime probe 可以设置 UTF-16 selection，layout manager / text container 可用，`UndoManager` semantic undo closure 可执行。iCloud scratch CLI 在无 signed app/entitlement 下 `url(forUbiquityContainerIdentifier:nil)` 返回 nil。用户授权的 Xcode UI demo 先证明 free Personal Team 只能普通 app signing；用户开通 ADP 后，同一 demo project 已证明 iCloud Documents entitlement profile、signed device artifact 和 physical iPhone ubiquity container lookup。

**CP-0 可保持：**

- **Platform route**：macOS + iOS 首期，iPadOS 后续，其他平台最后。
- **Core boundary**：Rust `anchor-core` 拥有 truth / model / dispatch / merge / op-log / DTO owner；Apple、CLI、sync adapter 都是外壳。
- **Editor boundary**：TextKit / `NSTextView` / `UITextView` 只承担 input、layout、selection、hit-testing；`EditorIntent` / `EditorPatch` 是 adapter contract；TextKit buffer 不是真理。
- **Sync boundary**：iCloud Drive 首期 adapter 可以作为 file transport；core 不出现 CloudKit、`NSFileCoordinator`、`NSMetadataQuery`、ubiquity 类型。
- **Binding direction**：UniFFI + generated Swift + XCFramework / SwiftPM binary wrapper 是当前最合理推荐路径。

**必须修改后才能进 CP-0：**

- D01 / binding wording：把“UniFFI 为自然选择”改成“Recommended path, gated by Stage 1 binding spike”。原因是 scratch C ABI demo 证明了 Swift-Rust staticlib link 可行，但本机未安装 `uniffi-bindgen`，且 UniFFI 官方文档标出 Swift 6 support 仍有 rough edge，async `Sendable` 已知不完全。
- V2 / build wording：把 macOS / iOS build command 写成命令骨架；显式写 **Observed: Xcode/SDK/simulator available via `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`; scratch SwiftPM/Xcode demo builds pass; Anchor target build not run because project does not exist**。
- D02 / layout wording：保留 `suites/anchor/*` 作为推荐，但必须标 `Needs user approval`；同时补上 fallback：若 Bun glob 或 Xcode 嵌套成本高，Apple project 移到 glob 外的顶层目录，core 仍可留 `suites/anchor`。
- D17 / blob cap wording：首期 iCloud Drive 不受 CloudKit `CKAsset` 限制；但二期 CloudKit 路线不能带着 64MB 单 blob cap 直接进入，Apple archived CloudKit Web Services data size limits 写着 Asset field 最大 50MB。CP-0 必须把 CloudKit 分片 / 降 cap / out-of-band 作为二期前置决策。
- D18 / offset wording：对外 UTF-16 是合理的 Apple 边界，但 core 内部单位和 Swift/Rust 转换必须在 Stage 1 用 emoji、ZWJ、combining mark、IME marked text fixture 验证。
- TextKit wording：跨 block 连续文本选择继续保持 Stage 1 spike / 非首期能力；不要把“跨 block 文本选择允许形成 intent”写成首期 UI 承诺。
- iCloud wording：file package 必须声明符合 `com.apple.package` 的文档类型，否则 Apple 文档说明 iCloud 默认会把 file wrapper 内容当普通目录枚举。

**需要用户批准：**

- 创建任何 `suites/anchor`、`apps/anchor-*`、`packages/anchor-*`、顶层 `anchor-apple/`、Xcode project / workspace、Swift Package、Rust crate、entitlements、bundle id、iCloud container。
- 选择最终 layout（Option A vs fallback Option C）和是否接受 `suites/*/*` 下存在非 Bun package 目录。
- 绑定机制作为产品分发边界冻结（UniFFI + XCFramework / SwiftPM binary wrapper，或 Stage 1 后改选 C ABI fast path）。
- iCloud Drive 同步作为首期产品路线以及 local-only 防误放语义；CloudKit / CKSyncEngine 继续留二期。
- Apple Developer Program Team、bundle id、iCloud container id、capability 设置、automatic/manual signing mode；iCloud capability 会创建或绑定 Apple Developer 侧 App ID/container。

**必须留给 Stage 1 spike：**

- Anchor Xcode project 创建后，macOS target / iOS simulator target build。
- UniFFI 对 Anchor DTO、structured errors、sync/async boundary、1/4/16/64MB bytes transfer 的成本实测。
- TextKit / `NSTextView` / `UITextView` 事件到 `EditorIntent`、`EditorPatch` 回放到 native view model 的 spike。
- iCloud Drive adapter：signed-in iCloud 环境下的 ubiquity container、file package、`NSMetadataQuery`、placeholder download、file coordination、conflict version、signed-out / over-quota 状态观测。
- diff3 和 fractional order-key 的 macOS / iOS byte-reproducible consistency vectors；推荐这些算法只在 Rust core 中执行，不由 Swift/TextKit 各自实现。

---

## 2. Observed environment

### 2.1 Repo workspace structure

**Observed：**

- `cwd = /Users/plimeor/Documents/labs`。
- `package.json` workspaces 为 `["apps/*", "packages/*", "suites/*/*"]`。
- `tsconfig.json` `include` 只包含：
  - `apps/*/src/**/*.ts`
  - `apps/*/src/**/*.tsx`
  - `packages/*/src/**/*.ts`
  - `packages/*/src/**/*.tsx`
  - `suites/*/*/src/**/*.ts`
  - `suites/*/*/src/**/*.tsx`
- `apps/` 存在但当前没有 app workspace。
- `packages/` 当前可见：`browser-peek`、`claudify`、`command-kit`、`git-kit`、`skills`。
- `suites/` 当前只有 `imprint/react`。
- `bun pm ls` 只列出 5 个 workspace package：`@plimeor/browser-peek`、`@plimeor/claudify`、`@plimeor/command-kit`、`@plimeor/git-kit`、`@plimeor/skills`。
- `bun install --dry-run` 在当前仓库完成，输出 workspace package 与依赖列表，没有写 lockfile。
- `rg --files -g 'Cargo.toml' -g '*.swift' -g '*.xcodeproj' -g '*.xcworkspace' -g 'Package.swift' -g '!node_modules/**' -g '!**/node_modules/**'` 无输出，退出码 1。

**Observed：Anchor code directory does not exist.**

- 当前没有 `suites/anchor`。
- 当前没有 `apps/anchor-*`。
- 当前没有 `packages/anchor-*`。
- 当前没有可复用 Apple project / Swift Package / Rust crate。

**Inferred：** 当前仓库没有任何可直接构建或复用的 Apple/Rust Anchor 实现。CP-0 只能批准目标边界、命令骨架和 Stage 1 验证计划。

### 2.2 Local toolchain

**Observed commands：**

| Command | Observed result |
|---|---|
| `find /Applications -maxdepth 2 -name 'Xcode*.app' -print` | `/Applications/Xcode.app` |
| `mdfind "kMDItemCFBundleIdentifier == 'com.apple.dt.Xcode'"` | `/Applications/Xcode.app` |
| `xcode-select -p` | `/Library/Developer/CommandLineTools` |
| `xcodebuild -version` | failed: `tool 'xcodebuild' requires Xcode`, active developer directory is Command Line Tools |
| `xcodebuild -showsdks` | same failure as above |
| `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -version` | `Xcode 26.5`, `Build version 17F42` |
| `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -showsdks` | DriverKit 25.5; iOS 26.5; iOS Simulator 26.5; macOS 26.5; tvOS 26.5; tvOS Simulator 26.5; visionOS 26.5; visionOS Simulator 26.5; watchOS 26.5; watchOS Simulator 26.5 |
| `xcrun --version` | `xcrun version 72.` |
| `xcrun --sdk macosx --show-sdk-path` | `/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk` |
| `xcrun --sdk macosx --show-sdk-version` | `26.5` |
| `xcrun --sdk iphonesimulator --show-sdk-version` | failed: SDK `iphonesimulator` cannot be located |
| `xcrun simctl list devices available` | failed: unable to find utility `simctl` |
| `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun --sdk macosx --show-sdk-path` | `/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX26.5.sdk` |
| `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun --sdk macosx --show-sdk-version` | `26.5` |
| `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun --sdk iphonesimulator --show-sdk-version` | `26.5` |
| `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun simctl list devices available` | available devices observed for iOS 26.2, 26.4, and 26.5, including iPhone 17 Pro, iPhone 17 Pro Max, iPhone Air, iPhone 17, iPad Pro 13-inch (M5), iPad Pro 11-inch (M5), iPad mini (A17 Pro), iPad Air, and iPad (A16); all listed devices were Shutdown |
| `swift --version` | `Apple Swift version 6.3.2`, target `arm64-apple-macosx26.0` |
| `swift package --version` | `Swift Package Manager - Swift 6.3.2` |
| `xcrun --find swiftc` | `/Library/Developer/CommandLineTools/usr/bin/swiftc` |
| `xcrun --find clang` | `/Library/Developer/CommandLineTools/usr/bin/clang` |
| `rustc --version` | `rustc 1.95.0 (59807616e 2026-04-14)` |
| `cargo --version` | `cargo 1.95.0 (f2d3ce0bd 2026-03-21)` |
| `rustup target list --installed` | `aarch64-apple-darwin` only |
| `rustup target list \| rg "apple-ios\|apple-darwin"` | available but not installed: `aarch64-apple-ios`, `aarch64-apple-ios-sim`, `x86_64-apple-ios`, etc. |
| `uniffi-bindgen --version` | failed: command not found |
| `cargo search uniffi --limit 8` | observed `uniffi = "0.31.1"` |
| `cargo info uniffi` | observed `uniffi 0.31.1` features include `bindgen`, `build`, and `cli`; binaries include `uniffi-bindgen` and `uniffi-bindgen-swift` when `cli` is enabled |
| `security find-identity -v -p codesigning` | after Xcode account/team setup: `Apple Development: <DEVELOPER_NAME> (<TEAM_ID_ALT>)` and `1 valid identities found` |
| `security find-certificate -a -c "Apple Development" -p \| openssl x509 -noout -subject -issuer -serial -dates` | observed certificate subject includes `OU=<TEAM_ID>`, issuer `Apple Worldwide Developer Relations Certification Authority`, valid `Jun 6 2026` to `Jun 6 2027` |
| `find "$HOME/Library/MobileDevice/Provisioning Profiles" -maxdepth 1 -name '*.mobileprovision' -print \| wc -l` | `0`; this legacy/default profile directory did not receive the Xcode managed profile |
| `find "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles" -maxdepth 1 -name '*.mobileprovision' -print` | after ADP iCloud build, observed `3b6e4dcd-0537-4357-8589-662074237ad7.mobileprovision` |
| `defaults read com.apple.dt.Xcode ... \| rg 'teamID\|teamName\|teamType\|isFreeProvisioningTeam'` | after ADP enrollment, observed `teamID = <TEAM_ID>`, `teamName = "<DEVELOPER_NAME>"`, `teamType = Individual`, `isFreeProvisioningTeam = 0` |
| `command -v xcodegen` | no output; `xcodegen` not found |
| `command -v tuist` | no output; `tuist` not found |
| `ruby -e 'require "xcodeproj"'` | failed: `cannot load such file -- xcodeproj` |
| `bun --version` | `1.3.14` |

**Observed Xcode / MCP state：**

- `mcp__computer_use.get_app_state` on Xcode observed Xcode Version 26.5 Welcome window with `No Recent Projects`; no project was open.
- `mcp__xcodebuildmcp.session_show_defaults` observed `projectPath`, `workspacePath`, `scheme`, simulator, and bundle id all null.
- `mcp__xcodebuildmcp.discover_projs` scanning `/Users/plimeor/Documents/labs` at max depth 6 observed `projectCount=0` and `workspaceCount=0`.

**Observed implication：**

- macOS command-line Swift / SwiftPM 可用。
- 当前 active developer directory 是 CLT，但完整 Xcode 26.5 已安装，并且可通过单次命令前缀 `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` 使用。
- 通过该 `DEVELOPER_DIR` 可以访问 iOS Simulator SDK 26.5 和 simulator 设备列表。
- Rust 当前只能构建 host Apple target `aarch64-apple-darwin`；Stage 1 Apple binding spike 前必须安装 iOS 和 iOS simulator Rust targets。
- UniFFI tooling 没有作为全局 binary 安装；未来应通过 `suites/anchor` Cargo workspace vendored / pinned bindgen crate 固定版本。
- free Personal Team 普通 app signing/provisioning 已验证；ADP Individual team 下 iCloud Documents entitlement provisioning 已验证。
- 本机没有 `xcodegen` / `tuist` / Ruby `xcodeproj`，因此自动生成 scratch `.xcodeproj` 需要手写 `.pbxproj`、安装额外工具或用 Xcode GUI；这些都不是 CP-0 contract 必需证据。
- Xcode UI signing/provisioning 证据集中记录在 §2.5；ADP iCloud entitlement 证据集中记录在 §2.6。

### 2.3 Not run

**Not run：**

- 没有运行 Anchor `xcodebuild` target build，因为当前没有 Anchor Xcode project 或 scheme。
- 没有安装或运行 Anchor iOS app；scratch 层已经 boot 并 shutdown 一个 iOS simulator。
- 没有为 Anchor 运行 `swift build`，因为当前没有 Anchor Swift package。
- 没有为 Anchor 运行 `cargo build`、`cargo test` 或 `cargo clippy`，因为当前没有 Anchor Cargo workspace。
- 没有为 Anchor 运行 UniFFI generation；scratch 层已经通过 project-local `uniffi 0.31.1` 生成并运行 Swift bindings。
- 没有运行 Anchor 真实 iCloud app target；repo 外 demo 已验证 ADP iCloud entitlement provisioning、device artifact signing、simulator launch smoke 和 physical iPhone ubiquity container lookup。
- 没有运行完整 TextKit editor behavior spike，包括 input event capture、IME、accessibility、hit-testing、跨 view selection；scratch 层只验证 macOS runtime selection/layout/semantic undo。
- 没有创建 Bun-workspace scratch repo 去模拟 `suites/*/*` 下无 `package.json` 目录；repo 外 scratch demo 只验证 Apple toolchain。

### 2.4 Scratch demo verification

**Observed：** 创建了 repo 外 scratch demo：`/tmp/anchor-apple-verification-demo-20260607`。

Scratch 内容：

- `rust/`：minimal Rust `staticlib` crate `anchor_demo_core`，暴露 `anchor_demo_add` 和 `anchor_demo_summary` 两个 `extern "C"` symbols。
- `swift-ffi/`：SwiftPM executable `AnchorDemo`，通过 C header / C target link Rust staticlib。
- `swift-textkit/`：SwiftPM library `AnchorTextKitProbe`，包含 `NSTextView` / `UITextView` adapter compile probe，以及只向 core 暴露 `SegmentId` / bytes 的 iCloud adapter API compile probe。
- `uniffi/`：minimal UniFFI UDL + Rust crate，暴露 `FixtureSummary` record 和 `read_segment(size) -> bytes`。
- `textkit-runtime/`：macOS `NSTextView` runtime probe，验证 UTF-16 length、selection、layout manager、text container、semantic undo closure。
- `icloud-runtime/`：Foundation iCloud boundary probe，验证无 entitlement CLI 下的 ubiquity container lookup、`NSMetadataQuery`、`NSFileCoordinator` 和 non-ubiquitous download error。
- `/tmp/anchor-icloud-entitlement-app-probe-20260607`：minimal UIKit simulator app，ad-hoc signed，并手工嵌入 iCloud Documents entitlements。
- `/tmp/anchor-icloud-noentitlement-app-probe-20260607`：同款 minimal UIKit simulator app，无 entitlements 对照组。

**Observed commands：**

| Command | Observed result |
|---|---|
| `env DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer cargo build --manifest-path /tmp/anchor-apple-verification-demo-20260607/rust/Cargo.toml --target aarch64-apple-darwin` | exit 0；Rust `anchor_demo_core` staticlib 成功 build for `aarch64-apple-darwin` |
| `env DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift run --package-path /tmp/anchor-apple-verification-demo-20260607/swift-ffi AnchorDemo` | exit 0；成功 build and run；输出包含 `ffi:add=42` 和 `ffi:summary blocks=4 bytes=4096` |
| `env DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift build --package-path /tmp/anchor-apple-verification-demo-20260607/swift-textkit` | exit 0；macOS SwiftPM build 成功编译 `EditorAdapterProbe.swift` 和 `ICloudAdapterProbe.swift` |
| `env DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -list -packagePath /tmp/anchor-apple-verification-demo-20260607/swift-textkit` | exit 64；当前 Xcode usage 不接受 `-packagePath` |
| `env DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -list` in `/tmp/anchor-apple-verification-demo-20260607/swift-textkit` | exit 0；成功 resolve package，并列出 scheme `AnchorTextKitProbe` |
| `env DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -scheme AnchorTextKitProbe -destination 'generic/platform=iOS Simulator' -configuration Debug -derivedDataPath /tmp/anchor-apple-verification-demo-20260607/derived/textkit-ios build` | exit 0；`** BUILD SUCCEEDED **`；build 使用 `iPhoneSimulator26.5.sdk`，并编译包含 `arm64-apple-ios17.0-simulator` 的 simulator targets |
| `env DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer cargo build --manifest-path /tmp/anchor-apple-verification-demo-20260607/rust/Cargo.toml --target aarch64-apple-ios-sim` | exit 101；失败信息为 `can't find crate for std`；Rust 报告 `aarch64-apple-ios-sim` target may not be installed，并建议 `rustup target add aarch64-apple-ios-sim` |
| `env DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -create-xcframework -library /tmp/anchor-apple-verification-demo-20260607/rust/target/aarch64-apple-darwin/debug/libanchor_demo_core.a -headers /tmp/anchor-apple-verification-demo-20260607/swift-ffi/Sources/AnchorDemoBridge/include -output /tmp/anchor-apple-verification-demo-20260607/AnchorDemoCore.xcframework` | exit 0；输出 `xcframework successfully written out` |
| `cargo run --manifest-path ~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/uniffi-0.31.1/Cargo.toml --features cli --bin uniffi-bindgen-swift -- --help` | exit 0；observed CLI accepts `--swift-sources`、`--headers`、`--modulemap`、`--xcframework`、`--module-name`、`--modulemap-filename` |
| `env DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer cargo build --manifest-path /tmp/anchor-apple-verification-demo-20260607/uniffi/Cargo.toml --target aarch64-apple-darwin` | exit 0；UniFFI scaffolding Rust crate build succeeded |
| `cargo run ... --bin uniffi-bindgen-swift -- --swift-sources --headers --modulemap --module-name anchor_demo_uniffiFFI ...` in `uniffi/` cwd | exit 0；generated `anchor_demo_uniffi.swift`、`anchor_demo_uniffiFFI.h`、`module.modulemap` |
| `env DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swiftc ... generated-plain/anchor_demo_uniffi.swift smoke.swift ...` | exit 0；generated Swift compiled and linked against `libanchor_demo_uniffi.dylib` |
| `/tmp/anchor-apple-verification-demo-20260607/uniffi/uniffi-smoke` | exit 0；输出 `uniffi:title=scratch-vault blocks=3 payload=4`、`uniffi:segment=16 first=0`、1MB/4MB/16MB/64MB bytes transfer timings |
| `/usr/bin/time -l /tmp/anchor-apple-verification-demo-20260607/uniffi/uniffi-smoke` | exit 0；1MB 37ms、4MB 152ms、16MB 588ms、64MB 2353ms；maximum resident set size `266895360` |
| `env DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swiftc -parse-as-library .../textkit-runtime/Probe.swift ... && .../textkit-probe` | exit 0；输出 `textkit:utf16=16 storage=16`、`textkit:selected=1:8`、`textkit:layout=true container=true`、`textkit:undo_events=semantic-inverse-intent` |
| `env DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swiftc -parse-as-library .../icloud-runtime/Probe.swift ... && .../icloud-probe` | exit 0；输出 `icloud:container_nil=true`、`icloud:metadata_query=NSMetadataQuery scopes=1`、`icloud:coordinated_bytes=7 coordinator_error=none`、`icloud:is_ubiquitous=false`、`icloud:start_download_error=NSCocoaErrorDomain:512` |
| `env DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun simctl boot 748BA2B7-DB31-425E-9152-15CDA08E474C && ... bootstatus ... -b && ... shutdown ...` | exit 0；`iPhone 17` bootstatus reached `Finished` at elapsed `00:40`; follow-up list showed device `Shutdown` |
| `swiftc ... /tmp/anchor-icloud-noentitlement-app-probe-20260607/AppDelegate.swift ... && codesign --force --sign - ... && simctl install ... && simctl launch --console ... dev.plimeor.AnchorNoEntitlementProbe` | exit 0；无 entitlement 对照 app build/sign/verify/install/launch 成功；输出 `icloud-app:container_nil=true`、`icloud-app:explicit_nil=true` |
| `codesign --verify --deep --strict --verbose=2 /tmp/anchor-icloud-entitlement-app-probe-20260607/AnchorICloudProbe.app` | exit 0；ad-hoc signed app valid on disk and satisfies Designated Requirement |
| `codesign -d --entitlements :- /tmp/anchor-icloud-entitlement-app-probe-20260607/AnchorICloudProbe.app` | exit 0；observed embedded entitlements include `application-identifier=<TEAM_ID>.dev.plimeor.AnchorICloudProbe`, `com.apple.developer.team-identifier=<TEAM_ID>`, `com.apple.developer.icloud-services=[CloudDocuments]`, `com.apple.developer.icloud-container-identifiers=[iCloud.dev.plimeor.AnchorICloudProbe]`, and `com.apple.developer.ubiquity-container-identifiers=[iCloud.dev.plimeor.AnchorICloudProbe]` |
| `simctl install ... /tmp/anchor-icloud-entitlement-app-probe-20260607/AnchorICloudProbe.app` | exit 0；install succeeded and app container path existed while simulator was booted |
| `simctl launch --console ... dev.plimeor.AnchorICloudProbe` | exit 1；SpringBoard denied launch: `FBSOpenApplicationServiceErrorDomain`, `The request was denied by service delegate (SBMainWorkspace)` |
| `simctl spawn ... AnchorICloudProbe.app/AnchorICloudProbe` | exit 163；`com.apple.CoreSimulator.LaunchdSimError`, underlying `SimXPCErrorDomain`, `Security policy issue` |

**Inferred：**

- SwiftPM + C ABI + Rust staticlib 在本机不是理论路径；host path 可以 build、link、execute。
- `xcodebuild -create-xcframework` 至少能对一个 macOS staticlib slice + headers 成功。Multi-platform XCFramework 仍需要 iOS Rust targets 和匹配 headers/slices。
- 引用 macOS `NSTextView` 与 iOS simulator `UITextView` 的 SwiftPM package code 可以在 Xcode 26.5 下编译。
- 引用 `FileManager.url(forUbiquityContainerIdentifier:)`、`NSMetadataQuery` 和 `NSFileCoordinator` 的 Swift adapter code 可以为 macOS 和 iOS simulator 编译。
- 这个 Xcode 版本支持从 package cwd 直接用 `xcodebuild -list` 检查 Swift package；本地 Xcode 26.5 不应在 CP-0 commands 中使用 `-packagePath`。
- UniFFI 的最小 UDL path、Swift source/header/modulemap generation、generated Swift compile/link/run 在本机成立；这比“推荐但未尝试”更强。
- UniFFI `bytes -> Data` 在 debug build 下可以传 64MB，但 64MB 单次调用约 2.35s 且进程 max RSS 约 267MB；这支持“UniFFI 适合 DTO/normal dispatch，bulk blob hot path 需要 Stage 1 再决策”的结论。
- macOS `NSTextView` runtime 可以承载 UTF-16 selection projection 和 layout plumbing；semantic undo closure 可以由 `UndoManager` 触发，但这不等于 TextKit buffer undo 已被正确截断。
- 无 signed app/entitlement 的 CLI 不能取得 ubiquity container；ad-hoc entitlement blob 也不能替代 Apple 授权的 provisioning profile。
- iOS simulator boot/shutdown 本机可用；剩余缺口是 app install/run，不是 simulator runtime 不可用。

**Unknown / Not run：**

- scratch demo 没有创建或构建 Anchor Xcode app target；只运行了 repo 外 minimal simulator app。
- scratch demo 只生成并运行了 minimal UniFFI bindings；没有对 Anchor DTO/error/async API 做 UniFFI proof。
- scratch demo 已 benchmark UniFFI 1MB / 4MB / 16MB / 64MB `bytes -> Data`，但没有 benchmark Anchor segment encoding、BlobId lookup、streaming 或 C ABI bytes fallback。
- scratch demo 没有安装 Rust iOS targets；这仍是 Stage 1 前置条件。
- scratch demo 没有证明 provisioning-profile-authorized iCloud entitlement、signed-in account 下的 ubiquity container lookup、placeholder download 或 conflict versions；后续 §2.6 的 Xcode UI demo 已补上 entitlement provisioning 和 physical iPhone container lookup，仍未覆盖 placeholder download 或 conflict versions。
- scratch demo 没有证明 TextKit 的 IME、direct buffer undo interception、cross-view selection、accessibility 或 patch replay 行为。

---

### 2.5 Xcode UI signing/provisioning demo

**Observed：** 使用 `computer use` 在 Xcode 26.5 UI 中创建了用户授权保留的 demo project：`~/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj`。

Creation options observed in Xcode UI：

- Platform: iOS
- Template: App
- Product Name: `AnchorProvisionProbe`
- Team: `<DEVELOPER_NAME> (Personal Team)`
- Organization Identifier: `dev.plimeor`
- Bundle Identifier: `dev.plimeor.AnchorProvisionProbe`
- Interface: SwiftUI
- Language: Swift
- Testing System: None
- Storage: None
- Location: `~/Documents`
- Create Git repository: off

**Observed Xcode UI signing state before trust repair：**

- Target `AnchorProvisionProbe` / tab `Signing & Capabilities` selected.
- `Automatically manage signing` is checked.
- Xcode UI text says it will create and update profiles, app IDs, and certificates.
- Team value is `<DEVELOPER_NAME> (Personal Team)`.
- Bundle Identifier value is `dev.plimeor.AnchorProvisionProbe`.
- iOS section shows `Provisioning Profile Xcode Managed Profile`.
- iOS section shows `Signing Certificate Apple Development`.
- Xcode first showed `Updating provisioning…`; final observed state is `Automatic signing failed`.
- Failure text: `Invalid trust settings. Restore system default trust settings for certificate "Apple Development: <DEVELOPER_NAME> (<TEAM_ID_ALT>)" in order to sign code with it.`
- UI presents buttons `Try Again` and `Repair Trust Settings`.

**Observed after user-approved trust repair：**

- Clicked Xcode UI `Repair Trust Settings` after user replied `点击`.
- Xcode UI signing error disappeared.
- Signing Certificate changed from generic `Apple Development` to `Apple Development: <DEVELOPER_NAME> (<TEAM_ID_ALT>)`.
- `xcodebuild -allowProvisioningUpdates` generic iOS device build succeeded.
- Xcode created/downloaded managed profile at `~/Library/Developer/Xcode/UserData/Provisioning Profiles/91d6e41e-98e6-45f8-a272-4c70d85bb403.mobileprovision`.
- Build log used profile `iOS Team Provisioning Profile: dev.plimeor.AnchorProvisionProbe`.
- In the same Personal Team target, Xcode UI `+ Capability` library search for `iCloud` returned `No Matches`.

**Observed commands：**

| Command | Observed result |
|---|---|
| `find "$HOME/Documents/AnchorProvisionProbe" -maxdepth 3 -type f -o -type d` | project exists with `AnchorProvisionProbe.xcodeproj`, `project.pbxproj`, `AnchorProvisionProbeApp.swift`, `ContentView.swift`, and asset catalog |
| `rg -n "DEVELOPMENT_TEAM\|PRODUCT_BUNDLE_IDENTIFIER\|CODE_SIGN_STYLE\|PROVISIONING_PROFILE\|ProvisioningStyle" ~/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj/project.pbxproj` | observed `DEVELOPMENT_TEAM = <TEAM_ID>`, `CODE_SIGN_STYLE = Automatic`, `PRODUCT_BUNDLE_IDENTIFIER = dev.plimeor.AnchorProvisionProbe` |
| `find "$HOME/Library/MobileDevice/Provisioning Profiles" -maxdepth 1 -name '*.mobileprovision' -print \| wc -l` | `0`; no local provisioning profile was downloaded/created before the trust failure |
| `security find-identity -v -p codesigning` | still reports one valid `Apple Development: <DEVELOPER_NAME> (<TEAM_ID_ALT>)` identity |
| `security find-certificate -a -c "Apple Development" -p \| openssl x509 -noout -subject -issuer -serial -dates` | certificate subject includes `OU=<TEAM_ID>`, valid `Jun 6 2026` to `Jun 6 2027` |
| `xcodebuild -project ~/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj -scheme AnchorProvisionProbe -destination 'generic/platform=iOS' -configuration Debug -derivedDataPath /tmp/AnchorProvisionProbeDerived -allowProvisioningUpdates build` | exit 0；`** BUILD SUCCEEDED **`；build log shows `Signing Identity: "Apple Development: <DEVELOPER_NAME> (<TEAM_ID_ALT>)"` and `Provisioning Profile: "iOS Team Provisioning Profile: dev.plimeor.AnchorProvisionProbe" (91d6e41e-98e6-45f8-a272-4c70d85bb403)` |
| `find "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles" -maxdepth 1 -name '*.mobileprovision' -print` | observed `91d6e41e-98e6-45f8-a272-4c70d85bb403.mobileprovision` |
| `security cms -D -i ...91d6e41e-98e6-45f8-a272-4c70d85bb403.mobileprovision` | observed profile name `iOS Team Provisioning Profile: dev.plimeor.AnchorProvisionProbe`, UUID `91d6e41e-98e6-45f8-a272-4c70d85bb403`, entitlements include `application-identifier=<TEAM_ID>.dev.plimeor.AnchorProvisionProbe`, `com.apple.developer.team-identifier=<TEAM_ID>`, `get-task-allow=true`, and `keychain-access-groups=["<TEAM_ID>.*"]` |
| `codesign --verify --deep --strict --verbose=4 /tmp/AnchorProvisionProbeDerived/Build/Products/Debug-iphoneos/AnchorProvisionProbe.app` | exit 0；app valid on disk and satisfies Designated Requirement |
| `codesign -d --entitlements :- /tmp/AnchorProvisionProbeDerived/Build/Products/Debug-iphoneos/AnchorProvisionProbe.app` | exit 0；app entitlements include `application-identifier=<TEAM_ID>.dev.plimeor.AnchorProvisionProbe`, `com.apple.developer.team-identifier=<TEAM_ID>`, and `get-task-allow=true` |
| Xcode UI `+ Capability`, search `iCloud` | observed `No Matches` under current Personal Team target |

**Inferred：**

- Xcode UI 可以为新 project 配置 Team、automatic signing、bundle id 和 Xcode Managed Profile intent。
- 早期 blocker 不是缺少 Xcode login/team selection，而是 Xcode UI 报告的 certificate trust settings。
- code signing identity 可以在 `security find-identity` 中显示 valid，但 Xcode automatic signing 仍可能因为 trust settings 不是 system default 而拒绝使用。
- 修复 trust settings 后，Xcode automatic signing 可以为普通 app target 生成 real development provisioning profile，并完成 signed iOS device build。
- 这证明 ordinary development provisioning，不证明 iCloud capability provisioning。
- Apple 文档说明 Xcode capability library 会按 membership 过滤；当前 Personal Team 下本机 UI 不显示 `iCloud`，足以把 iCloud 视为本环境不可用能力。

**Unknown / Not run：**

- free Personal Team 能否显示 iCloud capability：未观察到；本机 UI 当时返回 `No Matches`。

### 2.6 ADP iCloud entitlement verification

**Observed：** 用户开通 Apple Developer Program 后，Xcode account state 从 free Personal Team 变为 paid Individual team。`defaults read com.apple.dt.Xcode ...` 观察到 `teamID = <TEAM_ID>`、`teamName = "<DEVELOPER_NAME>"`、`teamType = Individual`、`isFreeProvisioningTeam = 0`。

**Observed：** 在用户授权下，repo 外 demo project `~/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj` 增加了 iCloud capability 形态的 project 配置：

- `TargetAttributes` 中 `SystemCapabilities.com.apple.iCloud.enabled = 1`。
- `CODE_SIGN_ENTITLEMENTS = AnchorProvisionProbe/AnchorProvisionProbe.entitlements`。
- Entitlements file 声明 `com.apple.developer.icloud-services = [CloudDocuments]`、`com.apple.developer.icloud-container-identifiers = [<ICLOUD_CONTAINER>]`、`com.apple.developer.icloud-container-development-container-identifiers = [<ICLOUD_CONTAINER>]`、`com.apple.developer.icloud-container-environment = Development`、`com.apple.developer.ubiquity-container-identifiers = [<ICLOUD_CONTAINER>]`。

**Observed commands：**

| Command | Observed result |
|---|---|
| `plutil -lint ~/Documents/AnchorProvisionProbe/AnchorProvisionProbe/AnchorProvisionProbe.entitlements` | exit 0；entitlements plist valid |
| `xcodebuild -showBuildSettings -project ~/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj -scheme AnchorProvisionProbe -configuration Debug -destination 'generic/platform=iOS'` | observed `CODE_SIGN_ENTITLEMENTS = AnchorProvisionProbe/AnchorProvisionProbe.entitlements`、`CODE_SIGN_STYLE = Automatic`、`DEVELOPMENT_TEAM = <TEAM_ID>`、`PRODUCT_BUNDLE_IDENTIFIER = dev.plimeor.AnchorProvisionProbe` |
| `xcodebuild -project ~/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj -scheme AnchorProvisionProbe -configuration Debug -destination 'generic/platform=iOS' -derivedDataPath /tmp/AnchorProvisionProbeICloudDerived -allowProvisioningUpdates build` | exit 0；`** BUILD SUCCEEDED **`；build log used `Provisioning Profile: "iOS Team Provisioning Profile: dev.plimeor.AnchorProvisionProbe" (3b6e4dcd-0537-4357-8589-662074237ad7)` |
| `security cms -D -i ~/Library/Developer/Xcode/UserData/Provisioning\ Profiles/3b6e4dcd-0537-4357-8589-662074237ad7.mobileprovision` | profile exists；name `iOS Team Provisioning Profile: dev.plimeor.AnchorProvisionProbe`；TeamName `<DEVELOPER_NAME>`；profile entitlements include `application-identifier`、`com.apple.developer.team-identifier`、`get-task-allow`、`com.apple.developer.icloud-services`、`com.apple.developer.icloud-container-identifiers`、`com.apple.developer.icloud-container-development-container-identifiers`、`com.apple.developer.icloud-container-environment`、`com.apple.developer.ubiquity-container-identifiers`、`com.apple.developer.ubiquity-kvstore-identifier` |
| `codesign --verify --deep --strict --verbose=2 /tmp/AnchorProvisionProbeICloudDerived/Build/Products/Debug-iphoneos/AnchorProvisionProbe.app` | exit 0；device app valid on disk and satisfies Designated Requirement |
| `codesign -d --entitlements :- /tmp/AnchorProvisionProbeICloudDerived/Build/Products/Debug-iphoneos/AnchorProvisionProbe.app` | exit 0；signed app entitlements include `application-identifier=<TEAM_ID>.dev.plimeor.AnchorProvisionProbe`、`com.apple.developer.team-identifier=<TEAM_ID>`、`get-task-allow=true`、`com.apple.developer.icloud-services=[CloudDocuments]`、iCloud container ids and ubiquity container ids |
| `xcodebuild -project ~/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj -scheme AnchorProvisionProbe -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.5' -derivedDataPath /tmp/AnchorProvisionProbeICloudSimDerived build` | exit 0；simulator build succeeded |
| `simctl install A1D90DAB-1FAC-413A-BCB4-F92B9F798F75 /tmp/AnchorProvisionProbeICloudSimDerived/Build/Products/Debug-iphonesimulator/AnchorProvisionProbe.app` | exit 0；install succeeded |
| `simctl launch A1D90DAB-1FAC-413A-BCB4-F92B9F798F75 dev.plimeor.AnchorProvisionProbe` | exit 0；process pid `42921` observed |
| `simctl spawn A1D90DAB-1FAC-413A-BCB4-F92B9F798F75 log show --style compact --last 2m --predicate 'eventMessage CONTAINS "icloud-runtime"'` | observed `icloud-runtime:explicit_nil=true` and `icloud-runtime:implicit_nil=true` |
| `devicectl list devices` | observed `Plimeor's iPhone` connected；CoreDevice id `C51610FF-15B1-5989-A8A3-DE2EDFACEB5B`；model `iPhone 15 Pro Max` |
| `devicectl device info details --device C51610FF-15B1-5989-A8A3-DE2EDFACEB5B` | observed physical iPhone, UDID `00008130-0002093A01D3803A`, iOS `26.5`, Developer Mode enabled, paired, wired transport, booted |
| `xcodebuild -project ~/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj -scheme AnchorProvisionProbe -configuration Debug -destination 'platform=iOS,id=00008130-0002093A01D3803A' -derivedDataPath /tmp/AnchorProvisionProbeICloudDeviceDerived -allowProvisioningUpdates build` | exit 0；physical-device build succeeded |
| `devicectl device install app --device C51610FF-15B1-5989-A8A3-DE2EDFACEB5B /tmp/AnchorProvisionProbeICloudDeviceDerived/Build/Products/Debug-iphoneos/AnchorProvisionProbe.app` | exit 0；installed app with bundle id `dev.plimeor.AnchorProvisionProbe` |
| `devicectl device process launch --device C51610FF-15B1-5989-A8A3-DE2EDFACEB5B --terminate-existing --console --timeout 20 dev.plimeor.AnchorProvisionProbe --icloud-runtime-probe` | exit 0；app printed `icloud-runtime:explicit_nil=false` and `icloud-runtime:implicit_nil=false`; both paths were `/private/var/mobile/Library/Mobile Documents/iCloud~dev~plimeor~AnchorProvisionProbe`; app terminated with exit code 0 |

**Inferred：**

- ADP Individual team 与 automatic signing 可以为该 demo bundle id 生成授权 iCloud Documents entitlements 的 development provisioning profile。
- 手写 entitlements file 仍不足以单独证明权限；关键证据是 provisioning profile 和最终 app signature 都包含匹配的 iCloud entitlements。
- Simulator 启动不再出现 `/tmp/anchor-icloud-entitlement-app-probe-20260607` 的 ad-hoc entitlement `Security policy issue`；但 simulator runtime 对 explicit/implicit ubiquity container lookup 仍返回 nil，推测是 simulator 环境没有登录 iCloud 或没有真实 iCloud Drive data context。
- paired、Developer Mode enabled、signed-in iCloud 的 physical iPhone 可以为这个 provisioned iCloud Documents demo app 返回 non-nil ubiquity container URL。

**Unknown / Not run：**

- 没有创建 Anchor file package、package UTType、placeholder download、`NSMetadataQuery` live update、file coordination blocking、conflict versions、signed-out / over-quota behavior。

---

## 3. Project layout viability

### 3.1 `suites/anchor/*` viability

**Recommended：Option A 仍是产品所有权最清楚的布局，但它不是自授权的目录创建许可。**

`suites/anchor/` 是放置 `core`、`cli`、`apple` 和 shared fixtures 的最 coherent 位置，因为 Anchor 是 theme-scoped product suite，不是 generic cross-suite package，也不是 unrelated standalone app。它也匹配计划中的未来验证命令：`cd suites/anchor; cargo test -p anchor-core`。

**Observed：** 当前 Bun workspaces 偏 TS 包管理形态，现有 workspace package 都有 `package.json`。Bun 官方文档把 workspaces 描述为独立 packages，并说明每个 workspace 有自己的 `package.json`。当前 `bun pm ls` 只列出现有 package workspaces。

**Unknown：** 没有直接观察 `suites/*/*` 匹配无 `package.json` 目录时的 Bun 行为，例如未来 `suites/anchor/core` 或 `suites/anchor/apple`。

**Inferred：**

- Root TypeScript checking 不应扫描 Rust/Swift source，因为 `tsconfig.json` 只 include `src/**/*.ts(x)` paths。
- 未解析风险是 Bun workspace/filter 行为，不是 TypeScript。
- 如果 `suites/anchor/core`、`suites/anchor/cli` 和 `suites/anchor/apple` 没有 `package.json`，它们不应被当作 publishable TS packages；但 CP-0 不应在缺少未来 scratch validation 或 implementation-time proof 的情况下依赖这一点。

**Recommended CP-0 wording：**

- `suites/anchor/*` 只有在 user approval 后才可创建。
- 该目录是 mixed-tool suite：嵌套 Cargo workspace + Xcode workspace + fixtures，不是一组 Bun/TS packages。
- 在 `suites/anchor/*` 下添加任何 `package.json` 都会有意创建 Bun workspace member，并必须满足 AGENTS package rules。不要为了适配 globs 添加 placeholder package files。

### 3.2 Xcode project/workspace placement

**Inferred：** Xcode 本身不要求 project 位于 repository root。只要 build products 不进入 source control，并且命令设置稳定的 derived data path，把 project 放在 `suites/anchor/apple/` 是合理的。

**Recommended：**

- Primary path: `suites/anchor/apple/Anchor.xcworkspace`.
- 在 Apple tree 内使用 shared Swift module/package 承载 macOS 和 iOS target 共享代码。
- AppKit-specific、UIKit-specific 和 shared Swift adapter code 分开：
  - shared: DTO wrappers, generated UniFFI Swift, `OpSyncPort` adapter protocols, settings model, fixture loader
  - macOS: AppKit `NSTextView`, menu, window, file access, macOS entitlements
  - iOS: UIKit `UITextView`, navigation, document browser/files, iOS entitlements
- verification commands 使用 `-derivedDataPath`，避免 DerivedData 意外变成 repo-local artifact。

**Observed / Unknown：** 通过 `DEVELOPER_DIR` 可以使用完整 Xcode；SDK 和 simulator destinations 已观察到。因为 Anchor Xcode project 尚不存在，`xcodebuild -list`、scheme discovery、code signing 和 Anchor DerivedData 行为仍是 Unknown。

**Fallback：** 如果 Xcode nested under `suites/anchor/apple` 或 Bun glob interaction 成本过高，只把 Apple project 移到一个 glob-excluded 顶层 `anchor-apple/` 目录，同时保留 `suites/anchor/core` 作为 Cargo workspace root。这样可以保留计划中的 `suites/anchor` Rust commands，并把 Xcode 与 Bun workspaces 隔离。

### 3.3 Rust core package position for Apple binding

**Recommended：** `suites/anchor/core/` 适合作为 Rust crate `anchor-core` 的位置；`anchor-editor-core` 应作为 internal Rust module，而不是独立 crate/package。

**Recommended Cargo shape, future only：**

- `suites/anchor/Cargo.toml` 作为 nested Cargo workspace。
- `suites/anchor/core/Cargo.toml` 用于 `anchor-core`。
- `crate-type` 至少支持 Rust tests 所需的 `rlib`，以及 Apple binding artifacts 所需的 `staticlib` 或 `cdylib`。
- `suites/anchor/cli` 依赖 `anchor-core`，并共享同一个 DTO/schema owner。

**Inferred：** core 和 CLI 放在同一个 Cargo workspace，可以让 DTO owner 明确落在 `anchor-core`，避免 Apple binding DTO 与 CLI DTO 分叉。

### 3.4 CLI and Apple DTO ownership

**Recommended：** CLI 和 Apple app 应共享同一个 DTO owner：`anchor-core`。

**Reasoning：**

- CLI 和 Apple binding 都调用同一个 dispatch，并消费同一个 op registry。
- Swift DTO wrappers 和 CLI output serialization 可以是 generated/projection layers，但不能独立定义 Note / Block / op / validation error semantics。
- 未来 schema envelope 应位于 Rust core，并由 CLI 和 binding 消费。

**Contract impact：** CP-0 应明确写入：“Swift and CLI consume DTOs; Rust core owns DTO vocabulary and versioning.”

### 3.5 Directories that require user approval

**Needs user approval before creation：**

- `suites/anchor/`
- `suites/anchor/Cargo.toml`
- `suites/anchor/core/`
- `suites/anchor/cli/`
- `suites/anchor/apple/`
- `suites/anchor/fixtures/`
- any `apps/anchor-*`
- any `packages/anchor-*`
- any top-level fallback such as `anchor-apple/`
- any Xcode project/workspace, Swift Package, entitlements file, bundle identifier, iCloud container identifier
- any root workspace / lockfile / tsconfig change

---

## 4. Apple build surface

### 4.1 Observed commands

**Observed：**

- 当前 active developer directory 是 Command Line Tools；因此默认 `xcodebuild` 会失败。
- 完整 Xcode 位于 `/Applications/Xcode.app`，可通过命令前缀 `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` 使用。
- 在该 `DEVELOPER_DIR` 下，`xcodebuild -version` reports `Xcode 26.5` / `Build version 17F42`。
- 在该 `DEVELOPER_DIR` 下，观察到 SDKs include macOS 26.5、iOS 26.5、iOS Simulator 26.5、tvOS 26.5、visionOS 26.5、watchOS 26.5。
- 在该 `DEVELOPER_DIR` 下，iOS 26.2、26.4、26.5 simulator devices available。
- SwiftPM exists (`Swift Package Manager - Swift 6.3.2`)。
- Rust host target exists；Rust iOS targets are not installed。
- UniFFI bindgen command is unavailable。
- Scratch demo observed：Rust `aarch64-apple-darwin` staticlib build succeeded；SwiftPM executable 通过 C ABI linked and ran that Rust staticlib；SwiftPM native adapter package built for macOS；Xcode built the same SwiftPM package for `generic/platform=iOS Simulator`；one-slice macOS XCFramework creation succeeded。
- Scratch demo observed failure：Rust `aarch64-apple-ios-sim` staticlib build failed because target `aarch64-apple-ios-sim` is not installed.
- Scratch demo observed：project-local `uniffi 0.31.1` bindgen 可以生成 Swift/header/modulemap，generated Swift 可以 compile/link/run。
- Scratch demo observed：iOS simulator `iPhone 17` 可以 bootstatus 到 Finished 并 shutdown。
- Observed：初始 Xcode GUI 为 Welcome window，没有打开 project；XcodeBuildMCP defaults 中没有 project/workspace/scheme。
- Observed：§2.5 记录 free Personal Team 普通 app signing/provisioning proof；§2.6 记录 ADP Individual team 的 iCloud entitlement provisioning 和 physical iPhone runtime proof。
- Observed：本机没有 `xcodegen` / `tuist` / Ruby `xcodeproj`；`xcodebuild` 没有 create project 子命令。
- Observed：`xcodebuild -help` 明确 `-allowProvisioningUpdates` 会让 `xcodebuild` 与 Apple Developer website 通信；automatic signing target 会 create/update profiles、app IDs、certificates，manual signing target 会 download missing/updated provisioning profiles。
- Scratch signed-app observed：无 entitlement 对照 app 可以 ad-hoc sign、install、launch；ad-hoc+iCloud entitlement app 可以 sign/verify/install，但 launch 被 SpringBoard 拒绝，direct spawn 报 `Security policy issue`。

### 4.2 Recommended commands, future skeletons

**Precondition / environment selection：**

```fish
set -x DEVELOPER_DIR /Applications/Xcode.app/Contents/Developer
xcodebuild -version
xcodebuild -showsdks
xcrun --sdk iphonesimulator --show-sdk-version
xcrun simctl list devices available
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
```

验证命令推荐使用 `DEVELOPER_DIR` 前缀，因为它不改变全局 `xcode-select`。持久执行 `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer` 是用户自己的环境选择，不是仓库要求。

**macOS target build command, skeleton：**

```fish
env DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -workspace suites/anchor/apple/Anchor.xcworkspace \
  -scheme Anchor-macOS \
  -destination 'platform=macOS' \
  -configuration Debug \
  CODE_SIGNING_ALLOWED=NO \
  -derivedDataPath suites/anchor/apple/.build/xcode \
  build
```

**iOS simulator target build command, CI skeleton：**

```fish
env DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -workspace suites/anchor/apple/Anchor.xcworkspace \
  -scheme Anchor-iOS \
  -destination 'generic/platform=iOS Simulator' \
  -configuration Debug \
  CODE_SIGNING_ALLOWED=NO \
  -derivedDataPath suites/anchor/apple/.build/xcode \
  build
```

**iOS simulator target build command, named-device smoke skeleton：**

```fish
env DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun simctl list devices available
env DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -workspace suites/anchor/apple/Anchor.xcworkspace \
  -scheme Anchor-iOS \
  -destination 'platform=iOS Simulator,name=<available-device>,OS=latest' \
  -configuration Debug \
  CODE_SIGNING_ALLOWED=NO \
  -derivedDataPath suites/anchor/apple/.build/xcode \
  build
```

**Signing boundary：**

- `CODE_SIGNING_ALLOWED=NO` 适合 CI build verification 中的 simulator / unsigned debug artifacts。
- iCloud Drive entitlement、ubiquity container、actual app launch 和 device tests 需要真实 Xcode project、approved team、bundle identifier、entitlements 和 provisioning profile；§2.6 证明 repo 外 demo 可通过 ADP Individual team 覆盖这条 signing/runtime path。
- ad-hoc signing 只能证明 entitlement blob 可嵌入，不能证明 app 获得 iCloud Documents 权限；`xcodebuild -allowProvisioningUpdates` 会和 Apple Developer website 通信，并可能创建/更新 profiles、app IDs 和 certificates，因此属于 user-approved action。

**Swift package build command, skeleton：**

```fish
swift build --package-path suites/anchor/apple/AnchorCoreBindings
```

这只适用于未来 `AnchorCoreBindings` 是一个包装 generated Swift source 和/或 binary XCFramework 的 Swift package。未运行，因为该 package 尚不存在。

**Swift package Xcode build command, direct package skeleton：**

```fish
cd suites/anchor/apple/AnchorCoreBindings
env DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -list
env DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -scheme AnchorCoreBindings \
  -destination 'generic/platform=iOS Simulator' \
  -configuration Debug \
  -derivedDataPath .build/xcode \
  build
```

**Observed：** scratch demo showed `xcodebuild -list -packagePath <path>` is not a valid option for local Xcode 26.5. Direct package builds should run from the package directory or through a future Xcode workspace/project.

**Rust crate build/test commands, skeleton：**

```fish
cd suites/anchor
cargo test -p anchor-core
cargo clippy -p anchor-core --all-targets
cargo build -p anchor-core --release --target aarch64-apple-darwin
cargo build -p anchor-core --release --target aarch64-apple-ios
cargo build -p anchor-core --release --target aarch64-apple-ios-sim
```

**Binding generation command, UniFFI library-mode skeleton：**

```fish
cd suites/anchor
cargo run -p uniffi-bindgen-swift -- \
  target/aarch64-apple-darwin/release/libanchor_core.a \
  apple/Generated/AnchorCore \
  --swift-sources \
  --headers \
  --modulemap \
  --xcframework \
  --modulemap-filename module.modulemap
```

UniFFI 文档支持 project-local `cargo run -p uniffi-bindgen-swift` 路径，并说明 Swift bindgen 可以生成 Swift sources、headers、modulemaps，以及 XCFramework-compatible modulemaps。

**XCFramework creation command, skeleton：**

```fish
xcodebuild -create-xcframework \
  -library suites/anchor/target/aarch64-apple-darwin/release/libanchor_core.a \
  -headers suites/anchor/apple/Generated/AnchorCore/Headers/macos \
  -library suites/anchor/target/aarch64-apple-ios/release/libanchor_core.a \
  -headers suites/anchor/apple/Generated/AnchorCore/Headers/ios \
  -library suites/anchor/target/aarch64-apple-ios-sim/release/libanchor_core.a \
  -headers suites/anchor/apple/Generated/AnchorCore/Headers/ios-sim \
  -output suites/anchor/apple/Artifacts/AnchorCore.xcframework
```

**Unknown：** exact scheme names、workspace name、header paths、library names、module names 必须等 Apple project 和 Rust crate 存在后确定。

---

## 5. Swift-Rust binding assessment

### 5.1 Relationship between candidates

**Observed / Inferred：** 这四个候选不是同一层级：

- **UniFFI** 和 **C ABI** 是 binding/calling mechanisms。
- **Swift Package** 和 **XCFramework** 是 distribution/packaging mechanisms。

因此可行的产品路径是组合方案，而不是四选一：UniFFI-generated Swift API + 以 XCFramework 打包的 Rust static libraries + 供 Xcode 消费的 SwiftPM wrapper / binary target。

**Observed scratch demo：** C ABI + Rust staticlib + SwiftPM executable 的 host path 已实际跑通。Swift executable 输出 `ffi:add=42` 和 `ffi:summary blocks=4 bytes=4096`，说明 Swift 不是只编译 header，而是完成 link 并调用到了 Rust symbol。

**Observed scratch demo：** UniFFI minimal path 已实际跑通。`uniffi 0.31.1` 通过 project-local `cargo run --manifest-path ... --features cli --bin uniffi-bindgen-swift` 生成 Swift source、C header、modulemap；generated Swift 暴露 `FixtureSummary: Sendable`、`payload: Data`、`openFixtureVault(name:)`、`readSegment(size:) -> Data`，并通过 Swift smoke binary 调到 Rust。

### 5.2 Candidate comparison

| Candidate | 适合 Anchor 的程度 | DTO / error / async / bytes 成本 | Segment bytes 风险 | Stage 1 最小 spike | 失败条件 |
|---|---|---|---|---|---|
| **UniFFI** | 结构化 DTO calls 的最佳首选。UniFFI Swift 官方文档覆盖 primitives、strings、bytes、records、enums、maps、errors 和 generated Swift files。 | Errors 可映射到 Swift `Error` / `throws`；`bytes` 映射到 Swift `Data`；generated output 包含 C headers、modulemap、Swift source。Async 存在，但 UniFFI 文档说明 Swift 6 support 仍不完整，async generated code 有已知 `Sendable` rough edges。 | 大概率会把 bytes copy 成 `Data`；小/中型 op segments 可接受，频繁 64MB blob transfer 存疑。实测前不要把 UniFFI 当作唯一 blob hot path。 | 导出一个 `open_fixture_vault() -> FixtureSummary`、一个 `dispatch(EditorIntent) -> TransactionResult`、一个 `read_segment(SegmentId) -> bytes`；从 Swift 测 1MB / 4MB / 16MB / 64MB transfer time 和 peak RSS。 | DTO shape 不支持；generated Swift 无法通过 Swift 6 strict concurrency；structured errors 退化成 strings；16MB/64MB bytes transfer 太慢或内存尖峰过高；async boundary 要求 Anchor 不能接受的 Rust runtime 假设。 |
| **Handwritten C ABI** | 适合作为小型稳定 API 或 bulk bytes fast path fallback；不适合作为 Anchor 演进型 DTO 的主 API。 | 手工成本高：ownership、lifetimes、freeing buffers、error enums、string encoding、async callbacks、versioning。没有严格约定时容易变成 stringly typed API。 | 对 zero-copy-ish 或 explicit copy buffer APIs 的控制最强，但也最容易 leak 或 use-after-free。 | 一个 `anchor_dispatch_json` 或 typed `anchor_read_segment(ptr,len)` API，带 explicit allocator/free；fuzz invalid pointers 和 repeated calls。 | 手工维护成本压过 DTO 演进收益；errors 变 opaque strings；memory ownership 不安全；Swift caller ergonomics 偏离 CLI/core vocabulary。 |
| **Swift Package wrapping binary/static lib** | 好的 packaging layer，不是 binding mechanism。最适合作为 local package 或 binary target，暴露 generated Swift 并链接 `AnchorCore.xcframework`。 | 保持 Xcode consumption 清楚；避免每次 app build 都编译 Rust。需要稳定 package layout 和 modulemap。 | 与底层 binding 相同。 | `swift build --package-path ...`，Xcode macOS/iOS targets import `AnchorCoreBindings` 并调用一个 fixture function。 | 如果要求产品 app build 环境安装 Rust/Cargo，则不适合作为产品分发方案。 |
| **XCFramework** | 多 Apple platforms 的最佳 binary distribution shape。 | 需要确定性 build script，生成 macOS、iOS device、iOS simulator slices；headers/modulemaps 必须匹配 generated Swift。 | 与底层 binding 相同；binary packaging 不解决 byte copy。 | Build 三个 Rust targets，生成 Swift/modulemap，创建 XCFramework，从 Xcode target import。 | Modulemap/header mismatch；simulator/device slices 缺失；generated Swift 无法 import C module；build 不能在 CI 复现。 |

**Observed scratch demo impact：**

- C ABI 可作为最小验证路径成立，但 demo 只覆盖两个 primitive/struct functions，不覆盖 Anchor DTO complexity、error mapping、async、bytes ownership 或 safety model。
- XCFramework creation command 成立，但 demo 只生成 macOS slice；iOS / iOS simulator slices 仍被缺失 Rust targets 阻断。
- SwiftPM wrapper 形态成立，但 demo 是 local executable / library package，不是 binary target import of multi-slice XCFramework。
- UniFFI minimal record + bytes path 成立，且 generated Swift 的 `Data` mapping 可运行。
- UniFFI 64MB `bytes -> Data` debug transfer 可完成，但 `/usr/bin/time -l` 记录 max RSS 约 267MB，64MB 单次调用约 2.35s；首期应避免把大 blob hot path 无条件压在 UniFFI `Data` transfer 上。
- UniFFI scratch 没有覆盖 structured errors、async、Swift 6 strict concurrency flags、Anchor recursive/large DTO shape、multi-crate workspace 或 iOS slices。

### 5.3 Recommendation

**Recommended：**

1. 使用 **UniFFI for structured DTOs, errors, and normal dispatch calls**。
2. 将 generated Swift + Rust static libraries 打成 **XCFramework**，再由 local **SwiftPM wrapper / binary target** 消费。
3. UniFFI `Data` transfer 已证明可以传 64MB，但成本偏高；Stage 1 应决定 bulk segment/blob bytes 继续走 UniFFI，还是启用 **C ABI as an explicit fast-path fallback for bulk segment/blob bytes**。
4. 尽量把 sync adapter I/O 的 async 保留在 Swift side；不要强迫 Rust core 拥有 CloudKit/iCloud async runtime concerns。
5. Stage 1 先安装或明确 pin `aarch64-apple-ios` / `aarch64-apple-ios-sim` targets；否则不能声称 iOS Rust slice 或 multi-platform XCFramework 已验证。

**Recommended DTO constraint：**

- 避免在 public FFI boundary 暴露高度递归 / 泛型化 DTO shapes。
- 优先使用 UniFFI 可以干净生成的 versioned records/enums。
- `TransactionResult`、`ValidationError`、`SyncStatus`、`MirrorStatus` 和 `EditorPatch` 保持 structured；不要为了 binding 容易而 collapse into strings。

**Stage 1 pass criteria：**

- Apple target 通过 generated Swift 调 core，并读取一个 fixture Note。
- `TransactionResult` 能 round-trip changed ids、validation error、revisions、selection hint。
- `bytes` transfer benchmarks 覆盖 1MB、4MB、16MB、64MB。
- Swift 6 build 在 intended compiler flags 下不产生不可接受的 concurrency/import warnings。
- failure modes 足够明确，可以决定 “UniFFI primary” 还是 “UniFFI DTO + C ABI bytes fast path”。

---

## 6. TextKit / native editor adapter viability

### 6.1 Basic viability

**Recommended：TextKit is viable as mechanism, not as model.**

Apple 文档把 TextKit 描述为 `UITextView` 和相关 text classes 使用的 text storage/layout infrastructure；`NSTextView` 是 AppKit text-system front end，负责绘制文本并处理 selection、modification、input management、key bindings、marked text 等交互。这匹配 Anchor 对 TextKit 的目标角色：input、layout、selection、hit-testing、IME surface。

**Observed scratch demo：** `swift-textkit` package 中的 `EditorAdapterProbe.swift` 使用 `NSTextView` / `UITextView`、`NSRange` 和 block-local UTF-16 selection DTO。它通过 `swift build --package-path ...` 完成 macOS build，并通过 `xcodebuild -scheme AnchorTextKitProbe -destination 'generic/platform=iOS Simulator' ... build` 完成 iOS simulator build。这证明 AppKit/UIKit TextKit adapter 的 compile surface 在本机可用。

**Observed scratch runtime：** `textkit-runtime/Probe.swift` 在 macOS 上实际 instantiate `NSTextView`，设置 sample string 和 selection。输出为 `textkit:utf16=16 storage=16`、`textkit:selected=1:8`、`textkit:layout=true container=true`。同一 probe 通过 `UndoManager.registerUndo(withTarget:)` 执行 semantic closure，输出 `textkit:undo_events=semantic-inverse-intent`。

**Inferred：** 真正风险不是“TextKit 能不能编辑文本”；它能。真正风险是 TextKit 的 text storage 和 attributed string 变成隐藏文档模型。CP-0 必须把 ownership boundary 写硬。

**Unknown / Not run：** scratch runtime 没有创建完整 editor view hierarchy，没有跑 real input event capture、hit-testing、IME marked text、TextKit direct buffer undo interception、undo grouping、accessibility range、patch replay 或跨 view selection。

### 6.2 Mechanism-only constraints

**Recommended adapter rules：**

- 一个 editable text block 映射到一个 native text surface。单个 text view 不跨 hard block boundary。
- TextKit buffer 是 `BlockProjection` / `InlineRun` 的 projection，不是 source-of-truth。
- TextKit attributes 用于 render Anchor marks；attributes 不拥有 ref/tag/link semantics。
- 每个 edit 都被 intercept 或 normalize 成 `EditorIntent`。
- `anchor-core::dispatch` 后，adapter 应用 `EditorPatch` 并重写相关 TextKit view model。
- `NSRange` / `NSTextRange` / view identity / focus / scroll / IME marked text 都保持 transient。
- persisted selection 如存在，使用带 stable block id 和 UTF-16 offsets 的 `EditorSelection`，不使用 platform range objects。
- `\n` 是单个 text block 内的 soft line break；hard block boundary 是 block op。

**Hidden-model high-risk points：**

- **Undo**：`NSTextView` / `UITextView` 可以在 platform undo 中注册 buffer edits。Anchor 必须对 truth edits suppress direct buffer undo，并注册 dispatch inverse intent/op 的 undo actions。
- **Attributes**：`NSAttributedString` attributes 很容易被误用来存 links/refs/tags。它们必须保持 derived rendering。
- **Selection**：platform ranges 跨 re-render、patch replay、IME、block movement 都不稳定。必须在 adapter boundary 立即转换。
- **Cross-block text**：一个带 separators 的 giant text view 会把 block tree 变成隐藏 text convention。CP-0 应拒绝这个形态。
- **IME marked text**：composition 必须是 transient；commit point 变成 `EditorIntent`，不是 partial persistent state。

### 6.3 Selection contracts

**Single-block text selection：**

- Adapter input：`block_id`、UTF-16 `anchor` / `focus` offsets、必要时的 affinity/direction、作为 transient 的 current composition state。
- Core/editor-core output：`EditorSelection::Text { block_id, range_utf16, affinity }`。
- Stage 1 证明项：selection 能经受 patch replay，以及 emoji / ZWJ / combining-mark offset cases。

**Block selection：**

- Adapter input：来自 handles/native selection controls 的 hit-tested block ids。
- Editor-core output：`EditorSelection::Block { anchor_block_id, focus_block_id, ordered_block_ids }`。
- Supported actions：move、wrap、delete/trash、duplicate、tag/type/prop commands、copy link、transclude。

**Embedded editor selection：**

- Adapter input：`block_id`、embedded editor kind、local selection payload。
- Editor-core output：`EditorSelection::Embedded { block_id, payload_kind, local_selection }`。
- Promote/demote contract：例如 `Esc` 从 embedded editor 退到 block selection；重复 `Cmd+A` 可以从 code payload promote 到 block/workspace selection。

**Cross-block text selection：**

- 保持为 Stage 1 spike 和非首期能力。
- 难点：跨多个 text views 的 continuous selection、accessibility range exposure、边缘 IME composition、跨多个 buffers 的 undo grouping、selection 横跨 disappearing/splitting blocks 时的 patch replay。
- CP-0 可以允许 editor-core 对 cross-block edit intents 做 shape/split，但在 spike proof 前不承诺 polished continuous native selection。

### 6.4 Undo via NSUndoManager

**Recommended：**

- `NSUndoManager` 应注册 semantic undo operations，调用 `anchor-core::dispatch` 并传入 inverse intent/op。
- Programmatic `EditorPatch` replay into TextKit 时必须 suppress 或 isolate undo registration。
- TextKit buffer direct undo 只允许用于 commit 前的 transient composition；一旦 committed to core，undo 必须是 semantic and replay-driven。

**Failure condition：** 如果 undo 可以在不产生 core op 的情况下修改 TextKit buffer，TextKit 就已经变成隐藏 truth source，CP-0 的 editor boundary 失效。

---

## 7. iCloud Drive adapter viability

### 7.1 File package + ubiquity + immutable op segment

**Recommended：这个形态可行，但有一个必要修正：声明 package type。**

Apple iCloud file-management 文档支持把 documents/files 存入 ubiquity containers，通过 `NSMetadataQuery` 定位 cloud documents，用 `NSFileCoordinator` 协调访问；同时说明只有 app exports conforming to `com.apple.package` 的 package UTI 时，file wrappers/packages 才会作为单个用户可见 document 处理。

**Observed scratch demo：** `swift-textkit` package 中的 `ICloudAdapterProbe.swift` 定义 `AnchorSegmentId`、`AnchorSyncPort` 和 `ICloudDriveAdapterProbe`，Swift adapter API 调用 `FileManager.url(forUbiquityContainerIdentifier:)`、`NSMetadataQuery`、`NSMetadataQueryUbiquitousDocumentsScope` 和 `NSFileCoordinator.coordinate(readingItemAt:options:error:byAccessor:)`。该 package 已通过 macOS SwiftPM build 和 iOS simulator Xcode build。

**Observed scratch runtime：** `icloud-runtime/Probe.swift` 在无 signed app / entitlement 的 CLI context 下运行。输出为 `icloud:container_nil=true`、`icloud:metadata_query=NSMetadataQuery scopes=1`、`icloud:coordinated_bytes=7 coordinator_error=none`、`icloud:is_ubiquitous=false`、`icloud:start_download_error=NSCocoaErrorDomain:512`。

**Observed signing state：** §2.5 记录 free Personal Team 普通 app signing/provisioning；§2.6 记录 ADP Individual team 下 iCloud Documents entitlement provisioning、signed device artifact，以及 physical iPhone 上 non-nil ubiquity container lookup。

**Observed signed-app control：** `/tmp/anchor-icloud-noentitlement-app-probe-20260607` 的无 entitlement UIKit simulator app 可以 build、ad-hoc sign、install、launch；app 内 `FileManager.url(forUbiquityContainerIdentifier:nil)` 和 explicit container lookup 均返回 nil。

**Observed entitlement failure：** `/tmp/anchor-icloud-entitlement-app-probe-20260607` 的同款 app 手工嵌入 iCloud Documents entitlements 后，`codesign --verify` 通过，`simctl install` 成功，但 `simctl launch --console` 被 SpringBoard 拒绝，`simctl spawn` 报 `Security policy issue`。

**Inferred：** iCloud Drive adapter 的 Foundation API compile surface 对 macOS/iOS 同源 Swift adapter 可行；core-only boundary 仍能保持为 `SegmentId` / bytes 协议形态。

**Inferred：** signed app / entitlement 不能从普通 CLI 或 ad-hoc entitlement blob 获得。iCloud Documents / ubiquity proof 必须运行在 provisioning-profile-authorized app context 下，并且 signing team 必须显示 iCloud capability。当前 ADP Individual team 已足够证明 iCloud Documents entitlement 和 physical-device ubiquity container lookup。

**Unknown / Not run：** 没有观察到 Anchor file package UTType、placeholder download、`NSMetadataQuery` live updates、file coordination blocking、quota、signed-out 或 conflict-version behavior。

**Contract correction：**

- CP-0 应写明：Anchor vault package 必须有 exported document type / UTI（或现代 UTType declaration）并 conform to `com.apple.package`。
- 缺少这一点时，`NSMetadataQuery` 可能返回 package internals，用户也可能把 package contents 看成 ordinary files。

**Recommended vault shape：**

- iCloud Drive synced vault：ubiquity container `Documents/` 下的 file package。
- Truth sync unit：immutable `.anchor/operations/<device_id>/<seq>.seg`。
- Projection/SQLite cache：local Application Support，位于 ubiquity container 外。
- Mirror files：derived export，不是 sync input。
- Segment files：write once；新内容创建新 segment。通过 content hash 和 mtime 在 publish 后不变来验证。

### 7.2 NSFileCoordinator / NSMetadataQuery / placeholder boundary

**Source-supported facts used：本节使用的外部 source-supported facts：**

- Apple docs 说明 `NSMetadataQuery` 有 initial gathering phase 和 live-update phase，app 应从 query notifications 处理 results。
- Apple docs 说明如果文件尚未下载，coordinated read 可能在下载期间 block；替代方式是读取 metadata downloading status 并调用 `startDownloadingUbiquitousItem(at:)`。
- Apple docs 暴露 URL resource keys，例如 `isUbiquitousItem`、`ubiquitousItemDownloadingStatus`、`ubiquitousItemIsDownloading`、`ubiquitousItemDownloadRequested`。

**Recommended adapter boundary：**

- Swift adapter 拥有 URLs、ubiquity container lookup、file coordination、metadata query、placeholder/download state、quota/account state 和 user-visible sync state。
- Rust core 只接收：
  - `list_segments() -> [SegmentId]`
  - `pull_segment(SegmentId) -> bytes`
  - `push_segment(SegmentId, bytes)`
  - same shape for blob ids / bytes
- Core 不接收 `URL`、`NSFileCoordinator`、`NSMetadataQuery`、`.icloud`、CloudKit records、zones、account tokens 或 file presenter objects。

### 7.3 iCloud Drive vs CloudKit / CKSyncEngine boundary

**Recommended：首期保持 iCloud Drive；CloudKit 保持第二阶段。**

**Observed external docs：** Apple archived CloudKit Web Services data size limits 写明 Asset field 最大 file size 为 50MB，record 最大 1MB 且不含 assets。如果未来 CloudKit implementation 把一个 blob 映射成一个 `CKAsset`，这会直接冲突于 64MB blob cap。

**Contract impact：**

- D17 可以为 first-phase local / iCloud Drive file package 保留 64MB。
- D17：CloudKit / CKSyncEngine route 在进入 CloudKit schema 前，需要先在 split blobs、lower cap、out-of-band asset storage 之间做决策。
- 不要让 CloudKit record schema 进入 core。CloudKit 继续作为同一个 `OpSyncPort` 后面的 Swift adapter。

### 7.4 Stage 1 iCloud spike proof

**Recommended Stage 1 spike should prove：**

- Anchor Xcode project 配置 iCloud entitlements 和 ubiquity container identifier；demo project 已证明同类配置可由 ADP team provisioning。
- Anchor app 的 `FileManager.url(forUbiquityContainerIdentifier:)` 在真实 signed-in iCloud account 下返回 container URL；demo project 已在 physical iPhone 上证明同类 lookup 返回 non-nil URL。
- `Documents/` 下的 vault file package 被当作 package，而不是 loose files。
- coordinated write 写入新的 immutable segment 后，另一个 query/device 能看到它。
- `NSMetadataQuery` 可以通过 live notifications 发现 segment files 或 package-level updates。
- not-yet-downloaded item 可通过 metadata/resource values 检测，并用 `startDownloadingUbiquitousItem(at:)` 下载。
- `NSFileCoordinator` read/write paths 要么成功，要么 surface typed sync states，不能 block UI。
- 观察 concurrent manifest writes 的 `NSFileVersion` / conflict-version behavior；如果 shared mutable manifest conflicts noisy，CP-1 前必须重设 manifest write 方案。
- signed-out 和 over-quota states 在 simulator 无法证明时，应在真实 account/device 上观察。
- Core audit commands 在 Rust core 中返回 zero cloud symbols：

```fish
rg -n "CloudKit|CKRecord|CKAsset|CKContainer|CKSyncEngine|NSFileCoordinator|NSMetadataQuery|ubiquit|iCloud|NSURLIsExcludedFromBackupKey" suites/anchor/core
rg -n "OpSyncPort|push_segment|pull_segment|SegmentId|BlobId" suites/anchor/core
```

**Failure condition：** 如果 core 需要 cloud/account/file-coordination types 才能实现 merge 或 read bytes，`OpSyncPort` boundary 已失效。

### 7.5 Scale / 性能：documented mechanics vs undocumented scale

**iCloud adapter 的机制面有官方文档支持，但 Apple 对任何规模 / 性能数字一律不文档化——故「API 编译面可行」不等于「iCloud 同步在 Anchor 规模下可行」，规模必须实测（Stage 1，12-stage-1-spike-plan.md §4）。** 下列为 Source-supported（developer.apple.com），与本节上文 Codex 本机 Observed 区分。

- **NSMetadataQuery**（segment 发现）：两相（initial gathering → live-update），`DidUpdate.userInfo` 拆 added/changed/removed（iOS 8/macOS 10.9+）；`notificationBatchingInterval` 默认 1.0s（仅合并窗口，非延迟保证）；`results` proxy 整份 copy 有「performance and memory issues」，应用 `result(at:)`。**未文档化**：任何文件数下的 gathering / live-update 延迟、内存上限、是否 duplicate / re-deliver、主线程阻塞。(https://developer.apple.com/documentation/foundation/nsmetadataquery)
- **Placeholder / dataless / eviction**：`URLUbiquitousItemDownloadingStatus`（.notDownloaded/.downloaded/.current）、`startDownloadingUbiquitousItem`、`evictUbiquitousItem`（只删本地）；读 dataless 内容触发同步 materialize，「can take a long time」可致 watchdog crash；OS 按 LRU 自动驱逐、不通知 app。**未文档化**：批量 materialize 成本、冷设备是否必须全下才能 replay、N 文件延迟；无 batch / 预取 API。(https://developer.apple.com/documentation/technotes/tn3150-getting-ready-for-data-less-files)
- **NSFileCoordinator**：同步阻塞；未下载项 coordinated read「blocks (potentially for a long time)」；批量 `prepare(...)`「much more efficient」（只定性）；后台带 presenter 会跨进程死锁，须 `removeFilePresenter`。**未文档化**：单次 / 批量延迟量级、UI 不阻塞保证、规模阈值。(https://developer.apple.com/documentation/foundation/nsfilecoordinator)
- **NSFileVersion / conflict**：iCloud 自动建版本，winner「on some basis」（不透明、不确定）、**无自动内容 merge**、loser 持续占配额直到 `removeOtherVersions`、document-scope 新文件冲突生 bounced 重复文件。→ **不可变 write-once-per-device segment 永不进 conflict 路径（佐证 D06）；共享可变 manifest 是文档级多 writer 隐患（D14 默认 per-device cursor）。** (https://developer.apple.com/library/archive/technotes/tn2336/_index.html)
- **quota / account**：`ubiquityIdentityToken`（nil=未登录，O(1)）、`NSUbiquityIdentityDidChange`（账号切换硬边界，绝不跨 identity 合并 segment）；over-quota 仅反应式错误（`NSUbiquitousFileNotUploadedDueToQuotaError` / `NSFileProviderError.insufficientQuota`），**无预查 API、无收敛保证**。(https://developer.apple.com/documentation/foundation/icloud-error-codes)
- **file package（`com.apple.package`）**：声明后 iCloud + `NSMetadataQuery` 当单 document（否则枚举内部文件，D34）；增量「only changed elements」但 element 未定义、不保证 = 单文件；只整包原子写。**未文档化**：内部文件数阈值、O(changed) vs O(total)、partial-materialize replay、内部文件级 conflict 粒度。(https://developer.apple.com/library/archive/documentation/General/Conceptual/iCloudDesignGuide/Chapters/DesigningForDocumentsIniCloud.html)
- **NSUbiquitousKeyValueStore**（manifest/cursor 候选）：硬上限 1MB 总 / 1024 key / 1MB 单值；服务端 recency check、无 merge hook；「several times per minute」、frequent writes 被 defer。→ **只配作极小 per-device cursor hint，权威 frontier 仍须可从 segment 推导。** (https://developer.apple.com/documentation/foundation/nsubiquitouskeyvaluestore)
- **CloudKit / CKSyncEngine**（scale gate no-go 时的转向候选）：server change-token + push（免文件枚举）、内建 batching + 退避；CKRecord ~1MB、CKAsset 50MB（仅 archived 文档、当前 reference 无、需实测）、per-request 400 items / 2MB（guideline 可变）、rate limit 无公开数字。→ **结构上比 iCloud Drive 更适合 million 多小对象。** (https://developer.apple.com/documentation/cloudkit/cksyncengine-4b4w9)

> **Prior-art（Inferred，非 Apple；支撑 D14/D38 的四 horizon + 两层 GC）：** log compaction 安全用 causal stability + min-of-known-frontiers（**非 wall-clock**；Kafka lagging-consumer 数据丢失教训）；time-travel retention 用 snapshot+delta / archive 而非硬删（Datomic as-of/excision、Git/Dolt reachability GC + archive、event-sourcing snapshot+read-time upcasting）。

---

## 8. Patch list for Claude

### 8.1 `contract-baseline-draft.md`

**Keep：**

- Strongest conclusion：Note-native、Apple-native-first、platform-agnostic Rust core。
- Core owns truth、model、dispatch、DTO/schema envelope、merge、op-log。
- Apple client 是 native shell，不拥有 business truth。
- TextKit mechanism-only boundary.
- iCloud Drive adapter 位于 `OpSyncPort` 后面；core 没有 CloudKit/iCloud types。
- CLI 是 local structured CLI，不是 MCP。

**Modify：**

- Binding baseline：“UniFFI + XCFramework / SwiftPM wrapper recommended, gated by Stage 1 spike; C ABI bytes fast path remains fallback”。Evidence：SwiftPM 可以在 macOS 通过 C ABI link 并运行 Rust staticlib；UniFFI 0.31.1 可以生成并运行 minimal record/bytes Swift binding；但这仍不证明 Anchor DTO/error/async shape。
- Apple build baseline：Observed local state 包括 default `xcode-select` 是 CLT，但 `/Applications/Xcode.app` 可通过 `DEVELOPER_DIR` 使用；Xcode 26.5、iOS SDK 26.5、iOS Simulator SDK 26.5、simulator devices 已观察到。Evidence：SwiftPM package 可以在 Xcode 26.5 下 build macOS 和 `generic/platform=iOS Simulator`，`iPhone 17` simulator bootstatus 可到 Finished 并 shutdown。Anchor target build remains Not run because project does not exist。
- Sync baseline：加入 file package UTType requirement (`com.apple.package`)。
- Sync baseline：加入 CloudKit caveat：64MB blob cap 超过 official archived 50MB Asset field limit；CloudKit route 在任何 CloudKit schema 前需要 split/lower/out-of-band decision。
- Editor baseline：cross-block continuous text selection 不是 first-release ability，只是 spike / intent-shaping boundary。Evidence：`NSTextView` / `UITextView` adapter compile surface 可在 macOS 和 iOS simulator 编译，macOS `NSTextView` runtime 可以设置 UTF-16 selection 并执行 semantic undo closure。

### 8.2 `key-decisions-draft.md`

**Keep：**

- D01：Rust core + Apple binding 方向。
- D02：`suites/anchor/` 作为 primary recommendation，但只在 approval 后生效。
- D03：in-process binding；`anchor serve` 只用于 dev/test。
- D06：immutable op segment。
- D18：external UTF-16 offset boundary。
- D19 / D26：cross-device deterministic diff3/order-key gates。
- D21：local-only non-ubiquity semantics。

**Modify：**

- D01：标为 `Recommended, partially proven by scratch, not Anchor-proven`；加入 UniFFI Swift 6 / async Sendable caveat；保留 Anchor DTO/error/async/bytes benchmark。把 observed C ABI host demo 和 UniFFI minimal record/bytes demo 作为 feasibility evidence，而不是完整 binding decision。
- D02：加入当前 Observed toolchain state；如果 Xcode-in-suite 或 Bun glob 失败，保留 fallback Option C。
- D06 / D14：区分 immutable segment files 与任何 mutable manifest；manifest conflict behavior 必须作为 Stage 1 iCloud proof。
- D17：为 iCloud Drive/local files 保留 64MB；加入 CloudKit 50MB Asset field caveat。
- D18：要求 offset fixtures 覆盖 composed characters、emoji、ZWJ、CRLF/newline、IME marked text。
- D21：path-in-ubiquity detection 必须由 adapter 拥有；如果 local-only guarantee 成为 product claim，要用 symlink / external volume cases 测试。

### 8.3 `07-project-layout-options.md`

**Keep：**

- Option A 作为 primary recommendation。
- Option C 作为 fallback。
- Option B 仍最弱，因为它把 product ownership 拆到 `apps/*` 和 `packages/*`。

**Modify：**

- Bun behavior certainty：current repo observed only package workspaces；Bun docs describe workspaces as packages with `package.json`；non-package glob behavior 未经 scratch-test。
- 明确写入：给 Rust/Xcode dirs 添加 placeholder `package.json` 会把它们变成 Bun workspace packages，并触发 AGENTS package obligations。
- 为 Xcode commands 加入 `-derivedDataPath` guidance。
- 加入 shared Swift code ownership：common Swift wrapper/package 位于 Apple tree 内，macOS/iOS adapters 分开。
- direct Swift package verification 使用 package cwd 下的 `xcodebuild -list`，或通过未来 workspace/project；scratch demo observed 本地 Xcode 26.5 不支持 `xcodebuild -list -packagePath <path>`。

### 8.4 `fixture-set-draft.md`

**Keep：**

- F19 single-block text selection.
- F20 block selection.
- F21 embedded editor selection.
- F22 cross-block edit rejection / normalizer split.
- F23 diff3 byte reproducibility.
- F26 order-key byte reproducibility.
- F34 sync merge.
- F38 font source dependency.

**Modify：**

- F19 应显式加入 composed characters 和 IME commit cases 的 UTF-16 offset fixtures。
- F21 应加入 native adapters 对 embedded code selection promote/demote 的证据。
- F22 应写明 cross-block continuous selection 只是 spike-only，不是 polished first-release UI commitment。
- F23 / F26 应写明 deterministic bytes 来自 Rust core vectors，不来自 TextKit/Swift-specific implementations。
- F34 应区分 iCloud Drive re-delivery / duplicate segment 与 CloudKit-specific re-delivery；CloudKit 保持第二阶段。

### 8.5 New user approvals to add

- 批准最终 layout 和目录创建。
- 批准 Xcode project/workspace creation、target names、bundle ids、signing team、entitlements。
- 在 Stage 1 evidence 之后批准 binding distribution boundary：UniFFI + XCFramework / SwiftPM binary，或 hybrid C ABI bytes fast path。
- 批准 signed app/iCloud entitlement 所需的 paid Apple Developer Program Team、bundle id、iCloud container id、capability 设置、automatic/manual signing mode；添加 capability / container 可能创建或绑定 Apple Developer 侧 App ID/container capability。
- 在 schema 进入 user private database 前批准任何 CloudKit/CKSyncEngine route。
- 如果 font-source decision 影响 “unknown font discarded” 语义，需要用户批准。

### 8.6 New Stage 1 spikes to add

- project creation 后的 Xcode target proof：`xcodebuild -list`、macOS build、iOS simulator build，以及使用 `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` 的 scheme/destination validation。Xcode UI demo 已创建独立 iOS project，但不是 Anchor target proof。
- Anchor iCloud capability proof：在 Anchor target 创建后复用 ADP signing path，确认 target profile/app signature 包含 iCloud entitlement；demo project 已证明 ADP automatic signing 可生成 iCloud Documents profile。
- Rust target setup：`aarch64-apple-darwin`、`aarch64-apple-ios`、`aarch64-apple-ios-sim`；scratch demo observed `aarch64-apple-ios-sim` build 在 target installed 前失败。
- UniFFI DTO/error/async/bytes benchmark spike；scratch minimal bytes benchmark 显示 64MB `bytes -> Data` debug transfer 可完成但成本约 2.35s / 267MB max RSS。
- XCFramework + SwiftPM wrapper import spike；scratch demo observed one-slice macOS XCFramework creation，但不是 multi-slice import。
- TextKit native adapter spike：single-block text、block selection、embedded editor selection、undo、IME、accessibility basics。
- iCloud Drive file package spike：Anchor package UTI、`NSMetadataQuery`、placeholder download、file coordination、conflict version、signed-out / over-quota observation；demo project 已证明 ADP iCloud Documents entitlement、signed device artifact 和 physical iPhone ubiquity container lookup。

### 8.7 Move out of first-release scope

- Cross-block continuous native text selection across multiple text surfaces。
- CloudKit / CKSyncEngine implementation。
- Web / Windows / Android iCloud sync。
- 任何独立于 Rust core 的 Swift-side diff3/order-key semantics implementation。
- 会在 product app build 期间编译 Rust 的 source Swift Package。
- 任何直接 persist domain semantics 的 TextKit / `NSAttributedString` model。

---

## Source notes

本验证使用的 external source-backed facts：

- Bun Workspaces documentation: https://bun.com/docs/pm/workspaces
- UniFFI Swift bindings: https://mozilla.github.io/uniffi-rs/latest/swift/overview.html
- UniFFI async overview: https://mozilla.github.io/uniffi-rs/latest/internals/async-overview.html
- UniFFI foreign-language bindings / bindgen: https://mozilla.github.io/uniffi-rs/latest/tutorial/foreign_language_bindings.html
- UniFFI Swift bindgen: https://mozilla.github.io/uniffi-rs/latest/swift/uniffi-bindgen-swift.html
- UniFFI UDL file: https://mozilla.github.io/uniffi-rs/latest/udl/index.html
- UniFFI UDL records: https://mozilla.github.io/uniffi-rs/latest/udl/records.html
- UniFFI built-in types: https://mozilla.github.io/uniffi-rs/0.27/udl/builtin_types.html
- Apple TextKit documentation: https://developer.apple.com/documentation/uikit/textkit
- Apple `NSTextView` documentation: https://developer.apple.com/documentation/appkit/nstextview
- Apple `NSString` documentation: https://developer.apple.com/documentation/foundation/nsstring
- Apple `NSFileCoordinator` coordinated read documentation: https://developer.apple.com/documentation/foundation/nsfilecoordinator/coordinate(readingitemat:options:error:byaccessor:)
- Apple `FileManager.startDownloadingUbiquitousItem(at:)`: https://developer.apple.com/documentation/foundation/filemanager/startdownloadingubiquitousitem(at:)
- Apple `NSMetadataQuery` documentation: https://developer.apple.com/documentation/foundation/nsmetadataquery
- Apple `FileManager.url(forUbiquityContainerIdentifier:)`: https://developer.apple.com/documentation/foundation/filemanager/url(forubiquitycontaineridentifier:)
- Apple Adding capabilities to your app: https://developer.apple.com/documentation/xcode/adding-capabilities-to-your-app
- Apple Configuring iCloud services: https://developer.apple.com/documentation/xcode/configuring-icloud-services
- Apple Signing & Capabilities workflow: https://help.apple.com/xcode/mac/current/en.lproj/dev60b6fbbc7.html
- Apple Capabilities overview: https://developer.apple.com/help/account/capabilities/capabilities-overview
- Apple Enable app capabilities: https://developer.apple.com/help/account/identifiers/enable-app-capabilities/
- Apple Entitlements: https://developer.apple.com/documentation/bundleresources/entitlements
- Apple iCloud Container Identifiers Entitlement: https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.icloud-container-identifiers
- Apple iCloud Services Entitlement: https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.icloud-services
- Apple Choosing a Membership: https://developer.apple.com/support/compare-memberships/
- Apple Supported capabilities (iOS): https://developer.apple.com/help/account/reference/supported-capabilities-ios/
- Apple iCloud File Management archive: https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/iCloud/iCloud.html
- Apple CloudKit Web Services data size limits archive: https://developer.apple.com/library/archive/documentation/DataManagement/Conceptual/CloudKitWebServicesReference/PropertyMetrics.html
