#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_DIR="$(cd "$CORE_DIR/../../.." && pwd)"
HARNESS_SOURCE="$SCRIPT_DIR/cross_target_vector_harness.rs"
WORK_DIR="${ANCHOR_CROSS_TARGET_WORK_DIR:-/tmp/anchor-cross-target-vectors}"
DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"

rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR/wasm/src" "$WORK_DIR/ios/src" "$WORK_DIR/android/src"

cargo test -p anchor-core --test determinism_vectors --manifest-path "$REPO_DIR/suites/anchor/Cargo.toml"

cat >"$WORK_DIR/wasm/Cargo.toml" <<EOF
[package]
name = "anchor-cross-target-wasm"
version = "0.0.0"
edition = "2021"
publish = false

[lib]
crate-type = ["cdylib"]

[dependencies]
anchor-core = { path = "$CORE_DIR" }

[profile.release]
panic = "abort"
opt-level = "s"
lto = true
EOF

cat >"$WORK_DIR/wasm/src/lib.rs" <<EOF
include!(r#"$HARNESS_SOURCE"#);

#[no_mangle]
pub extern "C" fn anchor_wasm_vector_status() -> u32 {
    anchor_cross_target_vector_status()
}
EOF

cargo build --release --target wasm32-unknown-unknown --manifest-path "$WORK_DIR/wasm/Cargo.toml"

node -e 'const fs=require("node:fs"); const wasmPath=process.argv[1]; const wasm=fs.readFileSync(wasmPath); WebAssembly.instantiate(wasm, {}).then(({instance}) => { const status = instance.exports.anchor_wasm_vector_status(); console.log(`anchor_wasm_vector_status=${status}`); process.exit(status === 0 ? 0 : 1); }).catch((error) => { console.error(error); process.exit(2); });' \
  "$WORK_DIR/wasm/target/wasm32-unknown-unknown/release/anchor_cross_target_wasm.wasm"

if [[ "${ANCHOR_RUN_ANDROID:-0}" == "1" ]]; then
  ANDROID_TARGET="${ANCHOR_ANDROID_TARGET:-x86_64-linux-android}"
  ANDROID_API="${ANCHOR_ANDROID_API:-35}"
  ANDROID_NDK_DIR="${ANDROID_NDK_HOME:-${ANDROID_NDK_ROOT:-${ANDROID_NDK_LATEST_HOME:-}}}"

  if [[ -z "$ANDROID_NDK_DIR" && -n "${ANDROID_HOME:-}" && -d "$ANDROID_HOME/ndk" ]]; then
    ANDROID_NDK_DIR="$(
      find "$ANDROID_HOME/ndk" -mindepth 1 -maxdepth 1 -type d |
        sort |
        tail -n 1
    )"
  fi

  if [[ -z "$ANDROID_NDK_DIR" || ! -d "$ANDROID_NDK_DIR" ]]; then
    echo "anchor_android_vector_status=not_run_no_ndk" >&2
    exit 4
  fi

  case "$ANDROID_TARGET" in
    aarch64-linux-android)
      android_linker_prefix="aarch64-linux-android"
      ;;
    x86_64-linux-android)
      android_linker_prefix="x86_64-linux-android"
      ;;
    *)
      echo "anchor_android_vector_status=unsupported_target:$ANDROID_TARGET" >&2
      exit 4
      ;;
  esac

  case "$(uname -s)-$(uname -m)" in
    Linux-*)
      android_host_tag="linux-x86_64"
      ;;
    Darwin-arm64)
      android_host_tag="darwin-arm64"
      ;;
    Darwin-*)
      android_host_tag="darwin-x86_64"
      ;;
    *)
      echo "anchor_android_vector_status=unsupported_host:$(uname -s)-$(uname -m)" >&2
      exit 4
      ;;
  esac

  android_linker="$ANDROID_NDK_DIR/toolchains/llvm/prebuilt/$android_host_tag/bin/${android_linker_prefix}${ANDROID_API}-clang"
  if [[ ! -x "$android_linker" ]]; then
    echo "anchor_android_vector_status=missing_linker:$android_linker" >&2
    exit 4
  fi

  android_target_env="$(printf '%s' "$ANDROID_TARGET" | tr '[:lower:]-' '[:upper:]_')"
  android_linker_env="CARGO_TARGET_${android_target_env}_LINKER"
  if [[ -z "${!android_linker_env:-}" ]]; then
    export "$android_linker_env=$android_linker"
  fi

  cat >"$WORK_DIR/android/Cargo.toml" <<EOF
[package]
name = "anchor-cross-target-android"
version = "0.0.0"
edition = "2021"
publish = false

[dependencies]
anchor-core = { path = "$CORE_DIR" }

[profile.release]
panic = "abort"
opt-level = "s"
lto = true
EOF

  cat >"$WORK_DIR/android/src/main.rs" <<EOF
include!(r#"$HARNESS_SOURCE"#);

fn main() {
    let status = anchor_cross_target_vector_status();
    println!("anchor_android_vector_status={status}");
    std::process::exit(status as i32);
}
EOF

  cargo build --release --target "$ANDROID_TARGET" --manifest-path "$WORK_DIR/android/Cargo.toml"

  ADB_BIN="${ANCHOR_ADB:-adb}"
  if ! command -v "$ADB_BIN" >/dev/null 2>&1; then
    echo "anchor_android_vector_status=not_run_no_adb" >&2
    exit 4
  fi

  android_binary="$WORK_DIR/android/target/$ANDROID_TARGET/release/anchor-cross-target-android"
  android_remote="/data/local/tmp/anchor-cross-target-android"
  "$ADB_BIN" push "$android_binary" "$android_remote" >/dev/null
  "$ADB_BIN" shell "chmod 755 $android_remote && $android_remote"
fi

if [[ "${ANCHOR_SKIP_IOS:-0}" == "1" ]]; then
  echo "anchor_ios_vector_status=skipped"
  exit 0
fi

cat >"$WORK_DIR/ios/Cargo.toml" <<EOF
[package]
name = "anchor-cross-target-ios"
version = "0.0.0"
edition = "2021"
publish = false

[dependencies]
anchor-core = { path = "$CORE_DIR" }

[profile.release]
panic = "abort"
opt-level = "s"
lto = true
EOF

cat >"$WORK_DIR/ios/src/main.rs" <<EOF
include!(r#"$HARNESS_SOURCE"#);

fn main() {
    let status = anchor_cross_target_vector_status();
    println!("anchor_ios_vector_status={status}");
    std::process::exit(status as i32);
}
EOF

DEVELOPER_DIR="$DEVELOPER_DIR" cargo build --release --target aarch64-apple-ios-sim --manifest-path "$WORK_DIR/ios/Cargo.toml"

SIMULATOR_ID="${ANCHOR_IOS_SIMULATOR_ID:-}"
if [[ -z "$SIMULATOR_ID" ]]; then
  SIMULATOR_ID="$(
    DEVELOPER_DIR="$DEVELOPER_DIR" xcrun simctl list devices available |
      sed -n 's/.*(\([0-9A-F-]\{8\}-[0-9A-F-]\{4\}-[0-9A-F-]\{4\}-[0-9A-F-]\{4\}-[0-9A-F-]\{12\}\)) (Booted).*/\1/p' |
      head -n 1
  )"
fi

if [[ -z "$SIMULATOR_ID" ]]; then
  echo "anchor_ios_vector_status=not_run_no_booted_simulator" >&2
  exit 3
fi

DEVELOPER_DIR="$DEVELOPER_DIR" xcrun simctl spawn "$SIMULATOR_ID" \
  "$WORK_DIR/ios/target/aarch64-apple-ios-sim/release/anchor-cross-target-ios"
