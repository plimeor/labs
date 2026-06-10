//! The extended editor intent surface: DeleteText / ReplaceText / RemoveMark /
//! CreateBlock. All paths land at the single validated dispatch chokepoint;
//! offsets are UTF-16 (D18) and surrogate-pair violations are typed errors.

use anchor_core::dto::{EditorIntent, OpStamp, Selection, Session, ValidationError};
use anchor_core::hlc::Hlc;
use anchor_core::marks::Mark;
use anchor_core::model::BodyState;

fn stamp(op_id: &str, wall: u64) -> OpStamp {
    OpStamp {
        op_id: op_id.to_string(),
        hlc: Hlc::new(wall, 0, "device_mac"),
        actor: "user".to_string(),
        seq: wall,
    }
}

fn body(session: &Session, id: &str) -> (String, Vec<Mark>) {
    match session.vault().nodes[id].content.body.clone().unwrap() {
        BodyState::Single(b) => (b.text, b.marks),
        BodyState::MultiValue { .. } => panic!("unexpected keep-both body"),
    }
}

#[test]
fn delete_text_removes_the_range_and_undo_restores_it() {
    let mut session = Session::open_fixture();
    // "Morning note." minus "ing" (4..7) → "Morn note."
    let result = session.dispatch(
        EditorIntent::DeleteText {
            target_id: "blk_a".to_string(),
            at: 4,
            len: 3,
        },
        stamp("op_del", 2_000),
    );
    assert!(result.validation_error.is_none());
    assert_eq!(body(&session, "blk_a").0, "Morn note.");
    assert_eq!(
        result.selection_hint,
        Some(Selection::Text {
            block_id: "blk_a".to_string(),
            start: 4,
            end: 4,
        })
    );

    let undo = result.undo_group.expect("delete is undoable");
    session.dispatch_undo_group(undo, stamp("op_del_undo", 2_001));
    assert_eq!(body(&session, "blk_a").0, "Morning note.");
}

#[test]
fn replace_text_edits_the_range_and_reclamps_marks() {
    let mut session = Session::open_fixture();
    session.dispatch(
        EditorIntent::ApplyMark {
            target_id: "blk_a".to_string(),
            start: 8,
            end: 12,
            kind: "bold".to_string(),
            expand: false,
        },
        stamp("op_mark", 1_900),
    );
    // Replace "Morning" (0..7) with "Late" — the later mark shifts left by 3.
    let result = session.dispatch(
        EditorIntent::ReplaceText {
            target_id: "blk_a".to_string(),
            at: 0,
            len: 7,
            text: "Late".to_string(),
        },
        stamp("op_repl", 2_000),
    );
    assert!(result.validation_error.is_none());
    let (text, marks) = body(&session, "blk_a");
    assert_eq!(text, "Late note.");
    assert_eq!(marks, vec![Mark::new("bold", 5, 9, false)]);
    assert_eq!(
        result.selection_hint,
        Some(Selection::Text {
            block_id: "blk_a".to_string(),
            start: 4,
            end: 4,
        })
    );
}

#[test]
fn edit_inside_a_surrogate_pair_is_rejected_and_log_untouched() {
    let mut session = Session::open_fixture();
    session.dispatch(
        EditorIntent::ReplaceText {
            target_id: "blk_a".to_string(),
            at: 0,
            len: 13,
            text: "🎉🎉".to_string(), // two surrogate pairs, 4 UTF-16 units
        },
        stamp("op_emoji", 2_000),
    );
    let log_len = session.log().len();
    // Deleting one unit out of a pair leaves a lone surrogate → typed error.
    let result = session.dispatch(
        EditorIntent::DeleteText {
            target_id: "blk_a".to_string(),
            at: 1,
            len: 1,
        },
        stamp("op_bad", 2_001),
    );
    assert_eq!(
        result.validation_error,
        Some(ValidationError::InvalidUtf16Offset)
    );
    assert_eq!(session.log().len(), log_len, "rejected edit appends nothing");
    assert_eq!(body(&session, "blk_a").0, "🎉🎉");
}

#[test]
fn remove_mark_trims_the_overlap_and_keeps_other_kinds() {
    let mut session = Session::open_fixture();
    for (n, kind) in ["bold", "link"].into_iter().enumerate() {
        session.dispatch(
            EditorIntent::ApplyMark {
                target_id: "blk_a".to_string(),
                start: 0,
                end: 10,
                kind: kind.to_string(),
                expand: false,
            },
            stamp(&format!("op_mark_{n}"), 1_900 + n as u64),
        );
    }
    // Unbold 4..6: the bold mark splits into 0..4 and 6..10; link is untouched.
    let result = session.dispatch(
        EditorIntent::RemoveMark {
            target_id: "blk_a".to_string(),
            start: 4,
            end: 6,
            kind: "bold".to_string(),
        },
        stamp("op_unbold", 2_000),
    );
    assert!(result.validation_error.is_none());
    let (_, marks) = body(&session, "blk_a");
    assert_eq!(
        marks,
        vec![
            Mark::new("bold", 0, 4, false),
            Mark::new("bold", 6, 10, false),
            Mark::new("link", 0, 10, false),
        ]
    );
}

#[test]
fn create_block_appends_after_the_last_sibling() {
    let mut session = Session::open_fixture();
    let note_id = session.summary().note_ids[0].clone();
    let result = session.dispatch(
        EditorIntent::CreateBlock {
            parent_id: note_id.clone(),
            after_block_id: None,
            text: "A fresh block.".to_string(),
        },
        stamp("op_create", 2_000),
    );
    assert!(result.validation_error.is_none());
    let new_id = result.changed_ids[0].clone();
    assert_eq!(new_id, "blk_op_create");

    let node = &session.vault().nodes[&new_id];
    assert_eq!(node.location.parent.as_deref(), Some(note_id.as_str()));
    assert!(node.location.order > session.vault().nodes["blk_b"].location.order);
    assert_eq!(body(&session, &new_id).0, "A fresh block.");
    assert_eq!(
        result.selection_hint,
        Some(Selection::Text {
            block_id: new_id.clone(),
            start: 0,
            end: 0,
        })
    );

    // Undo trashes the created block.
    let undo = result.undo_group.expect("create is undoable");
    session.dispatch_undo_group(undo, stamp("op_create_undo", 2_001));
    assert!(!session.vault().nodes[&new_id].visible);
}

#[test]
fn create_block_after_a_sibling_lands_between_siblings() {
    let mut session = Session::open_fixture();
    let note_id = session.summary().note_ids[0].clone();
    let result = session.dispatch(
        EditorIntent::CreateBlock {
            parent_id: note_id,
            after_block_id: Some("blk_a".to_string()),
            text: String::new(),
        },
        stamp("op_between", 2_000),
    );
    assert!(result.validation_error.is_none());
    let new_id = result.changed_ids[0].clone();
    let order = &session.vault().nodes[&new_id].location.order;
    assert!(*order > session.vault().nodes["blk_a"].location.order);
    assert!(*order < session.vault().nodes["blk_b"].location.order);
}

#[test]
fn create_block_under_missing_parent_is_a_structural_error() {
    let mut session = Session::open_fixture();
    let result = session.dispatch(
        EditorIntent::CreateBlock {
            parent_id: "note_missing".to_string(),
            after_block_id: None,
            text: String::new(),
        },
        stamp("op_orphan", 2_000),
    );
    assert_eq!(
        result.validation_error,
        Some(ValidationError::StructuralDispatchDeferred)
    );
}
