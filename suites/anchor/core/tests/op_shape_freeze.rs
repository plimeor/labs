//! D24 op-shape freeze.
//!
//! `op_envelope_canonical` serializes the FULL op envelope. This golden vector
//! pins its `rev` and proves every field is serialized: mutating any single
//! field changes the frozen bytes, i.e. any field omission/rename/re-type would
//! force an op-log migration. The op envelope is intentionally frozen before any
//! cloud sync record schema is derived from it (D24).

use anchor_core::hlc::Hlc;
use anchor_core::marks::Mark;
use anchor_core::model::TargetKind;
use anchor_core::op::{op_envelope_rev, Op, OpKind, OpPayload, Register, SubFieldKey};
use std::collections::{BTreeMap, BTreeSet};

/// A fully populated op: every optional field is `Some`, so each is observable.
fn golden_op() -> Op {
    let mut frontier = BTreeMap::new();
    frontier.insert("device_z".to_string(), Hlc::new(9, 1, "device_z"));
    let mut observed = BTreeSet::new();
    observed.insert("op_add_1".to_string());
    Op {
        op_id: "op_golden".to_string(),
        op_envelope_version: 1,
        hlc: Hlc::new(1_700, 2, "device_golden"),
        actor: "actor_golden".to_string(),
        seq: 7,
        target_id: "blk_golden".to_string(),
        target_kind: TargetKind::Block,
        register: Register::Content,
        sub_field_key: Some(SubFieldKey::Body),
        op_kind: OpKind::Set,
        base_register_rev: Some("brr".to_string()),
        new_register_rev: Some("nrr".to_string()),
        base_sub_rev: Some("bsr".to_string()),
        new_sub_rev: Some("nsr".to_string()),
        supersedes_rev: Some("sup".to_string()),
        dominates_frontier: Some(frontier),
        observed_adds: Some(observed),
        macro_op_id: Some("macro_golden".to_string()),
        macro_size: Some(3),
        diff_algo_version: Some(1),
        provenance: Some("prov".to_string()),
        approval_state: Some("approved".to_string()),
        payload: OpPayload::SetBody {
            text: "golden body".to_string(),
            marks: vec![Mark::new("bold", 0, 6, true)],
        },
    }
}

fn assert_field_observed(label: &str, base_rev: &str, mutate: impl FnOnce(&mut Op)) {
    let mut op = golden_op();
    mutate(&mut op);
    assert_ne!(
        op_envelope_rev(&op),
        base_rev,
        "field `{label}` is not serialized into the frozen op shape"
    );
}

#[test]
fn op_envelope_shape_is_frozen() {
    let golden_rev = op_envelope_rev(&golden_op());
    assert_eq!(golden_rev.len(), 64, "rev is a 64-hex BLAKE3 digest");
    // Frozen op-shape golden vector. A change here means the op envelope (the
    // on-disk shape) changed and would force an op-log migration.
    assert_eq!(
        golden_rev, "18582d532ebf171df3af8f801eb688e40ed78c82cb8c13de083b0a448e75dfe0",
        "op-shape golden vector drifted"
    );

    // Every envelope field must be serialized: mutating any one changes the rev.
    let g = &golden_rev;
    assert_field_observed("op_id", g, |o| o.op_id = "other".to_string());
    assert_field_observed("op_envelope_version", g, |o| o.op_envelope_version = 2);
    assert_field_observed("hlc.wall", g, |o| o.hlc.wall = 1);
    assert_field_observed("hlc.logical", g, |o| o.hlc.logical = 9);
    assert_field_observed("hlc.device", g, |o| o.hlc.device = "d2".to_string());
    assert_field_observed("actor", g, |o| o.actor = "a2".to_string());
    assert_field_observed("seq", g, |o| o.seq = 99);
    assert_field_observed("target_id", g, |o| o.target_id = "t2".to_string());
    assert_field_observed("target_kind", g, |o| o.target_kind = TargetKind::Note);
    assert_field_observed("register", g, |o| o.register = Register::Life);
    assert_field_observed("sub_field_key", g, |o| {
        o.sub_field_key = Some(SubFieldKey::TypeId)
    });
    assert_field_observed("op_kind", g, |o| o.op_kind = OpKind::Move);
    assert_field_observed("base_register_rev", g, |o| o.base_register_rev = None);
    assert_field_observed("new_register_rev", g, |o| o.new_register_rev = None);
    assert_field_observed("base_sub_rev", g, |o| o.base_sub_rev = None);
    assert_field_observed("new_sub_rev", g, |o| o.new_sub_rev = None);
    assert_field_observed("supersedes_rev", g, |o| o.supersedes_rev = None);
    assert_field_observed("dominates_frontier", g, |o| o.dominates_frontier = None);
    assert_field_observed("observed_adds", g, |o| o.observed_adds = None);
    assert_field_observed("macro_op_id", g, |o| o.macro_op_id = None);
    assert_field_observed("macro_size", g, |o| o.macro_size = Some(4));
    assert_field_observed("diff_algo_version", g, |o| o.diff_algo_version = None);
    assert_field_observed("provenance", g, |o| o.provenance = None);
    assert_field_observed("approval_state", g, |o| o.approval_state = None);
    assert_field_observed("payload", g, |o| {
        o.payload = OpPayload::TagAdd {
            tag: "t".to_string(),
        }
    });
}
