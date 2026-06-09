use anchor_core::canonical::{canonical_bytes, rev, CanonicalValue};
use anchor_core::diff3::{diff3_lines, join_lines, split_lines, Diff3Outcome};
use anchor_core::dto::Session;
use anchor_core::hash::hash_hex;
use anchor_core::hlc::Hlc;
use anchor_core::id::journal_note_id;
use anchor_core::model::{
    body_sub_rev, conflicts_canonical, Body, Life, Location, TargetKind, Vault,
};
use anchor_core::op::{Op, OpBuilder, OpKind, OpPayload, Register, SubFieldKey};
use anchor_core::order::key_between;
use anchor_core::replay::replay;

fn hlc(wall: u64, dev: &str) -> Hlc {
    Hlc::new(wall, 0, dev)
}

fn create_note(
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

fn create_block(
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

fn set_body(
    op_id: &str,
    hlc_v: Hlc,
    actor: &str,
    target: &str,
    text: &str,
    base_text: Option<&str>,
) -> Op {
    let body = Body::plain(text);
    let mut builder = OpBuilder::new(
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
    if let Some(base_text) = base_text {
        builder = builder.base_sub_rev(body_sub_rev(&Body::plain(base_text)));
    }
    builder.build()
}

fn tag_add(op_id: &str, hlc_v: Hlc, actor: &str, target: &str, tag: &str) -> Op {
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

fn life_set(op_id: &str, hlc_v: Hlc, actor: &str, target: &str, life: Life) -> Op {
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

fn order_independent(ops: &[Op]) -> Option<Vault> {
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

    if canonical_bytes(&v1.canonical()) != canonical_bytes(&v2.canonical()) {
        return None;
    }
    if canonical_bytes(&v1.canonical()) != canonical_bytes(&v3.canonical()) {
        return None;
    }
    if v1.snapshot_revision() != v2.snapshot_revision()
        || v1.snapshot_revision() != v3.snapshot_revision()
    {
        return None;
    }
    if canonical_bytes(&conflicts_canonical(&v1.conflicts))
        != canonical_bytes(&conflicts_canonical(&v2.conflicts))
    {
        return None;
    }
    if canonical_bytes(&conflicts_canonical(&v1.conflicts))
        != canonical_bytes(&conflicts_canonical(&v3.conflicts))
    {
        return None;
    }

    Some(v1)
}

pub fn anchor_cross_target_vector_status() -> u32 {
    if key_between(None, None).unwrap() != "V" {
        return 10;
    }
    if key_between(Some("V"), None).unwrap() != "k" {
        return 11;
    }
    if key_between(None, Some("V")).unwrap() != "F" {
        return 12;
    }
    if key_between(Some("V"), Some("k")).unwrap() != "c" {
        return 13;
    }

    let base = split_lines("l1\nl2\nl3");
    let a = split_lines("A1\nl2\nl3");
    let b = split_lines("l1\nl2\nB3");
    match diff3_lines(&base, &a, &b) {
        Diff3Outcome::Merged(m) if join_lines(&m) == "A1\nl2\nB3" => {}
        _ => return 20,
    }

    if hash_hex(b"null")
        != "03f88b99c3d8073bba8948d6e762aac443b265f606cc05abd4d172f03a4def6a"
    {
        return 30;
    }
    if rev(&CanonicalValue::str("anchor:cell:body"))
        != "6dad5f63c254be772e58682c56c48a1c8a8b6f355b1c101aed8c6b4a5e467390"
    {
        return 31;
    }
    if journal_note_id("vault_demo_0001", "2026-06-07")
        != "jnl_f99080f823e0815a8e1440955eb896d1c82d4ec371e19b2e0df89ad581f96b89"
    {
        return 32;
    }

    if Session::open_fixture().summary().snapshot_revision
        != "3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63"
    {
        return 40;
    }

    let conflict_ops = [
        create_block("c", 1, "mac", "u", "blk", None, "V"),
        set_body("b0", hlc(2, "mac"), "u", "blk", "l1\nl2\nl3", None),
        set_body(
            "ba",
            hlc(3, "mac"),
            "uA",
            "blk",
            "l1\nAA\nl3",
            Some("l1\nl2\nl3"),
        ),
        set_body(
            "bb",
            hlc(4, "iph"),
            "uB",
            "blk",
            "l1\nBB\nl3",
            Some("l1\nl2\nl3"),
        ),
    ];
    let Some(conflict_vault) = order_independent(&conflict_ops) else {
        return 49;
    };
    if conflict_vault.snapshot_revision()
        != "1552bb641e71fcd8dcfe51da8dcdf3e4dbaaa0cccc5d00a182ee0d1df417ea9f"
    {
        return 50;
    }

    let merged_ops = [
        create_note("cn", 1, "mac", "u", "n", None, "V"),
        create_block("cb", 2, "mac", "u", "blk", Some("n"), "V"),
        set_body("b0", hlc(3, "mac"), "u", "blk", "base", None),
        set_body("ba", hlc(4, "mac"), "uA", "blk", "base\nmac", Some("base")),
        set_body("bb", hlc(5, "iph"), "uB", "blk", "iph\nbase", Some("base")),
        tag_add("t", hlc(6, "iph"), "u", "n", "research"),
        life_set("ar", hlc(7, "mac"), "u", "n", Life::Archived),
    ];
    let Some(merged_vault) = order_independent(&merged_ops) else {
        return 59;
    };
    if merged_vault.snapshot_revision()
        != "97e065ff7f09edb2f44854b376705be3c4b8b747079ce2fbbfb10d0c3ec4b6f7"
    {
        return 60;
    }

    0
}
