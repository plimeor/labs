//! F05 / F08 / F35 — journal content-addressed identity, same-day merge, and
//! trash/reopen restore (no duplicate).

mod common;
use common::*;

use anchor_core::id::journal_note_id;
use anchor_core::model::{BodyState, Life};

#[test]
fn same_day_create_is_one_idempotent_note() {
    let jid = journal_note_id("v", "2026-06-07");
    // Two devices create "today" offline ⇒ same id ⇒ one target.
    let ops = [
        create_note("ca", 1, "mac", "uA", &jid, None, "V"),
        create_note("cb", 2, "iph", "uB", &jid, None, "V"),
    ];
    let vault = assert_order_independent(&ops);
    assert_eq!(vault.nodes.len(), 1);
    assert!(vault.nodes.contains_key(&jid));
}

#[test]
fn same_day_bodies_merge_disjoint() {
    // F35: morning (Mac) + evening (iPhone) edits to the same journal body,
    // disjoint from a shared base ⇒ both kept, no loser.
    let jid = journal_note_id("v", "2026-06-07");
    let ops = [
        create_note("ca", 1, "mac", "uA", &jid, None, "V"),
        create_note("cb", 1, "iph", "uB", &jid, None, "V"),
        set_body("b0", hlc(2, "mac"), "u", &jid, "intro", None),
        set_body("bm", hlc(3, "mac"), "uA", &jid, "morning\nintro", Some("intro")),
        set_body("be", hlc(4, "iph"), "uB", &jid, "intro\nevening", Some("intro")),
    ];
    let vault = assert_order_independent(&ops);
    assert_eq!(vault.nodes.len(), 1);
    match vault.nodes[&jid].content.body.clone().unwrap() {
        BodyState::Single(b) => assert_eq!(b.text, "morning\nintro\nevening"),
        other => panic!("expected merged single body, got {other:?}"),
    }
}

#[test]
fn trash_then_reopen_restores_same_note() {
    // F08: trash the journal, then "reopen today" resolves the same id ⇒ restore,
    // not a duplicate.
    let jid = journal_note_id("v", "2026-06-07");
    let ops = [
        create_note("ca", 1, "mac", "u", &jid, None, "V"),
        life_set("t", hlc(2, "mac"), "u", &jid, Life::Trashed),
        restore("r", hlc(3, "mac"), "u", &jid), // reopen today
    ];
    let vault = assert_order_independent(&ops);
    assert_eq!(vault.nodes.len(), 1, "no duplicate journal");
    assert_eq!(vault.nodes[&jid].life, Life::Active);
}
