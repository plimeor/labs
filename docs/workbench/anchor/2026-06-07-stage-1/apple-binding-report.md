# Anchor Stage 1 - Apple Binding Report

Date: 2026-06-07
Owner: Codex / Apple verifier
Status: workbench artifact, not a public interface contract

## Conclusion

Binding status is **passed for Stage 1 DTO/ordinary dispatch round-trip, not for pure UniFFI bulk bytes**.

Observed in this run:

- `anchor-core` builds for macOS, iOS device, and iOS Simulator targets.
- A separate Apple FFI wrapper crate builds three staticlib slices without changing `anchor-core` crate type.
- Three-slice `AnchorCoreFFI.xcframework` creation succeeds.
- SwiftPM wrapper imports the C ABI wrapper and calls the Claude-provided fixture, `TransactionResult`, typed validation error field, segment bytes, and 1/4/16/64MB blob bytes.
- A separate UniFFI wrapper crate generates Swift source/header/modulemap, builds macOS/iOS/iOS-sim slices, creates a three-slice `AnchorCoreUniFFI.xcframework`, and runs a generated Swift full round-trip smoke.
- UniFFI Swift calls the Claude-provided fixture, `EditorIntentDto`, `TransactionResultSummary`, generated `ValidationErrorCode`, post-dispatch fixture summary, `SegmentId`, segment bytes, and 1/4/16/64MB blob bytes.
- C ABI bytes fast path is materially lighter for segment/blob transfer than UniFFI bytes in this debug Swift smoke.

Follow-up observed after typed-validation freeze:

- Core DTO exposes `ValidationError` enum with stable `code/message`.
- C ABI JSON maps `validation_error` to `{code,message}` and Swift decodes `ValidationErrorCode.directActiveToDeleted`.
- UniFFI UDL exposes generated `ValidationErrorCode`; generated Swift smoke asserts `.directActiveToDeleted`.

Not observed in this run:

- Full production DTO vocabulary. The UniFFI wrapper uses a Stage 1 flat `EditorIntentDto` / `TransactionResultSummary` shape to avoid moving deterministic logic into Swift.

Recommended binding direction: **UniFFI primary for DTO/ordinary dispatch + C ABI bytes fast path for segment/blob bytes**. A pure UniFFI-primary path for bulk bytes should not be frozen from current evidence.

## Scope

Created only Apple spike files under `suites/anchor/apple/**`.

No changes were made to:

- root `package.json`
- root `bun.lock`
- Bun workspace configuration
- `suites/anchor/core` source
- core deterministic algorithms

Build outputs and DerivedData were kept outside the repo:

- `/tmp/anchor-apple-stage1/ffi-target`
- `/tmp/anchor-apple-stage1/AnchorCoreFFI.xcframework`
- `/tmp/anchor-apple-stage1/uniffi-target`
- `/tmp/anchor-apple-stage1/uniffi-generated`
- `/tmp/anchor-apple-stage1/AnchorCoreUniFFI.xcframework`
- `/tmp/anchor-apple-stage1/swift-build*`
- `/tmp/anchor-apple-stage1/DerivedData/*`

## Environment

| Command | Result |
|---|---|
| `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -version` | `Xcode 26.5`, build `17F42` |
| `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift --version` | Swift `6.3.2`, target `arm64-apple-macosx26.0` |
| `rustc --version` | `rustc 1.95.0 (59807616e 2026-04-14)` |
| `cargo --version` | `cargo 1.95.0 (f2d3ce0bd 2026-03-21)` |
| `rustup target list --installed` before Apple install | `aarch64-apple-darwin`, `aarch64-linux-android`, `wasm32-unknown-unknown` |
| `rustup target add aarch64-apple-ios aarch64-apple-ios-sim` | downloaded both `rust-std` components |
| `rustup target list --installed` after install | adds `aarch64-apple-ios`, `aarch64-apple-ios-sim` |
| `DEVELOPER_DIR=... xcrun simctl list runtimes` | iOS 26.2, 26.4.1, 26.5 runtimes available |
| `DEVELOPER_DIR=... xcrun simctl list devicetypes` | iPhone 17 family, iPhone 16/15/14 families, iPad M5/M4/M3/A16/A17 Pro, watch/tv/vision device types available |

## Rust build results

All commands ran from `suites/anchor` or with an explicit manifest path.

| Command | Result |
|---|---|
| `DEVELOPER_DIR=... cargo build -p anchor-core --release --target aarch64-apple-darwin` | passed |
| `DEVELOPER_DIR=... cargo build -p anchor-core --release --target aarch64-apple-ios` | passed |
| `DEVELOPER_DIR=... cargo build -p anchor-core --release --target aarch64-apple-ios-sim` | passed |
| `DEVELOPER_DIR=... CARGO_TARGET_DIR=/tmp/anchor-apple-stage1/ffi-target cargo build --manifest-path suites/anchor/apple/ffi/Cargo.toml --release --target aarch64-apple-darwin` | passed |
| same wrapper build for `aarch64-apple-ios` | passed |
| same wrapper build for `aarch64-apple-ios-sim` | passed |
| `DEVELOPER_DIR=... CARGO_TARGET_DIR=/tmp/anchor-apple-stage1/uniffi-target cargo build --manifest-path suites/anchor/apple/uniffi/Cargo.toml --release --target aarch64-apple-darwin` | passed |
| same UniFFI wrapper build for `aarch64-apple-ios` | passed |
| same UniFFI wrapper build for `aarch64-apple-ios-sim` | passed |

The wrapper crate is intentionally separate from `anchor-core`, so the core crate remains a platform-agnostic rlib for wasm/android gates.

## XCFramework

Command:

```fish
env DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -create-xcframework \
  -library /tmp/anchor-apple-stage1/ffi-target/aarch64-apple-darwin/release/libanchor_core_ffi.a -headers suites/anchor/apple/ffi/include \
  -library /tmp/anchor-apple-stage1/ffi-target/aarch64-apple-ios/release/libanchor_core_ffi.a -headers suites/anchor/apple/ffi/include \
  -library /tmp/anchor-apple-stage1/ffi-target/aarch64-apple-ios-sim/release/libanchor_core_ffi.a -headers suites/anchor/apple/ffi/include \
  -output /tmp/anchor-apple-stage1/AnchorCoreFFI.xcframework
```

Result: passed, `xcframework successfully written out`.

Artifact size observed: `51M`.

## SwiftPM wrapper

Package: `suites/anchor/apple/AnchorAppleSpike`

Observed schemes from `xcodebuild -list`:

- `AnchorAppleSmoke`
- `AnchorAppleSpike-Package`
- `AnchorCoreBindings`
- `AnchorICloudDriveProbe`
- `AnchorTextKitProbe`
- `AnchorTextKitSmoke`

Commands:

| Command | Result |
|---|---|
| `ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-darwin/release swift run --package-path suites/anchor/apple/AnchorAppleSpike --scratch-path /tmp/anchor-apple-stage1/swift-build AnchorAppleSmoke` | passed |
| `ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-ios-sim/release xcodebuild -scheme AnchorCoreBindings -destination 'generic/platform=iOS Simulator' -configuration Debug -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/bindings-ios -quiet build` | passed |

Smoke output:

```text
fixture:vault=vault_demo_0001 notes=1 snapshot=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63
dispatch:insert changed=blk_a selection=3:3
dispatch:error validation=direct_active_to_deleted
segment:bytes=979
```

Observed DTO facts:

- `open_fixture_vault()` returns the expected fixture vault id, one note, and expected snapshot revision.
- `dispatchInsertText(targetID: "blk_a", at: 0, text: "🍎 ")` returns `changed_ids = ["blk_a"]`.
- Selection hint is UTF-16 aware: the inserted string `"🍎 "` advances the caret by 3 UTF-16 code units.
- Direct active to deleted dispatch returns structured `TransactionResult.validation_error.code = "direct_active_to_deleted"`.
- `read_segment()` returns non-empty segment bytes.

## Bytes benchmark

This benchmark measures the C ABI bytes fast path via Swift `Data` copy, not UniFFI.

| Size | Time | Max RSS | Result |
|---:|---:|---:|---|
| 1MB | 1.94ms | 8,093,696 | passed |
| 4MB | 5.34ms | 12,386,304 | passed |
| 16MB | 9.70ms | 29,229,056 | passed |
| 64MB | 38.22ms | 96,387,072 | passed |

This is strong evidence that C ABI should be kept for segment/blob fast-path bytes alongside UniFFI DTO/ordinary dispatch.

## UniFFI status

Wrapper files:

- `suites/anchor/apple/uniffi/Cargo.toml`
- `suites/anchor/apple/uniffi/build.rs`
- `suites/anchor/apple/uniffi/src/anchor_core_uniffi.udl`
- `suites/anchor/apple/uniffi/src/lib.rs`
- `suites/anchor/apple/uniffi/SwiftSmoke/smoke.swift`

Binding generation command:

```fish
cargo run --manifest-path /Users/plimeor/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/uniffi-0.31.1/Cargo.toml \
  --features cli --bin uniffi-bindgen-swift -- \
  --swift-sources --headers --modulemap \
  --module-name anchor_core_uniffiFFI \
  --modulemap-filename module.modulemap \
  src/anchor_core_uniffi.udl \
  /tmp/anchor-apple-stage1/uniffi-generated
```

Result: passed; generated `anchor_core_uniffi.swift`, `anchor_core_uniffiFFI.h`, and `module.modulemap`.

Generated Swift compile/run commands:

| Command | Result |
|---|---|
| `swiftc -I /tmp/anchor-apple-stage1/uniffi-generated -L /tmp/anchor-apple-stage1/uniffi-target/aarch64-apple-darwin/release -lanchor_core_uniffi /tmp/anchor-apple-stage1/uniffi-generated/anchor_core_uniffi.swift suites/anchor/apple/uniffi/SwiftSmoke/smoke.swift -o /tmp/anchor-apple-stage1/uniffi-smoke` | passed |
| `/tmp/anchor-apple-stage1/uniffi-smoke` | passed |
| `xcrun --sdk iphonesimulator swiftc -target arm64-apple-ios18.0-simulator ... -lanchor_core_uniffi ... -o /tmp/anchor-apple-stage1/uniffi-smoke-iossim` | passed |
| `xcrun --sdk iphoneos swiftc -target arm64-apple-ios18.0 ... -lanchor_core_uniffi ... -o /tmp/anchor-apple-stage1/uniffi-smoke-ios` | passed |

UniFFI smoke output:

```text
uniffi:fixture vault=vault_demo_0001 notes=1 snapshot=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63
uniffi:dispatch insert changed=blk_a selection=3:3
uniffi:dispatch error=directActiveToDeleted message=direct active→deleted rejected; trash first (D10/D20)
uniffi:roundtrip before=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63 after=56e9e39d17157e6bc97d9008aef910791ae4d89b340b4aa767abb8f2fba0e1b6 segment=987 id=seg_1a1fa331b3f1e2c09a880af24bc76e74c5f829c80e47cd7752cf895454a364e3
uniffi:segment bytes=806 checksum=9609028308393580495
```

Observed UniFFI DTO facts:

- `openFixtureVault()` returns the expected fixture summary through generated Swift.
- `dispatchEditorIntent(EditorIntentDto(kind: "insert_text", ...))` returns `changedIds = ["blk_a"]` and UTF-16 caret `3:3`.
- `dispatchEditorIntent(EditorIntentDto(kind: "set_life", life: "deleted"))` preserves the structured validation-error field.
- `roundTripInsert(...)` opens a fixture session, dispatches to core, returns a changed snapshot revision, returns non-empty segment bytes, and returns a `seg_...` segment id.
- The wrapper constructs core `EditorIntent` and `OpStamp` in Rust; Swift does not implement op creation, merge, normalization, diff3, order-key, or tree invariants.

UniFFI XCFramework command:

```fish
env DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -create-xcframework \
  -library /tmp/anchor-apple-stage1/uniffi-target/aarch64-apple-darwin/release/libanchor_core_uniffi.a -headers /tmp/anchor-apple-stage1/uniffi-generated \
  -library /tmp/anchor-apple-stage1/uniffi-target/aarch64-apple-ios/release/libanchor_core_uniffi.a -headers /tmp/anchor-apple-stage1/uniffi-generated \
  -library /tmp/anchor-apple-stage1/uniffi-target/aarch64-apple-ios-sim/release/libanchor_core_uniffi.a -headers /tmp/anchor-apple-stage1/uniffi-generated \
  -output /tmp/anchor-apple-stage1/AnchorCoreUniFFI.xcframework
```

Result: passed, `xcframework successfully written out`.

## UniFFI bytes benchmark

This benchmark measures generated UniFFI `bytes` returned to Swift `Data`.

| Size | Time | Max RSS | Result |
|---:|---:|---:|---|
| 1MB | 2.36ms | 11,190,272 | passed |
| 4MB | 8.47ms | 23,871,488 | passed |
| 16MB | 33.31ms | 74,268,672 | passed |
| 64MB | 145.22ms | 267,272,192 | passed |

UniFFI bytes are feasible for Stage 1 correctness, but they are not the right default for bulk segment/blob transport. Compared with the C ABI smoke, the 64MB transfer is roughly 3.8x slower and has roughly 2.8x max RSS.

## Stop-condition check

No stop condition was hit.

- Apple binding can preserve the structured `TransactionResult` envelope.
- Bulk bytes do not need to be forced through UniFFI.
- Swift/TextKit side did not implement merge, normalization, op creation, diff3, order-key, or tree invariants.

Open concern: Swift 6 strict concurrency / async `Sendable`, final production DTO/error vocabulary, release packaging, and CI reproduction still gate binding freeze.
