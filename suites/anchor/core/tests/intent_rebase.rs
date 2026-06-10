//! Deterministic split/merge intent-rebase (conflict §6.1).
//!
//! A plain body edit concurrent with a structural split or merge-backward is
//! re-applied — at replay time, never in the log — onto the side its hunks
//! belong to, so neither intent is lost and no conflict needs surfacing. Hunks
//! that straddle the split point (or any unrecoverable shape) keep the
//! surface+pin floor. Replay stays a pure fold: every arrival order
//! materializes the identical state.

use anchor_core::dto::{EditorIntent, OpStamp, Session};
use anchor_core::hlc::Hlc;
use anchor_core::marks::Mark;
use anchor_core::model::{body_sub_rev, Body, BodyState, ConflictKind, TargetKind, Vault};
use anchor_core::op::{Op, OpBuilder, OpKind, OpPayload, Register, SubFieldKey};
use anchor_core::replay::replay;

fn stamp(op_id: &str, wall: u64) -> OpStamp {
    OpStamp {
        op_id: op_id.to_string(),
        hlc: Hlc::new(wall, 0, "device_a"),
        actor: "user_a".to_string(),
        seq: wall,
    }
}

/// A plain (non-macro) concurrent body edit by device/user B.
fn b_edit(op_id: &str, target: &str, base: &Body, edited: &Body) -> Op {
    OpBuilder::new(
        op_id,
        Hlc::new(2_000, 0, "device_b"),
        "user_b",
        target,
        TargetKind::Block,
        Register::Content,
        OpKind::Set,
        OpPayload::SetBody {
            text: edited.text.clone(),
            marks: edited.marks.clone(),
        },
    )
    .seq(1)
    .sub_field(SubFieldKey::Body)
    .base_sub_rev(body_sub_rev(base))
    .new_sub_rev(body_sub_rev(edited))
    .build()
}

fn single_body(vault: &Vault, id: &str) -> Body {
    match vault.nodes[id].content.body.clone().expect("body present") {
        BodyState::Single(b) => b,
        BodyState::MultiValue { .. } => panic!("{id}: unexpected keep-both body"),
    }
}

fn assert_order_independent(ops: &[Op], vault: &Vault) {
    let mut reversed: Vec<Op> = ops.to_vec();
    reversed.reverse();
    assert_eq!(
        replay(&reversed).snapshot_revision(),
        vault.snapshot_revision(),
        "rebase must be arrival-order independent"
    );
}

/// Fixture body: "Morning note." — split at 8 ⇒ "Morning " | "note.".
fn split_session() -> (Session, String) {
    let mut session = Session::open_fixture();
    let result = session.dispatch(
        EditorIntent::SplitBlock {
            target_id: "blk_a".to_string(),
            at: 8,
        },
        stamp("op_split", 2_000),
    );
    let new_id = result.changed_ids[1].clone();
    (session, new_id)
}

#[test]
fn left_side_edit_rebases_onto_the_kept_block() {
    let (session, new_id) = split_session();
    let mut ops = session.log().to_vec();
    // Intra-line edit in the left region: "Morning" → "Late morning". Line-
    // granular diff3 alone could not merge this against the tail truncation.
    ops.push(b_edit(
        "op_b_left",
        "blk_a",
        &Body::plain("Morning note."),
        &Body::plain("Late morning note."),
    ));

    let vault = replay(&ops);
    assert_eq!(single_body(&vault, "blk_a").text, "Late morning ");
    assert_eq!(single_body(&vault, &new_id).text, "note.");
    assert!(vault.conflicts.is_empty(), "{:?}", vault.conflicts);
    assert_order_independent(&ops, &vault);
}

#[test]
fn right_side_edit_is_redirected_to_the_split_created_block() {
    let (session, new_id) = split_session();
    let mut ops = session.log().to_vec();
    // Edit entirely in the tail the split moved away: "note." → "note!!".
    ops.push(b_edit(
        "op_b_right",
        "blk_a",
        &Body::plain("Morning note."),
        &Body::plain("Morning note!!"),
    ));

    let vault = replay(&ops);
    assert_eq!(single_body(&vault, "blk_a").text, "Morning ");
    assert_eq!(
        single_body(&vault, &new_id).text,
        "note!!",
        "the tail edit follows its text into the new block"
    );
    assert!(vault.conflicts.is_empty(), "{:?}", vault.conflicts);
    assert_order_independent(&ops, &vault);
}

#[test]
fn straddling_edit_keeps_the_surface_and_pin_floor() {
    let (session, _) = split_session();
    let mut ops = session.log().to_vec();
    // One hunk across the split point (offsets 6..10 vs at=8) — not rebasable.
    ops.push(b_edit(
        "op_b_straddle",
        "blk_a",
        &Body::plain("Morning note."),
        &Body::plain("MorninG_NOte."),
    ));

    let vault = replay(&ops);
    assert!(
        vault
            .conflicts
            .iter()
            .any(|c| c.kind == ConflictKind::SplitMergeStructural && c.target_id == "blk_a"),
        "straddling edit must keep the structural conflict floor"
    );
    assert_order_independent(&ops, &vault);
}

#[test]
fn edit_on_merged_away_block_folds_into_the_absorbing_block() {
    let mut session = Session::open_fixture();
    // Merge blk_b ("Evening note.") backward into blk_a ("Morning note.").
    session.dispatch(
        EditorIntent::MergeBackward {
            target_id: "blk_b".to_string(),
        },
        stamp("op_merge", 2_000),
    );
    let mut ops = session.log().to_vec();
    // Device B concurrently edited the now-trashed blk_b. Without the rebase
    // this edit would strand on an invisible block (silent loss in practice).
    ops.push(b_edit(
        "op_b_trashed_edit",
        "blk_b",
        &Body::plain("Evening note."),
        &Body::plain("Evening note, revised."),
    ));

    let vault = replay(&ops);
    assert_eq!(
        single_body(&vault, "blk_a").text,
        "Morning note.Evening note, revised.",
        "the absorbed-side edit lands inside the merged body"
    );
    assert!(vault.conflicts.is_empty(), "{:?}", vault.conflicts);
    assert_order_independent(&ops, &vault);
}

#[test]
fn rebased_marks_survive_via_reclamp() {
    let mut session = Session::open_fixture();
    // Give the tail a mark before splitting: "note." carries bold on 8..12.
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
    let marked = single_body(session.vault(), "blk_a");
    let result = session.dispatch(
        EditorIntent::SplitBlock {
            target_id: "blk_a".to_string(),
            at: 8,
        },
        stamp("op_split", 2_000),
    );
    let new_id = result.changed_ids[1].clone();

    let mut ops = session.log().to_vec();
    // Concurrent tail edit based on the marked pre-split body.
    let mut edited = marked.clone();
    edited.text = "Morning note!!".to_string();
    ops.push(b_edit("op_b_tail", "blk_a", &marked, &edited));

    let vault = replay(&ops);
    let right = single_body(&vault, &new_id);
    assert_eq!(right.text, "note!!");
    assert_eq!(
        right.marks,
        vec![Mark::new("bold", 0, 4, false)],
        "the split block's marks survive the rebased edit"
    );
    assert_order_independent(&ops, &vault);
}

#[test]
fn chained_edit_is_not_rebased() {
    let (session, _) = split_session();
    let mut ops = session.log().to_vec();
    let pre = Body::plain("Morning note.");
    let e1 = Body::plain("Morning note!!");
    let e2 = Body::plain("Morning note!!!");
    ops.push(b_edit("op_b_chain_1", "blk_a", &pre, &e1));
    ops.push(b_edit("op_b_chain_2", "blk_a", &e1, &e2));

    let vault = replay(&ops);
    // The chain head has a child, so the rebase must leave the chain intact and
    // fall back to the floor (keep-both + structural surface), losing nothing.
    assert!(
        vault
            .conflicts
            .iter()
            .any(|c| c.kind == ConflictKind::SplitMergeStructural),
        "chained concurrent edits keep the conflict floor: {:?}",
        vault.conflicts
    );
    assert_order_independent(&ops, &vault);
}
