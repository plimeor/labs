//! Shared op-construction helpers for the Stage 1 spike tests.
//!
//! Files under `tests/common/` are NOT compiled as separate test crates; each
//! test file pulls them in with `mod common;`.

#![allow(dead_code)]

use anchor_core::canonical::canonical_bytes;
use anchor_core::hlc::Hlc;
use anchor_core::marks::Mark;
use anchor_core::model::{
    body_sub_rev, conflicts_canonical, scalar_sub_rev, Body, Life, Location, TargetKind, Vault,
};
use anchor_core::op::{Op, OpBuilder, OpKind, OpPayload, Register, SubFieldKey};
use anchor_core::replay::replay;

pub fn hlc(wall: u64, dev: &str) -> Hlc {
    Hlc::new(wall, 0, dev)
}

pub fn hlc_l(wall: u64, logical: u32, dev: &str) -> Hlc {
    Hlc::new(wall, logical, dev)
}

#[allow(clippy::too_many_arguments)]
pub fn create_note(
    op_id: &str,
    wall: u64,
    dev: &str,
    actor: &str,
    id: &str,
    parent: Option<&str>,
    order: &str,
) -> Op {
    OpBuilder::new(
        op_id,
        hlc(wall, dev),
        actor,
        id,
        TargetKind::Note,
        Register::Location,
        OpKind::Create,
        OpPayload::Create {
            kind: TargetKind::Note,
            location: Location::new(parent.map(String::from), order),
        },
    )
    .build()
}

#[allow(clippy::too_many_arguments)]
pub fn create_block(
    op_id: &str,
    wall: u64,
    dev: &str,
    actor: &str,
    id: &str,
    parent: Option<&str>,
    order: &str,
) -> Op {
    OpBuilder::new(
        op_id,
        hlc(wall, dev),
        actor,
        id,
        TargetKind::Block,
        Register::Location,
        OpKind::Create,
        OpPayload::Create {
            kind: TargetKind::Block,
            location: Location::new(parent.map(String::from), order),
        },
    )
    .build()
}

/// Body edit; `base_text` is the value being edited from (None for first edit).
pub fn set_body(
    op_id: &str,
    hlc_v: Hlc,
    actor: &str,
    target: &str,
    text: &str,
    base_text: Option<&str>,
) -> Op {
    set_body_full(op_id, hlc_v, actor, target, Body::plain(text), base_text.map(Body::plain))
}

pub fn set_body_full(
    op_id: &str,
    hlc_v: Hlc,
    actor: &str,
    target: &str,
    body: Body,
    base: Option<Body>,
) -> Op {
    let mut b = OpBuilder::new(
        op_id,
        hlc_v,
        actor,
        target,
        TargetKind::Block,
        Register::Content,
        OpKind::Set,
        OpPayload::SetBody {
            text: body.text.clone(),
            marks: body.marks.clone(),
        },
    )
    .sub_field(SubFieldKey::Body)
    .new_sub_rev(body_sub_rev(&body));
    if let Some(base) = base {
        b = b.base_sub_rev(body_sub_rev(&base));
    }
    b.build()
}

pub fn set_type(
    op_id: &str,
    hlc_v: Hlc,
    actor: &str,
    target: &str,
    value: Option<&str>,
    base: Option<&str>,
) -> Op {
    let mut b = OpBuilder::new(
        op_id,
        hlc_v,
        actor,
        target,
        TargetKind::Note,
        Register::Content,
        OpKind::Set,
        OpPayload::SetTypeId {
            value: value.map(String::from),
        },
    )
    .sub_field(SubFieldKey::TypeId)
    .new_sub_rev(scalar_sub_rev(value));
    if let Some(base) = base {
        b = b.base_sub_rev(scalar_sub_rev(Some(base)));
    }
    b.build()
}

#[allow(clippy::too_many_arguments)]
pub fn set_prop(
    op_id: &str,
    hlc_v: Hlc,
    actor: &str,
    target: &str,
    key: &str,
    value: Option<&str>,
    base: Option<&str>,
) -> Op {
    let mut b = OpBuilder::new(
        op_id,
        hlc_v,
        actor,
        target,
        TargetKind::Note,
        Register::Content,
        OpKind::Set,
        OpPayload::SetProp {
            key: key.to_string(),
            value: value.map(String::from),
        },
    )
    .sub_field(SubFieldKey::Prop(key.to_string()))
    .new_sub_rev(scalar_sub_rev(value));
    if let Some(base) = base {
        b = b.base_sub_rev(scalar_sub_rev(Some(base)));
    }
    b.build()
}

pub fn tag_add(op_id: &str, hlc_v: Hlc, actor: &str, target: &str, tag: &str) -> Op {
    OpBuilder::new(
        op_id,
        hlc_v,
        actor,
        target,
        TargetKind::Note,
        Register::Content,
        OpKind::TagAdd,
        OpPayload::TagAdd {
            tag: tag.to_string(),
        },
    )
    .sub_field(SubFieldKey::Tag(tag.to_string()))
    .build()
}

pub fn tag_remove(
    op_id: &str,
    hlc_v: Hlc,
    actor: &str,
    target: &str,
    tag: &str,
    observed: &[&str],
) -> Op {
    let observed_set = observed.iter().map(|s| s.to_string()).collect();
    OpBuilder::new(
        op_id,
        hlc_v,
        actor,
        target,
        TargetKind::Note,
        Register::Content,
        OpKind::TagRemove,
        OpPayload::TagRemove {
            tag: tag.to_string(),
        },
    )
    .sub_field(SubFieldKey::Tag(tag.to_string()))
    .observed_adds(observed_set)
    .build()
}

pub fn life_set(op_id: &str, hlc_v: Hlc, actor: &str, target: &str, life: Life) -> Op {
    OpBuilder::new(
        op_id,
        hlc_v,
        actor,
        target,
        TargetKind::Note,
        Register::Life,
        OpKind::LifeSet,
        OpPayload::LifeSet { life },
    )
    .build()
}

pub fn restore(op_id: &str, hlc_v: Hlc, actor: &str, target: &str) -> Op {
    OpBuilder::new(
        op_id,
        hlc_v,
        actor,
        target,
        TargetKind::Note,
        Register::Life,
        OpKind::Restore,
        OpPayload::LifeSet { life: Life::Active },
    )
    .build()
}

pub fn move_op(
    op_id: &str,
    hlc_v: Hlc,
    actor: &str,
    target: &str,
    parent: Option<&str>,
    order: &str,
) -> Op {
    OpBuilder::new(
        op_id,
        hlc_v,
        actor,
        target,
        TargetKind::Block,
        Register::Location,
        OpKind::Move,
        OpPayload::SetLocation {
            parent: parent.map(String::from),
            order: order.to_string(),
        },
    )
    .build()
}

pub fn mark(kind: &str, start: u32, end: u32, expand: bool) -> Mark {
    Mark::new(kind, start, end, expand)
}

/// Replay in the given order, reversed, and rotated; assert byte-identical
/// materialized state, `snapshot_revision`, and conflict set across all orders.
/// Returns the materialized vault.
pub fn assert_order_independent(ops: &[Op]) -> Vault {
    let v1 = replay(ops);

    let mut reversed = ops.to_vec();
    reversed.reverse();
    let v2 = replay(&reversed);

    let mut rotated = ops.to_vec();
    if rotated.len() > 1 {
        let mid = rotated.len() / 2;
        rotated.rotate_left(mid);
    }
    let v3 = replay(&rotated);

    let c1 = canonical_bytes(&v1.canonical());
    let c2 = canonical_bytes(&v2.canonical());
    let c3 = canonical_bytes(&v3.canonical());
    assert_eq!(c1, c2, "materialized state differs under reversed ingestion");
    assert_eq!(c1, c3, "materialized state differs under rotated ingestion");

    assert_eq!(v1.snapshot_revision(), v2.snapshot_revision());
    assert_eq!(v1.snapshot_revision(), v3.snapshot_revision());

    let cf1 = canonical_bytes(&conflicts_canonical(&v1.conflicts));
    let cf2 = canonical_bytes(&conflicts_canonical(&v2.conflicts));
    let cf3 = canonical_bytes(&conflicts_canonical(&v3.conflicts));
    assert_eq!(cf1, cf2, "conflict set differs under reversed ingestion");
    assert_eq!(cf1, cf3, "conflict set differs under rotated ingestion");

    v1
}

/// Re-delivery (duplicate) idempotence: replaying `ops ++ ops` equals `ops`.
pub fn assert_redelivery_idempotent(ops: &[Op]) {
    let once = replay(ops);
    let mut doubled = ops.to_vec();
    doubled.extend_from_slice(ops);
    let twice = replay(&doubled);
    assert_eq!(
        canonical_bytes(&once.canonical()),
        canonical_bytes(&twice.canonical()),
        "duplicate re-delivery changed materialized state"
    );
    assert_eq!(once.snapshot_revision(), twice.snapshot_revision());
}
