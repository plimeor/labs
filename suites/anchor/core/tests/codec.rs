//! Round-trip and strictness proofs for the op-segment codec (the op-log file
//! format): encode → decode → re-encode is byte-identical, every payload kind
//! and every D24 envelope field survives, and non-canonical bytes are rejected
//! (segments are content-addressed, so byte form IS identity).

use anchor_core::codec::{decode_segment, encode_segment, CodecError};
use anchor_core::dto::{EditorIntent, OpStamp, Session};
use anchor_core::hlc::Hlc;
use anchor_core::ingest::IngestState;
use anchor_core::marks::Mark;
use anchor_core::model::{Life, Location, TargetKind};
use anchor_core::op::{Op, OpBuilder, OpKind, OpPayload, Register, SubFieldKey};
use anchor_core::sync_port::{MemoryOpSyncPort, OpSyncPort, SegmentId};
use std::collections::{BTreeMap, BTreeSet};

fn stamp(n: u64) -> OpStamp {
    OpStamp {
        op_id: format!("op_codec_{n}"),
        hlc: Hlc::new(2_000 + n, 0, "device_codec"),
        actor: "user".to_string(),
        seq: n,
    }
}

/// A session whose log exercises every dispatchable payload kind plus macro
/// fields (split/merge) and `observed_adds` (tag remove), with non-ASCII and
/// escaped text on the string path.
fn rich_session() -> Session {
    let mut session = Session::open_fixture();
    let intents: Vec<EditorIntent> = vec![
        EditorIntent::InsertText {
            target_id: "blk_a".into(),
            at: 0,
            text: "héllo \"🎉\"\n\tworld — 中文 ".into(),
        },
        EditorIntent::ApplyMark {
            target_id: "blk_a".into(),
            start: 0,
            end: 5,
            kind: "bold".into(),
            expand: true,
        },
        EditorIntent::SetType {
            target_id: "blk_a".into(),
            type_id: Some("paragraph".into()),
        },
        EditorIntent::SetProp {
            target_id: "blk_a".into(),
            key: "lang".into(),
            value: Some("en".into()),
        },
        EditorIntent::AddTag {
            target_id: "blk_a".into(),
            tag: "inbox".into(),
        },
        EditorIntent::RemoveTag {
            target_id: "blk_a".into(),
            tag: "inbox".into(),
        },
        EditorIntent::Move {
            target_id: "blk_b".into(),
            parent: None,
            order: "x".into(),
        },
        EditorIntent::SetLife {
            target_id: "blk_b".into(),
            life: Life::Trashed,
        },
        EditorIntent::SplitBlock {
            target_id: "blk_a".into(),
            at: 3,
        },
        EditorIntent::MergeBackward {
            // The block the split above created (`blk_<op_id>`), merged back.
            target_id: "blk_op_codec_8".into(),
        },
    ];
    for (n, intent) in intents.into_iter().enumerate() {
        let result = session.dispatch(intent, stamp(n as u64));
        assert!(
            result.validation_error.is_none(),
            "rich fixture dispatch {n} failed: {:?}",
            result.validation_error
        );
    }
    session
}

#[test]
fn segment_round_trips_byte_identically() {
    let session = rich_session();
    let bytes = session.read_segment();

    let decoded = decode_segment(&bytes).expect("canonical segment decodes");
    assert_eq!(decoded.as_slice(), session.log(), "ops survive the round trip");

    let re_encoded = encode_segment(&decoded);
    assert_eq!(re_encoded, bytes, "re-encode is byte-identical");
    assert_eq!(
        SegmentId::of_bytes(&re_encoded),
        session.segment_id(),
        "content address is stable through the codec"
    );
}

#[test]
fn empty_segment_round_trips() {
    let bytes = encode_segment(&[]);
    assert_eq!(bytes, b"[]");
    assert_eq!(decode_segment(&bytes).unwrap(), Vec::<Op>::new());
}

/// Every optional envelope field populated + the payload kinds dispatch never
/// emits (renormalize / set_location / life_set-deleted) round-trip too.
#[test]
fn full_envelope_and_every_payload_kind_round_trip() {
    let mut frontier = BTreeMap::new();
    frontier.insert("device_z".to_string(), Hlc::new(9, 1, "device_z"));
    let mut observed = BTreeSet::new();
    observed.insert("op_add_1".to_string());
    let full = Op {
        op_id: "op_full".to_string(),
        op_envelope_version: 1,
        hlc: Hlc::new(1_700, 2, "device_full"),
        actor: "actor_full".to_string(),
        seq: 7,
        target_id: "blk_full".to_string(),
        target_kind: TargetKind::Block,
        register: Register::Content,
        sub_field_key: Some(SubFieldKey::Prop("a:b".to_string())),
        op_kind: OpKind::Set,
        base_register_rev: Some("brr".to_string()),
        new_register_rev: Some("nrr".to_string()),
        base_sub_rev: Some("bsr".to_string()),
        new_sub_rev: Some("nsr".to_string()),
        supersedes_rev: Some("sup".to_string()),
        dominates_frontier: Some(frontier),
        observed_adds: Some(observed),
        macro_op_id: Some("macro_full".to_string()),
        macro_size: Some(3),
        diff_algo_version: Some(1),
        provenance: Some("prov".to_string()),
        approval_state: Some("approved".to_string()),
        payload: OpPayload::SetBody {
            text: "full body".to_string(),
            marks: vec![Mark::new("bold", 0, 4, true)],
        },
    };
    let payloads = vec![
        OpPayload::Create {
            kind: TargetKind::Note,
            location: Location::new(None, "V"),
        },
        OpPayload::SetLocation {
            parent: Some("jnl_x".to_string()),
            order: "k".to_string(),
        },
        OpPayload::Renormalize {
            order: "m".to_string(),
            base_snapshot_revision: Some("rev_base".to_string()),
        },
        OpPayload::SetTypeId { value: None },
        OpPayload::LifeSet {
            life: Life::Deleted,
        },
    ];
    let mut ops = vec![full];
    for (n, payload) in payloads.into_iter().enumerate() {
        ops.push(
            OpBuilder::new(
                format!("op_kind_{n}"),
                Hlc::new(3_000 + n as u64, 0, "device_full"),
                "actor_full",
                "blk_full",
                TargetKind::Block,
                Register::Location,
                OpKind::Renormalize,
                payload,
            )
            .sub_field(SubFieldKey::Tag("t:x".to_string()))
            .build(),
        );
    }

    let bytes = encode_segment(&ops);
    let decoded = decode_segment(&bytes).expect("full envelope decodes");
    assert_eq!(decoded, ops);
}

#[test]
fn decoded_segment_replays_to_the_same_snapshot() {
    let session = rich_session();
    let decoded = decode_segment(&session.read_segment()).unwrap();
    assert_eq!(
        anchor_core::replay::replay(&decoded).snapshot_revision(),
        session.vault().snapshot_revision(),
        "decoded ops materialize the identical state"
    );
}

#[test]
fn sync_loop_round_trips_through_port_bytes() {
    let session = rich_session();
    let bytes = session.read_segment();
    let id = session.segment_id();

    let mut port = MemoryOpSyncPort::new();
    port.push_segment(&id, &bytes).unwrap();
    // Re-delivery is idempotent; then a fresh replica pulls and ingests.
    port.push_segment(&id, &bytes).unwrap();

    let listed = port.list_segments().unwrap();
    assert_eq!(listed, vec![id.clone()]);
    let pulled = port.pull_segment(&id).unwrap();
    let ops = decode_segment(&pulled).expect("pulled bytes decode");

    let mut replica = IngestState::new();
    assert_eq!(replica.ingest_segment(&ops), ops.len());
    assert_eq!(replica.ingest_segment(&ops), 0, "re-ingest is a no-op");
    assert_eq!(
        replica.materialize().snapshot_revision(),
        session.vault().snapshot_revision(),
        "replica converges to the origin snapshot from bytes alone"
    );
}

#[test]
fn non_canonical_bytes_are_rejected() {
    let bytes = rich_session().read_segment();
    let text = String::from_utf8(bytes.clone()).unwrap();

    // Whitespace: not part of the canonical form (strict parser rejects it).
    let spaced = text.replacen("\"actor\":", "\"actor\": ", 1);
    assert!(matches!(
        decode_segment(spaced.as_bytes()),
        Err(CodecError::Syntax { .. })
    ));

    // An unknown (but alphabetically ordered) extra field parses and decodes,
    // then fails the re-encode identity check.
    let extra = text.replacen("\"actor\":", "\"aaa\":1,\"actor\":", 1);
    assert_eq!(
        decode_segment(extra.as_bytes()),
        Err(CodecError::NonCanonical)
    );

    // Float syntax is unrepresentable in the canonical model.
    let float = text.replacen("\"seq\":0", "\"seq\":0.5", 1);
    assert!(matches!(
        decode_segment(float.as_bytes()),
        Err(CodecError::Syntax { .. })
    ));

    // Trailing bytes after the root value.
    let mut trailing = bytes.clone();
    trailing.push(b'\n');
    assert!(matches!(
        decode_segment(&trailing),
        Err(CodecError::Syntax { .. })
    ));

    // Not UTF-8 at all.
    assert_eq!(decode_segment(&[0xff, 0xfe]), Err(CodecError::Utf8));

    // Root must be an array.
    assert_eq!(decode_segment(b"{}"), Err(CodecError::Shape));
}

#[test]
fn unsupported_envelope_version_is_rejected() {
    let session = Session::open_fixture();
    let text = String::from_utf8(session.read_segment()).unwrap();
    let bumped = text.replace("\"op_envelope_version\":1", "\"op_envelope_version\":2");
    assert_eq!(
        decode_segment(bumped.as_bytes()),
        Err(CodecError::UnsupportedVersion {
            index: 0,
            version: 2
        })
    );
}

#[test]
fn missing_field_is_a_typed_envelope_error() {
    let session = Session::open_fixture();
    let text = String::from_utf8(session.read_segment()).unwrap();
    let dropped = text.replace("\"provenance\":null,", "");
    assert_eq!(
        decode_segment(dropped.as_bytes()),
        Err(CodecError::Envelope {
            index: 0,
            field: "provenance"
        })
    );
}

#[test]
fn over_deep_nesting_is_rejected_not_a_stack_overflow() {
    let mut evil = String::new();
    for _ in 0..10_000 {
        evil.push('[');
    }
    assert!(matches!(
        decode_segment(evil.as_bytes()),
        Err(CodecError::Syntax { .. })
    ));
}
