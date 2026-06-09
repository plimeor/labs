//! The Apple-binding call surface (owned by Codex): open → dispatch → read.

use anchor_core::dto::{
    blob_id, fixture_blob, open_fixture_vault, EditorIntent, OpStamp, Session, ValidationError,
};
use anchor_core::hlc::Hlc;
use anchor_core::model::Life;

fn stamp(op_id: &str, wall: u64) -> OpStamp {
    OpStamp {
        op_id: op_id.to_string(),
        hlc: Hlc::new(wall, 0, "device_mac"),
        actor: "user".to_string(),
        seq: wall,
    }
}

#[test]
fn fixture_summary_is_populated() {
    let s = open_fixture_vault();
    assert_eq!(s.vault_id, "vault_demo_0001");
    assert_eq!(s.note_count, 1);
    assert_eq!(s.snapshot_revision.len(), 64);
    assert!(s.note_ids.iter().any(|id| id.starts_with("jnl_")));
}

#[test]
fn dispatch_add_tag_round_trips() {
    let mut session = Session::open_fixture();
    let note_id = session.summary().note_ids[0].clone();
    let result = session.dispatch(
        EditorIntent::AddTag {
            target_id: note_id.clone(),
            tag: "research".to_string(),
        },
        stamp("op_tag", 2000),
    );
    assert_eq!(result.changed_ids, vec![note_id.clone()]);
    assert!(result.validation_error.is_none());
    assert!(result.new_revisions.contains_key(&note_id));
    assert!(session.vault().nodes[&note_id]
        .content
        .tags
        .contains("research"));
}

#[test]
fn dispatch_insert_text_updates_body() {
    let mut session = Session::open_fixture();
    let result = session.dispatch(
        EditorIntent::InsertText {
            target_id: "blk_a".to_string(),
            at: 0,
            text: "PREFIX ".to_string(),
        },
        stamp("op_ins", 2000),
    );
    assert!(result.validation_error.is_none());
    // Caret collapses just after the inserted run ("PREFIX " = 7 UTF-16 units).
    assert_eq!(
        result.selection_hint,
        Some(anchor_core::dto::Selection::Text {
            block_id: "blk_a".to_string(),
            start: 7,
            end: 7,
        })
    );
    let body = session.vault().nodes["blk_a"].content.body.clone().unwrap();
    let text = match body {
        anchor_core::model::BodyState::Single(b) => b.text,
        _ => panic!("unexpected conflict"),
    };
    assert_eq!(text, "PREFIX Morning note.");
}

#[test]
fn dispatch_rejects_direct_active_to_deleted() {
    let mut session = Session::open_fixture();
    let result = session.dispatch(
        EditorIntent::SetLife {
            target_id: "blk_a".to_string(),
            life: Life::Deleted,
        },
        stamp("op_del", 2000),
    );
    assert_eq!(
        result.validation_error,
        Some(ValidationError::DirectActiveToDeleted),
        "active→deleted must be rejected"
    );
}

#[test]
fn validation_error_vocabulary_is_frozen() {
    let cases = [
        (
            ValidationError::InvalidUtf16Offset,
            "invalid_utf16_offset",
            "text edit produced invalid UTF-16; check Apple UTF-16 offset boundary",
        ),
        (
            ValidationError::DirectActiveToDeleted,
            "direct_active_to_deleted",
            "direct active→deleted rejected; trash first (D10/D20)",
        ),
        (
            ValidationError::StructuralDispatchDeferred,
            "structural_dispatch_deferred",
            "structural split/merge dispatch deferred to CP-2",
        ),
    ];

    let codes = cases
        .iter()
        .map(|(error, _, _)| error.code())
        .collect::<Vec<_>>();
    assert_eq!(
        codes,
        vec![
            "invalid_utf16_offset",
            "direct_active_to_deleted",
            "structural_dispatch_deferred",
        ]
    );
    assert!(!codes.contains(&"adapter_null_session"));
    assert!(!codes.contains(&"adapter_parse_error"));

    for (error, code, message) in cases {
        assert_eq!(error.code(), code);
        assert_eq!(error.message(), message);
    }
}

#[test]
fn segment_bytes_surface_is_stable() {
    let s1 = Session::open_fixture();
    let s2 = Session::open_fixture();
    assert!(!s1.read_segment().is_empty());
    assert_eq!(
        s1.segment_id(),
        s2.segment_id(),
        "fixture segment id is stable"
    );
}

#[test]
fn blob_surface_for_transfer_benchmark() {
    for size in [1usize, 1024, 4096] {
        let blob = fixture_blob(size);
        assert_eq!(blob.len(), size);
        assert!(blob_id(&blob).starts_with("blob_"));
    }
}
