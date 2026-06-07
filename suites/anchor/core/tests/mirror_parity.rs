//! F36 — mirror is a lossy post-commit derived export; its failure only affects
//! freshness; structured search matches ripgrep over the exported `.md`; open
//! body conflicts render as git-style fences.

mod common;
use common::*;

use anchor_core::mirror::{export_md, ripgrep_md, run_mirror_job, structured_search};
use anchor_core::replay::replay;

#[test]
fn structured_search_matches_ripgrep_over_md() {
    let ops = [
        create_note("ca", 1, "mac", "u", "A", None, "V"),
        set_body("ba", hlc(2, "mac"), "u", "A", "red apple pie", None),
        create_note("cb", 3, "mac", "u", "B", None, "k"),
        set_body("bb", hlc(4, "mac"), "u", "B", "green pear", None),
        create_note("cc", 5, "mac", "u", "C", None, "p"),
        set_body("bc", hlc(6, "mac"), "u", "C", "apple cider", None),
    ];
    let vault = replay(&ops);
    let md = export_md(&vault);
    assert_eq!(
        structured_search(&vault, "apple"),
        ripgrep_md(&md, "apple"),
        "structured search must match ripgrep over the mirror"
    );
    assert_eq!(structured_search(&vault, "apple"), vec!["A".to_string(), "C".to_string()]);
}

#[test]
fn mirror_failure_does_not_roll_back_op_log() {
    let ops = [
        create_note("c", 1, "mac", "u", "n", None, "V"),
        set_body("b", hlc(2, "mac"), "u", "n", "content", None),
    ];
    let vault = replay(&ops);
    let before = vault.snapshot_revision();

    let failed = run_mirror_job(&vault, true);
    assert!(!failed.status.fresh, "failed job is stale");
    assert!(failed.content.is_none());
    // The vault (op-log truth) is unaffected.
    assert_eq!(vault.snapshot_revision(), before);

    let ok = run_mirror_job(&vault, false);
    assert!(ok.status.fresh);
    assert!(ok.content.unwrap().contains("<!-- note:n -->"));
}

#[test]
fn open_body_conflict_renders_git_fence() {
    let ops = [
        create_block("c", 1, "mac", "u", "blk", None, "V"),
        set_body("b0", hlc(2, "mac"), "u", "blk", "l1\nl2\nl3", None),
        set_body("ba", hlc(3, "mac"), "uA", "blk", "l1\nAA\nl3", Some("l1\nl2\nl3")),
        set_body("bb", hlc(4, "iph"), "uB", "blk", "l1\nBB\nl3", Some("l1\nl2\nl3")),
    ];
    let vault = replay(&ops);
    let md = export_md(&vault);
    assert!(md.contains("<<<<<<< this device"), "conflict must render a fence");
    assert!(md.contains(">>>>>>> other device"));
}
