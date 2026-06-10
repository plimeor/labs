//! Conflict resolution (D31 Phase-2 core semantics): `dispatch_resolve_body`
//! supersedes the winner via `base_sub_rev` and every pinned loser via the
//! D24-reserved `supersedes_rev` hook — after replay the chosen body is a plain
//! `Single` and the `body_overlap` ConflictRecord disappears (its members are
//! causal history now, not concurrency). The log is never rewritten.

use anchor_core::dto::{EditorIntent, OpStamp, Session};
use anchor_core::hlc::Hlc;
use anchor_core::model::{Body, BodyState, ConflictKind};
use anchor_core::op::Op;

fn stamp(op_id: &str, wall: u64, device: &str, actor: &str, seq: u64) -> OpStamp {
    OpStamp {
        op_id: op_id.to_string(),
        hlc: Hlc::new(wall, 0, device),
        actor: actor.to_string(),
        seq,
    }
}

fn replace_all(text: &str) -> EditorIntent {
    EditorIntent::ReplaceText {
        target_id: "blk_a".to_string(),
        at: 0,
        len: 13, // "Morning note." in UTF-16 units
        text: text.to_string(),
    }
}

/// Concurrent full-body rewrites of `blk_a` from `n` devices sharing the same
/// base — the smallest reproducible body keep-both. Returns the merged session.
fn conflicted_session(texts: &[&str]) -> Session {
    let base = Session::open_fixture().log().to_vec();
    let mut merged: Vec<Op> = base.clone();
    for (i, text) in texts.iter().enumerate() {
        let mut replica = Session::open_from_ops("vault_demo_0001", base.clone());
        let result = replica.dispatch(
            replace_all(text),
            stamp(
                &format!("op_edit_{i}"),
                2_000,
                &format!("device_{i}"),
                &format!("user_{i}"),
                10,
            ),
        );
        assert!(result.validation_error.is_none());
        merged.extend(replica.log()[base.len()..].to_vec());
    }
    Session::open_from_ops("vault_demo_0001", merged)
}

fn body_of(session: &Session, id: &str) -> BodyState {
    session
        .vault()
        .nodes
        .get(id)
        .unwrap()
        .content
        .body
        .clone()
        .unwrap()
}

fn open_body_conflicts(session: &Session) -> usize {
    session
        .vault()
        .conflicts
        .iter()
        .filter(|c| c.target_id == "blk_a" && c.kind == ConflictKind::BodyOverlap)
        .count()
}

#[test]
fn resolve_body_clears_a_two_way_keep_both() {
    let mut session = conflicted_session(&["Sunrise note.", "Sunset note."]);
    assert!(matches!(body_of(&session, "blk_a"), BodyState::MultiValue { .. }));
    assert_eq!(open_body_conflicts(&session), 1);

    let result = session.dispatch_resolve_body(
        "blk_a",
        Body::plain("Resolved note."),
        stamp("op_resolve", 3_000, "device_mac", "user", 20),
    );
    assert!(result.validation_error.is_none());
    match body_of(&session, "blk_a") {
        BodyState::Single(body) => assert_eq!(body.text, "Resolved note."),
        other => panic!("expected resolved single body, got {other:?}"),
    }
    assert_eq!(open_body_conflicts(&session), 0);

    // Arrival order stays irrelevant after resolution.
    let mut reversed = session.log().to_vec();
    reversed.reverse();
    let replica = Session::open_from_ops("vault_demo_0001", reversed);
    assert_eq!(
        replica.vault().snapshot_revision(),
        session.vault().snapshot_revision()
    );
}

#[test]
fn resolve_body_clears_an_n_way_keep_both_in_one_dispatch() {
    let mut session = conflicted_session(&["Alpha note.", "Beta note.", "Gamma note."]);
    assert!(matches!(
        body_of(&session, "blk_a"),
        BodyState::MultiValue { ref losers, .. } if losers.len() == 2
    ));

    let result = session.dispatch_resolve_body(
        "blk_a",
        Body::plain("Settled note."),
        stamp("op_resolve", 3_000, "device_mac", "user", 20),
    );
    assert!(result.validation_error.is_none());
    match body_of(&session, "blk_a") {
        BodyState::Single(body) => assert_eq!(body.text, "Settled note."),
        other => panic!("expected resolved single body, got {other:?}"),
    }
    assert_eq!(open_body_conflicts(&session), 0);
}

#[test]
fn resolve_body_can_keep_the_winner_text() {
    let mut session = conflicted_session(&["Sunrise note.", "Sunset note."]);
    let winner_text = match body_of(&session, "blk_a") {
        BodyState::MultiValue { winner, .. } => winner.text,
        other => panic!("expected keep-both, got {other:?}"),
    };
    let result = session.dispatch_resolve_body(
        "blk_a",
        Body::plain(winner_text.clone()),
        stamp("op_resolve", 3_000, "device_mac", "user", 20),
    );
    assert!(result.validation_error.is_none());
    match body_of(&session, "blk_a") {
        BodyState::Single(body) => assert_eq!(body.text, winner_text),
        other => panic!("expected resolved single body, got {other:?}"),
    }
    assert_eq!(open_body_conflicts(&session), 0);
}

#[test]
fn resolve_without_an_open_conflict_is_deferred_and_log_untouched() {
    let mut session = Session::open_fixture();
    let len = session.log().len();
    let result = session.dispatch_resolve_body(
        "blk_a",
        Body::plain("Nothing to resolve."),
        stamp("op_resolve", 3_000, "device_mac", "user", 20),
    );
    assert_eq!(
        result.validation_error.map(|e| e.code()),
        Some("structural_dispatch_deferred")
    );
    assert_eq!(session.log().len(), len);
}

#[test]
fn edits_of_an_imported_block_are_downstream_of_the_import_macro_not_concurrent() {
    // Import (an atomic macro) creates the block; two replicas then edit that
    // block concurrently. That is an ordinary body_overlap — never a
    // split_merge_structural with the import macro, because both edits chain
    // causally back to the macro's own output rev.
    let mut origin = Session::open_empty();
    let imported = origin.dispatch_import_markdown(
        "Imported paragraph.",
        stamp("op_import", 1_000, "device_origin", "importer", 1),
    );
    assert!(imported.validation_error.is_none());
    let block_id = imported.changed_ids[1].clone();
    let base = origin.log().to_vec();

    let mut merged = base.clone();
    for (i, text) in ["Replica A text.", "Replica B text."].iter().enumerate() {
        let mut replica = Session::open_from_ops("vault_demo_0001", base.clone());
        let result = replica.dispatch(
            EditorIntent::ReplaceText {
                target_id: block_id.clone(),
                at: 0,
                len: 19,
                text: text.to_string(),
            },
            stamp(
                &format!("op_remote_{i}"),
                2_000,
                &format!("device_{i}"),
                &format!("user_{i}"),
                1,
            ),
        );
        assert!(result.validation_error.is_none());
        merged.extend(replica.log()[base.len()..].to_vec());
    }
    let mut session = Session::open_from_ops("vault_demo_0001", merged);
    let kinds: Vec<&str> = session
        .vault()
        .conflicts
        .iter()
        .map(|c| c.kind.as_str())
        .collect();
    assert_eq!(kinds, vec!["body_overlap"], "no structural false positive");

    let result = session.dispatch_resolve_body(
        &block_id,
        Body::plain("Settled paragraph."),
        stamp("op_resolve", 3_000, "device_origin", "importer", 2),
    );
    assert!(result.validation_error.is_none());
    assert!(session.vault().conflicts.is_empty(), "resolution clears the vault");
}

#[test]
fn identical_concurrent_bodies_are_not_a_conflict() {
    // Two replicas typing the byte-identical body concurrently share the same
    // computed rev: same bytes are one frontier value, never a keep-both.
    let session = conflicted_session(&["Same words.", "Same words."]);
    match body_of(&session, "blk_a") {
        BodyState::Single(body) => assert_eq!(body.text, "Same words."),
        other => panic!("expected single body, got {other:?}"),
    }
    assert_eq!(open_body_conflicts(&session), 0);
}
