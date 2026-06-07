//! F23 — concurrent body editing: deterministic diff3 auto-merge, keep-both on
//! overlap or unrecoverable base, and UTF-16 mark re-clamp. Never silent LWW.

mod common;
use common::*;

use anchor_core::marks::{reclamp, Mark, Splice};
use anchor_core::model::{BodyState, ConflictKind};

fn body_of(vault: &anchor_core::model::Vault, id: &str) -> BodyState {
    vault.nodes.get(id).unwrap().content.body.clone().unwrap()
}

#[test]
fn disjoint_hunks_auto_merge() {
    let ops = [
        create_block("c", 1, "mac", "u", "blk", None, "V"),
        set_body("b0", hlc(2, "mac"), "u", "blk", "l1\nl2\nl3", None),
        set_body("ba", hlc(3, "mac"), "uA", "blk", "A1\nl2\nl3", Some("l1\nl2\nl3")),
        set_body("bb", hlc(4, "iph"), "uB", "blk", "l1\nl2\nB3", Some("l1\nl2\nl3")),
    ];
    let vault = assert_order_independent(&ops);
    match body_of(&vault, "blk") {
        BodyState::Single(b) => assert_eq!(b.text, "A1\nl2\nB3"),
        other => panic!("expected clean auto-merge, got {other:?}"),
    }
    assert!(!vault.nodes["blk"].has_body_conflict);
    assert!(vault.conflicts.is_empty(), "auto-merge must surface no conflict");
}

#[test]
fn overlapping_hunks_keep_both() {
    let ops = [
        create_block("c", 1, "mac", "u", "blk", None, "V"),
        set_body("b0", hlc(2, "mac"), "u", "blk", "l1\nl2\nl3", None),
        set_body("ba", hlc(3, "mac"), "uA", "blk", "l1\nAA\nl3", Some("l1\nl2\nl3")),
        set_body("bb", hlc(4, "iph"), "uB", "blk", "l1\nBB\nl3", Some("l1\nl2\nl3")),
    ];
    let vault = assert_order_independent(&ops);
    match body_of(&vault, "blk") {
        BodyState::MultiValue { winner, losers } => {
            // Winner = higher-T side (bb), loser preserved with its op id.
            assert_eq!(winner.text, "l1\nBB\nl3");
            assert_eq!(losers.len(), 1);
            assert_eq!(losers[0].value.text, "l1\nAA\nl3");
            assert_eq!(losers[0].losing_op_id, "ba");
        }
        other => panic!("expected keep-both, got {other:?}"),
    }
    assert!(vault.nodes["blk"].has_body_conflict);
    let c = vault
        .conflicts
        .iter()
        .find(|c| c.kind == ConflictKind::BodyOverlap)
        .expect("body_overlap conflict");
    // Both ops pinned against compaction (no silent loss).
    assert!(c.pinned_op_ids.contains(&"ba".to_string()));
    assert!(c.pinned_op_ids.contains(&"bb".to_string()));
}

#[test]
fn unrecoverable_base_degrades_to_keep_both() {
    // Both edits cite a base that is not present in the log ⇒ deterministic
    // keep-both, never a fork.
    let ops = [
        create_block("c", 1, "mac", "u", "blk", None, "V"),
        set_body("ba", hlc(3, "mac"), "uA", "blk", "AAA", Some("ghost")),
        set_body("bb", hlc(4, "iph"), "uB", "blk", "BBB", Some("ghost")),
    ];
    let vault = assert_order_independent(&ops);
    assert!(matches!(body_of(&vault, "blk"), BodyState::MultiValue { .. }));
}

#[test]
fn auto_merge_reclamps_winner_marks() {
    // Lower-T side inserts a line; higher-T side only adds a bold mark on "ccc".
    // Auto-merge takes the inserted text and shifts the winner's mark.
    let base = anchor_core::model::Body::plain("aaa\nbbb\nccc");
    let a = anchor_core::model::Body::plain("aaa\nXXX\nbbb\nccc");
    let b = anchor_core::model::Body::new("aaa\nbbb\nccc", vec![mark("bold", 8, 11, true)]);
    let ops = [
        create_block("c", 1, "mac", "u", "blk", None, "V"),
        set_body_full("b0", hlc(2, "mac"), "u", "blk", base.clone(), None),
        set_body_full("ba", hlc(3, "mac"), "uA", "blk", a, Some(base.clone())),
        set_body_full("bb", hlc(4, "iph"), "uB", "blk", b, Some(base)),
    ];
    let vault = assert_order_independent(&ops);
    match body_of(&vault, "blk") {
        BodyState::Single(body) => {
            assert_eq!(body.text, "aaa\nXXX\nbbb\nccc");
            assert_eq!(body.marks, vec![mark("bold", 12, 15, true)]);
        }
        other => panic!("expected auto-merge, got {other:?}"),
    }
}

// --- direct re-clamp unit cases (expand seam / non-expand seam / collapse) ---

#[test]
fn reclamp_expand_grows_into_insertion_at_start() {
    let m = vec![Mark::new("bold", 5, 10, true)];
    let sp = [Splice { at: 5, old_len: 0, new_len: 3 }];
    assert_eq!(reclamp(&m, &sp), vec![Mark::new("bold", 5, 13, true)]);
}

#[test]
fn reclamp_non_expand_skips_insertion_at_start() {
    let m = vec![Mark::new("link", 5, 10, false)];
    let sp = [Splice { at: 5, old_len: 0, new_len: 3 }];
    assert_eq!(reclamp(&m, &sp), vec![Mark::new("link", 8, 13, false)]);
}

#[test]
fn reclamp_drops_collapsed_mark() {
    // The whole marked range is deleted ⇒ mark dropped.
    let m = vec![Mark::new("bold", 4, 8, true)];
    let sp = [Splice { at: 3, old_len: 7, new_len: 0 }];
    assert_eq!(reclamp(&m, &sp), Vec::<Mark>::new());
}
