use anchor_core::dto::{
    EditorIntent, FixtureSummary as CoreFixtureSummary, OpStamp, Session,
    TransactionResult as CoreTransactionResult,
};
use anchor_core::hlc::Hlc;
use anchor_core::model::Life;
use std::sync::atomic::{AtomicU64, Ordering};

uniffi::include_scaffolding!("anchor_core_uniffi");

static OP_COUNTER: AtomicU64 = AtomicU64::new(20_000);

pub struct EditorIntentDto {
    pub kind: String,
    pub target_id: String,
    pub at: u32,
    pub text: String,
    pub life: String,
}

pub struct FixtureSummary {
    pub vault_id: String,
    pub note_count: u64,
    pub snapshot_revision: String,
    pub note_ids: Vec<String>,
}

pub struct TransactionResultSummary {
    pub changed_ids: Vec<String>,
    pub has_validation_error: bool,
    pub validation_error: String,
    pub selection_kind: String,
    pub selection_block_id: String,
    pub selection_start: u32,
    pub selection_end: u32,
    pub new_revision_count: u64,
    pub conflict_count: u64,
    pub projection_fresh: bool,
    pub mirror_fresh: bool,
}

pub struct RoundTripResult {
    pub before: FixtureSummary,
    pub transaction: TransactionResultSummary,
    pub after: FixtureSummary,
    pub segment_len: u64,
    pub segment_id: String,
}

fn next_stamp(op_name: &str, seq: u64) -> OpStamp {
    let n = OP_COUNTER.fetch_add(1, Ordering::Relaxed);
    OpStamp {
        op_id: format!("op_uniffi_{}_{}", op_name, n),
        hlc: Hlc::new(n, 0, "device_apple_uniffi"),
        actor: "apple_uniffi".to_string(),
        seq,
    }
}

fn fixture_summary(summary: CoreFixtureSummary) -> FixtureSummary {
    FixtureSummary {
        vault_id: summary.vault_id,
        note_count: summary.note_count as u64,
        snapshot_revision: summary.snapshot_revision,
        note_ids: summary.note_ids,
    }
}

fn selection_fields(selection: Option<anchor_core::dto::Selection>) -> (String, String, u32, u32) {
    match selection {
        Some(anchor_core::dto::Selection::Text {
            block_id,
            start,
            end,
        }) => ("text".to_string(), block_id, start, end),
        Some(anchor_core::dto::Selection::Block { block_id }) => {
            ("block".to_string(), block_id, 0, 0)
        }
        Some(anchor_core::dto::Selection::Embedded {
            block_id,
            start,
            end,
        }) => ("embedded".to_string(), block_id, start, end),
        None => ("none".to_string(), String::new(), 0, 0),
    }
}

fn transaction_summary(result: CoreTransactionResult) -> TransactionResultSummary {
    let validation_error = result.validation_error.unwrap_or_default();
    let has_validation_error = !validation_error.is_empty();
    let (selection_kind, selection_block_id, selection_start, selection_end) =
        selection_fields(result.selection_hint);
    TransactionResultSummary {
        changed_ids: result.changed_ids,
        has_validation_error,
        validation_error,
        selection_kind,
        selection_block_id,
        selection_start,
        selection_end,
        new_revision_count: result.new_revisions.len() as u64,
        conflict_count: result.conflicts.len() as u64,
        projection_fresh: result.projection_fresh,
        mirror_fresh: result.mirror_fresh,
    }
}

fn to_core_intent(intent: EditorIntentDto) -> EditorIntent {
    match intent.kind.as_str() {
        "insert_text" => EditorIntent::InsertText {
            target_id: intent.target_id,
            at: intent.at,
            text: intent.text,
        },
        "set_life" if intent.life == "deleted" => EditorIntent::SetLife {
            target_id: intent.target_id,
            life: Life::Deleted,
        },
        "set_life" if intent.life == "trashed" => EditorIntent::SetLife {
            target_id: intent.target_id,
            life: Life::Trashed,
        },
        "set_life" if intent.life == "active" => EditorIntent::SetLife {
            target_id: intent.target_id,
            life: Life::Active,
        },
        _ => EditorIntent::SplitBlock {
            target_id: intent.target_id,
            at: intent.at,
        },
    }
}

pub fn open_fixture_vault() -> FixtureSummary {
    fixture_summary(anchor_core::dto::open_fixture_vault())
}

pub fn dispatch_editor_intent(intent: EditorIntentDto) -> TransactionResultSummary {
    let mut session = Session::open_fixture();
    let result = session.dispatch(to_core_intent(intent), next_stamp("dispatch", 1));
    transaction_summary(result)
}

pub fn round_trip_insert(intent: EditorIntentDto) -> RoundTripResult {
    let mut session = Session::open_fixture();
    let before = fixture_summary(session.summary());
    let result = session.dispatch(to_core_intent(intent), next_stamp("round_trip", 1));
    let transaction = transaction_summary(result);
    let after = fixture_summary(session.summary());
    let segment = session.read_segment();
    let segment_id = session.segment_id().0;
    RoundTripResult {
        before,
        transaction,
        after,
        segment_len: segment.len() as u64,
        segment_id,
    }
}

pub fn read_fixture_segment() -> Vec<u8> {
    Session::open_fixture().read_segment()
}

pub fn fixture_blob(size: u64) -> Vec<u8> {
    anchor_core::dto::fixture_blob(size as usize)
}
