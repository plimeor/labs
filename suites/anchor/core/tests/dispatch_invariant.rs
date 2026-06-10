//! CP-2: the single validated-dispatch chokepoint.
//!
//! Every local persistent write funnels through `Session::commit`, the only site
//! that appends to the session op-log, and it is gated by `validate_batch`. These
//! tests prove a rejected dispatch never performs a partial write, and that a
//! structural macro is stamped with its group size for all-or-nothing replay.

use anchor_core::dto::{EditorIntent, OpStamp, Session, ValidationError};
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
fn rejected_dispatch_leaves_log_and_snapshot_untouched() {
    let mut session = Session::open_fixture();
    let before_len = session.log().len();
    let before_rev = session.summary().snapshot_revision;

    // active→deleted is rejected by validate_batch at the commit chokepoint.
    let result = session.dispatch(
        EditorIntent::SetLife {
            target_id: "blk_a".to_string(),
            life: Life::Deleted,
        },
        stamp("op_reject", 2_000),
    );

    assert_eq!(
        result.validation_error,
        Some(ValidationError::DirectActiveToDeleted)
    );
    // The single chokepoint rejected the batch before any append: no partial write.
    assert_eq!(
        session.log().len(),
        before_len,
        "a rejected dispatch must not append to the op-log"
    );
    assert_eq!(
        session.summary().snapshot_revision,
        before_rev,
        "a rejected dispatch must not change materialized state"
    );
}

#[test]
fn structural_macro_ops_are_stamped_with_group_size() {
    let mut session = Session::open_fixture();
    let before = session.log().len();

    session.dispatch(
        EditorIntent::SplitBlock {
            target_id: "blk_a".to_string(),
            at: 8,
        },
        stamp("op_split_macro", 2_000),
    );

    let appended = &session.log()[before..];
    assert_eq!(appended.len(), 3, "split is a 3-op macro");
    let macro_id = appended[0]
        .macro_op_id
        .clone()
        .expect("structural ops carry a macro_op_id");
    for op in appended {
        assert_eq!(op.macro_op_id.as_deref(), Some(macro_id.as_str()));
        assert_eq!(
            op.macro_size,
            Some(3),
            "commit stamps every macro op with its group size"
        );
    }
}
