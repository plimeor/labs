//! F33 / F32 — per-cell `base_sub_rev` stale guard; different cells stay
//! independently mergeable (no manufactured conflict).

mod common;
use common::*;

use anchor_core::model::{body_sub_rev, scalar_sub_rev, Body};
use anchor_core::op::SubFieldKey;
use anchor_core::replay::replay;
use anchor_core::stale::{dispatch_local, would_conflict, DispatchOutcome};

#[test]
fn stale_base_on_same_cell_conflicts() {
    let ops = [
        create_block("c", 1, "mac", "u", "blk", None, "V"),
        set_body("b", hlc(2, "mac"), "u", "blk", "current", None),
    ];
    let vault = replay(&ops);

    // A local write that based on the up-to-date value applies.
    let fresh = dispatch_local(
        &vault,
        "blk",
        &SubFieldKey::Body,
        Some(&body_sub_rev(&Body::plain("current"))),
    );
    assert_eq!(fresh, DispatchOutcome::Applied);

    // A local write that based on a stale value conflicts (CLI exit 3).
    let stale = dispatch_local(
        &vault,
        "blk",
        &SubFieldKey::Body,
        Some(&body_sub_rev(&Body::plain("stale"))),
    );
    assert_eq!(stale, DispatchOutcome::Conflict);
}

#[test]
fn different_cells_do_not_clash() {
    // F32: a body write and a type write are different cells; neither stale-guards
    // the other.
    let ops = [
        create_note("c", 1, "mac", "u", "n", None, "V"),
        set_type("t", hlc(2, "mac"), "u", "n", Some("book"), None),
    ];
    let vault = replay(&ops);

    // Writing the body cell with no prior body base never conflicts with type.
    let body = dispatch_local(&vault, "n", &SubFieldKey::Body, None);
    assert_eq!(body, DispatchOutcome::Applied);

    // Writing the type cell from the current value applies.
    let ty = dispatch_local(
        &vault,
        "n",
        &SubFieldKey::TypeId,
        Some(&scalar_sub_rev(Some("book"))),
    );
    assert_eq!(ty, DispatchOutcome::Applied);

    // A prop cell that never existed: editing from a base flags it.
    assert!(would_conflict(None, Some("anything")));
    // Fresh create (no base) never conflicts.
    assert!(!would_conflict(None, None));
}
