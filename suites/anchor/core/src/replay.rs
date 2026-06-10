//! Op-log replay: a pure fold over the total order `T` (conflict §4, §10).
//!
//! `replay(ops)` is arrival-order independent: ops are deduped by `op_id`, sorted
//! by `T`, then folded. Every register's resolution is a pure function of the op
//! *set*, so any two replicas holding the same set materialize byte-identical
//! state and `snapshot_revision`. This module wires the per-register rules
//! (location LWW + cycle guard, body diff3/keep-both, scalar causality-aware
//! LWW, tag OR-Set, life lattice) and derives the conflict read-model.

use crate::diff3::{self, Diff3Outcome};
use crate::hlc::Hlc;
use crate::lattice;
use crate::marks;
use crate::model::{
    body_sub_rev, scalar_sub_rev, Body, BodyState, ConflictKind, ConflictRecord, Life, Location,
    LoserBody, Node, NodeContent, TargetKind, Vault, ROOT_SENTINEL,
};
use crate::op::{Op, OpKind, OpPayload, Register, SubFieldKey};
use alloc::collections::{BTreeMap, BTreeSet};
use alloc::string::{String, ToString};
use alloc::vec::Vec;

/// Replay an op set into a materialized vault.
pub fn replay(ops: &[Op]) -> Vault {
    let sorted = drop_incomplete_macros(dedup_and_sort(ops));

    // Bucket ops per node.
    let mut buckets: BTreeMap<String, NodeOps> = BTreeMap::new();
    for op in &sorted {
        let b = buckets.entry(op.target_id.clone()).or_default();
        b.ingest(op);
    }

    // Global location fold (cross-node cycle guard, T order).
    let (parents, skipped_move_targets) = resolve_locations(&sorted);

    let mut nodes: BTreeMap<String, Node> = BTreeMap::new();
    let mut conflicts: Vec<ConflictRecord> = Vec::new();

    for (id, b) in &buckets {
        let kind = b.kind.unwrap_or(TargetKind::Note);
        let location = parents
            .get(id)
            .cloned()
            .unwrap_or_else(|| Location::new(None, "V"));

        let (body, body_conflict) = resolve_body(id, &b.body_ops, &mut conflicts);
        let type_id = resolve_scalar(id, Some("type_id"), &b.type_ops, &mut conflicts);
        let mut props = BTreeMap::new();
        for (k, ops) in &b.prop_ops {
            let sub = SubFieldKey::Prop(k.clone()).as_string();
            if let Some(v) = resolve_scalar(id, Some(&sub), ops, &mut conflicts) {
                props.insert(k.clone(), v);
            }
        }
        let tags = resolve_tags(&b.tag_adds, &b.tag_removes);
        let life = resolve_life(&b.life_ops, &b.content_edit_hlcs);

        nodes.insert(
            id.clone(),
            Node {
                id: id.clone(),
                kind,
                location,
                content: NodeContent {
                    body,
                    type_id,
                    props,
                    tags,
                },
                life,
                visible: false, // filled below
                has_body_conflict: body_conflict,
            },
        );
    }

    // Derived visibility (root-reachability over living ancestors, non-cascade).
    let ids: Vec<String> = nodes.keys().cloned().collect();
    for id in &ids {
        let v = compute_visible(id, &nodes);
        if let Some(n) = nodes.get_mut(id) {
            n.visible = v;
        }
    }

    // Structural / cross-register conflicts.
    derive_move_skipped(&skipped_move_targets, &mut conflicts);
    derive_location_relocated(&buckets, &nodes, &mut conflicts);
    derive_ancestor_life_conflicts(&buckets, &nodes, &mut conflicts);
    derive_life_tie(&buckets, &mut conflicts);
    derive_reorder_blend(&buckets, &mut conflicts);
    derive_split_merge_structural(&buckets, &mut conflicts);

    // Deterministic conflict ordering.
    conflicts.sort_by(|a, b| {
        a.target_id
            .cmp(&b.target_id)
            .then(a.kind.as_str().cmp(b.kind.as_str()))
            .then(a.sub_field_key.cmp(&b.sub_field_key))
    });

    Vault { nodes, conflicts }
}

fn dedup_and_sort(ops: &[Op]) -> Vec<Op> {
    let mut by_id: BTreeMap<String, Op> = BTreeMap::new();
    for op in ops {
        by_id.entry(op.op_id.clone()).or_insert_with(|| op.clone());
    }
    let mut v: Vec<Op> = by_id.into_values().collect();
    v.sort_by(|a, b| a.total_order_key().cmp(&b.total_order_key()));
    v
}

/// Apply editor macros (split / merge / undo) all-or-nothing (D29). An op that
/// declares a `macro_size` is kept only when exactly that many ops of its
/// `macro_op_id` group are present in the deduped set; a partially delivered
/// macro is dropped whole, so a half-applied structural edit can never
/// materialize. Ops with no macro (or no declared size) are always kept.
fn drop_incomplete_macros(ops: Vec<Op>) -> Vec<Op> {
    let mut present: BTreeMap<String, u32> = BTreeMap::new();
    for op in &ops {
        if let Some(macro_id) = &op.macro_op_id {
            *present.entry(macro_id.clone()).or_insert(0) += 1;
        }
    }
    ops.into_iter()
        .filter(|op| match (&op.macro_op_id, op.macro_size) {
            (Some(macro_id), Some(size)) => present.get(macro_id) == Some(&size),
            _ => true,
        })
        .collect()
}

#[derive(Default)]
struct NodeOps {
    kind: Option<TargetKind>,
    body_ops: Vec<Op>,
    type_ops: Vec<Op>,
    prop_ops: BTreeMap<String, Vec<Op>>,
    tag_adds: BTreeMap<String, Vec<Op>>,
    tag_removes: BTreeMap<String, Vec<Op>>,
    life_ops: Vec<Op>,
    location_ops: Vec<Op>,
    content_edit_hlcs: Vec<Hlc>,
}

impl NodeOps {
    fn ingest(&mut self, op: &Op) {
        if self.kind.is_none() {
            self.kind = Some(op.target_kind);
        }
        match op.register {
            Register::Location => self.location_ops.push(op.clone()),
            Register::Life => self.life_ops.push(op.clone()),
            Register::Content => {
                self.content_edit_hlcs.push(op.hlc.clone());
                match &op.payload {
                    OpPayload::SetBody { .. } => self.body_ops.push(op.clone()),
                    OpPayload::SetTypeId { .. } => self.type_ops.push(op.clone()),
                    OpPayload::SetProp { key, .. } => {
                        self.prop_ops.entry(key.clone()).or_default().push(op.clone());
                    }
                    OpPayload::TagAdd { tag } => {
                        self.tag_adds.entry(tag.clone()).or_default().push(op.clone());
                    }
                    OpPayload::TagRemove { tag } => {
                        self.tag_removes
                            .entry(tag.clone())
                            .or_default()
                            .push(op.clone());
                    }
                    _ => {}
                }
            }
        }
    }
}

/// Global location fold with apply-time cycle guard. Returns winning locations
/// and the set of targets whose move was cycle-skipped.
fn resolve_locations(sorted: &[Op]) -> (BTreeMap<String, Location>, BTreeSet<String>) {
    let mut parents: BTreeMap<String, Location> = BTreeMap::new();
    let mut skipped: BTreeSet<String> = BTreeSet::new();
    for op in sorted {
        if op.register != Register::Location {
            continue;
        }
        let (parent, order) = match &op.payload {
            OpPayload::Create { location, .. } => (location.parent.clone(), location.order.clone()),
            OpPayload::SetLocation { parent, order } => (parent.clone(), order.clone()),
            OpPayload::Renormalize { order, .. } => {
                let cur_parent = parents.get(&op.target_id).and_then(|l| l.parent.clone());
                (cur_parent, order.clone())
            }
            _ => continue,
        };
        if would_cycle(&parents, &op.target_id, parent.as_deref()) {
            skipped.insert(op.target_id.clone());
            continue;
        }
        parents.insert(op.target_id.clone(), Location { parent, order });
    }
    (parents, skipped)
}

/// Would setting `target`'s parent to `new_parent` create a cycle in the current
/// partial tree?
fn would_cycle(parents: &BTreeMap<String, Location>, target: &str, new_parent: Option<&str>) -> bool {
    let mut cur = match new_parent {
        Some(p) => p.to_string(),
        None => return false,
    };
    if cur == target {
        return true;
    }
    let mut guard = 0usize;
    loop {
        if cur == target {
            return true;
        }
        match parents.get(&cur).and_then(|l| l.parent.clone()) {
            Some(p) => cur = p,
            None => return false,
        }
        guard += 1;
        if guard > 100_000 {
            return true; // malformed; fail safe
        }
    }
}

/// Recover the `sub_rev → Body` map and pick the non-superseded frontier.
fn resolve_body(
    target_id: &str,
    body_ops: &[Op],
    conflicts: &mut Vec<ConflictRecord>,
) -> (Option<BodyState>, bool) {
    if body_ops.is_empty() {
        return (None, false);
    }

    // sub_rev (computed authoritatively) → body value.
    let mut by_rev: BTreeMap<String, Body> = BTreeMap::new();
    let mut new_revs: Vec<String> = Vec::new();
    let mut bodies: Vec<(Body, String)> = Vec::new(); // (body, op_id) in T order
    let mut base_of: Vec<Option<String>> = Vec::new();
    for op in body_ops {
        if let OpPayload::SetBody { text, marks } = &op.payload {
            let body = Body {
                text: text.clone(),
                marks: marks.clone(),
            };
            let nr = body_sub_rev(&body);
            by_rev.insert(nr.clone(), body.clone());
            new_revs.push(nr);
            bodies.push((body, op.op_id.clone()));
            base_of.push(op.base_sub_rev.clone());
        }
    }

    // Superseded: op X is superseded if some op Y bases on X.new_sub_rev.
    let bases: BTreeSet<String> = base_of.iter().flatten().cloned().collect();
    let mut frontier: Vec<usize> = Vec::new();
    for (i, nr) in new_revs.iter().enumerate() {
        if !bases.contains(nr) {
            frontier.push(i);
        }
    }

    if frontier.len() <= 1 {
        let idx = *frontier.last().unwrap_or(&(bodies.len() - 1));
        return (Some(BodyState::Single(bodies[idx].0.clone())), false);
    }

    if frontier.len() == 2 {
        let lo = frontier[0];
        let hi = frontier[1];
        let base_rev = base_of[hi].clone().or_else(|| base_of[lo].clone());
        let base_body = base_rev.as_ref().and_then(|r| by_rev.get(r).cloned());
        if let Some(base) = base_body {
            let base_lines = diff3::split_lines(&base.text);
            let lo_lines = diff3::split_lines(&bodies[lo].0.text);
            let hi_lines = diff3::split_lines(&bodies[hi].0.text);
            match diff3::diff3_lines(&base_lines, &lo_lines, &hi_lines) {
                Diff3Outcome::Merged(merged) => {
                    let merged_text = diff3::join_lines(&merged);
                    let splices = diff3::text_splices(&bodies[hi].0.text, &merged_text);
                    let merged_marks = marks::reclamp(&bodies[hi].0.marks, &splices);
                    return (
                        Some(BodyState::Single(Body {
                            text: merged_text,
                            marks: merged_marks,
                        })),
                        false,
                    );
                }
                Diff3Outcome::Conflict => {}
            }
        }
        // Overlap or unrecoverable base ⇒ keep-both (winner = higher-T).
        let winner = clamp_body(&bodies[hi].0);
        let loser = LoserBody {
            value: clamp_body(&bodies[lo].0),
            losing_op_id: bodies[lo].1.clone(),
        };
        conflicts.push(ConflictRecord {
            target_id: target_id.to_string(),
            kind: ConflictKind::BodyOverlap,
            sub_field_key: Some("body".to_string()),
            live_op_id: Some(bodies[hi].1.clone()),
            losing_op_ids: alloc::vec![bodies[lo].1.clone()],
            pinned_op_ids: alloc::vec![bodies[lo].1.clone(), bodies[hi].1.clone()],
        });
        return (
            Some(BodyState::MultiValue {
                winner,
                losers: alloc::vec![loser],
            }),
            true,
        );
    }

    // N-way (≥3): fold into a single keep-both (winner = highest-T).
    let hi = *frontier.last().unwrap();
    let winner = clamp_body(&bodies[hi].0);
    let mut losers = Vec::new();
    let mut losing_ids = Vec::new();
    let mut pinned = Vec::new();
    for &i in frontier.iter().rev() {
        pinned.push(bodies[i].1.clone());
        if i == hi {
            continue;
        }
        losers.push(LoserBody {
            value: clamp_body(&bodies[i].0),
            losing_op_id: bodies[i].1.clone(),
        });
        losing_ids.push(bodies[i].1.clone());
    }
    conflicts.push(ConflictRecord {
        target_id: target_id.to_string(),
        kind: ConflictKind::BodyOverlap,
        sub_field_key: Some("body".to_string()),
        live_op_id: Some(bodies[hi].1.clone()),
        losing_op_ids: losing_ids,
        pinned_op_ids: pinned,
    });
    (Some(BodyState::MultiValue { winner, losers }), true)
}

fn clamp_body(b: &Body) -> Body {
    let len = diff3::to_utf16(&b.text).len() as u32;
    Body {
        text: b.text.clone(),
        marks: marks::clamp_to_len(&b.marks, len),
    }
}

/// Causality-aware per-cell LWW for a scalar cell (type_id / props[k]).
fn resolve_scalar(
    target_id: &str,
    sub_field: Option<&str>,
    ops: &[Op],
    conflicts: &mut Vec<ConflictRecord>,
) -> Option<String> {
    if ops.is_empty() {
        return None;
    }
    let mut values: Vec<(Option<String>, String, String)> = Vec::new(); // (value, new_rev, op_id), T order
    let mut base_of: Vec<Option<String>> = Vec::new();
    for op in ops {
        let value = match &op.payload {
            OpPayload::SetTypeId { value } => value.clone(),
            OpPayload::SetProp { value, .. } => value.clone(),
            _ => continue,
        };
        let nr = scalar_sub_rev(value.as_deref());
        values.push((value, nr, op.op_id.clone()));
        base_of.push(op.base_sub_rev.clone());
    }
    let bases: BTreeSet<String> = base_of.iter().flatten().cloned().collect();
    let mut frontier: Vec<usize> = Vec::new();
    for (i, (_, nr, _)) in values.iter().enumerate() {
        if !bases.contains(nr) {
            frontier.push(i);
        }
    }
    if frontier.is_empty() {
        // Everything superseded shouldn't happen; fall back to last in T order.
        return values.last().and_then(|v| v.0.clone());
    }
    let hi = *frontier.last().unwrap();
    if frontier.len() > 1 {
        let losing_ids: Vec<String> = frontier
            .iter()
            .filter(|&&i| i != hi)
            .map(|&i| values[i].2.clone())
            .collect();
        conflicts.push(ConflictRecord {
            target_id: target_id.to_string(),
            kind: ConflictKind::Scalar,
            sub_field_key: sub_field.map(String::from),
            live_op_id: Some(values[hi].2.clone()),
            losing_op_ids: losing_ids.clone(),
            pinned_op_ids: losing_ids,
        });
    }
    values[hi].0.clone()
}

fn resolve_tags(
    tag_adds: &BTreeMap<String, Vec<Op>>,
    tag_removes: &BTreeMap<String, Vec<Op>>,
) -> BTreeSet<String> {
    let mut present = BTreeSet::new();
    for (tag, adds) in tag_adds {
        let add_ids: BTreeSet<String> = adds.iter().map(|o| o.op_id.clone()).collect();
        let mut observed: BTreeSet<String> = BTreeSet::new();
        if let Some(removes) = tag_removes.get(tag) {
            for r in removes {
                if let Some(obs) = &r.observed_adds {
                    observed.extend(obs.iter().cloned());
                }
            }
        }
        if crate::orset::tag_present(&add_ids, &observed) {
            present.insert(tag.clone());
        }
    }
    present
}

fn resolve_life(life_ops: &[Op], content_edit_hlcs: &[Hlc]) -> Life {
    let mut life = Life::Active;
    for op in life_ops {
        match (op.op_kind, &op.payload) {
            (OpKind::Restore, OpPayload::LifeSet { life: to }) if life != Life::Deleted => {
                life = *to;
            }
            (_, OpPayload::LifeSet { life: set }) => {
                if *set == Life::Deleted {
                    let honored = lattice::resolve_terminal_delete(
                        op.dominates_frontier.as_ref(),
                        content_edit_hlcs.iter(),
                    );
                    life = lattice::life_join(life, honored);
                } else {
                    life = lattice::life_join(life, *set);
                }
            }
            _ => {}
        }
    }
    life
}

fn compute_visible(id: &str, nodes: &BTreeMap<String, Node>) -> bool {
    let node = match nodes.get(id) {
        Some(n) => n,
        None => return false,
    };
    if !node.life.is_living() {
        return false;
    }
    let mut cur_parent = node.location.parent.clone();
    let mut guard = 0usize;
    loop {
        let p = match cur_parent {
            Some(p) => p,
            None => return true,
        };
        if p == ROOT_SENTINEL {
            return true;
        }
        match nodes.get(&p) {
            None => return true, // dangling parent → reattached to root
            Some(pn) => match pn.life {
                Life::Deleted => cur_parent = pn.location.parent.clone(), // reattach: skip deleted
                Life::Trashed => return false,                            // hidden under trashed
                Life::Active | Life::Archived => cur_parent = pn.location.parent.clone(),
            },
        }
        guard += 1;
        if guard > 100_000 {
            return false;
        }
    }
}

fn derive_move_skipped(skipped: &BTreeSet<String>, conflicts: &mut Vec<ConflictRecord>) {
    for target in skipped {
        conflicts.push(ConflictRecord {
            target_id: target.clone(),
            kind: ConflictKind::MoveSkipped,
            sub_field_key: None,
            live_op_id: None,
            losing_op_ids: Vec::new(),
            pinned_op_ids: Vec::new(),
        });
    }
}

fn derive_location_relocated(
    buckets: &BTreeMap<String, NodeOps>,
    nodes: &BTreeMap<String, Node>,
    conflicts: &mut Vec<ConflictRecord>,
) {
    for (id, b) in buckets {
        // A move that changed the parent (more than one location op, with at
        // least two distinct actors), concurrent with a content edit by a
        // different actor ⇒ surface (non-silent relocation).
        let move_actors: BTreeSet<&str> = b
            .location_ops
            .iter()
            .filter(|o| !matches!(o.payload, OpPayload::Create { .. }))
            .map(|o| o.actor.as_str())
            .collect();
        if move_actors.is_empty() {
            continue;
        }
        let content_actors: BTreeSet<&str> =
            b.body_ops.iter().map(|o| o.actor.as_str()).collect();
        let cross = content_actors.iter().any(|ca| !move_actors.contains(ca));
        let relocated = nodes
            .get(id)
            .map(|n| n.location.parent.is_some())
            .unwrap_or(false);
        if cross && relocated {
            conflicts.push(ConflictRecord {
                target_id: id.clone(),
                kind: ConflictKind::LocationRelocated,
                sub_field_key: None,
                live_op_id: None,
                losing_op_ids: Vec::new(),
                pinned_op_ids: Vec::new(),
            });
        }
    }
}

fn derive_ancestor_life_conflicts(
    buckets: &BTreeMap<String, NodeOps>,
    nodes: &BTreeMap<String, Node>,
    conflicts: &mut Vec<ConflictRecord>,
) {
    for (id, b) in buckets {
        if b.body_ops.is_empty() {
            continue;
        }
        // Nearest ancestor whose life is trashed/deleted.
        let mut cur = nodes.get(id).and_then(|n| n.location.parent.clone());
        let mut guard = 0usize;
        let mut hidden_ancestor: Option<&Node> = None;
        while let Some(p) = cur {
            if p == ROOT_SENTINEL {
                break;
            }
            match nodes.get(&p) {
                Some(pn) => {
                    if matches!(pn.life, Life::Trashed | Life::Deleted) {
                        hidden_ancestor = Some(pn);
                        break;
                    }
                    cur = pn.location.parent.clone();
                }
                None => break,
            }
            guard += 1;
            if guard > 100_000 {
                break;
            }
        }
        let Some(anc) = hidden_ancestor else { continue };
        // Concurrency heuristic: the descendant content edit came from a
        // different actor than whoever set the ancestor's life.
        let anc_life_actors: BTreeSet<&str> = buckets
            .get(&anc.id)
            .map(|ab| ab.life_ops.iter().map(|o| o.actor.as_str()).collect())
            .unwrap_or_default();
        let descendant_edits: Vec<&Op> = b
            .body_ops
            .iter()
            .filter(|o| !anc_life_actors.contains(o.actor.as_str()))
            .collect();
        if descendant_edits.is_empty() {
            continue;
        }
        let pinned: Vec<String> = descendant_edits.iter().map(|o| o.op_id.clone()).collect();
        conflicts.push(ConflictRecord {
            target_id: id.clone(),
            kind: ConflictKind::AncestorLifeVsDescendantEdit,
            sub_field_key: None,
            live_op_id: None,
            losing_op_ids: Vec::new(),
            pinned_op_ids: pinned,
        });
    }
}

fn derive_life_tie(buckets: &BTreeMap<String, NodeOps>, conflicts: &mut Vec<ConflictRecord>) {
    for (id, b) in buckets {
        let mut has_trashed = false;
        let mut has_archived = false;
        let mut trash_actor: Option<&str> = None;
        let mut archive_actor: Option<&str> = None;
        for op in &b.life_ops {
            if let OpPayload::LifeSet { life } = &op.payload {
                match life {
                    Life::Trashed => {
                        has_trashed = true;
                        trash_actor = Some(op.actor.as_str());
                    }
                    Life::Archived => {
                        has_archived = true;
                        archive_actor = Some(op.actor.as_str());
                    }
                    _ => {}
                }
            }
        }
        if has_trashed && has_archived && trash_actor != archive_actor {
            conflicts.push(ConflictRecord {
                target_id: id.clone(),
                kind: ConflictKind::LifeTie,
                sub_field_key: None,
                live_op_id: None,
                losing_op_ids: Vec::new(),
                pinned_op_ids: Vec::new(),
            });
        }
    }
}

/// Surface a structural macro (split / merge, marked by `macro_op_id`) that ran
/// concurrently with another actor's plain edit on the same node (D29, conflict
/// §6.1). Stage-1/CP-2 does not yet auto-rebase the structural intent against the
/// concurrent edit; the safety floor is to surface the collision and pin every
/// involved op so compaction never drops a side (no silent loss). The eventual
/// deterministic intent-rebase is a documented follow-up.
fn derive_split_merge_structural(
    buckets: &BTreeMap<String, NodeOps>,
    conflicts: &mut Vec<ConflictRecord>,
) {
    for (id, b) in buckets {
        let macro_actors: BTreeSet<&str> = b
            .body_ops
            .iter()
            .chain(b.life_ops.iter())
            .filter(|o| o.macro_op_id.is_some())
            .map(|o| o.actor.as_str())
            .collect();
        if macro_actors.is_empty() {
            continue;
        }
        // A plain (non-macro) body edit by a different actor is concurrent with
        // the structural macro on this node.
        let concurrent_edits: Vec<&Op> = b
            .body_ops
            .iter()
            .filter(|o| o.macro_op_id.is_none() && !macro_actors.contains(o.actor.as_str()))
            .collect();
        if concurrent_edits.is_empty() {
            continue;
        }
        let mut pinned: Vec<String> = Vec::new();
        for op in b.body_ops.iter().chain(b.life_ops.iter()) {
            if op.macro_op_id.is_some() {
                pinned.push(op.op_id.clone());
            }
        }
        for op in &concurrent_edits {
            pinned.push(op.op_id.clone());
        }
        pinned.sort();
        pinned.dedup();
        conflicts.push(ConflictRecord {
            target_id: id.clone(),
            kind: ConflictKind::SplitMergeStructural,
            sub_field_key: None,
            live_op_id: None,
            losing_op_ids: Vec::new(),
            pinned_op_ids: pinned,
        });
    }
}

fn derive_reorder_blend(buckets: &BTreeMap<String, NodeOps>, conflicts: &mut Vec<ConflictRecord>) {
    for (id, b) in buckets {
        let reorder_actors: BTreeSet<&str> = b
            .location_ops
            .iter()
            .filter(|o| matches!(o.payload, OpPayload::SetLocation { .. } | OpPayload::Renormalize { .. }))
            .map(|o| o.actor.as_str())
            .collect();
        if reorder_actors.len() >= 2 {
            conflicts.push(ConflictRecord {
                target_id: id.clone(),
                kind: ConflictKind::ReorderBlend,
                sub_field_key: None,
                live_op_id: None,
                losing_op_ids: Vec::new(),
                pinned_op_ids: Vec::new(),
            });
        }
    }
}
