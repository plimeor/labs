//! Sync ingestion (D12, conflict §7.3).
//!
//! Per-actor monotonic high-water-mark + `op_id` dedup make re-delivery a no-op,
//! and merging is a fold over the op *set* — arrival order never matters. The
//! first-release cloud file transport can re-deliver the same immutable segment
//! file arbitrarily often; ingestion converges. The core sees only op bytes —
//! no cloud/account/file-coordination types.

use crate::hlc::Hlc;
use crate::op::Op;
use crate::replay::replay;
use crate::model::Vault;
use alloc::collections::{BTreeMap, BTreeSet};
use alloc::string::String;
use alloc::vec::Vec;

/// Per-actor confirmed high-water-mark.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ActorHwm {
    pub hlc: Hlc,
    pub seq: u64,
}

/// Accumulates accepted ops with idempotent dedup and per-actor HWMs.
#[derive(Default)]
pub struct IngestState {
    seen: BTreeSet<String>,
    hwm: BTreeMap<String, ActorHwm>,
    log: Vec<Op>,
}

impl IngestState {
    pub fn new() -> Self {
        IngestState::default()
    }

    /// Ingest one op. Returns `true` if it was newly accepted, `false` if it was
    /// a duplicate (re-delivery).
    pub fn ingest(&mut self, op: Op) -> bool {
        if self.seen.contains(&op.op_id) {
            return false;
        }
        self.seen.insert(op.op_id.clone());
        let entry = self.hwm.entry(op.actor.clone());
        let candidate = ActorHwm {
            hlc: op.hlc.clone(),
            seq: op.seq,
        };
        entry
            .and_modify(|h| {
                if candidate.hlc > h.hlc {
                    h.hlc = candidate.hlc.clone();
                }
                if candidate.seq > h.seq {
                    h.seq = candidate.seq;
                }
            })
            .or_insert(candidate);
        self.log.push(op);
        true
    }

    /// Ingest a segment (slice of ops). Returns the count of newly accepted ops.
    pub fn ingest_segment(&mut self, ops: &[Op]) -> usize {
        let mut accepted = 0;
        for op in ops {
            if self.ingest(op.clone()) {
                accepted += 1;
            }
        }
        accepted
    }

    pub fn actor_hwm(&self, actor: &str) -> Option<&ActorHwm> {
        self.hwm.get(actor)
    }

    pub fn len(&self) -> usize {
        self.log.len()
    }

    pub fn is_empty(&self) -> bool {
        self.log.is_empty()
    }

    pub fn log(&self) -> &[Op] {
        &self.log
    }

    /// Materialize the current accepted set.
    pub fn materialize(&self) -> Vault {
        replay(&self.log)
    }
}
