//! `Renormalize` producer (F26) + stale-base collapse (F26c).
//!
//! Renormalize is order-key maintenance, not user intent: the producer emits
//! one op per child as a single atomic macro, each carrying the location rev it
//! was computed against. Replay applies the macro compare-and-swap,
//! all-or-nothing: any stale base collapses the whole rebalance, so a
//! concurrent move always wins and a partial rebalance can never reorder
//! siblings. Replay stays a pure fold — same op set, same result, any arrival
//! order.

use anchor_core::dto::{EditorIntent, OpStamp, Session};
use anchor_core::hlc::Hlc;
use anchor_core::model::{TargetKind, Vault};
use anchor_core::replay::replay;

fn stamp(op_id: &str, wall: u64, device: &str) -> OpStamp {
    OpStamp {
        op_id: op_id.to_string(),
        hlc: Hlc::new(wall, 0, device),
        actor: device.to_string(),
        seq: 1,
    }
}

/// Fixture + deliberately awkward long order keys on the journal's children.
fn lopsided_session() -> Session {
    let mut session = Session::open_fixture();
    for (n, (id, order)) in [("blk_a", "VVVVVVV1"), ("blk_b", "VVVVVVV2")]
        .into_iter()
        .enumerate()
    {
        let result = session.dispatch(
            EditorIntent::Move {
                target_id: id.to_string(),
                parent: parent_note_id(session.vault()),
                order: order.to_string(),
            },
            stamp(&format!("op_skew_{n}"), 3_000 + n as u64, "device_mac"),
        );
        assert!(result.validation_error.is_none());
    }
    session
}

fn parent_note_id(vault: &Vault) -> Option<String> {
    vault
        .nodes
        .values()
        .find(|n| n.kind == TargetKind::Note)
        .map(|n| n.id.clone())
}

fn sibling_sequence(vault: &Vault, parent: &str) -> Vec<String> {
    let mut children: Vec<_> = vault
        .nodes
        .values()
        .filter(|n| n.location.parent.as_deref() == Some(parent) && n.life.is_living())
        .map(|n| (n.location.order.clone(), n.id.clone()))
        .collect();
    children.sort();
    children.into_iter().map(|(_, id)| id).collect()
}

#[test]
fn renormalize_rebalances_keys_and_preserves_sibling_order() {
    let mut session = lopsided_session();
    let note = parent_note_id(session.vault()).unwrap();
    let before = sibling_sequence(session.vault(), &note);

    let result = session.dispatch_renormalize_children(
        Some(&note),
        stamp("op_renorm", 4_000, "device_mac"),
    );
    assert!(result.validation_error.is_none());
    assert_eq!(result.changed_ids.len(), 2);

    let after = sibling_sequence(session.vault(), &note);
    assert_eq!(before, after, "rebalancing never reorders siblings");
    for id in &after {
        let key = &session.vault().nodes[id].location.order;
        assert!(
            key.len() < "VVVVVVV1".len(),
            "key {key} was not shortened by the rebalance"
        );
    }
}

#[test]
fn renormalize_under_two_children_is_a_clean_no_op() {
    let mut session = Session::open_fixture();
    // Root has a single child (the journal note).
    let result = session.dispatch_renormalize_children(None, stamp("op_renorm", 4_000, "device_mac"));
    assert!(result.validation_error.is_none());
    assert!(result.changed_ids.is_empty());
}

#[test]
fn stale_base_collapses_the_whole_rebalance() {
    let session = lopsided_session();
    let note = parent_note_id(session.vault()).unwrap();

    // Device B renormalizes at wall 4000 (computed against the lopsided keys).
    let mut renorm_side = lopsided_session();
    renorm_side.dispatch_renormalize_children(Some(&note), stamp("op_renorm", 4_000, "device_b"));
    let renorm_ops = renorm_side.log()[session.log().len()..].to_vec();

    // Concurrently (earlier in T), device C moved blk_a — one renormalize base
    // is now stale, so the WHOLE macro must collapse, not just blk_a's op.
    let mut move_side = lopsided_session();
    move_side.dispatch(
        EditorIntent::Move {
            target_id: "blk_a".to_string(),
            parent: Some(note.clone()),
            order: "B".to_string(),
        },
        stamp("op_concurrent_move", 3_500, "device_c"),
    );
    let move_ops = move_side.log()[session.log().len()..].to_vec();

    let mut merged = session.log().to_vec();
    merged.extend(move_ops.iter().cloned());
    merged.extend(renorm_ops.iter().cloned());
    let vault = replay(&merged);

    assert_eq!(
        vault.nodes["blk_a"].location.order, "B",
        "the concurrent move wins"
    );
    assert_eq!(
        vault.nodes["blk_b"].location.order, "VVVVVVV2",
        "the untouched sibling's renormalize collapsed too (all-or-nothing)"
    );

    // Pure-fold check: reversed arrival materializes identically.
    let mut reversed = session.log().to_vec();
    reversed.extend(renorm_ops.iter().cloned());
    reversed.extend(move_ops.iter().cloned());
    assert_eq!(
        replay(&reversed).snapshot_revision(),
        vault.snapshot_revision()
    );
}

#[test]
fn later_move_overwrites_a_fresh_renormalize() {
    let mut session = lopsided_session();
    let note = parent_note_id(session.vault()).unwrap();
    session.dispatch_renormalize_children(Some(&note), stamp("op_renorm", 4_000, "device_mac"));
    session.dispatch(
        EditorIntent::Move {
            target_id: "blk_a".to_string(),
            parent: Some(note.clone()),
            order: "z9".to_string(),
        },
        stamp("op_later_move", 5_000, "device_mac"),
    );
    assert_eq!(session.vault().nodes["blk_a"].location.order, "z9");
}

#[test]
fn partially_delivered_rebalance_never_applies() {
    let mut session = lopsided_session();
    let note = parent_note_id(session.vault()).unwrap();
    let base_len = session.log().len();
    session.dispatch_renormalize_children(Some(&note), stamp("op_renorm", 4_000, "device_mac"));

    let mut partial = session.log().to_vec();
    partial.remove(base_len); // drop one macro member
    let vault = replay(&partial);
    assert_eq!(vault.nodes["blk_a"].location.order, "VVVVVVV1");
    assert_eq!(vault.nodes["blk_b"].location.order, "VVVVVVV2");
}
