#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPLE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
FFI_DIR="$APPLE_DIR/ffi"
TARGET_DIR="$FFI_DIR/target"
RELEASE_DIR="$TARGET_DIR/release"
UNIVERSAL_LIB="$RELEASE_DIR/libanchor_core_ffi.a"

mkdir -p "$RELEASE_DIR"

for target in aarch64-apple-darwin x86_64-apple-darwin; do
  if ! rustup target list --installed | grep -qx "$target"; then
    echo "missing Rust target: $target" >&2
    echo "run: rustup target add $target" >&2
    exit 1
  fi
done

for target in aarch64-apple-darwin x86_64-apple-darwin; do
  CARGO_TARGET_DIR="$TARGET_DIR" cargo build \
    --manifest-path "$FFI_DIR/Cargo.toml" \
    --release \
    --target "$target"
done

xcrun lipo -create \
  "$TARGET_DIR/aarch64-apple-darwin/release/libanchor_core_ffi.a" \
  "$TARGET_DIR/x86_64-apple-darwin/release/libanchor_core_ffi.a" \
  -output "$UNIVERSAL_LIB"

xcrun lipo -info "$UNIVERSAL_LIB"
