#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUT_DIR="${ANCHOR_APPLE_ARTIFACT_DIR:-/tmp/anchor-apple-stage1/hosted-binding-artifacts}"
DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
export DEVELOPER_DIR

cleanup_lockfiles() {
  rm -f "$SCRIPT_DIR/ffi/Cargo.lock" "$SCRIPT_DIR/uniffi/Cargo.lock"
}
trap cleanup_lockfiles EXIT

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

HOST_TRIPLE="$(rustc -vV | awk '/^host:/ { print $2 }')"
if [[ "$HOST_TRIPLE" != *-apple-darwin ]]; then
  echo "expected an Apple host triple, got: $HOST_TRIPLE" >&2
  exit 1
fi

FFI_TARGET_DIR="$OUT_DIR/ffi-target"
MACOS_FFI_TARGETS=("aarch64-apple-darwin")
if [[ "$HOST_TRIPLE" != "aarch64-apple-darwin" ]]; then
  MACOS_FFI_TARGETS+=("$HOST_TRIPLE")
fi

echo "== build C ABI FFI release slices =="
for target in "${MACOS_FFI_TARGETS[@]}" aarch64-apple-ios aarch64-apple-ios-sim; do
  CARGO_TARGET_DIR="$FFI_TARGET_DIR" cargo build \
    --manifest-path "$SCRIPT_DIR/ffi/Cargo.toml" \
    --release \
    --target "$target"
done

MACOS_LIBS=()
for target in "${MACOS_FFI_TARGETS[@]}"; do
  MACOS_LIBS+=("$FFI_TARGET_DIR/$target/release/libanchor_core_ffi.a")
done

MACOS_LIB="$OUT_DIR/libanchor_core_ffi_macos.a"
if [[ "${#MACOS_LIBS[@]}" -eq 1 ]]; then
  cp "${MACOS_LIBS[0]}" "$MACOS_LIB"
else
  xcrun lipo -create "${MACOS_LIBS[@]}" -output "$MACOS_LIB"
fi
xcrun lipo -info "$MACOS_LIB"

HEADERS_DIR="$OUT_DIR/wrapper-binary-headers"
mkdir -p "$HEADERS_DIR"
cp "$SCRIPT_DIR/ffi/include/AnchorCoreFFI.h" "$HEADERS_DIR/AnchorCoreFFI.h"
cat > "$HEADERS_DIR/module.modulemap" <<'EOF'
module AnchorCoreC {
    header "AnchorCoreFFI.h"
    export *
}
EOF

XCFRAMEWORK="$OUT_DIR/AnchorCoreCBinary.xcframework"
echo "== create C ABI XCFramework =="
xcodebuild -create-xcframework \
  -library "$MACOS_LIB" \
  -headers "$HEADERS_DIR" \
  -library "$FFI_TARGET_DIR/aarch64-apple-ios/release/libanchor_core_ffi.a" \
  -headers "$HEADERS_DIR" \
  -library "$FFI_TARGET_DIR/aarch64-apple-ios-sim/release/libanchor_core_ffi.a" \
  -headers "$HEADERS_DIR" \
  -output "$XCFRAMEWORK"

echo "== build Swift wrapper consumer =="
CONSUMER_DIR="$OUT_DIR/wrapper-binary-consumer"
mkdir -p "$CONSUMER_DIR/Sources/AnchorCoreBindings" "$CONSUMER_DIR/Sources/WrapperConsumer"
cp "$SCRIPT_DIR/AnchorAppleSpike/Sources/AnchorCoreBindings/AnchorCoreBindings.swift" \
  "$CONSUMER_DIR/Sources/AnchorCoreBindings/AnchorCoreBindings.swift"
cat > "$CONSUMER_DIR/Package.swift" <<'EOF'
// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "AnchorWrapperConsumer",
    products: [
        .executable(name: "WrapperConsumer", targets: ["WrapperConsumer"])
    ],
    targets: [
        .binaryTarget(
            name: "AnchorCoreC",
            path: "../AnchorCoreCBinary.xcframework"
        ),
        .target(
            name: "AnchorCoreBindings",
            dependencies: ["AnchorCoreC"]
        ),
        .executableTarget(
            name: "WrapperConsumer",
            dependencies: ["AnchorCoreBindings"]
        )
    ]
)
EOF
cat > "$CONSUMER_DIR/Sources/WrapperConsumer/main.swift" <<'EOF'
import AnchorCoreBindings
import Foundation

@main
struct WrapperConsumerMain {
    static func main() async throws {
        let expectedSnapshot = "3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63"

        let summary = try openFixtureVault()
        precondition(summary.vaultID == "vault_demo_0001")
        precondition(summary.noteCount == 1)
        precondition(summary.snapshotRevision == expectedSnapshot)
        print("wrapper:fixture snapshot=\(summary.snapshotRevision)")

        let session = try AnchorSession()
        let insert = try session.dispatchInsertText(targetID: "blk_a", at: 0, text: "Hi ")
        precondition(insert.validationError == nil)
        precondition(insert.changedIDs == ["blk_a"])
        precondition(insert.selectionHint?.start == 3)
        print("wrapper:insert changed=\(insert.changedIDs.joined(separator: ",")) selection=\(insert.selectionHint?.start ?? 0)")

        let directDelete = try session.dispatchDirectDelete(targetID: "blk_a")
        precondition(directDelete.validationError?.code == .directActiveToDeleted)
        print("wrapper:error validation=\(directDelete.validationError?.code.rawValue ?? "missing")")

        let segment = try session.readSegment()
        precondition(segment.count > 0)
        print("wrapper:segment bytes=\(segment.count)")

        let client = try AnchorCoreClient()
        let actorSummary = try await client.summary()
        precondition(actorSummary.snapshotRevision == expectedSnapshot)
        let actorSegment = try await client.readSegment()
        precondition(actorSegment.count > 0)
        print("wrapper:actor snapshot=\(actorSummary.snapshotRevision) segment=\(actorSegment.count)")
    }
}
EOF

swift run \
  --package-path "$CONSUMER_DIR" \
  -c release \
  -Xswiftc -strict-concurrency=complete \
  -Xswiftc -warnings-as-errors \
  WrapperConsumer

echo "== checksum C ABI XCFramework zip =="
(
  cd "$OUT_DIR"
  ditto -c -k --sequesterRsrc --keepParent \
    AnchorCoreCBinary.xcframework \
    AnchorCoreCBinary.xcframework.zip
)
swift package compute-checksum "$OUT_DIR/AnchorCoreCBinary.xcframework.zip"
shasum -a 256 "$OUT_DIR/AnchorCoreCBinary.xcframework.zip"

echo "== build UniFFI release slices =="
UNIFFI_TARGET_DIR="$OUT_DIR/uniffi-target"
for target in "$HOST_TRIPLE" aarch64-apple-ios aarch64-apple-ios-sim; do
  CARGO_TARGET_DIR="$UNIFFI_TARGET_DIR" cargo build \
    --manifest-path "$SCRIPT_DIR/uniffi/Cargo.toml" \
    --release \
    --target "$target"
done

UNIFFI_MANIFEST="$(
  find "${CARGO_HOME:-$HOME/.cargo}/registry/src" \
    -path '*/uniffi-0.31.1/Cargo.toml' \
    -print \
    -quit
)"
if [[ -z "$UNIFFI_MANIFEST" ]]; then
  echo "could not locate uniffi 0.31.1 Cargo.toml in the cargo registry" >&2
  exit 1
fi

GENERATED_DIR="$OUT_DIR/uniffi-generated"
mkdir -p "$GENERATED_DIR"
(
  cd "$SCRIPT_DIR/uniffi"
  cargo run \
    --manifest-path "$UNIFFI_MANIFEST" \
    --features cli \
    --bin uniffi-bindgen-swift -- \
    --swift-sources \
    --headers \
    --modulemap \
    --module-name anchor_core_uniffiFFI \
    --modulemap-filename module.modulemap \
    src/anchor_core_uniffi.udl \
    "$GENERATED_DIR"
)

echo "== run macOS UniFFI async smoke =="
swiftc \
  -swift-version 6 \
  -strict-concurrency=complete \
  -warnings-as-errors \
  -I "$GENERATED_DIR" \
  -L "$UNIFFI_TARGET_DIR/$HOST_TRIPLE/release" \
  -lanchor_core_uniffi \
  "$GENERATED_DIR/anchor_core_uniffi.swift" \
  "$SCRIPT_DIR/uniffi/SwiftSmoke/smoke.swift" \
  -o "$OUT_DIR/uniffi-async-smoke-macos"
DYLD_LIBRARY_PATH="$UNIFFI_TARGET_DIR/$HOST_TRIPLE/release:${DYLD_LIBRARY_PATH:-}" \
  "$OUT_DIR/uniffi-async-smoke-macos"

echo "== compile iOS Simulator UniFFI async smoke =="
IOS_SIM_SDK="$(xcrun --sdk iphonesimulator --show-sdk-path)"
swiftc \
  -swift-version 6 \
  -strict-concurrency=complete \
  -warnings-as-errors \
  -target arm64-apple-ios17.0-simulator \
  -sdk "$IOS_SIM_SDK" \
  -I "$GENERATED_DIR" \
  -L "$UNIFFI_TARGET_DIR/aarch64-apple-ios-sim/release" \
  -lanchor_core_uniffi \
  "$GENERATED_DIR/anchor_core_uniffi.swift" \
  "$SCRIPT_DIR/uniffi/SwiftSmoke/smoke.swift" \
  -o "$OUT_DIR/uniffi-async-smoke-iossim"
vtool -show-build "$OUT_DIR/uniffi-async-smoke-iossim"

echo "== compile iPhoneOS UniFFI async smoke =="
IPHONEOS_SDK="$(xcrun --sdk iphoneos --show-sdk-path)"
swiftc \
  -swift-version 6 \
  -strict-concurrency=complete \
  -warnings-as-errors \
  -target arm64-apple-ios17.0 \
  -sdk "$IPHONEOS_SDK" \
  -I "$GENERATED_DIR" \
  -L "$UNIFFI_TARGET_DIR/aarch64-apple-ios/release" \
  -lanchor_core_uniffi \
  "$GENERATED_DIR/anchor_core_uniffi.swift" \
  "$SCRIPT_DIR/uniffi/SwiftSmoke/smoke.swift" \
  -o "$OUT_DIR/uniffi-async-smoke-iphoneos"
file "$OUT_DIR/uniffi-async-smoke-iphoneos"
vtool -show-build "$OUT_DIR/uniffi-async-smoke-iphoneos"
xcrun lipo -archs "$OUT_DIR/uniffi-async-smoke-iphoneos"

cleanup_lockfiles
find "$OUT_DIR" -maxdepth 2 -type f | sort
