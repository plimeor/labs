//! F34 — sync ingestion: dedup, per-actor HWM, idempotent re-delivery, and
//! order-independent convergence.

mod common;
use common::*;

use anchor_core::canonical::canonical_bytes;
use anchor_core::ingest::IngestState;

fn segment() -> Vec<anchor_core::op::Op> {
    vec![
        create_block("c", 1, "mac", "mac", "blk", None, "V"),
        set_body("b0", hlc(2, "mac"), "mac", "blk", "base", None),
        set_body("ba", hlc(3, "mac"), "mac", "blk", "base\nmac", Some("base")),
        set_body("bb", hlc(4, "iph"), "iph", "blk", "iph\nbase", Some("base")),
        tag_add("t", hlc(5, "iph"), "iph", "blk", "x"),
    ]
}

#[test]
fn redelivery_of_a_segment_is_idempotent() {
    let seg = segment();
    let mut state = IngestState::new();
    let first = state.ingest_segment(&seg);
    assert_eq!(first, seg.len(), "first delivery accepts all ops");
    let second = state.ingest_segment(&seg);
    assert_eq!(second, 0, "re-delivery accepts nothing (op_id dedup)");
    assert_eq!(state.len(), seg.len());
}

#[test]
fn ingestion_order_does_not_change_result() {
    let seg = segment();

    let mut forward = IngestState::new();
    forward.ingest_segment(&seg);

    let mut backward = IngestState::new();
    let mut rev = seg.clone();
    rev.reverse();
    backward.ingest_segment(&rev);
    // Re-deliver the forward order too, to prove duplicates don't perturb it.
    backward.ingest_segment(&seg);

    assert_eq!(
        canonical_bytes(&forward.materialize().canonical()),
        canonical_bytes(&backward.materialize().canonical())
    );
    assert_eq!(
        forward.materialize().snapshot_revision(),
        backward.materialize().snapshot_revision()
    );
}

#[test]
fn per_actor_hwm_is_monotonic() {
    let seg = segment();
    let mut state = IngestState::new();
    state.ingest_segment(&seg);
    let mac = state.actor_hwm("mac").expect("mac hwm");
    // mac's highest op is hlc wall=3, seq default 0.
    assert_eq!(mac.hlc.wall, 3);
    let iph = state.actor_hwm("iph").expect("iph hwm");
    assert_eq!(iph.hlc.wall, 5);
}
