//! F24 / F26 / F27 — location merge: move-vs-edit, cycle rejection, reorder
//! blend, and dangling-parent reattach.

mod common;
use common::*;

use anchor_core::model::{BodyState, ConflictKind};

#[test]
fn move_vs_edit_both_apply_and_surface_relocation() {
    // F24: one device moves the block, another edits its body. Different
    // registers ⇒ both apply; relocation is surfaced (non-silent).
    let ops = [
        create_note("p1", 1, "mac", "u", "parent1", None, "V"),
        create_note("p2", 2, "mac", "u", "parent2", None, "k"),
        create_block("cb", 3, "mac", "u", "blk", Some("parent1"), "V"),
        move_op("mv", hlc(4, "mac"), "uA", "blk", Some("parent2"), "V"),
        set_body("be", hlc(5, "iph"), "uB", "blk", "edited", None),
    ];
    let vault = assert_order_independent(&ops);
    assert_eq!(vault.nodes["blk"].location.parent.as_deref(), Some("parent2"));
    match vault.nodes["blk"].content.body.clone().unwrap() {
        BodyState::Single(b) => assert_eq!(b.text, "edited"),
        other => panic!("edit lost: {other:?}"),
    }
    assert!(vault
        .conflicts
        .iter()
        .any(|c| c.kind == ConflictKind::LocationRelocated));
}

#[test]
fn cycle_move_is_rejected_deterministically() {
    // X and Y are siblings under P. A: X→under Y (lower T). B: Y→under X
    // (higher T) would cycle ⇒ B is skipped. Result is identical under any
    // ingestion order.
    let ops = [
        create_note("p", 1, "mac", "u", "P", None, "V"),
        create_block("cx", 2, "mac", "u", "X", Some("P"), "V"),
        create_block("cy", 3, "mac", "u", "Y", Some("P"), "k"),
        move_op("a", hlc(4, "mac"), "uA", "X", Some("Y"), "V"),
        move_op("b", hlc(5, "iph"), "uB", "Y", Some("X"), "V"),
    ];
    let vault = assert_order_independent(&ops);
    assert_eq!(vault.nodes["X"].location.parent.as_deref(), Some("Y"));
    assert_eq!(vault.nodes["Y"].location.parent.as_deref(), Some("P"), "cycle move skipped");
    assert!(vault
        .conflicts
        .iter()
        .any(|c| c.kind == ConflictKind::MoveSkipped && c.target_id == "Y"));
}

#[test]
fn concurrent_reorder_surfaces_blend() {
    // Two devices reorder the same block with different keys ⇒ deterministic
    // winner + reorder_blend surfaced.
    let ops = [
        create_note("p", 1, "mac", "u", "P", None, "V"),
        create_block("cb", 2, "mac", "u", "blk", Some("P"), "V"),
        move_op("r1", hlc(3, "mac"), "uA", "blk", Some("P"), "g"),
        move_op("r2", hlc(4, "iph"), "uB", "blk", Some("P"), "x"),
    ];
    let vault = assert_order_independent(&ops);
    // Higher-T (r2) wins the order key.
    assert_eq!(vault.nodes["blk"].location.order, "x");
    assert!(vault
        .conflicts
        .iter()
        .any(|c| c.kind == ConflictKind::ReorderBlend));
}

#[test]
fn dangling_parent_reattaches_to_root() {
    // A block whose parent was never created is reattached to the root and stays
    // visible (read-time reattach, not a fork).
    let ops = [
        create_block("cb", 1, "mac", "u", "blk", Some("ghost_parent"), "V"),
        set_body("b", hlc(2, "mac"), "u", "blk", "orphan", None),
    ];
    let vault = assert_order_independent(&ops);
    assert!(vault.nodes["blk"].visible, "dangling parent reattaches to root");
}
