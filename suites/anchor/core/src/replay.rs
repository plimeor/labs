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
    let (sorted, rebased, observed) =
        rebase_structural_edits(drop_incomplete_macros(dedup_and_sort(ops)));

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
    derive_split_merge_structural(&buckets, &rebased, &observed, &mut conflicts);

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

/// Deterministic split/merge **intent-rebase** (conflict §6.1, the follow-up to
/// the surface+pin floor). A plain body edit that ran concurrently with a
/// structural split or merge-backward macro on the same block is re-applied —
/// at replay time, never in the log — onto the side of the structure its hunks
/// belong to:
///
/// - split: every hunk entirely in the left part ⇒ re-applied to the kept
///   block's truncated body (a boundary insert counts as left); every hunk
///   entirely in the right part ⇒ redirected to the split-created block with
///   offsets shifted by the split point;
/// - merge-backward: an edit on the merged-away (trashed) block is folded into
///   the absorbing block's merged body at the absorbed offset.
///
/// The rewritten edit bases on the structural result's body rev, so the body
/// frontier collapses cleanly instead of keeping-both. The rebase is a pure
/// function of the deduped op set (the log itself is never mutated), so every
/// replica derives the identical view in any arrival order.
///
/// Conservative by design — any of these falls back to the surface+pin floor:
/// hunks straddling the split point, an unrecoverable base body, a macro group
/// that does not byte-validate as a split (`pre == left + right`) or merge
/// (`merged == previous + absorbed`), an edit another op already chains on, a
/// mark-only edit (no text hunks), an ambiguous multi-candidate match, or a
/// hunk landing inside a surrogate pair.
/// Returns `(ops, rebased, observed)`: the (possibly rewritten) op set, the ids
/// of edits that were integrated, and the ids of body ops a validated macro
/// causally consumed (its pre-image) — both are excluded from the structural
/// conflict surface, since neither is *concurrent unresolved* work.
fn rebase_structural_edits(ops: Vec<Op>) -> (Vec<Op>, BTreeSet<String>, BTreeSet<String>) {
    // Content-addressed body index (computed revs, as resolve_body uses) and
    // the set of all revs some op bases on (the chain guard).
    let mut body_by_rev: BTreeMap<String, Body> = BTreeMap::new();
    let mut bases: BTreeSet<String> = BTreeSet::new();
    let mut groups: BTreeMap<String, Vec<usize>> = BTreeMap::new();
    for (i, op) in ops.iter().enumerate() {
        if let OpPayload::SetBody { text, marks } = &op.payload {
            let body = Body {
                text: text.clone(),
                marks: marks.clone(),
            };
            body_by_rev.insert(body_sub_rev(&body), body);
        }
        if let Some(b) = &op.base_sub_rev {
            bases.insert(b.clone());
        }
        if let Some(m) = &op.macro_op_id {
            groups.entry(m.clone()).or_default().push(i);
        }
    }

    let mut splits: Vec<SplitShape> = Vec::new();
    let mut merges: Vec<MergeShape> = Vec::new();
    for indices in groups.values() {
        if let Some(split) = recognize_split(&ops, indices, &body_by_rev) {
            splits.push(split);
        } else if let Some(merge) = recognize_merge(&ops, indices, &body_by_rev) {
            merges.push(merge);
        }
    }

    let mut rebased: BTreeSet<String> = BTreeSet::new();
    let mut observed: BTreeSet<String> = BTreeSet::new();
    if splits.is_empty() && merges.is_empty() {
        return (ops, rebased, observed);
    }

    // Ops whose body a validated macro consumed (the macro's pre-image).
    for op in &ops {
        let Some(body) = payload_body(op) else {
            continue;
        };
        let rev = body_sub_rev(&body);
        let split_pre = splits
            .iter()
            .any(|s| s.original == op.target_id && s.pre_rev == rev);
        let merge_pre = merges.iter().any(|m| {
            (m.previous == op.target_id && m.prev_rev == rev)
                || (m.trashed == op.target_id && m.absorbed_text == body.text)
        });
        if split_pre || merge_pre {
            observed.insert(op.op_id.clone());
        }
    }

    let mut ops = ops;
    for op in &mut ops {
        let Some(new_op) = rebase_one(op, &splits, &merges, &body_by_rev, &bases) else {
            continue;
        };
        rebased.insert(new_op.op_id.clone());
        *op = new_op;
    }
    (ops, rebased, observed)
}

/// A byte-validated split macro: `pre == left + right`, split at `at`.
struct SplitShape {
    original: String,
    new_block: String,
    at: u32,
    pre_rev: String,
    left: Body,
    right: Body,
}

/// A byte-validated merge-backward macro: `merged == previous + absorbed`.
struct MergeShape {
    previous: String,
    trashed: String,
    merged: Body,
    /// The absorbing block's pre-merge body rev (the macro's base).
    prev_rev: String,
    /// UTF-16 offset where the absorbed body begins inside `merged`.
    offset: u32,
    /// The absorbed (trashed-side) body text, for matching an edit's base.
    absorbed_text: String,
}

fn recognize_split(
    ops: &[Op],
    indices: &[usize],
    body_by_rev: &BTreeMap<String, Body>,
) -> Option<SplitShape> {
    if indices.len() != 3 {
        return None;
    }
    let mut create: Option<&Op> = None;
    let mut body_ops: Vec<&Op> = Vec::new();
    for &i in indices {
        match &ops[i].payload {
            OpPayload::Create { .. } => create = Some(&ops[i]),
            OpPayload::SetBody { .. } => body_ops.push(&ops[i]),
            _ => return None,
        }
    }
    let create = create?;
    if body_ops.len() != 2 {
        return None;
    }
    let new_block = create.target_id.clone();
    let right_op = body_ops.iter().find(|o| o.target_id == new_block)?;
    let left_op = body_ops.iter().find(|o| o.target_id != new_block)?;
    let pre_rev = left_op.base_sub_rev.clone()?;
    let pre = body_by_rev.get(&pre_rev)?;
    let left = payload_body(left_op)?;
    let right = payload_body(right_op)?;
    let mut joined = left.text.clone();
    joined.push_str(&right.text);
    if pre.text != joined {
        return None;
    }
    Some(SplitShape {
        original: left_op.target_id.clone(),
        new_block,
        at: left.text.encode_utf16().count() as u32,
        pre_rev,
        left,
        right,
    })
}

fn recognize_merge(
    ops: &[Op],
    indices: &[usize],
    body_by_rev: &BTreeMap<String, Body>,
) -> Option<MergeShape> {
    if indices.len() != 2 {
        return None;
    }
    let mut body_op: Option<&Op> = None;
    let mut trash_op: Option<&Op> = None;
    for &i in indices {
        match &ops[i].payload {
            OpPayload::SetBody { .. } => body_op = Some(&ops[i]),
            OpPayload::LifeSet {
                life: Life::Trashed,
            } => trash_op = Some(&ops[i]),
            _ => return None,
        }
    }
    let body_op = body_op?;
    let trash_op = trash_op?;
    if body_op.target_id == trash_op.target_id {
        return None;
    }
    let prev_rev = body_op.base_sub_rev.as_ref()?;
    let previous_body = body_by_rev.get(prev_rev)?;
    let merged = payload_body(body_op)?;
    let absorbed_text = merged.text.strip_prefix(previous_body.text.as_str())?;
    Some(MergeShape {
        previous: body_op.target_id.clone(),
        trashed: trash_op.target_id.clone(),
        prev_rev: prev_rev.clone(),
        offset: previous_body.text.encode_utf16().count() as u32,
        absorbed_text: String::from(absorbed_text),
        merged,
    })
}

fn payload_body(op: &Op) -> Option<Body> {
    match &op.payload {
        OpPayload::SetBody { text, marks } => Some(Body {
            text: text.clone(),
            marks: marks.clone(),
        }),
        _ => None,
    }
}

/// The rebased replacement for one plain concurrent edit, or `None` to keep the
/// op as-is (and let the conflict floor handle it).
fn rebase_one(
    op: &Op,
    splits: &[SplitShape],
    merges: &[MergeShape],
    body_by_rev: &BTreeMap<String, Body>,
    bases: &BTreeSet<String>,
) -> Option<Op> {
    if op.macro_op_id.is_some() {
        return None;
    }
    let edited = payload_body(op)?;
    let base_rev = op.base_sub_rev.as_ref()?;
    // Chain guard: another op bases on this edit — leave the chain intact.
    if bases.contains(&body_sub_rev(&edited)) {
        return None;
    }

    let split_candidates: Vec<&SplitShape> = splits
        .iter()
        .filter(|s| s.original == op.target_id && s.pre_rev == *base_rev)
        .collect();
    if let [split] = split_candidates.as_slice() {
        let pre = body_by_rev.get(&split.pre_rev)?;
        let edits = diff3::text_edits(&pre.text, &edited.text);
        if edits.is_empty() {
            return None;
        }
        if edits.iter().all(|e| e.at + e.old_len <= split.at) {
            return rebuilt(op, &op.target_id, &split.left, &edits);
        }
        if edits.iter().all(|e| e.at >= split.at) {
            let shifted: Vec<diff3::TextEdit> = edits
                .iter()
                .map(|e| diff3::TextEdit {
                    at: e.at - split.at,
                    old_len: e.old_len,
                    insert: e.insert.clone(),
                })
                .collect();
            return rebuilt(op, &split.new_block, &split.right, &shifted);
        }
        return None; // straddles the split point → floor
    }
    if !split_candidates.is_empty() {
        return None; // ambiguous → floor
    }

    let merge_candidates: Vec<&MergeShape> = merges
        .iter()
        .filter(|m| {
            m.trashed == op.target_id
                && body_by_rev
                    .get(base_rev)
                    .is_some_and(|b| b.text == m.absorbed_text)
        })
        .collect();
    if let [merge] = merge_candidates.as_slice() {
        let absorbed = body_by_rev.get(base_rev)?;
        let edits = diff3::text_edits(&absorbed.text, &edited.text);
        if edits.is_empty() {
            return None;
        }
        let shifted: Vec<diff3::TextEdit> = edits
            .iter()
            .map(|e| diff3::TextEdit {
                at: e.at + merge.offset,
                old_len: e.old_len,
                insert: e.insert.clone(),
            })
            .collect();
        return rebuilt(op, &merge.previous, &merge.merged, &shifted);
    }
    None
}

/// Rebuild `op` as the same edit re-applied onto `onto` (the structural side's
/// body), retargeted to `target` and based on the structural result so the body
/// frontier collapses cleanly.
fn rebuilt(op: &Op, target: &str, onto: &Body, edits: &[diff3::TextEdit]) -> Option<Op> {
    let new_text = diff3::apply_text_edits(&onto.text, edits)?;
    let splices: Vec<marks::Splice> = edits.iter().map(diff3::TextEdit::splice).collect();
    let new_body = Body {
        text: new_text,
        marks: marks::reclamp(&onto.marks, &splices),
    };
    let mut out = op.clone();
    out.target_id = String::from(target);
    out.base_sub_rev = Some(body_sub_rev(onto));
    out.new_sub_rev = Some(body_sub_rev(&new_body));
    out.payload = OpPayload::SetBody {
        text: new_body.text,
        marks: new_body.marks,
    };
    Some(out)
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
///
/// `Renormalize` ops are maintenance, not user intent, and apply
/// compare-and-swap (F26c): an op carrying a `base_snapshot_revision` is
/// honored only while its target's location is still exactly the one it was
/// computed against. A macro'd renormalize group (one stamp ⇒ contiguous in
/// `T`) is all-or-nothing — if ANY member's base is stale, the whole group
/// collapses silently, so a concurrent move always wins over rebalancing and a
/// partial rebalance can never reorder siblings.
fn resolve_locations(sorted: &[Op]) -> (BTreeMap<String, Location>, BTreeSet<String>) {
    let mut parents: BTreeMap<String, Location> = BTreeMap::new();
    let mut skipped: BTreeSet<String> = BTreeSet::new();
    let mut i = 0;
    while i < sorted.len() {
        let op = &sorted[i];
        if op.register != Register::Location {
            i += 1;
            continue;
        }
        if is_renormalize(op) && op.macro_op_id.is_some() {
            let group_end = renormalize_group_end(sorted, i);
            let group = &sorted[i..group_end];
            if group.iter().all(|g| renormalize_base_is_fresh(g, &parents)) {
                for g in group {
                    apply_renormalize(g, &mut parents);
                }
            }
            i = group_end;
            continue;
        }
        let (parent, order) = match &op.payload {
            OpPayload::Create { location, .. } => (location.parent.clone(), location.order.clone()),
            OpPayload::SetLocation { parent, order } => (parent.clone(), order.clone()),
            OpPayload::Renormalize { order, .. } => {
                if !renormalize_base_is_fresh(op, &parents) {
                    i += 1;
                    continue;
                }
                let cur_parent = parents.get(&op.target_id).and_then(|l| l.parent.clone());
                (cur_parent, order.clone())
            }
            _ => {
                i += 1;
                continue;
            }
        };
        if would_cycle(&parents, &op.target_id, parent.as_deref()) {
            skipped.insert(op.target_id.clone());
            i += 1;
            continue;
        }
        parents.insert(op.target_id.clone(), Location { parent, order });
        i += 1;
    }
    (parents, skipped)
}

fn is_renormalize(op: &Op) -> bool {
    op.register == Register::Location && matches!(op.payload, OpPayload::Renormalize { .. })
}

/// End (exclusive) of the contiguous renormalize run sharing `sorted[start]`'s
/// macro id. Macro ops share one stamp, so they are adjacent under `T`.
fn renormalize_group_end(sorted: &[Op], start: usize) -> usize {
    let macro_id = &sorted[start].macro_op_id;
    let mut end = start;
    while end < sorted.len() && is_renormalize(&sorted[end]) && &sorted[end].macro_op_id == macro_id
    {
        end += 1;
    }
    end
}

/// F26c freshness: no base ⇒ unconditional (legacy shape); with a base, the
/// target's current location rev must equal it.
fn renormalize_base_is_fresh(op: &Op, parents: &BTreeMap<String, Location>) -> bool {
    let OpPayload::Renormalize {
        base_snapshot_revision,
        ..
    } = &op.payload
    else {
        return false;
    };
    let Some(base) = base_snapshot_revision else {
        return true;
    };
    parents
        .get(&op.target_id)
        .map(|loc| crate::model::location_rev(loc) == *base)
        .unwrap_or(false)
}

/// Apply one fresh renormalize: the order is rebalanced, the parent kept (so no
/// cycle can be introduced).
fn apply_renormalize(op: &Op, parents: &mut BTreeMap<String, Location>) {
    let OpPayload::Renormalize { order, .. } = &op.payload else {
        return;
    };
    let parent = parents.get(&op.target_id).and_then(|l| l.parent.clone());
    parents.insert(
        op.target_id.clone(),
        Location {
            parent,
            order: order.clone(),
        },
    );
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
/// §6.1). Edits whose hunks fall cleanly on one side were already folded in by
/// `rebase_structural_edits`; what remains here is the safety floor for the
/// rest (straddling/ambiguous/unrecoverable cases): surface the collision and
/// pin every involved op so compaction never drops a side (no silent loss).
fn derive_split_merge_structural(
    buckets: &BTreeMap<String, NodeOps>,
    rebased: &BTreeSet<String>,
    observed: &BTreeSet<String>,
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
        // Body revs some other op on this node bases on: a superseded op is
        // causal history, not a concurrent edit.
        let node_bases: BTreeSet<&str> = b
            .body_ops
            .iter()
            .filter_map(|o| o.base_sub_rev.as_deref())
            .collect();
        // A plain (non-macro) body edit by a different actor is concurrent with
        // the structural macro — unless the rebase pass integrated it, the
        // macro causally consumed it (its pre-image), or it is superseded.
        let concurrent_edits: Vec<&Op> = b
            .body_ops
            .iter()
            .filter(|o| {
                o.macro_op_id.is_none()
                    && !macro_actors.contains(o.actor.as_str())
                    && !rebased.contains(&o.op_id)
                    && !observed.contains(&o.op_id)
                    && !payload_body(o)
                        .is_some_and(|body| node_bases.contains(body_sub_rev(&body).as_str()))
            })
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
