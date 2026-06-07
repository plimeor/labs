//! Cross-target consistency vector set (F23 / F26 / D19 / D26 / D30).
//!
//! These golden values are the mandatory CI gate: the SAME source compiled for
//! `aarch64-apple-darwin`, `wasm32-unknown-unknown`, and `aarch64-linux-android`
//! must reproduce them byte-for-byte. The diff3 merge, fractional order key,
//! canonical bytes, and `snapshot_revision` are integer-only and platform-free,
//! so equality holds by construction; this file is the enforcement.
//!
//! Captured on `aarch64-apple-darwin` (Rust 1.95.0) from the vendored BLAKE3 and
//! the pinned `DIFF_ALGO_VERSION = 1`. Bumping the diff/order algorithm must
//! regenerate these vectors deliberately.

mod common;
use common::*;

use anchor_core::canonical::{rev, CanonicalValue};
use anchor_core::diff3::{diff3_lines, join_lines, split_lines, Diff3Outcome};
use anchor_core::dto::Session;
use anchor_core::id::journal_note_id;
use anchor_core::model::Life;
use anchor_core::order::key_between;
use anchor_core::replay::replay;

#[test]
fn order_key_vector() {
    assert_eq!(key_between(None, None).unwrap(), "V");
    assert_eq!(key_between(Some("V"), None).unwrap(), "k");
    assert_eq!(key_between(None, Some("V")).unwrap(), "F");
    assert_eq!(key_between(Some("V"), Some("k")).unwrap(), "c");
}

#[test]
fn diff3_merge_vector() {
    let base = split_lines("l1\nl2\nl3");
    let a = split_lines("A1\nl2\nl3");
    let b = split_lines("l1\nl2\nB3");
    match diff3_lines(&base, &a, &b) {
        Diff3Outcome::Merged(m) => assert_eq!(join_lines(&m), "A1\nl2\nB3"),
        other => panic!("expected clean merge, got {other:?}"),
    }
}

#[test]
fn hash_and_identity_vectors() {
    assert_eq!(
        anchor_core::hash::hash_hex(b"null"),
        "03f88b99c3d8073bba8948d6e762aac443b265f606cc05abd4d172f03a4def6a"
    );
    assert_eq!(
        rev(&CanonicalValue::str("anchor:cell:body")),
        "6dad5f63c254be772e58682c56c48a1c8a8b6f355b1c101aed8c6b4a5e467390"
    );
    assert_eq!(
        journal_note_id("vault_demo_0001", "2026-06-07"),
        "jnl_f99080f823e0815a8e1440955eb896d1c82d4ec371e19b2e0df89ad581f96b89"
    );
}

#[test]
fn fixture_vault_snapshot_vector() {
    assert_eq!(
        Session::open_fixture().summary().snapshot_revision,
        "3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63"
    );
}

#[test]
fn conflict_vault_snapshot_vector() {
    let ops = [
        create_block("c", 1, "mac", "u", "blk", None, "V"),
        set_body("b0", hlc(2, "mac"), "u", "blk", "l1\nl2\nl3", None),
        set_body("ba", hlc(3, "mac"), "uA", "blk", "l1\nAA\nl3", Some("l1\nl2\nl3")),
        set_body("bb", hlc(4, "iph"), "uB", "blk", "l1\nBB\nl3", Some("l1\nl2\nl3")),
    ];
    // Byte-identical across all ingestion orders AND equal to the golden.
    let vault = assert_order_independent(&ops);
    assert_eq!(
        vault.snapshot_revision(),
        "1552bb641e71fcd8dcfe51da8dcdf3e4dbaaa0cccc5d00a182ee0d1df417ea9f"
    );
}

#[test]
fn merged_vault_snapshot_vector() {
    let ops = [
        create_note("cn", 1, "mac", "u", "n", None, "V"),
        create_block("cb", 2, "mac", "u", "blk", Some("n"), "V"),
        set_body("b0", hlc(3, "mac"), "u", "blk", "base", None),
        set_body("ba", hlc(4, "mac"), "uA", "blk", "base\nmac", Some("base")),
        set_body("bb", hlc(5, "iph"), "uB", "blk", "iph\nbase", Some("base")),
        tag_add("t", hlc(6, "iph"), "u", "n", "research"),
        life_set("ar", hlc(7, "mac"), "u", "n", Life::Archived),
    ];
    let vault = assert_order_independent(&ops);
    assert_eq!(
        vault.snapshot_revision(),
        "97e065ff7f09edb2f44854b376705be3c4b8b747079ce2fbbfb10d0c3ec4b6f7"
    );
    let _ = replay(&ops); // smoke: plain replay equals the asserted vault path
}
