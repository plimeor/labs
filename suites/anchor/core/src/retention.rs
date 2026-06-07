//! Four-horizon retention correctness (D14 / D38, conflict §10).
//!
//! Hard-delete eligibility is the conjunction of five data-safety conditions
//! plus an explicit excise process gate; anything short of that can only be
//! archived (compacted-to-snapshot-delta, kept reachable). The 7-day conflict
//! horizon is UI-only and never releases an open-conflict pin or authorizes a
//! hard delete. `restore` is a forward dominating op, never a log rewrite. Pure
//! decision logic — the cloud placeholder/eviction costs are Codex's spike.

use crate::hlc::Hlc;
use alloc::collections::BTreeMap;
use alloc::string::String;

/// What compaction/GC may do with a given op's payload.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RetentionDecision {
    /// Must keep verbatim (pinned by an open conflict, or not yet replay-safe).
    Keep,
    /// May archive (compact to snapshot-delta / immutable segment), stays reachable.
    Archive,
    /// May physically remove the payload (only via explicit excise).
    HardDelete,
}

/// An op's standing against the four horizons + the excise gate.
#[derive(Clone, Copy, Debug, Default)]
pub struct OpStanding {
    /// (1) Below the causal-stability watermark.
    pub below_watermark: bool,
    /// (2) Member of an open ConflictRecord (pinned).
    pub open_conflict_member: bool,
    /// (3) Already covered by every known peer's snapshot.
    pub snapshot_covered_all_peers: bool,
    /// (4) Beyond the audit/restore horizon.
    pub beyond_audit_horizon: bool,
    /// (5) Beyond the time-travel horizon.
    pub beyond_time_travel_horizon: bool,
    /// (6) An explicit excise process authorized removal (NOT a compaction default).
    pub explicit_excise: bool,
}

/// Decide what may happen to an op's payload (D38 truth table).
pub fn decide(s: &OpStanding) -> RetentionDecision {
    // Open-conflict pin always wins (conflict §10 hard rule). The 7-day conflict
    // horizon is not represented here at all — it never authorizes deletion.
    if s.open_conflict_member {
        return RetentionDecision::Keep;
    }
    // Not replay-safe yet ⇒ keep verbatim.
    if !s.below_watermark || !s.snapshot_covered_all_peers {
        return RetentionDecision::Keep;
    }
    // All five data-safety conditions + the excise gate ⇒ hard delete.
    if s.beyond_audit_horizon && s.beyond_time_travel_horizon && s.explicit_excise {
        return RetentionDecision::HardDelete;
    }
    // Replay-safe but still within audit/time-travel (or no excise) ⇒ archive,
    // never hard-delete. Compaction by itself can never destroy payload.
    RetentionDecision::Archive
}

/// Causal-stability watermark = min over known devices of their confirmed HLC
/// frontier (conflict §10). `None` if no devices are known.
pub fn causal_stability_watermark(frontiers: &BTreeMap<String, Hlc>) -> Option<Hlc> {
    frontiers.values().min().cloned()
}

/// A stale peer that is offline beyond the window is dropped from the known-device
/// set so it stops pinning the watermark low (D14 stale-peer exit). Returns the
/// frontier map with the stale device removed.
pub fn drop_stale_peer(
    mut frontiers: BTreeMap<String, Hlc>,
    stale_device: &str,
) -> BTreeMap<String, Hlc> {
    frontiers.remove(stale_device);
    frontiers
}

/// Whether read-time upcasting is required for an op envelope version. Within
/// Stage 1 only version 1 exists, so upcasting is the identity; the hook exists
/// so old envelopes never need a storage rewrite (D24 / D38).
pub fn needs_upcast(op_envelope_version: u32) -> bool {
    op_envelope_version < crate::OP_ENVELOPE_VERSION
}
