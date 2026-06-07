//! F25 / F27 / F31 — life lattice, edit-vs-delete, terminal-delete domination,
//! trash-vs-archive tie, ancestor-trashed vs descendant-edit.

mod common;
use common::*;

use anchor_core::hlc::Hlc;
use anchor_core::lattice::{life_join, resolve_terminal_delete};
use anchor_core::model::{BodyState, ConflictKind, Life};
use std::collections::BTreeMap;

#[test]
fn lattice_join_is_archived_wins_tie() {
    assert_eq!(life_join(Life::Active, Life::Trashed), Life::Trashed);
    assert_eq!(life_join(Life::Trashed, Life::Archived), Life::Archived); // tie → archived
    assert_eq!(life_join(Life::Active, Life::Deleted), Life::Deleted);
    assert_eq!(life_join(Life::Archived, Life::Deleted), Life::Deleted);
}

#[test]
fn edit_vs_delete_keeps_edit_and_is_reversible() {
    // F31: concurrent body edit + trash ⇒ reversible trashed + edit preserved.
    let ops = [
        create_block("c", 1, "mac", "u", "blk", None, "V"),
        set_body("b", hlc(2, "mac"), "uA", "blk", "hello", None),
        life_set("d", hlc(3, "iph"), "uB", "blk", Life::Trashed),
    ];
    let vault = assert_order_independent(&ops);
    assert_eq!(vault.nodes["blk"].life, Life::Trashed);
    assert!(!vault.nodes["blk"].visible);
    match vault.nodes["blk"].content.body.clone().unwrap() {
        BodyState::Single(b) => assert_eq!(b.text, "hello"),
        other => panic!("edit lost: {other:?}"),
    }

    // Restore brings it back with the edit intact.
    let mut restored = ops.to_vec();
    restored.push(restore("r", hlc(4, "mac"), "uA", "blk"));
    let v2 = assert_order_independent(&restored);
    assert_eq!(v2.nodes["blk"].life, Life::Active);
    assert!(v2.nodes["blk"].visible);
}

#[test]
fn terminal_delete_blocked_by_concurrent_edit() {
    // A delete whose frontier does not dominate a concurrent edit is blocked to
    // reversible trashed (D20).
    let mut frontier = BTreeMap::new();
    frontier.insert("mac".to_string(), Hlc::new(5, 0, "mac"));
    let concurrent_edit = Hlc::new(10, 0, "mac"); // beyond the frontier
    assert_eq!(
        resolve_terminal_delete(Some(&frontier), [&concurrent_edit]),
        Life::Trashed
    );

    let mut frontier2 = BTreeMap::new();
    frontier2.insert("mac".to_string(), Hlc::new(20, 0, "mac"));
    assert_eq!(
        resolve_terminal_delete(Some(&frontier2), [&concurrent_edit]),
        Life::Deleted
    );
}

#[test]
fn trash_vs_archive_tie_surfaces_life_tie() {
    let ops = [
        create_note("c", 1, "mac", "u", "n", None, "V"),
        life_set("t", hlc(2, "mac"), "uA", "n", Life::Trashed),
        life_set("a", hlc(3, "iph"), "uB", "n", Life::Archived),
    ];
    let vault = assert_order_independent(&ops);
    assert_eq!(vault.nodes["n"].life, Life::Archived); // archived wins (D27)
    assert!(vault
        .conflicts
        .iter()
        .any(|c| c.kind == ConflictKind::LifeTie));
}

#[test]
fn ancestor_trashed_vs_descendant_edit() {
    // F25: trash a parent while a child is concurrently edited. The child is
    // hidden but its edit is preserved, a cross-level conflict is surfaced, and
    // the descendant content op is pinned against compaction.
    let ops = [
        create_note("cp", 1, "mac", "u", "parent", None, "V"),
        create_block("cc", 2, "mac", "u", "child", Some("parent"), "V"),
        set_body("be", hlc(3, "iph"), "uB", "child", "deep edit", None),
        life_set("tl", hlc(4, "mac"), "uA", "parent", Life::Trashed),
    ];
    let vault = assert_order_independent(&ops);
    assert_eq!(vault.nodes["parent"].life, Life::Trashed);
    assert!(!vault.nodes["child"].visible, "child hidden under trashed ancestor");
    match vault.nodes["child"].content.body.clone().unwrap() {
        BodyState::Single(b) => assert_eq!(b.text, "deep edit"),
        other => panic!("descendant edit lost: {other:?}"),
    }
    let c = vault
        .conflicts
        .iter()
        .find(|c| c.kind == ConflictKind::AncestorLifeVsDescendantEdit)
        .expect("ancestor_life_vs_descendant_edit conflict");
    assert!(c.pinned_op_ids.contains(&"be".to_string()), "descendant op pinned");
}
