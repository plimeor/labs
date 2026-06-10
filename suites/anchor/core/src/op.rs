//! The op envelope. Every D24 field is reserved up front (NON-NEGOTIABLE):
//! omitting any one would force a later op-log migration. Fields the Stage 1
//! merge does not yet consume are still carried, so the on-disk shape is frozen.

use crate::canonical::CanonicalValue;
use crate::hlc::Hlc;
use crate::marks::Mark;
use crate::model::{Life, Location, TargetKind};
use alloc::collections::{BTreeMap, BTreeSet};
use alloc::string::String;
use alloc::vec::Vec;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Register {
    Location,
    Content,
    Life,
}

impl Register {
    pub fn as_str(self) -> &'static str {
        match self {
            Register::Location => "location",
            Register::Content => "content",
            Register::Life => "life",
        }
    }
}

/// Named `content` sub-field cell (conflict §3.2). `location`/`life` carry `None`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SubFieldKey {
    Body,
    TypeId,
    Prop(String),
    Tag(String),
}

impl SubFieldKey {
    pub fn as_string(&self) -> String {
        match self {
            SubFieldKey::Body => String::from("body"),
            SubFieldKey::TypeId => String::from("type_id"),
            SubFieldKey::Prop(k) => {
                let mut s = String::from("props:");
                s.push_str(k);
                s
            }
            SubFieldKey::Tag(t) => {
                let mut s = String::from("tags:");
                s.push_str(t);
                s
            }
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OpKind {
    Set,
    Move,
    TagAdd,
    TagRemove,
    LifeSet,
    Restore,
    Create,
    Split,
    Merge,
    Renormalize,
}

impl OpKind {
    pub fn as_str(self) -> &'static str {
        match self {
            OpKind::Set => "set",
            OpKind::Move => "move",
            OpKind::TagAdd => "tag_add",
            OpKind::TagRemove => "tag_remove",
            OpKind::LifeSet => "life_set",
            OpKind::Restore => "restore",
            OpKind::Create => "create",
            OpKind::Split => "split",
            OpKind::Merge => "merge",
            OpKind::Renormalize => "renormalize",
        }
    }
}

/// Payload carries the actual values. The merge engine reads the payload for the
/// op's register/sub-field.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum OpPayload {
    /// Create a node; `location` seeds its initial position.
    Create {
        kind: TargetKind,
        location: Location,
    },
    SetLocation {
        parent: Option<String>,
        order: String,
    },
    /// Renormalize carries the rebalanced order plus the base snapshot it was
    /// computed against (conflict §6.4 rule 3).
    Renormalize {
        order: String,
        base_snapshot_revision: Option<String>,
    },
    SetBody {
        text: String,
        marks: Vec<Mark>,
    },
    SetTypeId {
        value: Option<String>,
    },
    SetProp {
        key: String,
        value: Option<String>,
    },
    TagAdd {
        tag: String,
    },
    TagRemove {
        tag: String,
    },
    LifeSet {
        life: Life,
    },
}

/// One operation in the append-only log.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Op {
    // Identity & ordering.
    pub op_id: String,
    pub op_envelope_version: u32,
    pub hlc: Hlc,
    pub actor: String,
    pub seq: u64,

    // Target & register.
    pub target_id: String,
    pub target_kind: TargetKind,
    pub register: Register,
    pub sub_field_key: Option<SubFieldKey>,
    pub op_kind: OpKind,

    // Revisions / guards.
    pub base_register_rev: Option<String>,
    pub new_register_rev: Option<String>,
    pub base_sub_rev: Option<String>,
    pub new_sub_rev: Option<String>,
    pub supersedes_rev: Option<String>,

    // Merge-mechanism fields.
    pub dominates_frontier: Option<BTreeMap<String, Hlc>>,
    pub observed_adds: Option<BTreeSet<String>>,
    /// Groups the ops of one editor macro (split / merge / undo). All ops sharing
    /// a `macro_op_id` are applied all-or-nothing by replay (D29): a partially
    /// delivered macro never materializes a half-applied structural edit.
    pub macro_op_id: Option<String>,
    /// Total op count of this op's macro group. Replay drops a macro group whose
    /// present-op count does not equal `macro_size`. `None` for non-macro ops.
    pub macro_size: Option<u32>,
    pub diff_algo_version: Option<u32>,

    // Reserved D24 envelope fields — carried in the frozen on-disk shape but not
    // yet consumed by Stage-1 / CP-2 merge (omitting any would force a later
    // op-log migration). `base/new_register_rev` and `supersedes_rev` are
    // register-granularity guards superseded in Stage-1 by the sub-field
    // (`base/new_sub_rev`) path; `provenance` / `approval_state` are agent/review
    // hooks (conflict §7.4) reserved for a post-CP-2 subsystem.
    pub provenance: Option<String>,
    pub approval_state: Option<String>,

    pub payload: OpPayload,
}

impl Op {
    /// The global total order key `T` (conflict §4). Borrowed to avoid copies.
    pub fn total_order_key(&self) -> (u64, u32, &str, &str, &str) {
        (
            self.hlc.wall,
            self.hlc.logical,
            self.hlc.device.as_str(),
            self.actor.as_str(),
            self.op_id.as_str(),
        )
    }
}

/// Builder with the boilerplate defaulted, so fixtures stay readable.
pub struct OpBuilder {
    op: Op,
}

impl OpBuilder {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        op_id: impl Into<String>,
        hlc: Hlc,
        actor: impl Into<String>,
        target_id: impl Into<String>,
        target_kind: TargetKind,
        register: Register,
        op_kind: OpKind,
        payload: OpPayload,
    ) -> Self {
        OpBuilder {
            op: Op {
                op_id: op_id.into(),
                op_envelope_version: crate::OP_ENVELOPE_VERSION,
                hlc,
                actor: actor.into(),
                seq: 0,
                target_id: target_id.into(),
                target_kind,
                register,
                sub_field_key: None,
                op_kind,
                base_register_rev: None,
                new_register_rev: None,
                base_sub_rev: None,
                new_sub_rev: None,
                supersedes_rev: None,
                dominates_frontier: None,
                observed_adds: None,
                macro_op_id: None,
                macro_size: None,
                diff_algo_version: None,
                provenance: None,
                approval_state: None,
                payload,
            },
        }
    }

    pub fn seq(mut self, seq: u64) -> Self {
        self.op.seq = seq;
        self
    }
    pub fn sub_field(mut self, k: SubFieldKey) -> Self {
        self.op.sub_field_key = Some(k);
        self
    }
    pub fn base_sub_rev(mut self, r: impl Into<String>) -> Self {
        self.op.base_sub_rev = Some(r.into());
        self
    }
    pub fn new_sub_rev(mut self, r: impl Into<String>) -> Self {
        self.op.new_sub_rev = Some(r.into());
        self
    }
    pub fn observed_adds(mut self, a: BTreeSet<String>) -> Self {
        self.op.observed_adds = Some(a);
        self
    }
    pub fn macro_op_id(mut self, m: impl Into<String>) -> Self {
        self.op.macro_op_id = Some(m.into());
        self
    }
    pub fn macro_size(mut self, n: u32) -> Self {
        self.op.macro_size = Some(n);
        self
    }
    pub fn build(self) -> Op {
        self.op
    }
}

/// Canonical (D24) serialization of the **full** op envelope. Every field is
/// included and the payload is tagged by `kind`, so the frozen op-shape golden
/// vector changes if any field is omitted, renamed, or re-typed — that is, any
/// such change would force an op-log migration. This is the on-disk shape the
/// segment byte surface and the D24 freeze test both encode.
pub fn op_envelope_canonical(op: &Op) -> CanonicalValue {
    CanonicalValue::object([
        ("op_id", CanonicalValue::str(op.op_id.clone())),
        (
            "op_envelope_version",
            CanonicalValue::UInt(op.op_envelope_version as u64),
        ),
        ("hlc", hlc_canonical(&op.hlc)),
        ("actor", CanonicalValue::str(op.actor.clone())),
        ("seq", CanonicalValue::UInt(op.seq)),
        ("target_id", CanonicalValue::str(op.target_id.clone())),
        ("target_kind", CanonicalValue::str(op.target_kind.as_str())),
        ("register", CanonicalValue::str(op.register.as_str())),
        (
            "sub_field_key",
            match &op.sub_field_key {
                Some(k) => CanonicalValue::str(k.as_string()),
                None => CanonicalValue::Null,
            },
        ),
        ("op_kind", CanonicalValue::str(op.op_kind.as_str())),
        (
            "base_register_rev",
            CanonicalValue::opt_str(&op.base_register_rev),
        ),
        (
            "new_register_rev",
            CanonicalValue::opt_str(&op.new_register_rev),
        ),
        ("base_sub_rev", CanonicalValue::opt_str(&op.base_sub_rev)),
        ("new_sub_rev", CanonicalValue::opt_str(&op.new_sub_rev)),
        ("supersedes_rev", CanonicalValue::opt_str(&op.supersedes_rev)),
        (
            "dominates_frontier",
            frontier_canonical(op.dominates_frontier.as_ref()),
        ),
        (
            "observed_adds",
            observed_adds_canonical(op.observed_adds.as_ref()),
        ),
        ("macro_op_id", CanonicalValue::opt_str(&op.macro_op_id)),
        ("macro_size", opt_uint(op.macro_size.map(u64::from))),
        (
            "diff_algo_version",
            opt_uint(op.diff_algo_version.map(u64::from)),
        ),
        ("provenance", CanonicalValue::opt_str(&op.provenance)),
        ("approval_state", CanonicalValue::opt_str(&op.approval_state)),
        ("payload", payload_canonical(&op.payload)),
    ])
}

/// `rev` of the full op envelope — the frozen op-shape identity (D24).
pub fn op_envelope_rev(op: &Op) -> String {
    crate::canonical::rev(&op_envelope_canonical(op))
}

fn hlc_canonical(hlc: &Hlc) -> CanonicalValue {
    CanonicalValue::object([
        ("wall", CanonicalValue::UInt(hlc.wall)),
        ("logical", CanonicalValue::UInt(hlc.logical as u64)),
        ("device", CanonicalValue::str(hlc.device.clone())),
    ])
}

fn opt_uint(v: Option<u64>) -> CanonicalValue {
    match v {
        Some(n) => CanonicalValue::UInt(n),
        None => CanonicalValue::Null,
    }
}

fn frontier_canonical(frontier: Option<&BTreeMap<String, Hlc>>) -> CanonicalValue {
    match frontier {
        None => CanonicalValue::Null,
        Some(map) => {
            let mut out = BTreeMap::new();
            for (device, hlc) in map {
                out.insert(device.clone(), hlc_canonical(hlc));
            }
            CanonicalValue::Object(out)
        }
    }
}

fn observed_adds_canonical(adds: Option<&BTreeSet<String>>) -> CanonicalValue {
    match adds {
        None => CanonicalValue::Null,
        Some(set) => CanonicalValue::array(
            set.iter().map(|id| CanonicalValue::str(id.clone())).collect(),
        ),
    }
}

fn location_canonical(loc: &Location) -> CanonicalValue {
    CanonicalValue::object([
        ("parent", CanonicalValue::opt_str(&loc.parent)),
        ("order", CanonicalValue::str(loc.order.clone())),
    ])
}

fn payload_canonical(payload: &OpPayload) -> CanonicalValue {
    match payload {
        OpPayload::Create { kind, location } => CanonicalValue::object([
            ("kind", CanonicalValue::str("create")),
            ("target_kind", CanonicalValue::str(kind.as_str())),
            ("location", location_canonical(location)),
        ]),
        OpPayload::SetLocation { parent, order } => CanonicalValue::object([
            ("kind", CanonicalValue::str("set_location")),
            ("parent", CanonicalValue::opt_str(parent)),
            ("order", CanonicalValue::str(order.clone())),
        ]),
        OpPayload::Renormalize {
            order,
            base_snapshot_revision,
        } => CanonicalValue::object([
            ("kind", CanonicalValue::str("renormalize")),
            ("order", CanonicalValue::str(order.clone())),
            (
                "base_snapshot_revision",
                CanonicalValue::opt_str(base_snapshot_revision),
            ),
        ]),
        OpPayload::SetBody { text, marks } => CanonicalValue::object([
            ("kind", CanonicalValue::str("set_body")),
            ("text", CanonicalValue::str(text.clone())),
            (
                "marks",
                CanonicalValue::array(marks.iter().map(crate::model::mark_canonical).collect()),
            ),
        ]),
        OpPayload::SetTypeId { value } => CanonicalValue::object([
            ("kind", CanonicalValue::str("set_type_id")),
            ("value", CanonicalValue::opt_str(value)),
        ]),
        OpPayload::SetProp { key, value } => CanonicalValue::object([
            ("kind", CanonicalValue::str("set_prop")),
            ("key", CanonicalValue::str(key.clone())),
            ("value", CanonicalValue::opt_str(value)),
        ]),
        OpPayload::TagAdd { tag } => CanonicalValue::object([
            ("kind", CanonicalValue::str("tag_add")),
            ("tag", CanonicalValue::str(tag.clone())),
        ]),
        OpPayload::TagRemove { tag } => CanonicalValue::object([
            ("kind", CanonicalValue::str("tag_remove")),
            ("tag", CanonicalValue::str(tag.clone())),
        ]),
        OpPayload::LifeSet { life } => CanonicalValue::object([
            ("kind", CanonicalValue::str("life_set")),
            ("life", CanonicalValue::str(life.as_str())),
        ]),
    }
}
