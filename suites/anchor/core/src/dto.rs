//! The minimal DTO / call surface for the Apple binding spike (owned by Codex).
//!
//! These are the structured records the binding marshals (UniFFI primary, C ABI
//! bytes fast-path fallback — D01). They are intentionally flat versioned
//! records/enums (no deep recursion/generics) so they bind cleanly. The full
//! `anchor-editor-core` surface is larger; this is the Stage-1 subset sufficient
//! to prove `open_fixture_vault → dispatch(EditorIntent) → TransactionResult`
//! round-trips and to feed a `read_segment(SegmentId) -> bytes` benchmark.

use crate::hash;
use crate::hlc::Hlc;
use crate::id::journal_note_id;
use crate::marks::Mark;
use crate::model::{body_sub_rev, scalar_sub_rev, Life, Location, TargetKind, Vault};
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
    /// Reserved: core currently only emits `Text`, but the FFI matches every
    /// variant exhaustively, so `Block` (whole-block selection) stays in the
    /// generated binding surface for future use.
    Block {
        block_id: String,
    },
    /// Reserved: selection local to an embedded editor (e.g. a code block
    /// payload). Not yet emitted by core; kept for binding-surface stability.
    Embedded {
        block_id: String,
        start: u32,
        end: u32,
    },
}

/// Core-sourced editor projection patch. This is the Stage-1 lower-bound DTO
/// consumed by native adapters; it is derived from committed core state and is
/// never a source of truth.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum EditorPatch {
    ReplaceBlockText {
        block_id: String,
        text: String,
        selection_start: u32,
        selection_end: u32,
    },
    InsertTextSurface {
        after_block_id: String,
        block_id: String,
        text: String,
        selection_start: u32,
        selection_end: u32,
    },
    RemoveTextSurface {
        block_id: String,
    },
}

/// Core-owned undo group lower bound. It groups the inverse projection patches
/// for a committed transaction; future CP-2 work can upgrade this to inverse
/// dispatch intents without moving grouping ownership to the client.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UndoGroup {
    pub group_id: String,
    pub label: String,
    pub inverse_patches: Vec<EditorPatch>,
}

/// Editor intent (the core text-editing surface; additive over the Stage-1
/// subset, so existing bindings keep constructing the original variants).
#[derive(Clone, Debug)]
pub enum EditorIntent {
    InsertText {
        target_id: String,
        at: u32,
        text: String,
    },
    /// Delete the UTF-16 range `[at, at+len)`.
    DeleteText {
        target_id: String,
        at: u32,
        len: u32,
    },
    /// Replace the UTF-16 range `[at, at+len)` with `text` (the general edit;
    /// insert and delete are its special cases).
    ReplaceText {
        target_id: String,
        at: u32,
        len: u32,
        text: String,
    },
    /// Remove `kind` formatting from `[start, end)`: an overlapping mark of
    /// that kind is trimmed to its parts outside the range (an exact cover
    /// removes it entirely).
    RemoveMark {
        target_id: String,
        start: u32,
        end: u32,
        kind: String,
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
    /// Structural editor intents, dispatched via dedicated macro builders: split
    /// a block at a UTF-16 offset, merge a block into its previous living
    /// sibling, or create a new block under `parent_id` (after
    /// `after_block_id`, or appended at the end). Their ops share a
    /// `macro_op_id` and replay all-or-nothing (D29).
    SplitBlock {
        target_id: String,
        at: u32,
    },
    MergeBackward {
        target_id: String,
    },
    CreateBlock {
        parent_id: String,
        after_block_id: Option<String>,
        text: String,
    },
}

/// The result handed back to the platform adapter after a dispatch.
#[derive(Clone, Debug)]
pub struct TransactionResult {
    pub changed_ids: Vec<String>,
    pub validation_error: Option<ValidationError>,
    pub new_revisions: BTreeMap<String, String>,
    pub selection_hint: Option<Selection>,
    pub editor_patches: Vec<EditorPatch>,
    pub undo_group: Option<UndoGroup>,
    pub conflicts: Vec<crate::model::ConflictRecord>,
    /// Stage-1 placeholders: always `true`. A future projection/mirror freshness
    /// gate will compute these in `commit`; until then there is no `false` path,
    /// so adapters must not branch on them yet.
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

    /// An empty session (no fixture content): the entry point for imports and
    /// for replicas that materialize purely from ingested segments.
    pub fn open_empty() -> Session {
        Session {
            log: Vec::new(),
            vault: Vault::default(),
            vault_id: "vault_demo_0001".to_string(),
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
    /// validate → append → replay → result. Structural intents are routed to
    /// their macro builders (guard clauses); every path lands at the single
    /// validated `commit` chokepoint.
    pub fn dispatch(&mut self, intent: EditorIntent, stamp: OpStamp) -> TransactionResult {
        if let EditorIntent::SplitBlock { target_id, at } = &intent {
            return self.dispatch_split_block(target_id, *at, stamp);
        }
        if let EditorIntent::MergeBackward { target_id } = &intent {
            return self.dispatch_merge_backward(target_id, stamp);
        }
        if let EditorIntent::CreateBlock {
            parent_id,
            after_block_id,
            text,
        } = &intent
        {
            return self.dispatch_create_block(parent_id, after_block_id.as_deref(), text, stamp);
        }

        let selection_hint = self.selection_hint(&intent);
        let op = match self.build_op(&intent, &stamp) {
            Ok(op) => op,
            Err(e) => return self.error_result(e),
        };
        let target = op.target_id.clone();
        let editor_patches = self.editor_patches_for_single_op(&op, &selection_hint);
        let undo_group = self.undo_group_for_single_op(&op, &intent, &stamp);
        self.commit(
            alloc::vec![op],
            alloc::vec![target],
            selection_hint,
            editor_patches,
            undo_group,
        )
    }

    /// Apply a core-issued undo group back through the op-log. This is still a
    /// lower bound: it proves inverse projection patches can become committed
    /// core ops, but it does not claim redo or product NSUndoManager semantics.
    pub fn dispatch_undo_group(&mut self, group: UndoGroup, stamp: OpStamp) -> TransactionResult {
        let editor_patches = group.inverse_patches.clone();
        let selection_hint = selection_hint_for_patches(&editor_patches);
        let ops = match self.ops_for_undo_group(&group, &stamp) {
            Ok(ops) => ops,
            Err(e) => return self.error_result(e),
        };
        let changed_ids = changed_ids_for_patches(&editor_patches);
        self.commit(ops, changed_ids, selection_hint, editor_patches, None)
    }

    /// Import external markdown as one new Note whose blocks follow the
    /// paragraph plan (`importer::plan_import`). The whole import is a single
    /// macro group: it commits through the validated chokepoint and replays
    /// all-or-nothing, so a partially delivered import never materializes.
    /// Ids/orders derive from the caller's stamp (D36) and from `crate::order`.
    pub fn dispatch_import_markdown(&mut self, md: &str, stamp: OpStamp) -> TransactionResult {
        let blocks = crate::importer::plan_import(md);
        let note_id = format!("note_{}", stamp.op_id);
        let macro_id = format!("macro_import_{}", stamp.op_id);

        let last_root_order = self
            .vault
            .nodes
            .values()
            .filter(|node| node.location.parent.is_none())
            .map(|node| node.location.order.clone())
            .max();
        let Ok(note_order) = crate::order::key_between(last_root_order.as_deref(), None) else {
            return self.error_result(ValidationError::StructuralDispatchDeferred);
        };
        let Ok(block_orders) = crate::order::keys_after(None, blocks.len()) else {
            return self.error_result(ValidationError::StructuralDispatchDeferred);
        };

        let mut ops = alloc::vec![OpBuilder::new(
            format!("{}_note_create", stamp.op_id),
            stamp.hlc.clone(),
            stamp.actor.clone(),
            note_id.clone(),
            TargetKind::Note,
            Register::Location,
            OpKind::Create,
            OpPayload::Create {
                kind: TargetKind::Note,
                location: Location::new(None, note_order),
            },
        )
        .seq(stamp.seq)
        .macro_op_id(macro_id.clone())
        .build()];
        let mut changed_ids = alloc::vec![note_id.clone()];
        for (index, text) in blocks.iter().enumerate() {
            // Zero-padded so block id order matches paragraph order in mirrors.
            let block_id = format!("blk_{}_{index:04}", stamp.op_id);
            let body = crate::model::Body::plain(text.clone());
            ops.push(
                OpBuilder::new(
                    format!("{}_blk_{index:04}_create", stamp.op_id),
                    stamp.hlc.clone(),
                    stamp.actor.clone(),
                    block_id.clone(),
                    TargetKind::Block,
                    Register::Location,
                    OpKind::Create,
                    OpPayload::Create {
                        kind: TargetKind::Block,
                        location: Location::new(Some(note_id.clone()), block_orders[index].clone()),
                    },
                )
                .seq(stamp.seq)
                .macro_op_id(macro_id.clone())
                .build(),
            );
            ops.push(
                OpBuilder::new(
                    format!("{}_blk_{index:04}_body", stamp.op_id),
                    stamp.hlc.clone(),
                    stamp.actor.clone(),
                    block_id.clone(),
                    TargetKind::Block,
                    Register::Content,
                    OpKind::Set,
                    OpPayload::SetBody {
                        text: body.text.clone(),
                        marks: Vec::new(),
                    },
                )
                .seq(stamp.seq)
                .sub_field(SubFieldKey::Body)
                .new_sub_rev(body_sub_rev(&body))
                .macro_op_id(macro_id.clone())
                .build(),
            );
            changed_ids.push(block_id);
        }
        self.commit(ops, changed_ids, None, Vec::new(), None)
    }

    /// Rebalance the order keys of `parent_id`'s living children (F26): the
    /// `Renormalize` op producer. Emits one op per child whose key changes, as a
    /// single atomic macro; each op carries the location rev it was computed
    /// against (`base_snapshot_revision`), and replay collapses the whole macro
    /// if any base went stale (F26c) — a concurrent move always wins over
    /// maintenance, never the reverse.
    pub fn dispatch_renormalize_children(
        &mut self,
        parent_id: Option<&str>,
        stamp: OpStamp,
    ) -> TransactionResult {
        let mut children: Vec<(String, crate::model::Location)> = self
            .vault
            .nodes
            .values()
            .filter(|node| node.location.parent.as_deref() == parent_id && node.life.is_living())
            .map(|node| (node.id.clone(), node.location.clone()))
            .collect();
        // Current sibling sequence; same-key ties break deterministically by id.
        children.sort_by(|a, b| a.1.order.cmp(&b.1.order).then(a.0.cmp(&b.0)));
        if children.len() < 2 {
            return self.commit(Vec::new(), Vec::new(), None, Vec::new(), None);
        }
        let Ok(orders) = crate::order::keys_after(None, children.len()) else {
            return self.error_result(ValidationError::StructuralDispatchDeferred);
        };
        let macro_id = format!("macro_renorm_{}", stamp.op_id);
        let mut ops = Vec::new();
        let mut changed_ids = Vec::new();
        for (index, (child_id, location)) in children.iter().enumerate() {
            if location.order == orders[index] {
                continue;
            }
            ops.push(
                OpBuilder::new(
                    format!("{}_renorm_{index:04}", stamp.op_id),
                    stamp.hlc.clone(),
                    stamp.actor.clone(),
                    child_id.clone(),
                    self.kind_of(child_id),
                    Register::Location,
                    OpKind::Renormalize,
                    OpPayload::Renormalize {
                        order: orders[index].clone(),
                        base_snapshot_revision: Some(crate::model::location_rev(location)),
                    },
                )
                .seq(stamp.seq)
                .macro_op_id(macro_id.clone())
                .build(),
            );
            changed_ids.push(child_id.clone());
        }
        self.commit(ops, changed_ids, None, Vec::new(), None)
    }

    /// The single validated-dispatch chokepoint (CP-2 invariant): the **only**
    /// site in the crate that appends to the op-log. Every persistent write —
    /// single-op, structural macro, or undo replay — funnels through here and is
    /// gated by `validate_batch`; an invalid batch is rejected with the log left
    /// untouched. A `rg "self\.log\.(extend|push)" src/` proof must return
    /// exactly one match (this method).
    fn commit(
        &mut self,
        mut ops: Vec<Op>,
        changed_ids: Vec<String>,
        selection_hint: Option<Selection>,
        editor_patches: Vec<EditorPatch>,
        undo_group: Option<UndoGroup>,
    ) -> TransactionResult {
        // Stamp each macro group's size so replay can apply it all-or-nothing.
        stamp_macro_sizes(&mut ops);
        if let Err(error) = self.validate_batch(&ops) {
            return self.error_result(error);
        }
        self.log.extend(ops);
        self.vault = replay(&self.log);
        let mut new_revisions = BTreeMap::new();
        for id in &changed_ids {
            if let Some(rev) = self.vault.node_snapshot_revision(id) {
                new_revisions.insert(id.clone(), rev);
            }
        }
        let conflicts = self
            .vault
            .conflicts
            .iter()
            .filter(|c| changed_ids.iter().any(|id| id == &c.target_id))
            .cloned()
            .collect();
        TransactionResult {
            changed_ids,
            validation_error: None,
            new_revisions,
            selection_hint,
            editor_patches,
            undo_group,
            conflicts,
            projection_fresh: true,
            mirror_fresh: true,
        }
    }

    /// Append-front validation for the single dispatch chokepoint. Re-derives the
    /// life-register terminal-reachability guard against the current vault plus
    /// the in-flight batch, so no dispatch path — single op, structural macro, or
    /// undo replay — can append a direct `active → deleted` (D10/D20). The guard
    /// lives here (not in op construction) so it provably gates every append.
    fn validate_batch(&self, ops: &[Op]) -> Result<(), ValidationError> {
        let mut pending_life: BTreeMap<&str, Life> = BTreeMap::new();
        for op in ops {
            if let OpPayload::LifeSet { life } = &op.payload {
                if *life == Life::Deleted {
                    let current = pending_life
                        .get(op.target_id.as_str())
                        .copied()
                        .or_else(|| self.vault.nodes.get(&op.target_id).map(|n| n.life))
                        .unwrap_or(Life::Active);
                    if current != Life::Trashed {
                        return Err(ValidationError::DirectActiveToDeleted);
                    }
                }
                pending_life.insert(op.target_id.as_str(), *life);
            }
        }
        Ok(())
    }

    fn editor_patches_for_single_op(
        &self,
        op: &Op,
        selection_hint: &Option<Selection>,
    ) -> Vec<EditorPatch> {
        let OpPayload::SetBody { text, .. } = &op.payload else {
            return Vec::new();
        };
        let (selection_start, selection_end) = match selection_hint {
            Some(Selection::Text { start, end, .. }) => (*start, *end),
            _ => {
                let len = text.encode_utf16().count() as u32;
                (len, len)
            }
        };
        alloc::vec![EditorPatch::ReplaceBlockText {
            block_id: op.target_id.clone(),
            text: text.clone(),
            selection_start,
            selection_end,
        }]
    }

    fn undo_group_for_single_op(
        &self,
        op: &Op,
        intent: &EditorIntent,
        stamp: &OpStamp,
    ) -> Option<UndoGroup> {
        let OpPayload::SetBody { .. } = &op.payload else {
            return None;
        };
        let previous = self.current_body(&op.target_id)?;
        let selection = match intent {
            EditorIntent::InsertText { at, .. } => (*at, *at),
            // Undo re-selects the restored range.
            EditorIntent::DeleteText { at, len, .. }
            | EditorIntent::ReplaceText { at, len, .. } => (*at, *at + *len),
            EditorIntent::ApplyMark { start, end, .. }
            | EditorIntent::RemoveMark { start, end, .. } => (*start, *end),
            _ => {
                let len = previous.text.encode_utf16().count() as u32;
                (len, len)
            }
        };
        Some(UndoGroup {
            group_id: format!("undo_{}", stamp.op_id),
            label: "replace_block_text".to_string(),
            inverse_patches: alloc::vec![EditorPatch::ReplaceBlockText {
                block_id: op.target_id.clone(),
                text: previous.text,
                selection_start: selection.0,
                selection_end: selection.1,
            }],
        })
    }

    fn ops_for_undo_group(
        &self,
        group: &UndoGroup,
        stamp: &OpStamp,
    ) -> Result<Vec<Op>, ValidationError> {
        let mut ops = Vec::new();
        let macro_id = format!("macro_undo_{}", stamp.op_id);
        for (index, patch) in group.inverse_patches.iter().enumerate() {
            match patch {
                EditorPatch::ReplaceBlockText { block_id, text, .. } => {
                    let current = self
                        .current_body(block_id)
                        .ok_or(ValidationError::StructuralDispatchDeferred)?;
                    let next_body = crate::model::Body::plain(text);
                    ops.push(
                        OpBuilder::new(
                            format!("{}_undo_{}_replace_body", stamp.op_id, index),
                            stamp.hlc.clone(),
                            stamp.actor.clone(),
                            block_id.clone(),
                            self.kind_of(block_id),
                            Register::Content,
                            OpKind::Set,
                            OpPayload::SetBody {
                                text: next_body.text.clone(),
                                marks: next_body.marks.clone(),
                            },
                        )
                        .seq(stamp.seq)
                        .sub_field(SubFieldKey::Body)
                        .base_sub_rev(body_sub_rev(&current))
                        .new_sub_rev(body_sub_rev(&next_body))
                        .macro_op_id(macro_id.clone())
                        .build(),
                    );
                }
                EditorPatch::InsertTextSurface {
                    after_block_id,
                    block_id,
                    text,
                    ..
                } => {
                    if !self.vault.nodes.contains_key(after_block_id) {
                        return Err(ValidationError::StructuralDispatchDeferred);
                    }
                    if !self.vault.nodes.contains_key(block_id) {
                        ops.push(self.create_undo_surface_op(
                            stamp,
                            index,
                            &macro_id,
                            after_block_id,
                            block_id,
                        )?);
                    } else {
                        ops.push(
                            OpBuilder::new(
                                format!("{}_undo_{}_restore_surface", stamp.op_id, index),
                                stamp.hlc.clone(),
                                stamp.actor.clone(),
                                block_id.clone(),
                                self.kind_of(block_id),
                                Register::Life,
                                OpKind::Restore,
                                OpPayload::LifeSet { life: Life::Active },
                            )
                            .seq(stamp.seq)
                            .macro_op_id(macro_id.clone())
                            .build(),
                        );
                    }
                    let current = self.current_body_or_empty(block_id);
                    let next_body = crate::model::Body::plain(text);
                    ops.push(
                        OpBuilder::new(
                            format!("{}_undo_{}_insert_surface_body", stamp.op_id, index),
                            stamp.hlc.clone(),
                            stamp.actor.clone(),
                            block_id.clone(),
                            self.kind_of(block_id),
                            Register::Content,
                            OpKind::Set,
                            OpPayload::SetBody {
                                text: next_body.text.clone(),
                                marks: next_body.marks.clone(),
                            },
                        )
                        .seq(stamp.seq)
                        .sub_field(SubFieldKey::Body)
                        .base_sub_rev(body_sub_rev(&current))
                        .new_sub_rev(body_sub_rev(&next_body))
                        .macro_op_id(macro_id.clone())
                        .build(),
                    );
                }
                EditorPatch::RemoveTextSurface { block_id } => {
                    if !self.vault.nodes.contains_key(block_id) {
                        return Err(ValidationError::StructuralDispatchDeferred);
                    }
                    ops.push(
                        OpBuilder::new(
                            format!("{}_undo_{}_remove_surface", stamp.op_id, index),
                            stamp.hlc.clone(),
                            stamp.actor.clone(),
                            block_id.clone(),
                            self.kind_of(block_id),
                            Register::Life,
                            OpKind::LifeSet,
                            OpPayload::LifeSet {
                                life: Life::Trashed,
                            },
                        )
                        .seq(stamp.seq)
                        .macro_op_id(macro_id.clone())
                        .build(),
                    );
                }
            }
        }
        Ok(ops)
    }

    fn create_undo_surface_op(
        &self,
        stamp: &OpStamp,
        index: usize,
        macro_id: &str,
        after_block_id: &str,
        block_id: &str,
    ) -> Result<Op, ValidationError> {
        let after = self
            .vault
            .nodes
            .get(after_block_id)
            .ok_or(ValidationError::StructuralDispatchDeferred)?;
        let next_order = self.next_sibling_order(after_block_id);
        let order =
            crate::order::key_between(Some(after.location.order.as_str()), next_order.as_deref())
                .map_err(|_| ValidationError::StructuralDispatchDeferred)?;
        Ok(OpBuilder::new(
            format!("{}_undo_{}_create_surface", stamp.op_id, index),
            stamp.hlc.clone(),
            stamp.actor.clone(),
            block_id.to_string(),
            TargetKind::Block,
            Register::Location,
            OpKind::Create,
            OpPayload::Create {
                kind: TargetKind::Block,
                location: Location::new(after.location.parent.clone(), order),
            },
        )
        .seq(stamp.seq)
        .macro_op_id(macro_id.to_string())
        .build())
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
            EditorIntent::DeleteText { target_id, at, .. } => Some(Selection::Text {
                block_id: target_id.clone(),
                start: *at,
                end: *at,
            }),
            EditorIntent::ReplaceText {
                target_id,
                at,
                text,
                ..
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
            }
            | EditorIntent::RemoveMark {
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

    fn split_body_at(
        &self,
        body: &crate::model::Body,
        at: u32,
    ) -> Result<(crate::model::Body, crate::model::Body), ValidationError> {
        let units: Vec<u16> = body.text.encode_utf16().collect();
        let at = (at as usize).min(units.len());
        let left_text =
            String::from_utf16(&units[..at]).map_err(|_| ValidationError::InvalidUtf16Offset)?;
        let right_text =
            String::from_utf16(&units[at..]).map_err(|_| ValidationError::InvalidUtf16Offset)?;
        let at = at as u32;
        let mut left_marks = Vec::new();
        let mut right_marks = Vec::new();
        for mark in &body.marks {
            if mark.end <= at {
                left_marks.push(mark.clone());
            } else if mark.start >= at {
                right_marks.push(Mark::new(
                    mark.kind.clone(),
                    mark.start - at,
                    mark.end - at,
                    mark.expand,
                ));
            } else {
                if mark.start < at {
                    left_marks.push(Mark::new(mark.kind.clone(), mark.start, at, mark.expand));
                }
                if mark.end > at {
                    right_marks.push(Mark::new(mark.kind.clone(), 0, mark.end - at, mark.expand));
                }
            }
        }
        Ok((
            crate::model::Body::new(left_text, left_marks),
            crate::model::Body::new(right_text, right_marks),
        ))
    }

    fn next_sibling_order(&self, target_id: &str) -> Option<String> {
        let target = self.vault.nodes.get(target_id)?;
        self.vault
            .nodes
            .values()
            .filter(|node| {
                node.id != target_id
                    && node.location.parent == target.location.parent
                    && node.location.order > target.location.order
            })
            .map(|node| node.location.order.clone())
            .min()
    }

    fn previous_sibling_id(&self, target_id: &str) -> Option<String> {
        let target = self.vault.nodes.get(target_id)?;
        self.vault
            .nodes
            .values()
            .filter(|node| {
                node.id != target_id
                    && node.location.parent == target.location.parent
                    && node.location.order < target.location.order
                    && node.life.is_living()
            })
            .max_by(|a, b| a.location.order.cmp(&b.location.order))
            .map(|node| node.id.clone())
    }

    fn kind_of(&self, target_id: &str) -> TargetKind {
        self.vault
            .nodes
            .get(target_id)
            .map(|node| node.kind)
            .unwrap_or(TargetKind::Block)
    }

    fn dispatch_split_block(
        &mut self,
        target_id: &str,
        at: u32,
        stamp: OpStamp,
    ) -> TransactionResult {
        let Some(target) = self.vault.nodes.get(target_id) else {
            return self.error_result(ValidationError::StructuralDispatchDeferred);
        };
        let current = self.current_body_or_empty(target_id);
        let (left_body, right_body) = match self.split_body_at(&current, at) {
            Ok(split) => split,
            Err(error) => return self.error_result(error),
        };
        let next_order = self.next_sibling_order(target_id);
        // Keep every order key inside crate::order — surface a structural error
        // rather than fabricating a `<order>z` key that bypasses the algorithm.
        let new_order = match crate::order::key_between(
            Some(target.location.order.as_str()),
            next_order.as_deref(),
        ) {
            Ok(order) => order,
            Err(_) => return self.error_result(ValidationError::StructuralDispatchDeferred),
        };
        let new_block_id = format!("blk_{}", stamp.op_id);
        let macro_id = format!("macro_{}", stamp.op_id);
        let undo_group_id = format!("undo_{}", stamp.op_id);
        let left_op = OpBuilder::new(
            format!("{}_a_left_body", stamp.op_id),
            stamp.hlc.clone(),
            stamp.actor.clone(),
            target_id.to_string(),
            TargetKind::Block,
            Register::Content,
            OpKind::Set,
            OpPayload::SetBody {
                text: left_body.text.clone(),
                marks: left_body.marks.clone(),
            },
        )
        .seq(stamp.seq)
        .sub_field(SubFieldKey::Body)
        .base_sub_rev(body_sub_rev(&current))
        .new_sub_rev(body_sub_rev(&left_body))
        .macro_op_id(macro_id.clone())
        .build();
        let create_op = OpBuilder::new(
            format!("{}_b_create_right", stamp.op_id),
            stamp.hlc.clone(),
            stamp.actor.clone(),
            new_block_id.clone(),
            TargetKind::Block,
            Register::Location,
            OpKind::Create,
            OpPayload::Create {
                kind: TargetKind::Block,
                location: Location::new(target.location.parent.clone(), new_order),
            },
        )
        .seq(stamp.seq)
        .macro_op_id(macro_id.clone())
        .build();
        let right_op = OpBuilder::new(
            format!("{}_c_right_body", stamp.op_id),
            stamp.hlc,
            stamp.actor,
            new_block_id.clone(),
            TargetKind::Block,
            Register::Content,
            OpKind::Set,
            OpPayload::SetBody {
                text: right_body.text.clone(),
                marks: right_body.marks.clone(),
            },
        )
        .seq(stamp.seq)
        .sub_field(SubFieldKey::Body)
        .new_sub_rev(body_sub_rev(&right_body))
        .macro_op_id(macro_id)
        .build();
        self.commit(
            alloc::vec![left_op, create_op, right_op],
            alloc::vec![target_id.to_string(), new_block_id.clone()],
            Some(Selection::Text {
                block_id: new_block_id.clone(),
                start: 0,
                end: 0,
            }),
            alloc::vec![
                EditorPatch::ReplaceBlockText {
                    block_id: target_id.to_string(),
                    text: left_body.text,
                    selection_start: at,
                    selection_end: at,
                },
                EditorPatch::InsertTextSurface {
                    after_block_id: target_id.to_string(),
                    block_id: new_block_id.clone(),
                    text: right_body.text,
                    selection_start: 0,
                    selection_end: 0,
                },
            ],
            Some(UndoGroup {
                group_id: undo_group_id,
                label: "split_block".to_string(),
                inverse_patches: alloc::vec![
                    EditorPatch::ReplaceBlockText {
                        block_id: target_id.to_string(),
                        text: current.text,
                        selection_start: at,
                        selection_end: at,
                    },
                    EditorPatch::RemoveTextSurface {
                        block_id: new_block_id,
                    },
                ],
            }),
        )
    }

    /// Create a new block under `parent_id`: after `after_block_id` when given,
    /// appended after the last child otherwise. One atomic macro (create +
    /// optional body), like the other structural intents.
    fn dispatch_create_block(
        &mut self,
        parent_id: &str,
        after_block_id: Option<&str>,
        text: &str,
        stamp: OpStamp,
    ) -> TransactionResult {
        if !self.vault.nodes.contains_key(parent_id) {
            return self.error_result(ValidationError::StructuralDispatchDeferred);
        }
        // The anchor sibling (patch + ordering) and the order bounds.
        let (anchor, lower, upper) = match after_block_id {
            Some(after) => {
                let Some(after_node) = self.vault.nodes.get(after) else {
                    return self.error_result(ValidationError::StructuralDispatchDeferred);
                };
                if after_node.location.parent.as_deref() != Some(parent_id) {
                    return self.error_result(ValidationError::StructuralDispatchDeferred);
                }
                (
                    Some(after.to_string()),
                    Some(after_node.location.order.clone()),
                    self.next_sibling_order(after),
                )
            }
            None => {
                let last = self
                    .vault
                    .nodes
                    .values()
                    .filter(|n| n.location.parent.as_deref() == Some(parent_id))
                    .max_by(|a, b| a.location.order.cmp(&b.location.order));
                (
                    last.map(|n| n.id.clone()),
                    last.map(|n| n.location.order.clone()),
                    None,
                )
            }
        };
        let Ok(order) = crate::order::key_between(lower.as_deref(), upper.as_deref()) else {
            return self.error_result(ValidationError::StructuralDispatchDeferred);
        };

        let new_block_id = format!("blk_{}", stamp.op_id);
        let macro_id = format!("macro_{}", stamp.op_id);
        let mut ops = alloc::vec![OpBuilder::new(
            format!("{}_a_create", stamp.op_id),
            stamp.hlc.clone(),
            stamp.actor.clone(),
            new_block_id.clone(),
            TargetKind::Block,
            Register::Location,
            OpKind::Create,
            OpPayload::Create {
                kind: TargetKind::Block,
                location: Location::new(Some(parent_id.to_string()), order),
            },
        )
        .seq(stamp.seq)
        .macro_op_id(macro_id.clone())
        .build()];
        if !text.is_empty() {
            let body = crate::model::Body::plain(text);
            ops.push(
                OpBuilder::new(
                    format!("{}_b_body", stamp.op_id),
                    stamp.hlc.clone(),
                    stamp.actor.clone(),
                    new_block_id.clone(),
                    TargetKind::Block,
                    Register::Content,
                    OpKind::Set,
                    OpPayload::SetBody {
                        text: body.text.clone(),
                        marks: body.marks.clone(),
                    },
                )
                .seq(stamp.seq)
                .sub_field(SubFieldKey::Body)
                .new_sub_rev(body_sub_rev(&body))
                .macro_op_id(macro_id)
                .build(),
            );
        }
        // The surface patch needs a sibling anchor; a first child has none, so
        // adapters refresh from `changed_ids` in that case.
        let editor_patches = match &anchor {
            Some(anchor_id) => alloc::vec![EditorPatch::InsertTextSurface {
                after_block_id: anchor_id.clone(),
                block_id: new_block_id.clone(),
                text: text.to_string(),
                selection_start: 0,
                selection_end: 0,
            }],
            None => Vec::new(),
        };
        self.commit(
            ops,
            alloc::vec![new_block_id.clone()],
            Some(Selection::Text {
                block_id: new_block_id.clone(),
                start: 0,
                end: 0,
            }),
            editor_patches,
            Some(UndoGroup {
                group_id: format!("undo_{}", stamp.op_id),
                label: "create_block".to_string(),
                inverse_patches: alloc::vec![EditorPatch::RemoveTextSurface {
                    block_id: new_block_id,
                }],
            }),
        )
    }

    fn dispatch_merge_backward(&mut self, target_id: &str, stamp: OpStamp) -> TransactionResult {
        let Some(previous_id) = self.previous_sibling_id(target_id) else {
            return self.error_result(ValidationError::StructuralDispatchDeferred);
        };
        let previous_body = self.current_body_or_empty(&previous_id);
        let current_body = self.current_body_or_empty(target_id);
        let previous_len = previous_body.text.encode_utf16().count() as u32;
        let current_len = current_body.text.encode_utf16().count() as u32;
        let mut merged_marks = previous_body.marks.clone();
        merged_marks.extend(current_body.marks.iter().map(|mark| {
            Mark::new(
                mark.kind.clone(),
                previous_len + mark.start,
                previous_len + mark.end,
                mark.expand,
            )
        }));
        let mut merged_text = previous_body.text.clone();
        merged_text.push_str(&current_body.text);
        let merged_body = crate::model::Body::new(merged_text, merged_marks);
        let macro_id = format!("macro_{}", stamp.op_id);
        let undo_group_id = format!("undo_{}", stamp.op_id);
        let body_op = OpBuilder::new(
            format!("{}_a_previous_body", stamp.op_id),
            stamp.hlc.clone(),
            stamp.actor.clone(),
            previous_id.clone(),
            TargetKind::Block,
            Register::Content,
            OpKind::Set,
            OpPayload::SetBody {
                text: merged_body.text.clone(),
                marks: merged_body.marks.clone(),
            },
        )
        .seq(stamp.seq)
        .sub_field(SubFieldKey::Body)
        .base_sub_rev(body_sub_rev(&previous_body))
        .new_sub_rev(body_sub_rev(&merged_body))
        .macro_op_id(macro_id.clone())
        .build();
        let life_op = OpBuilder::new(
            format!("{}_b_trash_current", stamp.op_id),
            stamp.hlc,
            stamp.actor,
            target_id.to_string(),
            TargetKind::Block,
            Register::Life,
            OpKind::LifeSet,
            OpPayload::LifeSet {
                life: Life::Trashed,
            },
        )
        .seq(stamp.seq)
        .macro_op_id(macro_id)
        .build();
        self.commit(
            alloc::vec![body_op, life_op],
            alloc::vec![previous_id.clone(), target_id.to_string()],
            Some(Selection::Text {
                block_id: previous_id.clone(),
                start: previous_len,
                end: previous_len,
            }),
            alloc::vec![
                EditorPatch::ReplaceBlockText {
                    block_id: previous_id.clone(),
                    text: merged_body.text,
                    selection_start: previous_len,
                    selection_end: previous_len,
                },
                EditorPatch::RemoveTextSurface {
                    block_id: target_id.to_string(),
                },
            ],
            Some(UndoGroup {
                group_id: undo_group_id,
                label: "merge_backward".to_string(),
                inverse_patches: alloc::vec![
                    EditorPatch::ReplaceBlockText {
                        block_id: previous_id.clone(),
                        text: previous_body.text,
                        selection_start: previous_len,
                        selection_end: previous_len,
                    },
                    EditorPatch::InsertTextSurface {
                        after_block_id: previous_id,
                        block_id: target_id.to_string(),
                        text: current_body.text,
                        selection_start: 0,
                        selection_end: current_len,
                    },
                ],
            }),
        )
    }

    fn error_result(&self, error: ValidationError) -> TransactionResult {
        TransactionResult {
            changed_ids: Vec::new(),
            validation_error: Some(error),
            new_revisions: BTreeMap::new(),
            selection_hint: None,
            editor_patches: Vec::new(),
            undo_group: None,
            conflicts: Vec::new(),
            projection_fresh: true,
            mirror_fresh: true,
        }
    }

    fn current_body(&self, target_id: &str) -> Option<crate::model::Body> {
        self.vault
            .nodes
            .get(target_id)
            .and_then(|n| n.content.body.as_ref())
            .map(|b| b.winner().clone())
    }

    /// `current_body` or a fresh empty body, lazily (no allocation when present).
    fn current_body_or_empty(&self, target_id: &str) -> crate::model::Body {
        self.current_body(target_id)
            .unwrap_or_else(|| crate::model::Body::plain(""))
    }

    /// The general text edit: replace the UTF-16 range `[at, at+len)` with
    /// `text` (insert and delete are its special cases). Offsets clamp to the
    /// current body; an edit that lands inside a surrogate pair is rejected.
    fn replace_body_op(
        &self,
        target_id: &str,
        at: u32,
        len: u32,
        text: &str,
        stamp: &OpStamp,
    ) -> Result<Op, ValidationError> {
        let current = self.current_body_or_empty(target_id);
        let mut units: Vec<u16> = current.text.encode_utf16().collect();
        let at = (at as usize).min(units.len());
        let old_len = (len as usize).min(units.len() - at);
        let ins: Vec<u16> = text.encode_utf16().collect();
        units.splice(at..at + old_len, ins.iter().cloned());
        let new_text =
            String::from_utf16(&units).map_err(|_| ValidationError::InvalidUtf16Offset)?;
        let splice = crate::marks::Splice {
            at: at as u32,
            old_len: old_len as u32,
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
            target_id.to_string(),
            self.kind_of(target_id),
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

    fn build_op(&self, intent: &EditorIntent, stamp: &OpStamp) -> Result<Op, ValidationError> {
        match intent {
            EditorIntent::InsertText {
                target_id,
                at,
                text,
            } => self.replace_body_op(target_id, *at, 0, text, stamp),
            EditorIntent::DeleteText { target_id, at, len } => {
                self.replace_body_op(target_id, *at, *len, "", stamp)
            }
            EditorIntent::ReplaceText {
                target_id,
                at,
                len,
                text,
            } => self.replace_body_op(target_id, *at, *len, text, stamp),
            EditorIntent::RemoveMark {
                target_id,
                start,
                end,
                kind,
            } => {
                let current = self.current_body_or_empty(target_id);
                let base = body_sub_rev(&current);
                let mut new_marks = Vec::new();
                for mark in &current.marks {
                    if mark.kind != *kind || mark.end <= *start || mark.start >= *end {
                        new_marks.push(mark.clone());
                        continue;
                    }
                    // Trim the overlapping mark to its parts outside the range.
                    if mark.start < *start {
                        new_marks.push(Mark::new(mark.kind.clone(), mark.start, *start, mark.expand));
                    }
                    if mark.end > *end {
                        new_marks.push(Mark::new(mark.kind.clone(), *end, mark.end, mark.expand));
                    }
                }
                let new_body = crate::model::Body {
                    text: current.text.clone(),
                    marks: new_marks,
                };
                Ok(OpBuilder::new(
                    stamp.op_id.clone(),
                    stamp.hlc.clone(),
                    stamp.actor.clone(),
                    target_id.clone(),
                    self.kind_of(target_id),
                    Register::Content,
                    OpKind::Set,
                    OpPayload::SetBody {
                        text: new_body.text.clone(),
                        marks: new_body.marks.clone(),
                    },
                )
                .seq(stamp.seq)
                .sub_field(SubFieldKey::Body)
                .base_sub_rev(base)
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
                let mut current = self.current_body_or_empty(target_id);
                let base = body_sub_rev(&current);
                current
                    .marks
                    .push(Mark::new(kind.clone(), *start, *end, *expand));
                Ok(OpBuilder::new(
                    stamp.op_id.clone(),
                    stamp.hlc.clone(),
                    stamp.actor.clone(),
                    target_id.clone(),
                    self.kind_of(target_id),
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
                    self.kind_of(target_id),
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
                    self.kind_of(target_id),
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
                self.kind_of(target_id),
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
                    self.kind_of(target_id),
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
                self.kind_of(target_id),
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
                // The terminal active→deleted guard (D10/D20) is enforced
                // centrally in `validate_batch` at the dispatch chokepoint, so
                // every path (not just this intent) is covered.
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
                    self.kind_of(target_id),
                    Register::Life,
                    op_kind,
                    OpPayload::LifeSet { life: *life },
                )
                .seq(stamp.seq)
                .build())
            }
            EditorIntent::SplitBlock { .. }
            | EditorIntent::MergeBackward { .. }
            | EditorIntent::CreateBlock { .. } => Err(ValidationError::StructuralDispatchDeferred),
        }
    }
}

/// Open the fixture vault and return its summary (the binding entry point).
pub fn open_fixture_vault() -> FixtureSummary {
    Session::open_fixture().summary()
}

/// Canonical bytes of an op segment: the full D24 op envelope per op (the byte
/// transfer surface the binding reads via `read_segment`). The inverse lives in
/// `codec::decode_segment`; together they are the round-trippable op-log file
/// format.
pub fn segment_bytes(ops: &[Op]) -> Vec<u8> {
    crate::codec::encode_segment(ops)
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

/// Set `macro_size` on every op carrying a `macro_op_id` to the number of ops in
/// its group within this committed batch (one dispatch = one macro). Replay uses
/// it to apply a structural macro all-or-nothing (D29).
fn stamp_macro_sizes(ops: &mut [Op]) {
    let mut counts: BTreeMap<String, u32> = BTreeMap::new();
    for op in ops.iter() {
        if let Some(macro_id) = &op.macro_op_id {
            *counts.entry(macro_id.clone()).or_insert(0) += 1;
        }
    }
    for op in ops.iter_mut() {
        if let Some(macro_id) = op.macro_op_id.clone() {
            op.macro_size = counts.get(&macro_id).copied();
        }
    }
}

fn changed_ids_for_patches(patches: &[EditorPatch]) -> Vec<String> {
    let mut changed = Vec::new();
    for patch in patches {
        let id = match patch {
            EditorPatch::ReplaceBlockText { block_id, .. }
            | EditorPatch::InsertTextSurface { block_id, .. }
            | EditorPatch::RemoveTextSurface { block_id } => block_id,
        };
        if !changed.iter().any(|existing| existing == id) {
            changed.push(id.clone());
        }
    }
    changed
}

fn selection_hint_for_patches(patches: &[EditorPatch]) -> Option<Selection> {
    let mut selection = None;
    for patch in patches {
        match patch {
            EditorPatch::ReplaceBlockText {
                block_id,
                selection_start,
                selection_end,
                ..
            }
            | EditorPatch::InsertTextSurface {
                block_id,
                selection_start,
                selection_end,
                ..
            } => {
                selection = Some(Selection::Text {
                    block_id: block_id.clone(),
                    start: *selection_start,
                    end: *selection_end,
                });
            }
            EditorPatch::RemoveTextSurface { .. } => {}
        }
    }
    selection
}
