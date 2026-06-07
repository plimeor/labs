//! Replay is a pure fold over T: arrival order never changes the materialized
//! state or snapshot_revision (the pervasive conflict-model assertion), at small
//! and at smoke scale. Merge results are independent of any per-device watermark
//! because replay takes only the op *set* as input.

mod common;
use common::*;

use anchor_core::canonical::canonical_bytes;
use anchor_core::model::Life;
use anchor_core::replay::replay;

#[test]
fn multi_feature_vault_is_order_independent() {
    let ops = [
        create_note("cn", 1, "mac", "u", "note", None, "V"),
        create_block("cb", 2, "mac", "u", "blk", Some("note"), "V"),
        set_body("b0", hlc(3, "mac"), "u", "blk", "base", None),
        set_body("ba", hlc(4, "mac"), "uA", "blk", "base\nmac", Some("base")),
        set_body("bb", hlc(5, "iph"), "uB", "blk", "iph\nbase", Some("base")),
        set_type("ty", hlc(6, "mac"), "u", "note", Some("book"), None),
        set_prop("pr", hlc(7, "mac"), "u", "note", "status", Some("draft"), None),
        tag_add("tg", hlc(8, "iph"), "u", "note", "research"),
        life_set("ar", hlc(9, "mac"), "u", "note", Life::Archived),
    ];
    // Reverse + rotate replays must all match byte-for-byte.
    assert_order_independent(&ops);
}

/// Deterministically generate a medium op set across many nodes.
fn generate(n: usize) -> Vec<anchor_core::op::Op> {
    let mut ops = Vec::new();
    let devices = ["mac", "iph", "ipad"];
    for i in 0..n {
        let id = format!("blk{i:04}");
        let dev = devices[i % devices.len()];
        let order = anchor_core::order::key_between(None, None).unwrap();
        ops.push(create_block(
            &format!("c{i}"),
            (i as u64) * 10 + 1,
            dev,
            "u",
            &id,
            None,
            &order,
        ));
        ops.push(set_body(
            &format!("b{i}"),
            hlc((i as u64) * 10 + 2, dev),
            "u",
            &id,
            &format!("body of {i}"),
            None,
        ));
        if i % 3 == 0 {
            ops.push(tag_add(
                &format!("t{i}"),
                hlc((i as u64) * 10 + 3, dev),
                "u",
                &id,
                "kind",
            ));
        }
    }
    ops
}

#[test]
fn scale_smoke_order_independent() {
    // ~1400 ops across 500 nodes; reverse + rotate must converge byte-identically.
    let ops = generate(500);
    let v1 = replay(&ops);

    let mut shuffled = ops.clone();
    shuffled.reverse();
    let v2 = replay(&shuffled);

    let mut rotated = ops.clone();
    let mid = rotated.len() / 2;
    rotated.rotate_left(mid);
    let v3 = replay(&rotated);

    assert_eq!(canonical_bytes(&v1.canonical()), canonical_bytes(&v2.canonical()));
    assert_eq!(canonical_bytes(&v1.canonical()), canonical_bytes(&v3.canonical()));
    assert_eq!(v1.snapshot_revision(), v2.snapshot_revision());
    assert_eq!(v1.snapshot_revision(), v3.snapshot_revision());
    assert_eq!(v1.nodes.len(), 500);
}

#[test]
fn duplicate_redelivery_is_a_no_op() {
    let ops = generate(50);
    assert_redelivery_idempotent(&ops);
}
