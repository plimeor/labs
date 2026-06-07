//! F43 — four-horizon retention: hard-delete needs five data-safety conditions
//! plus an explicit excise gate; everything short of that can only archive. The
//! conflict horizon never authorizes deletion; restore is a forward op.

mod common;
use common::*;

use anchor_core::hlc::Hlc;
use anchor_core::model::Life;
use anchor_core::replay::replay;
use anchor_core::retention::{
    causal_stability_watermark, decide, drop_stale_peer, needs_upcast, OpStanding, RetentionDecision,
};
use std::collections::BTreeMap;

fn all_safe() -> OpStanding {
    OpStanding {
        below_watermark: true,
        open_conflict_member: false,
        snapshot_covered_all_peers: true,
        beyond_audit_horizon: true,
        beyond_time_travel_horizon: true,
        explicit_excise: true,
    }
}

#[test]
fn open_conflict_pin_is_never_deleted() {
    let mut s = all_safe();
    s.open_conflict_member = true;
    assert_eq!(decide(&s), RetentionDecision::Keep);
}

#[test]
fn within_time_travel_horizon_archives_not_deletes() {
    let mut s = all_safe();
    s.beyond_time_travel_horizon = false; // still inside time-travel window
    assert_eq!(decide(&s), RetentionDecision::Archive);
}

#[test]
fn hard_delete_requires_all_conditions_plus_excise() {
    assert_eq!(decide(&all_safe()), RetentionDecision::HardDelete);
    let mut no_excise = all_safe();
    no_excise.explicit_excise = false;
    assert_eq!(decide(&no_excise), RetentionDecision::Archive, "no excise ⇒ archive only");
}

#[test]
fn not_replay_safe_keeps_verbatim() {
    let mut s = all_safe();
    s.below_watermark = false;
    assert_eq!(decide(&s), RetentionDecision::Keep);
}

#[test]
fn watermark_is_min_and_stale_peer_can_be_dropped() {
    let mut frontiers = BTreeMap::new();
    frontiers.insert("mac".to_string(), Hlc::new(100, 0, "mac"));
    frontiers.insert("iph".to_string(), Hlc::new(50, 0, "iph"));
    frontiers.insert("ipad_offline".to_string(), Hlc::new(5, 0, "ipad_offline"));
    assert_eq!(causal_stability_watermark(&frontiers).unwrap().wall, 5);

    // Dropping the stale offline peer raises the watermark.
    let pruned = drop_stale_peer(frontiers, "ipad_offline");
    assert_eq!(causal_stability_watermark(&pruned).unwrap().wall, 50);
}

#[test]
fn restore_is_a_forward_op_not_a_log_rewrite() {
    let base = vec![
        create_note("c", 1, "mac", "u", "n", None, "V"),
        life_set("t", hlc(2, "mac"), "u", "n", Life::Trashed),
    ];
    let mut log = base.clone();
    log.push(restore("r", hlc(3, "mac"), "u", "n"));
    // The original ops are an unchanged prefix; the log only grew.
    assert_eq!(&log[..base.len()], &base[..]);
    assert_eq!(replay(&log).nodes["n"].life, Life::Active);
}

#[test]
fn upcast_hook_exists() {
    assert!(needs_upcast(0));
    assert!(!needs_upcast(anchor_core::OP_ENVELOPE_VERSION));
}
