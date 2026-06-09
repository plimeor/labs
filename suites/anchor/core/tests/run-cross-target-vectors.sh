#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_DIR="$(cd "$CORE_DIR/../../.." && pwd)"
HARNESS_SOURCE="$SCRIPT_DIR/cross_target_vector_harness.rs"
WORK_DIR="${ANCHOR_CROSS_TARGET_WORK_DIR:-/tmp/anchor-cross-target-vectors}"
DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"

rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR/wasm/src" "$WORK_DIR/ios/src"

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
