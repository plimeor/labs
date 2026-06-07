//! Segment batching budget — smoke shape only (F42 / D06 / D13).
//!
//! The real numbers (metadata-query enumeration latency, placeholder cost) are
//! Codex's cloud-transport runtime spike. This module pins the *shape* of the
//! invariant the core side must guarantee: `N` logical ops must NOT produce
//! `~N` synced segment files. Op→segment batching plus compaction keeps the
//! steady-state segment count far below the op count. Pure arithmetic, no I/O.

/// Batching parameters.
#[derive(Clone, Copy, Debug)]
pub struct BatchParams {
    /// Max logical ops sealed into one segment.
    pub ops_per_segment: u64,
    /// Compaction folds this many sealed segments into one snapshot segment.
    pub compaction_fold: u64,
}

impl Default for BatchParams {
    fn default() -> Self {
        BatchParams {
            ops_per_segment: 512,
            compaction_fold: 16,
        }
    }
}

/// Computed budget for `op_count` logical ops.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SegmentBudget {
    pub op_count: u64,
    /// Sealed segments before compaction.
    pub sealed_segments: u64,
    /// Steady-state synced segment files after compaction (+ 1 active unsealed).
    pub steady_state_segments: u64,
}

/// Compute the segment budget. Steady state = compacted snapshot segments + the
/// single active unsealed segment.
pub fn budget(op_count: u64, params: BatchParams) -> SegmentBudget {
    let sealed = op_count.div_ceil(params.ops_per_segment);
    let compacted = sealed.div_ceil(params.compaction_fold.max(1));
    SegmentBudget {
        op_count,
        sealed_segments: sealed,
        steady_state_segments: compacted + 1,
    }
}

/// The failure shape we must avoid: roughly one synced segment per logical op.
pub fn is_per_op_failure(op_count: u64, segment_count: u64) -> bool {
    op_count >= 100 && segment_count * 2 > op_count
}
