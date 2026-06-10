//! Structural editor dispatch lower bound.

use anchor_core::dto::{EditorIntent, EditorPatch, OpStamp, Selection, Session, ValidationError};
use anchor_core::hlc::Hlc;
use anchor_core::model::{BodyState, Life};

fn stamp(op_id: &str, wall: u64) -> OpStamp {
    OpStamp {
        op_id: op_id.to_string(),
        hlc: Hlc::new(wall, 0, "device_mac"),
        actor: "user".to_string(),
        seq: wall,
    }
}

fn body_text(session: &Session, block_id: &str) -> String {
    let body = session.vault().nodes[block_id]
        .content
        .body
        .clone()
        .unwrap();
    match body {
        BodyState::Single(body) => body.text,
        BodyState::MultiValue { .. } => panic!("unexpected body conflict"),
    }
}

#[test]
fn split_block_creates_right_sibling_and_moves_caret() {
    let mut session = Session::open_fixture();
    let result = session.dispatch(
        EditorIntent::SplitBlock {
            target_id: "blk_a".to_string(),
            at: 8,
        },
        stamp("op_split_block_test", 2_000),
    );

    assert!(result.validation_error.is_none());
    assert_eq!(result.changed_ids.len(), 2);
    assert_eq!(result.changed_ids[0], "blk_a");
    assert_eq!(body_text(&session, "blk_a"), "Morning ");

    let new_block_id = result.changed_ids[1].clone();
    assert!(new_block_id.starts_with("blk_op_split_block_test"));
    assert_eq!(body_text(&session, &new_block_id), "note.");
    assert_eq!(
        result.selection_hint,
        Some(Selection::Text {
            block_id: new_block_id.clone(),
            start: 0,
            end: 0,
        })
    );
    assert_eq!(
        result.editor_patches,
        vec![
            EditorPatch::ReplaceBlockText {
                block_id: "blk_a".to_string(),
                text: "Morning ".to_string(),
                selection_start: 8,
                selection_end: 8,
            },
            EditorPatch::InsertTextSurface {
                after_block_id: "blk_a".to_string(),
                block_id: new_block_id.clone(),
                text: "note.".to_string(),
                selection_start: 0,
                selection_end: 0,
            },
        ]
    );
    let undo = result
        .undo_group
        .clone()
        .expect("split should return undo group");
    assert_eq!(undo.group_id, "undo_op_split_block_test");
    assert_eq!(undo.label, "split_block");
    assert_eq!(
        undo.inverse_patches,
        vec![
            EditorPatch::ReplaceBlockText {
                block_id: "blk_a".to_string(),
                text: "Morning note.".to_string(),
                selection_start: 8,
                selection_end: 8,
            },
            EditorPatch::RemoveTextSurface {
                block_id: new_block_id.clone(),
            },
        ]
    );

    let left = &session.vault().nodes["blk_a"];
    let right = &session.vault().nodes[&new_block_id];
    assert_eq!(right.kind, left.kind);
    assert_eq!(right.location.parent, left.location.parent);
    assert!(left.location.order < right.location.order);
    assert!(right.location.order < session.vault().nodes["blk_b"].location.order);

    let undo_result = session.dispatch_undo_group(undo, stamp("op_undo_split_block_test", 2_001));
    assert!(undo_result.validation_error.is_none());
    assert_eq!(
        undo_result.changed_ids,
        vec!["blk_a".to_string(), new_block_id.clone()]
    );
    assert_eq!(undo_result.editor_patches.len(), 2);
    assert!(undo_result.undo_group.is_none());
    assert_eq!(body_text(&session, "blk_a"), "Morning note.");
    assert_eq!(session.vault().nodes[&new_block_id].life, Life::Trashed);
    assert!(!session.vault().nodes[&new_block_id].visible);
    assert_eq!(
        undo_result.selection_hint,
        Some(Selection::Text {
            block_id: "blk_a".to_string(),
            start: 8,
            end: 8,
        })
    );
}

#[test]
fn merge_backward_appends_current_body_to_previous_sibling_and_trashes_current() {
    let mut session = Session::open_fixture();
    let result = session.dispatch(
        EditorIntent::MergeBackward {
            target_id: "blk_b".to_string(),
        },
        stamp("op_merge_backward_test", 2_000),
    );

    assert!(result.validation_error.is_none());
    assert_eq!(result.changed_ids, vec!["blk_a", "blk_b"]);
    assert_eq!(body_text(&session, "blk_a"), "Morning note.Evening note.");
    assert_eq!(session.vault().nodes["blk_b"].life, Life::Trashed);
    assert!(!session.vault().nodes["blk_b"].visible);
    assert_eq!(
        result.selection_hint,
        Some(Selection::Text {
            block_id: "blk_a".to_string(),
            start: 13,
            end: 13,
        })
    );
    assert_eq!(
        result.editor_patches,
        vec![
            EditorPatch::ReplaceBlockText {
                block_id: "blk_a".to_string(),
                text: "Morning note.Evening note.".to_string(),
                selection_start: 13,
                selection_end: 13,
            },
            EditorPatch::RemoveTextSurface {
                block_id: "blk_b".to_string(),
            },
        ]
    );
    let undo = result
        .undo_group
        .clone()
        .expect("merge should return undo group");
    assert_eq!(undo.group_id, "undo_op_merge_backward_test");
    assert_eq!(undo.label, "merge_backward");
    assert_eq!(
        undo.inverse_patches,
        vec![
            EditorPatch::ReplaceBlockText {
                block_id: "blk_a".to_string(),
                text: "Morning note.".to_string(),
                selection_start: 13,
                selection_end: 13,
            },
            EditorPatch::InsertTextSurface {
                after_block_id: "blk_a".to_string(),
                block_id: "blk_b".to_string(),
                text: "Evening note.".to_string(),
                selection_start: 0,
                selection_end: 13,
            },
        ]
    );

    let undo_result =
        session.dispatch_undo_group(undo, stamp("op_undo_merge_backward_test", 2_001));
    assert!(undo_result.validation_error.is_none());
    assert_eq!(undo_result.changed_ids, vec!["blk_a", "blk_b"]);
    assert_eq!(undo_result.editor_patches.len(), 2);
    assert!(undo_result.undo_group.is_none());
    assert_eq!(body_text(&session, "blk_a"), "Morning note.");
    assert_eq!(body_text(&session, "blk_b"), "Evening note.");
    assert_eq!(session.vault().nodes["blk_b"].life, Life::Active);
    assert!(session.vault().nodes["blk_b"].visible);
    assert_eq!(
        undo_result.selection_hint,
        Some(Selection::Text {
            block_id: "blk_b".to_string(),
            start: 0,
            end: 13,
        })
    );
}

#[test]
fn merge_backward_on_first_sibling_returns_structural_error() {
    let mut session = Session::open_fixture();
    let result = session.dispatch(
        EditorIntent::MergeBackward {
            target_id: "blk_a".to_string(),
        },
        stamp("op_merge_backward_first", 2_000),
    );

    assert_eq!(
        result.validation_error,
        Some(ValidationError::StructuralDispatchDeferred)
    );
    assert!(result.changed_ids.is_empty());
    assert!(result.editor_patches.is_empty());
    assert!(result.undo_group.is_none());
    assert_eq!(body_text(&session, "blk_a"), "Morning note.");
}
