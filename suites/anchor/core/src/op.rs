//! The op envelope. Every D24 field is reserved up front (NON-NEGOTIABLE):
//! omitting any one would force a later op-log migration. Fields the Stage 1
//! merge does not yet consume are still carried, so the on-disk shape is frozen.

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
    pub macro_op_id: Option<String>,
    pub diff_algo_version: Option<u32>,

    // Reserved hooks — never consulted by merge (conflict §7.4).
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
    pub fn supersedes_rev(mut self, r: impl Into<String>) -> Self {
        self.op.supersedes_rev = Some(r.into());
        self
    }
    pub fn dominates_frontier(mut self, f: BTreeMap<String, Hlc>) -> Self {
        self.op.dominates_frontier = Some(f);
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
    pub fn diff_algo_version(mut self, v: u32) -> Self {
        self.op.diff_algo_version = Some(v);
        self
    }
    pub fn provenance(mut self, p: impl Into<String>) -> Self {
        self.op.provenance = Some(p.into());
        self
    }
    pub fn build(self) -> Op {
        self.op
    }
}
