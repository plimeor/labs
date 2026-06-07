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

## Current verification summary

Passed:

- Xcode/Swift/Rust environment with explicit `DEVELOPER_DIR`.
- Rust Apple targets installed: `aarch64-apple-ios`, `aarch64-apple-ios-sim`.
- `anchor-core` builds for macOS, iOS, and iOS Simulator.
- Separate C ABI FFI wrapper builds three staticlib slices.
- Three-slice XCFramework creation succeeds.
- Separate UniFFI wrapper builds three staticlib slices.
- UniFFI generated Swift source/header/modulemap succeeds.
- UniFFI generated Swift smoke calls fixture summary, `EditorIntentDto`, `TransactionResultSummary`, validation error, post-dispatch snapshot revision, `SegmentId`, segment bytes, and blob bytes.
- UniFFI three-slice XCFramework creation succeeds.
- UniFFI generated Swift compiles for macOS, iOS device SDK, and iOS Simulator SDK.
- SwiftPM wrapper imports the FFI surface.
- macOS Swift smoke calls fixture summary, dispatch insert, validation error, segment bytes, and blob bytes.
- C ABI bytes benchmark passes 1/4/16/64MB with 64MB around 38.22ms and max RSS around 96MB.
- TextKit macOS smoke passes UTF-16 selection/layout/semantic undo probe.
- TextKit iOS Simulator compile passes.
- iCloud adapter macOS/iOS compile passes.
- Physical iPhone signed iCloud runtime passes container lookup, package type id, coordinated write/read, current segment download call, and 1024-file write subset.
- True macOS signed `.app` provisioning/build/runtime passes; Xcode generated/used `Mac Team Provisioning Profile: dev.plimeor.AnchorMacICloudProbe`.
- macOS signed `.app` runtime proves `.anchorvault` package metadata discovery works (`package_metadata_count=1`).
- macOS signed `.app` runtime proves package-internal direct enumeration sees 1024 hidden `.anchor` segment files and 128 visible package-internal segment files.
- macOS signed `.app` runtime proves `NSMetadataQuery` does not enumerate package-internal `.seg` files in this probe, while it can enumerate package-external `.seg` files.
- macOS + iOS shared-container online conflict harness passes in coordinated mode: both devices converged to macOS `seq=79`, `conflict_versions=0`.
- macOS + iOS shared-container online conflict harness passes in raw write mode: both devices converged to iOS `seq=119`, `conflict_versions=0`.
- macOS + iOS shared-container offline fork conflict harness passes: after iPhone was offline, iOS wrote `ios-offline`, macOS wrote `mac-online`, reconnect selected `ios-offline` as current and exposed 1 unresolved `NSFileVersion` conflict containing the `mac-online` JSON.
- core cloud-symbol grep audit passes with 0 cloud matches.

Open gates / blocked:

- Repo-local signed Anchor app target.
- Full Anchor target iCloud runtime.
- standalone signed macOS CLI remains invalid for restricted iCloud entitlements; use a real `.app`.
- iOS physical-device `NSMetadataQuery` did not gather within the probe windows and returned 0 segment results.
- Remote placeholder download; current probe only called download on a local/current segment.
- Product conflict-resolution policy for unresolved `NSFileVersion` manifest conflicts. Runtime materialization was observed; resolution/removal was not implemented or performed.
- over-quota / signed-out states.
- segment-file-count 10K/50K/100K scale gate.

## Current decision state

1. **D01 binding**

   Binding state is `UniFFI DTO / ordinary dispatch + C ABI bytes fast path`. UniFFI covers fixture summary, dispatch, validation error, changed snapshot, segment id, segment bytes, and blob bytes round-trip through generated Swift. Bulk segment/blob bytes use the C ABI fast path.

2. **DTO / error vocabulary**

   The binding surface preserves a structured `TransactionResult` envelope. Final CP-1 freeze still needs core-owned typed validation errors if validation semantics must be enum-shaped rather than `validation_error: Option<String>`.

3. **TextKit adapter**

   TextKit runtime work is MainActor-bound. Stage 1 evidence covers macOS UTF-16 selection/layout/semantic undo smoke and iOS simulator compile. Real app responder-chain direct buffer undo suppression, IME marked text, accessibility, and full patch replay remain product-runtime gates.

4. **iCloud Drive**

   iCloud Drive state is compromise. Signed iPhone and macOS probes pass container lookup, package type id, coordinated read/write, package-level metadata discovery, package-internal direct enumeration, 1024-file subset, online convergence, and offline `NSFileVersion` conflict materialization. Package-internal `.seg` discovery does not rely on `NSMetadataQuery`.

5. **iCloud remaining gates**

   Default transport approval requires product conflict-resolution policy, remote placeholder behavior, signed-out / over-quota states, local-only path edge cases, 10K/50K/100K segment-file-count scale, and million-op core replay/compaction budget.

6. **Core boundary**

   Apple spike code contains no merge, normalization, op creation, tree invariants, diff3, order-key, or persistent app writes. Core cloud-symbol audit remains 0 matches.
