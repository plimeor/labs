# Anchor Stage 1 - Apple Integration State for Claude

Date: 2026-06-07
Owner: Codex / Apple verifier
Status: workbench artifact, not a public interface contract

## Files added by Codex

Apple spike implementation files:

- `suites/anchor/apple/ffi/Cargo.toml`
- `suites/anchor/apple/ffi/include/AnchorCoreFFI.h`
- `suites/anchor/apple/ffi/src/lib.rs`
- `suites/anchor/apple/AnchorAppleSpike/Package.swift`
- `suites/anchor/apple/AnchorAppleSpike/Sources/AnchorCoreC/include/AnchorCoreFFI.h`
- `suites/anchor/apple/AnchorAppleSpike/Sources/AnchorCoreC/empty.c`
- `suites/anchor/apple/AnchorAppleSpike/Sources/AnchorCoreBindings/AnchorCoreBindings.swift`
- `suites/anchor/apple/AnchorAppleSpike/Sources/AnchorAppleSmoke/main.swift`
- `suites/anchor/apple/AnchorAppleSpike/Sources/AnchorTextKitProbe/AnchorTextKitProbe.swift`
- `suites/anchor/apple/AnchorAppleSpike/Sources/AnchorTextKitSmoke/main.swift`
- `suites/anchor/apple/AnchorAppleSpike/Sources/AnchorICloudDriveProbe/AnchorICloudDriveProbe.swift`
- `suites/anchor/apple/uniffi/Cargo.toml`
- `suites/anchor/apple/uniffi/build.rs`
- `suites/anchor/apple/uniffi/src/anchor_core_uniffi.udl`
- `suites/anchor/apple/uniffi/src/lib.rs`
- `suites/anchor/apple/uniffi/SwiftSmoke/smoke.swift`
- `suites/anchor/apple/macos-icloud-probe/AnchorMacICloudProbe.swift`
- `suites/anchor/apple/macos-icloud-probe/AnchorMacICloudProbe.entitlements`
- `suites/anchor/apple/AnchorMacICloudProbe/AnchorMacICloudProbe.xcodeproj/project.pbxproj`
- `suites/anchor/apple/AnchorMacICloudProbe/AnchorMacICloudProbe.xcodeproj/project.xcworkspace/contents.xcworkspacedata`
- `suites/anchor/apple/AnchorMacICloudProbe/AnchorMacProbe.entitlements`
- `suites/anchor/apple/AnchorMacICloudProbe/AnchorMacProbeInfo.plist`
- `suites/anchor/apple/AnchorMacICloudProbe/AnchorMacICloudProbe/AnchorMacICloudProbeApp.swift`
- `suites/anchor/apple/AnchorMacICloudProbe/AnchorMacICloudProbe/ContentView.swift`
- `suites/anchor/apple/AnchorMacICloudProbe/AnchorMacICloudProbe/ICloudRuntimeProbe.swift`
- `suites/anchor/apple/AnchorMacICloudProbe/AnchorMacICloudProbe/Assets.xcassets/**`

Workbench reports:

- `docs/workbench/anchor/2026-06-07-stage-1/apple-binding-report.md`
- `docs/workbench/anchor/2026-06-07-stage-1/textkit-adapter-report.md`
- `docs/workbench/anchor/2026-06-07-stage-1/icloud-drive-report.md`
- `docs/workbench/anchor/2026-06-07-stage-1/apple-patch-list-for-claude.md`

Generated artifacts kept out of repo:

- `/tmp/anchor-apple-stage1/ffi-target`
- `/tmp/anchor-apple-stage1/AnchorCoreFFI.xcframework`
- `/tmp/anchor-apple-stage1/uniffi-target`
- `/tmp/anchor-apple-stage1/uniffi-generated`
- `/tmp/anchor-apple-stage1/AnchorCoreUniFFI.xcframework`
- `/tmp/anchor-apple-stage1/swift-build*`
- `/tmp/anchor-apple-stage1/DerivedData/*`

Repo-external Apple runtime probe created under `Documents`:

- `/Users/plimeor/Documents/AnchorMacICloudProbe/AnchorMacICloudProbe.xcodeproj`
- `/Users/plimeor/Documents/AnchorMacICloudProbe/AnchorMacICloudProbe/**`
- bundle id: `dev.plimeor.AnchorMacICloudProbe`
- initial iCloud container: `iCloud.dev.plimeor.AnchorMacICloudProbe`

Repo-external Apple runtime probes extended for shared-container conflict testing:

- `/Users/plimeor/Documents/AnchorProvisionProbe/AnchorProvisionProbe/AnchorProvisionProbeApp.swift`
- `/Users/plimeor/Documents/AnchorMacICloudProbe/AnchorMacICloudProbe/AnchorMacICloudProbeApp.swift`
- `/Users/plimeor/Documents/AnchorMacICloudProbe/AnchorMacICloudProbe/AnchorMacICloudProbe.entitlements`
- shared iCloud container: `<ICLOUD_CONTAINER>`
- conflict launch flag: `--icloud-conflict-probe <runID> <startEpochMilliseconds> <writer> <mode> <iterations> <settleSeconds>`

## Files intentionally not changed by Codex

- root `package.json`
- root `bun.lock`
- Bun workspace configuration
- `suites/anchor/Cargo.toml`
- `suites/anchor/core/**`
- any product app shell
- any repo-local product app entitlement, bundle id, provisioning profile, or iCloud container
- any repo-local product app target; the repo-local Xcode project is a verifier-only macOS project

## Current verification summary

Passed:

- Xcode/Swift/Rust environment with explicit `DEVELOPER_DIR`.
- Bun glob check passes: `bun install --dry-run --frozen-lockfile --ignore-scripts`, and `find suites/anchor -name package.json -print` returns 0 files.
- Rust Apple targets installed: `aarch64-apple-ios`, `aarch64-apple-ios-sim`.
- `anchor-core` builds for macOS, iOS, and iOS Simulator.
- Separate C ABI FFI wrapper builds three staticlib slices.
- Three-slice XCFramework creation succeeds.
- Separate UniFFI wrapper builds three staticlib slices.
- UniFFI generated Swift source/header/modulemap succeeds.
- UniFFI generated Swift smoke calls fixture summary, `EditorIntentDto`, `TransactionResultSummary`, typed `ValidationErrorCode`, post-dispatch snapshot revision, `SegmentId`, segment bytes, and blob bytes.
- UniFFI three-slice XCFramework creation succeeds.
- Release-surface rerun creates both C ABI and UniFFI three-slice XCFrameworks and runs generated Swift with `-swift-version 6 -strict-concurrency=complete -warnings-as-errors`.
- UniFFI generated Swift compiles for macOS, iOS device SDK, and iOS Simulator SDK.
- SwiftPM wrapper imports the FFI surface.
- macOS Swift smoke calls fixture summary, dispatch insert, typed `ValidationErrorCode`, segment bytes, and blob bytes.
- C ABI bytes benchmark passes 1/4/16/64MB with 64MB around 38.22ms and max RSS around 96MB.
- TextKit macOS smoke passes UTF-16 selection/layout/semantic undo probe.
- TextKit iOS Simulator compile passes.
- iCloud adapter macOS/iOS compile passes.
- Physical iPhone signed iCloud runtime passes container lookup, package type id, coordinated write/read, current segment download call, and 1024-file write subset.
- True macOS signed `.app` provisioning/build/runtime passes; Xcode generated/used `Mac Team Provisioning Profile: dev.plimeor.AnchorMacICloudProbe`.
- macOS signed `.app` runtime proves `.anchorvault` package metadata discovery works (`package_metadata_count=1`).
- macOS signed `.app` runtime proves package-internal direct enumeration sees 1024 hidden `.anchor` segment files, 128 visible package-internal segment files, and 10K / 50K / 100K package-internal scale counts.
- macOS signed `.app` runtime proves `NSMetadataQuery` does not enumerate package-internal `.seg` files in this probe, while it can enumerate package-external `.seg` files.
- macOS + iOS shared-container online conflict harness passes in coordinated mode: both devices converged to macOS `seq=79`, `conflict_versions=0`.
- macOS + iOS shared-container online conflict harness passes in raw write mode: both devices converged to iOS `seq=119`, `conflict_versions=0`.
- macOS + iOS shared-container offline fork conflict harness passes: after iPhone was offline, iOS wrote `ios-offline`, macOS wrote `mac-online`, reconnect selected `ios-offline` as current and exposed 1 unresolved `NSFileVersion` conflict containing the `mac-online` JSON.
- Repo-local verifier exists under `suites/anchor/apple/AnchorMacICloudProbe` as an Xcode-created macOS-only project (`SUPPORTED_PLATFORMS = macosx`).
- Repo-local verifier signed build passes with `Mac Team Provisioning Profile: dev.plimeor.AnchorMacICloudProbe`; the runtime uses CloudDocuments-only entitlement for `<ICLOUD_CONTAINER>` via `CODE_SIGN_ENTITLEMENTS=AnchorMacProbe.entitlements`, `INFOPLIST_FILE=AnchorMacProbeInfo.plist`, and `GENERATE_INFOPLIST_FILE=NO`.
- Repo-local verifier macOS runtime passes container lookup, `.anchorvault` Info.plist package declaration, coordinated read/write, 1024-file subset, and 10K / 50K / 100K direct enumeration; package-internal `NSMetadataQuery` count remains 0, and package-internal placeholder/download attempts return `NSCocoaErrorDomain:4`. Current scale timings are 10K `3634.66ms` write / `22.53ms` enum, 50K `18455.09ms` write / `124.70ms` enum, and 100K `38509.85ms` write / `269.50ms` enum.
- core cloud-symbol grep audit passes with 0 cloud matches.

Open gates / blocked:

- Repo-local signed Anchor product app target; the current repo-local project is a verifier target only.
- Full Anchor target iCloud runtime.
- standalone signed macOS CLI remains invalid for restricted iCloud entitlements; use a real `.app`.
- iOS physical-device `NSMetadataQuery` did not gather within the probe windows and returned 0 segment results.
- Remote placeholder download; current macOS probe observed local package-internal evict/download failure, not a true remote `.icloud` placeholder.
- Product conflict-resolution policy for unresolved `NSFileVersion` manifest conflicts. Runtime materialization was observed; resolution/removal remains open.
- over-quota / signed-out states.
- remote placeholder, signed-out / over-quota, non-macOS large-scale delivery, and steady-state segment budget gates.

## Current decision state

1. **D01 binding**

   Binding state is `UniFFI DTO / ordinary dispatch + C ABI bytes fast path`. UniFFI covers fixture summary, dispatch, typed `ValidationErrorCode`, changed snapshot, segment id, segment bytes, and blob bytes round-trip through generated Swift. Synchronous generated Swift passes Swift 6 strict concurrency + warnings-as-errors against release artifacts. Bulk segment/blob bytes use the C ABI fast path.

2. **DTO / error vocabulary**

   The binding surface preserves a structured `TransactionResult` envelope. Core DTO now exposes typed `ValidationError` with stable `code/message`, and both C ABI Swift wrapper and UniFFI generated Swift smoke assert `direct_active_to_deleted`.

3. **TextKit adapter**

   TextKit runtime work is MainActor-bound. Stage 1 evidence covers macOS UTF-16 selection/layout/semantic undo smoke and iOS simulator compile. Real app responder-chain direct buffer undo suppression, IME marked text, accessibility, and full patch replay remain product-runtime gates.

4. **iCloud Drive**

   iCloud Drive state is compromise. Signed iPhone and macOS probes pass container lookup, package type id, coordinated read/write, package-level metadata discovery, package-internal direct enumeration through 100K files on macOS, online convergence, and offline `NSFileVersion` conflict materialization. Package-internal `.seg` discovery does not rely on `NSMetadataQuery`.

5. **iCloud remaining gates**

   Default transport approval requires product conflict-resolution policy, remote placeholder behavior, signed-out / over-quota states, local-only path edge cases, iOS large-scale delivery behavior, and million-op core replay/compaction plus steady-state segment budget.

6. **Core boundary**

   Apple spike code contains no merge, normalization, op creation, tree invariants, diff3, order-key, or persistent app writes. Core cloud-symbol audit remains 0 matches.
