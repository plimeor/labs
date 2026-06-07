//! F42 — segment batching budget shape: N logical ops must NOT produce ~N
//! synced segment files.

use anchor_core::segment::{budget, is_per_op_failure, BatchParams};

#[test]
fn million_ops_stay_within_a_tiny_segment_budget() {
    let b = budget(1_000_000, BatchParams::default());
    // 1M ops / 512 per segment ≈ 1954 sealed; / 16 compaction ≈ 123 + 1 active.
    assert!(b.steady_state_segments < 200, "got {}", b.steady_state_segments);
    assert!(
        !is_per_op_failure(b.op_count, b.steady_state_segments),
        "batching must avoid the per-op failure shape"
    );
}

#[test]
fn per_op_segments_is_recognized_as_failure() {
    // Degenerate: one segment per op, no compaction ⇒ the failure shape.
    let bad = BatchParams {
        ops_per_segment: 1,
        compaction_fold: 1,
    };
    let b = budget(10_000, bad);
    assert!(is_per_op_failure(b.op_count, b.sealed_segments));
}

#[test]
fn budget_scales_sublinearly() {
    let small = budget(10_000, BatchParams::default());
    let big = budget(10_000_000, BatchParams::default());
    // 1000x ops should not be 1000x segments by anything close.
    assert!(big.steady_state_segments < small.steady_state_segments * 1000);
}
