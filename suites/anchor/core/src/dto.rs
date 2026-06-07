//! The minimal DTO / call surface for the Apple binding spike (owned by Codex).
//!
//! These are the structured records the binding marshals (UniFFI primary, C ABI
//! bytes fast-path fallback — D01). They are intentionally flat versioned
//! records/enums (no deep recursion/generics) so they bind cleanly. The full
//! `anchor-editor-core` surface is larger; this is the Stage-1 subset sufficient
//! to prove `open_fixture_vault → dispatch(EditorIntent) → TransactionResult`
//! round-trips and to feed a `read_segment(SegmentId) -> bytes` benchmark.

use crate::canonical::{canonical_bytes, CanonicalValue};
use crate::hash;
use crate::hlc::Hlc;
use crate::id::journal_note_id;
use crate::marks::Mark;
use crate::model::{body_sub_rev, scalar_sub_rev, BodyState, Life, Location, TargetKind, Vault};
use crate::op::{Op, OpBuilder, OpKind, OpPayload, Register, SubFieldKey};
use crate::replay::replay;
use crate::sync_port::SegmentId;
use alloc::collections::BTreeMap;
use alloc::format;
use alloc::string::{String, ToString};
use alloc::vec::Vec;

/// Platform-supplied op stamp (clock + entropy live outside the core).
#[derive(Clone, Debug)]
pub struct OpStamp {
    pub op_id: String,
    pub hlc: Hlc,
    pub actor: String,
    pub seq: u64,
}

/// Portable editor selection hint (transient; never persisted).
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Selection {
    Text {
        block_id: String,
        start: u32,
        end: u32,
    },
    Block {
        block_id: String,
    },
    /// Selection local to an embedded editor (e.g. a code block payload).
    Embedded {
        block_id: String,
        start: u32,
        end: u32,
    },
}

/// Editor intent (the Stage-1 subset of the `anchor-editor-core` surface).
#[derive(Clone, Debug)]
pub enum EditorIntent {
    InsertText {
        target_id: String,
        at: u32,
        text: String,
    },
    SetType {
        target_id: String,
        type_id: Option<String>,
    },
    SetProp {
        target_id: String,
        key: String,
        value: Option<String>,
    },
    AddTag {
        target_id: String,
        tag: String,
    },
    RemoveTag {
        target_id: String,
        tag: String,
    },
    ApplyMark {
        target_id: String,
        start: u32,
        end: u32,
        kind: String,
        expand: bool,
    },
    Move {
        target_id: String,
        parent: Option<String>,
        order: String,
    },
    SetLife {
        target_id: String,
        life: Life,
    },
    /// Structural intents whose dispatch is deferred to CP-2.
    SplitBlock {
        target_id: String,
        at: u32,
    },
    MergeBackward {
        target_id: String,
    },
}

/// The result handed back to the platform adapter after a dispatch.
#[derive(Clone, Debug)]
pub struct TransactionResult {
    pub changed_ids: Vec<String>,
    pub validation_error: Option<ValidationError>,
    pub new_revisions: BTreeMap<String, String>,
    pub selection_hint: Option<Selection>,
    pub conflicts: Vec<crate::model::ConflictRecord>,
    pub projection_fresh: bool,
    pub mirror_fresh: bool,
}

/// Typed validation failures produced by core dispatch.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ValidationError {
    InvalidUtf16Offset,
    DirectActiveToDeleted,
    StructuralDispatchDeferred,
}

impl ValidationError {
    pub fn code(&self) -> &'static str {
        match self {
            ValidationError::InvalidUtf16Offset => "invalid_utf16_offset",
            ValidationError::DirectActiveToDeleted => "direct_active_to_deleted",
            ValidationError::StructuralDispatchDeferred => "structural_dispatch_deferred",
        }
    }

    pub fn message(&self) -> &'static str {
        match self {
            ValidationError::InvalidUtf16Offset => {
                "text edit produced invalid UTF-16; check Apple UTF-16 offset boundary"
            }
            ValidationError::DirectActiveToDeleted => {
                "direct active→deleted rejected; trash first (D10/D20)"
            }
            ValidationError::StructuralDispatchDeferred => {
                "structural split/merge dispatch deferred to CP-2"
            }
        }
    }
}

/// Summary returned by `open_fixture_vault`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FixtureSummary {
    pub vault_id: String,
    pub note_count: usize,
    pub snapshot_revision: String,
    pub note_ids: Vec<String>,
}

/// An in-process session: the op-log plus its materialized vault. This is the
/// object the binding wraps.
pub struct Session {
    log: Vec<Op>,
    vault: Vault,
    vault_id: String,
}

impl Session {
    /// Build a deterministic fixture vault (a journal note + two body blocks).
    pub fn open_fixture() -> Session {
        let vault_id = "vault_demo_0001".to_string();
        let date = "2026-06-07";
        let jid = journal_note_id(&vault_id, date);
        let block_a = "blk_a".to_string();
        let block_b = "blk_b".to_string();

        let dev = "device_mac";
        let actor = "user";
        let body_a = "Morning note.";
        let body_b = "Evening note.";

        let log = alloc::vec![
            OpBuilder::new(
                "op_create_note",
                Hlc::new(1_000, 0, dev),
                actor,
                jid.clone(),
                TargetKind::Note,
                Register::Location,
                OpKind::Create,
                OpPayload::Create {
                    kind: TargetKind::Note,
                    location: Location::new(None, "V"),
                },
            )
            .seq(1)
            .build(),
            OpBuilder::new(
                "op_create_a",
                Hlc::new(1_001, 0, dev),
                actor,
                block_a.clone(),
                TargetKind::Block,
                Register::Location,
                OpKind::Create,
                OpPayload::Create {
                    kind: TargetKind::Block,
                    location: Location::new(Some(jid.clone()), "V"),
                },
            )
            .seq(2)
            .build(),
            OpBuilder::new(
                "op_body_a",
                Hlc::new(1_002, 0, dev),
                actor,
                block_a.clone(),
                TargetKind::Block,
                Register::Content,
                OpKind::Set,
                OpPayload::SetBody {
                    text: body_a.to_string(),
                    marks: Vec::new(),
                },
            )
            .seq(3)
            .sub_field(SubFieldKey::Body)
            .new_sub_rev(body_sub_rev(&crate::model::Body::plain(body_a)))
            .build(),
            OpBuilder::new(
                "op_create_b",
                Hlc::new(1_003, 0, dev),
                actor,
                block_b.clone(),
                TargetKind::Block,
                Register::Location,
                OpKind::Create,
                OpPayload::Create {
                    kind: TargetKind::Block,
                    location: Location::new(Some(jid.clone()), "k"),
                },
            )
            .seq(4)
            .build(),
            OpBuilder::new(
                "op_body_b",
                Hlc::new(1_004, 0, dev),
                actor,
                block_b.clone(),
                TargetKind::Block,
                Register::Content,
                OpKind::Set,
                OpPayload::SetBody {
                    text: body_b.to_string(),
                    marks: Vec::new(),
                },
            )
            .seq(5)
            .sub_field(SubFieldKey::Body)
            .new_sub_rev(body_sub_rev(&crate::model::Body::plain(body_b)))
            .build(),
        ];

        let vault = replay(&log);
        Session {
            log,
            vault,
            vault_id,
        }
    }

    pub fn summary(&self) -> FixtureSummary {
        let note_ids: Vec<String> = self
            .vault
            .nodes
            .values()
            .filter(|n| n.kind == TargetKind::Note)
            .map(|n| n.id.clone())
            .collect();
        FixtureSummary {
            vault_id: self.vault_id.clone(),
            note_count: note_ids.len(),
            snapshot_revision: self.vault.snapshot_revision(),
            note_ids,
        }
    }

    pub fn vault(&self) -> &Vault {
        &self.vault
    }

    pub fn log(&self) -> &[Op] {
        &self.log
    }

    /// Canonical bytes of the whole op-log: the `read_segment` byte surface for
    /// the binding transfer benchmark.
    pub fn read_segment(&self) -> Vec<u8> {
        segment_bytes(&self.log)
    }

    pub fn segment_id(&self) -> SegmentId {
        SegmentId::of_bytes(&self.read_segment())
    }

    /// Apply an editor intent. Mirrors the real dispatch shape: intent → op →
    /// append → replay → result.
    pub fn dispatch(&mut self, intent: EditorIntent, stamp: OpStamp) -> TransactionResult {
        let selection_hint = self.selection_hint(&intent);
        let op = match self.build_op(&intent, &stamp) {
            Ok(op) => op,
            Err(e) => return self.error_result(e),
        };
        let target = op.target_id.clone();
        self.log.push(op);
        self.vault = replay(&self.log);
        let mut new_revisions = BTreeMap::new();
        if let Some(rev) = self.vault.node_snapshot_revision(&target) {
            new_revisions.insert(target.clone(), rev);
        }
        let conflicts = self
            .vault
            .conflicts
            .iter()
            .filter(|c| c.target_id == target)
            .cloned()
            .collect();
        TransactionResult {
            changed_ids: alloc::vec![target],
            validation_error: None,
            new_revisions,
            selection_hint,
            conflicts,
            projection_fresh: true,
            mirror_fresh: true,
        }
    }

    /// Derive a transient post-dispatch selection hint from the intent. For a
    /// text insertion the caret collapses just after the inserted run.
    fn selection_hint(&self, intent: &EditorIntent) -> Option<Selection> {
        match intent {
            EditorIntent::InsertText {
                target_id,
                at,
                text,
            } => {
                let caret = at + text.encode_utf16().count() as u32;
                Some(Selection::Text {
                    block_id: target_id.clone(),
                    start: caret,
                    end: caret,
                })
            }
            EditorIntent::ApplyMark {
                target_id,
                start,
                end,
                ..
            } => Some(Selection::Text {
                block_id: target_id.clone(),
                start: *start,
                end: *end,
            }),
            _ => None,
        }
    }

    fn error_result(&self, error: ValidationError) -> TransactionResult {
        TransactionResult {
            changed_ids: Vec::new(),
            validation_error: Some(error),
            new_revisions: BTreeMap::new(),
            selection_hint: None,
            conflicts: Vec::new(),
            projection_fresh: true,
            mirror_fresh: true,
        }
    }

    fn current_body(&self, target_id: &str) -> Option<crate::model::Body> {
        self.vault.nodes.get(target_id).and_then(|n| {
            n.content.body.as_ref().map(|b| match b {
                BodyState::Single(body) => body.clone(),
                BodyState::MultiValue { winner, .. } => winner.clone(),
            })
        })
    }

    fn build_op(&self, intent: &EditorIntent, stamp: &OpStamp) -> Result<Op, ValidationError> {
        let kind_of = |id: &str| {
            self.vault
                .nodes
                .get(id)
                .map(|n| n.kind)
                .unwrap_or(TargetKind::Block)
        };
        match intent {
            EditorIntent::InsertText {
                target_id,
                at,
                text,
            } => {
                let current = self
                    .current_body(target_id)
                    .unwrap_or(crate::model::Body::plain(""));
                let mut units: Vec<u16> = current.text.encode_utf16().collect();
                let at = (*at as usize).min(units.len());
                let ins: Vec<u16> = text.encode_utf16().collect();
                units.splice(at..at, ins.iter().cloned());
                let new_text =
                    String::from_utf16(&units).map_err(|_| ValidationError::InvalidUtf16Offset)?;
                let splice = crate::marks::Splice {
                    at: at as u32,
                    old_len: 0,
                    new_len: ins.len() as u32,
                };
                let new_marks = crate::marks::reclamp(&current.marks, &[splice]);
                let new_body = crate::model::Body {
                    text: new_text,
                    marks: new_marks,
                };
                Ok(OpBuilder::new(
                    stamp.op_id.clone(),
                    stamp.hlc.clone(),
                    stamp.actor.clone(),
                    target_id.clone(),
                    kind_of(target_id),
                    Register::Content,
                    OpKind::Set,
                    OpPayload::SetBody {
                        text: new_body.text.clone(),
                        marks: new_body.marks.clone(),
                    },
                )
                .seq(stamp.seq)
                .sub_field(SubFieldKey::Body)
                .base_sub_rev(body_sub_rev(&current))
                .new_sub_rev(body_sub_rev(&new_body))
                .build())
            }
            EditorIntent::ApplyMark {
                target_id,
                start,
                end,
                kind,
                expand,
            } => {
                let mut current = self
                    .current_body(target_id)
                    .unwrap_or(crate::model::Body::plain(""));
                let base = body_sub_rev(&current);
                current
                    .marks
                    .push(Mark::new(kind.clone(), *start, *end, *expand));
                Ok(OpBuilder::new(
                    stamp.op_id.clone(),
                    stamp.hlc.clone(),
                    stamp.actor.clone(),
                    target_id.clone(),
                    kind_of(target_id),
                    Register::Content,
                    OpKind::Set,
                    OpPayload::SetBody {
                        text: current.text.clone(),
                        marks: current.marks.clone(),
                    },
                )
                .seq(stamp.seq)
                .sub_field(SubFieldKey::Body)
                .base_sub_rev(base)
                .new_sub_rev(body_sub_rev(&current))
                .build())
            }
            EditorIntent::SetType { target_id, type_id } => {
                let current = self
                    .vault
                    .nodes
                    .get(target_id)
                    .and_then(|n| n.content.type_id.clone());
                Ok(OpBuilder::new(
                    stamp.op_id.clone(),
                    stamp.hlc.clone(),
                    stamp.actor.clone(),
                    target_id.clone(),
                    kind_of(target_id),
                    Register::Content,
                    OpKind::Set,
                    OpPayload::SetTypeId {
                        value: type_id.clone(),
                    },
                )
                .seq(stamp.seq)
                .sub_field(SubFieldKey::TypeId)
                .base_sub_rev(scalar_sub_rev(current.as_deref()))
                .new_sub_rev(scalar_sub_rev(type_id.as_deref()))
                .build())
            }
            EditorIntent::SetProp {
                target_id,
                key,
                value,
            } => {
                let current = self
                    .vault
                    .nodes
                    .get(target_id)
                    .and_then(|n| n.content.props.get(key).cloned());
                Ok(OpBuilder::new(
                    stamp.op_id.clone(),
                    stamp.hlc.clone(),
                    stamp.actor.clone(),
                    target_id.clone(),
                    kind_of(target_id),
                    Register::Content,
                    OpKind::Set,
                    OpPayload::SetProp {
                        key: key.clone(),
                        value: value.clone(),
                    },
                )
                .seq(stamp.seq)
                .sub_field(SubFieldKey::Prop(key.clone()))
                .base_sub_rev(scalar_sub_rev(current.as_deref()))
                .new_sub_rev(scalar_sub_rev(value.as_deref()))
                .build())
            }
            EditorIntent::AddTag { target_id, tag } => Ok(OpBuilder::new(
                stamp.op_id.clone(),
                stamp.hlc.clone(),
                stamp.actor.clone(),
                target_id.clone(),
                kind_of(target_id),
                Register::Content,
                OpKind::TagAdd,
                OpPayload::TagAdd { tag: tag.clone() },
            )
            .seq(stamp.seq)
            .sub_field(SubFieldKey::Tag(tag.clone()))
            .build()),
            EditorIntent::RemoveTag { target_id, tag } => {
                // observed adds = all add op_ids for this tag currently in the log.
                let mut observed = alloc::collections::BTreeSet::new();
                for op in &self.log {
                    if op.target_id == *target_id {
                        if let OpPayload::TagAdd { tag: t } = &op.payload {
                            if t == tag {
                                observed.insert(op.op_id.clone());
                            }
                        }
                    }
                }
                Ok(OpBuilder::new(
                    stamp.op_id.clone(),
                    stamp.hlc.clone(),
                    stamp.actor.clone(),
                    target_id.clone(),
                    kind_of(target_id),
                    Register::Content,
                    OpKind::TagRemove,
                    OpPayload::TagRemove { tag: tag.clone() },
                )
                .seq(stamp.seq)
                .sub_field(SubFieldKey::Tag(tag.clone()))
                .observed_adds(observed)
                .build())
            }
            EditorIntent::Move {
                target_id,
                parent,
                order,
            } => Ok(OpBuilder::new(
                stamp.op_id.clone(),
                stamp.hlc.clone(),
                stamp.actor.clone(),
                target_id.clone(),
                kind_of(target_id),
                Register::Location,
                OpKind::Move,
                OpPayload::SetLocation {
                    parent: parent.clone(),
                    order: order.clone(),
                },
            )
            .seq(stamp.seq)
            .build()),
            EditorIntent::SetLife { target_id, life } => {
                // Dispatch rejects a direct active→deleted (D10/D20): terminal
                // delete is only reachable from trashed.
                if *life == Life::Deleted {
                    let current = self.vault.nodes.get(target_id).map(|n| n.life);
                    if current != Some(Life::Trashed) {
                        return Err(ValidationError::DirectActiveToDeleted);
                    }
                }
                let op_kind = if *life == Life::Active {
                    OpKind::Restore
                } else {
                    OpKind::LifeSet
                };
                Ok(OpBuilder::new(
                    stamp.op_id.clone(),
                    stamp.hlc.clone(),
                    stamp.actor.clone(),
                    target_id.clone(),
                    kind_of(target_id),
                    Register::Life,
                    op_kind,
                    OpPayload::LifeSet { life: *life },
                )
                .seq(stamp.seq)
                .build())
            }
            EditorIntent::SplitBlock { .. } | EditorIntent::MergeBackward { .. } => {
                Err(ValidationError::StructuralDispatchDeferred)
            }
        }
    }
}

/// Open the fixture vault and return its summary (the binding entry point).
pub fn open_fixture_vault() -> FixtureSummary {
    Session::open_fixture().summary()
}

/// Canonical bytes for one op (representative segment encoding for the byte
/// transfer surface; not required to round-trip in Stage 1).
fn op_canonical(op: &Op) -> CanonicalValue {
    CanonicalValue::object([
        ("op_id", CanonicalValue::str(op.op_id.clone())),
        ("v", CanonicalValue::UInt(op.op_envelope_version as u64)),
        (
            "hlc",
            CanonicalValue::object([
                ("wall", CanonicalValue::UInt(op.hlc.wall)),
                ("logical", CanonicalValue::UInt(op.hlc.logical as u64)),
                ("device", CanonicalValue::str(op.hlc.device.clone())),
            ]),
        ),
        ("actor", CanonicalValue::str(op.actor.clone())),
        ("seq", CanonicalValue::UInt(op.seq)),
        ("target_id", CanonicalValue::str(op.target_id.clone())),
        ("register", CanonicalValue::str(op.register.as_str())),
    ])
}

/// Canonical bytes of an op segment.
pub fn segment_bytes(ops: &[Op]) -> Vec<u8> {
    let items = ops.iter().map(op_canonical).collect::<Vec<_>>();
    canonical_bytes(&CanonicalValue::array(items))
}

/// Deterministic fixture blob of `size` bytes for the 1/4/16/64MB binding
/// transfer benchmark (so Codex measures bytes→Data without a real vault).
pub fn fixture_blob(size: usize) -> Vec<u8> {
    let mut out = Vec::with_capacity(size);
    let seed = b"anchor-fixture-blob";
    for i in 0..size {
        out.push(seed[i % seed.len()] ^ (i as u8));
    }
    out
}

/// Blob content id.
pub fn blob_id(bytes: &[u8]) -> String {
    format!("blob_{}", hash::hash_hex(bytes))
}
