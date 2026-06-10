//! The round-3 editor-core intent surface: indent/outdent, exit-container,
//! transform, insert-code-block (embedded editor), paste-fragment, and the
//! multi-block selection edits — plus the F21 selection promote/demote ladder.

use anchor_core::dto::{EditorIntent, OpStamp, Selection, Session};
use anchor_core::editor::{demote, escalate};
use anchor_core::hlc::Hlc;
use anchor_core::model::{BodyState, TargetKind};
use anchor_core::replay::replay;

fn stamp(op_id: &str, wall: u64, seq: u64) -> OpStamp {
    OpStamp {
        op_id: op_id.to_string(),
        hlc: Hlc::new(wall, 0, "device_mac"),
        actor: "user".to_string(),
        seq,
    }
}

fn note_id(session: &Session) -> String {
    session.summary().note_ids[0].clone()
}

#[test]
fn indent_block_reparents_under_previous_sibling() {
    let mut session = Session::open_fixture();
    let result = session.dispatch(
        EditorIntent::IndentBlock {
            target_id: "blk_b".to_string(),
        },
        stamp("op_indent", 2_000, 10),
    );
    assert!(result.validation_error.is_none());
    assert_eq!(
        result.selection_hint,
        Some(Selection::Block {
            block_id: "blk_b".to_string()
        })
    );
    let node = session.vault().nodes.get("blk_b").unwrap();
    assert_eq!(node.location.parent.as_deref(), Some("blk_a"));
}

#[test]
fn indent_without_previous_sibling_is_deferred_and_log_untouched() {
    let mut session = Session::open_fixture();
    let len = session.log().len();
    let result = session.dispatch(
        EditorIntent::IndentBlock {
            target_id: "blk_a".to_string(),
        },
        stamp("op_indent_first", 2_000, 10),
    );
    assert!(result.validation_error.is_some());
    assert_eq!(session.log().len(), len);
}

#[test]
fn outdent_block_lands_right_after_its_container() {
    let mut session = Session::open_fixture();
    session.dispatch(
        EditorIntent::IndentBlock {
            target_id: "blk_b".to_string(),
        },
        stamp("op_indent", 2_000, 10),
    );
    let result = session.dispatch(
        EditorIntent::OutdentBlock {
            target_id: "blk_b".to_string(),
        },
        stamp("op_outdent", 2_100, 11),
    );
    assert!(result.validation_error.is_none());
    let note = note_id(&session);
    let a = session.vault().nodes.get("blk_a").unwrap().location.clone();
    let b = session.vault().nodes.get("blk_b").unwrap().location.clone();
    assert_eq!(b.parent.as_deref(), Some(note.as_str()));
    assert!(b.order > a.order, "outdented block sits after its old container");
}

#[test]
fn outdent_at_note_level_is_deferred() {
    let mut session = Session::open_fixture();
    let result = session.dispatch(
        EditorIntent::OutdentBlock {
            target_id: "blk_a".to_string(),
        },
        stamp("op_outdent_top", 2_000, 10),
    );
    assert_eq!(
        result.validation_error.map(|e| e.code()),
        Some("structural_dispatch_deferred")
    );
}

#[test]
fn exit_container_on_empty_requires_an_empty_body() {
    let mut session = Session::open_fixture();
    session.dispatch(
        EditorIntent::IndentBlock {
            target_id: "blk_b".to_string(),
        },
        stamp("op_indent", 2_000, 10),
    );
    // Non-empty body: the gesture defers.
    let blocked = session.dispatch(
        EditorIntent::ExitContainerOnEmpty {
            target_id: "blk_b".to_string(),
        },
        stamp("op_exit_full", 2_100, 11),
    );
    assert!(blocked.validation_error.is_some());

    // An empty child of blk_a exits to note level with the caret kept.
    session.dispatch(
        EditorIntent::CreateBlock {
            parent_id: "blk_a".to_string(),
            after_block_id: None,
            text: String::new(),
        },
        stamp("op_empty", 2_200, 12),
    );
    let empty_id = "blk_op_empty".to_string();
    let result = session.dispatch(
        EditorIntent::ExitContainerOnEmpty {
            target_id: empty_id.clone(),
        },
        stamp("op_exit", 2_300, 13),
    );
    assert!(result.validation_error.is_none());
    assert_eq!(
        result.selection_hint,
        Some(Selection::Text {
            block_id: empty_id.clone(),
            start: 0,
            end: 0
        })
    );
    let note = note_id(&session);
    let node = session.vault().nodes.get(&empty_id).unwrap();
    assert_eq!(node.location.parent.as_deref(), Some(note.as_str()));
}

#[test]
fn transform_block_sets_the_type_with_a_block_selection() {
    let mut session = Session::open_fixture();
    let result = session.dispatch(
        EditorIntent::TransformBlock {
            target_id: "blk_a".to_string(),
            type_id: Some("heading".to_string()),
        },
        stamp("op_transform", 2_000, 10),
    );
    assert!(result.validation_error.is_none());
    assert_eq!(
        result.selection_hint,
        Some(Selection::Block {
            block_id: "blk_a".to_string()
        })
    );
    let node = session.vault().nodes.get("blk_a").unwrap();
    assert_eq!(node.content.type_id.as_deref(), Some("heading"));
}

#[test]
fn insert_code_block_is_one_atomic_macro_with_embedded_selection() {
    let mut session = Session::open_fixture();
    let note = note_id(&session);
    let result = session.dispatch(
        EditorIntent::InsertCodeBlock {
            parent_id: note.clone(),
            after_block_id: Some("blk_a".to_string()),
            language: "rust".to_string(),
            code: "fn main() {}".to_string(),
        },
        stamp("op_code", 2_000, 10),
    );
    assert!(result.validation_error.is_none());
    let block_id = "blk_op_code".to_string();
    assert_eq!(
        result.selection_hint,
        Some(Selection::Embedded {
            block_id: block_id.clone(),
            start: 0,
            end: 0
        })
    );
    let node = session.vault().nodes.get(&block_id).unwrap();
    assert_eq!(node.kind, TargetKind::Block);
    assert_eq!(node.content.type_id.as_deref(), Some("code"));
    assert_eq!(node.content.props.get("language").map(String::as_str), Some("rust"));
    match node.content.body.as_ref().unwrap() {
        BodyState::Single(body) => assert_eq!(body.text, "fn main() {}"),
        other => panic!("expected single body, got {other:?}"),
    }

    // All four ops share one macro id; a partially delivered macro never
    // materializes the block (all-or-nothing, D29).
    let macro_ops: Vec<_> = session
        .log()
        .iter()
        .filter(|op| op.macro_op_id.as_deref() == Some("macro_op_code"))
        .collect();
    assert_eq!(macro_ops.len(), 4);
    let mut partial = session.log().to_vec();
    partial.pop();
    let vault = replay(&partial);
    assert!(!vault.nodes.contains_key(&block_id));
}

#[test]
fn paste_fragment_lands_between_siblings_in_plan_order() {
    let mut session = Session::open_fixture();
    let note = note_id(&session);
    let markdown = "First pasted paragraph.\n\nSecond one.\n\n```sh\necho fenced\n```";
    let result = session.dispatch(
        EditorIntent::PasteFragment {
            parent_id: note.clone(),
            after_block_id: Some("blk_a".to_string()),
            markdown: markdown.to_string(),
        },
        stamp("op_paste", 2_000, 10),
    );
    assert!(result.validation_error.is_none());
    assert_eq!(result.changed_ids.len(), 3);

    let a_order = session.vault().nodes.get("blk_a").unwrap().location.order.clone();
    let b_order = session.vault().nodes.get("blk_b").unwrap().location.order.clone();
    let mut previous = a_order.clone();
    for id in &result.changed_ids {
        let node = session.vault().nodes.get(id).unwrap();
        assert!(node.location.order > previous, "pasted blocks keep plan order");
        assert!(node.location.order < b_order, "pasted blocks sit before blk_b");
        previous = node.location.order.clone();
    }
    let last = result.changed_ids.last().unwrap();
    match session.vault().nodes.get(last).unwrap().content.body.as_ref().unwrap() {
        BodyState::Single(body) => assert_eq!(body.text, "```sh\necho fenced\n```"),
        other => panic!("expected single body, got {other:?}"),
    }
    // Caret lands at the end of the last pasted block.
    match result.selection_hint {
        Some(Selection::Text { block_id, start, end }) => {
            assert_eq!(&block_id, last);
            assert_eq!(start, end);
            assert!(start > 0);
        }
        other => panic!("expected text selection, got {other:?}"),
    }

    // Atomicity + arrival-order independence of the macro.
    let mut partial = session.log().to_vec();
    partial.pop();
    let vault = replay(&partial);
    for id in &result.changed_ids {
        assert!(!vault.nodes.contains_key(id), "partial paste must not materialize");
    }
    let mut reversed = session.log().to_vec();
    reversed.reverse();
    assert_eq!(
        replay(&reversed).snapshot_revision(),
        session.vault().snapshot_revision()
    );

    // The undo group removes the fragment again.
    let undo = result.undo_group.expect("paste has an undo group");
    let undone = session.dispatch_undo_group(undo, stamp("op_paste_undo", 2_100, 11));
    assert!(undone.validation_error.is_none());
    for id in &result.changed_ids {
        assert!(!session.vault().nodes.get(id).unwrap().life.is_living());
    }
}

#[test]
fn paste_fragment_of_nothing_is_a_noop() {
    let mut session = Session::open_fixture();
    let note = note_id(&session);
    let len = session.log().len();
    let result = session.dispatch(
        EditorIntent::PasteFragment {
            parent_id: note,
            after_block_id: None,
            markdown: "   \n\n  ".to_string(),
        },
        stamp("op_paste_empty", 2_000, 10),
    );
    assert!(result.validation_error.is_none());
    assert!(result.changed_ids.is_empty());
    assert_eq!(session.log().len(), len);
}

#[test]
fn delete_blocks_trashes_atomically_and_undo_restores() {
    let mut session = Session::open_fixture();
    let note = note_id(&session);
    session.dispatch(
        EditorIntent::CreateBlock {
            parent_id: note,
            after_block_id: Some("blk_b".to_string()),
            text: "Third block.".to_string(),
        },
        stamp("op_third", 2_000, 10),
    );
    let result = session.dispatch(
        EditorIntent::DeleteBlocks {
            block_ids: vec!["blk_b".to_string(), "blk_op_third".to_string()],
        },
        stamp("op_del", 2_100, 11),
    );
    assert!(result.validation_error.is_none());
    assert!(!session.vault().nodes.get("blk_b").unwrap().life.is_living());
    assert!(!session.vault().nodes.get("blk_op_third").unwrap().life.is_living());
    assert_eq!(
        result.selection_hint,
        Some(Selection::Block {
            block_id: "blk_a".to_string()
        })
    );
    // The macro is all-or-nothing.
    let mut partial = session.log().to_vec();
    partial.pop();
    let vault = replay(&partial);
    assert!(vault.nodes.get("blk_b").unwrap().life.is_living());

    let undo = result.undo_group.expect("delete has an undo group");
    let undone = session.dispatch_undo_group(undo, stamp("op_del_undo", 2_200, 12));
    assert!(undone.validation_error.is_none());
    for id in ["blk_b", "blk_op_third"] {
        let node = session.vault().nodes.get(id).unwrap();
        assert!(node.life.is_living());
    }
    match session.vault().nodes.get("blk_b").unwrap().content.body.as_ref().unwrap() {
        BodyState::Single(body) => assert_eq!(body.text, "Evening note."),
        other => panic!("expected single body, got {other:?}"),
    }
}

#[test]
fn move_blocks_reparents_in_the_given_order() {
    let mut session = Session::open_fixture();
    let note = note_id(&session);
    session.dispatch(
        EditorIntent::CreateBlock {
            parent_id: note,
            after_block_id: Some("blk_b".to_string()),
            text: "Third block.".to_string(),
        },
        stamp("op_third", 2_000, 10),
    );
    let result = session.dispatch(
        EditorIntent::MoveBlocks {
            block_ids: vec!["blk_op_third".to_string(), "blk_b".to_string()],
            parent_id: Some("blk_a".to_string()),
            after_block_id: None,
        },
        stamp("op_move", 2_100, 11),
    );
    assert!(result.validation_error.is_none());
    let third = session.vault().nodes.get("blk_op_third").unwrap().location.clone();
    let b = session.vault().nodes.get("blk_b").unwrap().location.clone();
    assert_eq!(third.parent.as_deref(), Some("blk_a"));
    assert_eq!(b.parent.as_deref(), Some("blk_a"));
    assert!(third.order < b.order, "blocks keep the requested order");
    assert_eq!(
        result.selection_hint,
        Some(Selection::Block {
            block_id: "blk_op_third".to_string()
        })
    );
}

#[test]
fn move_blocks_into_their_own_subtree_is_deferred() {
    let mut session = Session::open_fixture();
    session.dispatch(
        EditorIntent::IndentBlock {
            target_id: "blk_b".to_string(),
        },
        stamp("op_indent", 2_000, 10),
    );
    let len = session.log().len();
    let result = session.dispatch(
        EditorIntent::MoveBlocks {
            block_ids: vec!["blk_a".to_string()],
            parent_id: Some("blk_b".to_string()),
            after_block_id: None,
        },
        stamp("op_cycle", 2_100, 11),
    );
    assert_eq!(
        result.validation_error.map(|e| e.code()),
        Some("structural_dispatch_deferred")
    );
    assert_eq!(session.log().len(), len);
}

#[test]
fn selection_ladder_escalates_text_to_full_to_block_and_demotes_back() {
    let session = Session::open_fixture();
    let vault = session.vault();
    let partial = Selection::Text {
        block_id: "blk_a".to_string(),
        start: 0,
        end: 7,
    };
    let full = escalate(vault, &partial);
    assert_eq!(
        full,
        Selection::Text {
            block_id: "blk_a".to_string(),
            start: 0,
            end: 13
        }
    );
    let block = escalate(vault, &full);
    assert_eq!(
        block,
        Selection::Block {
            block_id: "blk_a".to_string()
        }
    );
    // The block rung is the ladder's top (workspace focus is adapter-owned).
    assert_eq!(escalate(vault, &block), block);
    assert_eq!(demote(&full), Some(block.clone()));
    assert_eq!(demote(&block), None);
}

#[test]
fn selection_ladder_promotes_the_embedded_editor_to_its_block() {
    let mut session = Session::open_fixture();
    let note = note_id(&session);
    let result = session.dispatch(
        EditorIntent::InsertCodeBlock {
            parent_id: note,
            after_block_id: Some("blk_b".to_string()),
            language: "sh".to_string(),
            code: "echo hi".to_string(),
        },
        stamp("op_code", 2_000, 10),
    );
    let embedded = result.selection_hint.expect("embedded selection");
    let vault = session.vault();
    // Cmd+A: partial → full payload → enclosing block.
    let full = escalate(vault, &embedded);
    assert_eq!(
        full,
        Selection::Embedded {
            block_id: "blk_op_code".to_string(),
            start: 0,
            end: 7
        }
    );
    assert_eq!(
        escalate(vault, &full),
        Selection::Block {
            block_id: "blk_op_code".to_string()
        }
    );
    // Esc demotes the embedded editor straight to block selection.
    assert_eq!(
        demote(&embedded),
        Some(Selection::Block {
            block_id: "blk_op_code".to_string()
        })
    );
}
