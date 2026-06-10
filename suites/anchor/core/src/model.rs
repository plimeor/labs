//! Materialized domain model and its canonical (hashable) projection.
//!
//! `anchor-core` owns Note/Block as the only first-class persistent objects.
//! Everything here is the *output* of replay: a pure function of the op set. The
//! canonical projection deliberately excludes actor/jitter metadata so
//! `snapshot_revision` is byte-identical across devices (D30).

use crate::canonical::{rev, CanonicalValue};
use crate::marks::Mark;
use alloc::collections::{BTreeMap, BTreeSet};
use alloc::string::String;
use alloc::vec::Vec;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TargetKind {
    Note,
    Block,
}

impl TargetKind {
    pub fn as_str(self) -> &'static str {
        match self {
            TargetKind::Note => "note",
            TargetKind::Block => "block",
        }
    }
}

/// Lifecycle register value. Lattice: `active < {trashed, archived} < deleted`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Life {
    Active,
    Archived,
    Trashed,
    Deleted,
}

impl Life {
    pub fn as_str(self) -> &'static str {
        match self {
            Life::Active => "active",
            Life::Archived => "archived",
            Life::Trashed => "trashed",
            Life::Deleted => "deleted",
        }
    }

    /// Whether a node in this state keeps its subtree reachable (visible).
    pub fn is_living(self) -> bool {
        matches!(self, Life::Active | Life::Archived)
    }
}

/// `location` register: an atomic `{parent, order}` value (never split).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Location {
    pub parent: Option<String>,
    pub order: String,
}

impl Location {
    pub fn new(parent: Option<String>, order: impl Into<String>) -> Self {
        Location {
            parent,
            order: order.into(),
        }
    }
}

/// A body value: UTF-16 text plus its inline marks.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Body {
    pub text: String,
    pub marks: Vec<Mark>,
}

impl Body {
    pub fn new(text: impl Into<String>, marks: Vec<Mark>) -> Self {
        Body {
            text: text.into(),
            marks,
        }
    }

    pub fn plain(text: impl Into<String>) -> Self {
        Body {
            text: text.into(),
            marks: Vec::new(),
        }
    }
}

/// A keep-both loser: a body value preserved as a derived Multi-Value entry.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LoserBody {
    pub value: Body,
    pub losing_op_id: String,
}

/// Resolved `content.body` cell: a single value, or keep-both (Multi-Value).
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum BodyState {
    Single(Body),
    MultiValue { winner: Body, losers: Vec<LoserBody> },
}

impl BodyState {
    pub fn winner(&self) -> &Body {
        match self {
            BodyState::Single(b) => b,
            BodyState::MultiValue { winner, .. } => winner,
        }
    }
}

/// Resolved `content` register (sub-field cells).
#[derive(Clone, Debug, PartialEq, Eq, Default)]
pub struct NodeContent {
    pub body: Option<BodyState>,
    pub type_id: Option<String>,
    pub props: BTreeMap<String, String>,
    pub tags: BTreeSet<String>,
}

/// A materialized Note or Block.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Node {
    pub id: String,
    pub kind: TargetKind,
    pub location: Location,
    pub content: NodeContent,
    pub life: Life,
    /// Derived root-reachability over the merged tree (non-cascade).
    pub visible: bool,
    pub has_body_conflict: bool,
}

/// Derived conflict read-model kinds (conflict §9). This is NOT a public CLI
/// schema (D31 defers that to Phase 2); it is a replay-derived value used for
/// surfacing and for the "no silent loss" pin against compaction.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ConflictKind {
    BodyOverlap,
    Scalar,
    Tag,
    MoveSkipped,
    LocationRelocated,
    ReorderBlend,
    LifeTie,
    AncestorLifeVsDescendantEdit,
    SplitMergeStructural,
    JournalMerge,
}

impl ConflictKind {
    pub fn as_str(self) -> &'static str {
        match self {
            ConflictKind::BodyOverlap => "body_overlap",
            ConflictKind::Scalar => "scalar",
            ConflictKind::Tag => "tag",
            ConflictKind::MoveSkipped => "move_skipped",
            ConflictKind::LocationRelocated => "location_relocated",
            ConflictKind::ReorderBlend => "reorder_blend",
            ConflictKind::LifeTie => "life_tie",
            ConflictKind::AncestorLifeVsDescendantEdit => "ancestor_life_vs_descendant_edit",
            ConflictKind::SplitMergeStructural => "split_merge_structural",
            ConflictKind::JournalMerge => "journal_merge",
        }
    }
}

/// Derived conflict record. `pinned_op_ids` are op ids that compaction must
/// never truncate while the conflict is open (conflict §10).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ConflictRecord {
    pub target_id: String,
    pub kind: ConflictKind,
    pub sub_field_key: Option<String>,
    pub live_op_id: Option<String>,
    pub losing_op_ids: Vec<String>,
    pub pinned_op_ids: Vec<String>,
}

/// The materialized vault: all nodes (including hidden/trashed, flagged by
/// `visible`) plus the derived conflict set.
#[derive(Clone, Debug, PartialEq, Eq, Default)]
pub struct Vault {
    pub nodes: BTreeMap<String, Node>,
    pub conflicts: Vec<ConflictRecord>,
}

impl Vault {
    /// Canonical projection of the materialized state (nodes only, sorted).
    pub fn canonical(&self) -> CanonicalValue {
        let nodes = self
            .nodes
            .values()
            .map(node_canonical)
            .collect::<Vec<_>>();
        CanonicalValue::object([("nodes", CanonicalValue::array(nodes))])
    }

    /// Byte-identical-across-devices snapshot revision over materialized output.
    pub fn snapshot_revision(&self) -> String {
        rev(&self.canonical())
    }

    /// Per-node snapshot revision (subtree leaf granularity for the spike).
    pub fn node_snapshot_revision(&self, id: &str) -> Option<String> {
        self.nodes.get(id).map(|n| rev(&node_canonical(n)))
    }
}

pub(crate) fn mark_canonical(m: &Mark) -> CanonicalValue {
    CanonicalValue::object([
        ("kind", CanonicalValue::str(m.kind.clone())),
        ("start", CanonicalValue::UInt(m.start as u64)),
        ("end", CanonicalValue::UInt(m.end as u64)),
        ("expand", CanonicalValue::Bool(m.expand)),
    ])
}

fn body_canonical(b: &Body) -> CanonicalValue {
    let marks = b.marks.iter().map(mark_canonical).collect::<Vec<_>>();
    CanonicalValue::object([
        ("text", CanonicalValue::str(b.text.clone())),
        ("marks", CanonicalValue::array(marks)),
    ])
}

fn body_state_canonical(s: &BodyState) -> CanonicalValue {
    match s {
        BodyState::Single(b) => CanonicalValue::object([
            ("kind", CanonicalValue::str("single")),
            ("value", body_canonical(b)),
        ]),
        BodyState::MultiValue { winner, losers } => {
            let losers = losers
                .iter()
                .map(|l| {
                    CanonicalValue::object([
                        ("value", body_canonical(&l.value)),
                        ("losing_op_id", CanonicalValue::str(l.losing_op_id.clone())),
                    ])
                })
                .collect::<Vec<_>>();
            CanonicalValue::object([
                ("kind", CanonicalValue::str("multi")),
                ("winner", body_canonical(winner)),
                ("losers", CanonicalValue::array(losers)),
            ])
        }
    }
}

fn content_canonical(c: &NodeContent) -> CanonicalValue {
    let body = match &c.body {
        Some(s) => body_state_canonical(s),
        None => CanonicalValue::Null,
    };
    let mut props = BTreeMap::new();
    for (k, v) in &c.props {
        props.insert(k.clone(), CanonicalValue::str(v.clone()));
    }
    let tags = c
        .tags
        .iter()
        .map(|t| CanonicalValue::str(t.clone()))
        .collect::<Vec<_>>();
    CanonicalValue::object([
        ("body", body),
        ("type_id", CanonicalValue::opt_str(&c.type_id)),
        ("props", CanonicalValue::Object(props)),
        ("tags", CanonicalValue::array(tags)),
    ])
}

fn node_canonical(n: &Node) -> CanonicalValue {
    let location = CanonicalValue::object([
        ("parent", CanonicalValue::opt_str(&n.location.parent)),
        ("order", CanonicalValue::str(n.location.order.clone())),
    ]);
    CanonicalValue::object([
        ("id", CanonicalValue::str(n.id.clone())),
        ("kind", CanonicalValue::str(n.kind.as_str())),
        ("location", location),
        ("content", content_canonical(&n.content)),
        ("life", CanonicalValue::str(n.life.as_str())),
        ("visible", CanonicalValue::Bool(n.visible)),
        ("has_body_conflict", CanonicalValue::Bool(n.has_body_conflict)),
    ])
}

/// Content-address of a `location` register value (`{parent, order}`). This is
/// the compare-and-swap base a `Renormalize` op carries (F26c): replay honors
/// the renormalize only while the target's location is still exactly the one it
/// was computed against.
pub fn location_rev(loc: &Location) -> String {
    rev(&CanonicalValue::object([
        ("parent", CanonicalValue::opt_str(&loc.parent)),
        ("order", CanonicalValue::str(loc.order.clone())),
    ]))
}

/// `sub_rev` of a body cell value (conflict §3.4): `blake3(canonical(value))`.
pub fn body_sub_rev(body: &Body) -> String {
    rev(&body_canonical(body))
}

/// `sub_rev` of a scalar cell value (`type_id` / `props[k]`).
pub fn scalar_sub_rev(value: Option<&str>) -> String {
    let v = match value {
        Some(s) => CanonicalValue::str(s),
        None => CanonicalValue::Null,
    };
    rev(&v)
}

/// Canonical projection of the conflict set (for equality testing across orders).
pub fn conflicts_canonical(conflicts: &[ConflictRecord]) -> CanonicalValue {
    let mut sorted = conflicts.to_vec();
    sorted.sort_by(|a, b| {
        a.target_id
            .cmp(&b.target_id)
            .then(a.kind.as_str().cmp(b.kind.as_str()))
            .then(a.sub_field_key.cmp(&b.sub_field_key))
    });
    let items = sorted
        .iter()
        .map(|c| {
            let losing = c
                .losing_op_ids
                .iter()
                .map(|s| CanonicalValue::str(s.clone()))
                .collect::<Vec<_>>();
            let pinned = c
                .pinned_op_ids
                .iter()
                .map(|s| CanonicalValue::str(s.clone()))
                .collect::<Vec<_>>();
            CanonicalValue::object([
                ("target_id", CanonicalValue::str(c.target_id.clone())),
                ("kind", CanonicalValue::str(c.kind.as_str())),
                ("sub_field_key", CanonicalValue::opt_str(&c.sub_field_key)),
                ("live_op_id", CanonicalValue::opt_str(&c.live_op_id)),
                ("losing_op_ids", CanonicalValue::array(losing)),
                ("pinned_op_ids", CanonicalValue::array(pinned)),
            ])
        })
        .collect::<Vec<_>>();
    CanonicalValue::array(items)
}

/// The implicit top-level root sentinel (materialization-time reattach fallback,
/// D07). Not a persistent parent value.
pub const ROOT_SENTINEL: &str = "@root";
