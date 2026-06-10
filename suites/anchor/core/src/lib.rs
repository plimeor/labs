//! `anchor-core` — Anchor's platform-agnostic deterministic core (Stage 1 spike).
//!
//! Boundary (CP-0): this crate owns truth, model, validation, normalization, the
//! append-only op-log, replay/materialization, every merge rule, the single
//! pinned diff3 + fractional order-key implementation, the single validated
//! dispatch, and the DTO/schema-envelope vocabulary. It contains **no** Apple,
//! cloud-provider, file-coordination, or sync-engine symbols and **no**
//! OS-specific merge logic; clients (Swift/TextKit, CLI, `OpSyncPort` adapters)
//! are dispatch shells that own zero business truth (D37).
//!
//! Status: the deterministic core invariants required through CP-2 are in place —
//! the single validated dispatch chokepoint (the only op-log append site, gated
//! by `validate_batch`), all-or-nothing structural macros (`macro_size`), the
//! frozen D24 op envelope (`op::op_envelope_canonical`), and the
//! transport-agnostic `OpSyncPort` boundary with a reference adapter. This
//! crate itself never performs I/O; persistence lives in clients (the `anchor`
//! CLI in `../cli` persists op segments through `codec`). See `README.md` for
//! the stable-vs-planned public contract surface.

#![no_std]
#![forbid(unsafe_code)]

extern crate alloc;

pub mod hash;

// Stage 1 deterministic spikes.
pub mod canonical;
pub mod codec;
pub mod diff3;
pub mod dto;
pub mod editor;
pub mod hlc;
pub mod id;
pub mod importer;
pub mod ingest;
pub mod lattice;
pub mod marks;
pub mod mirror;
pub mod model;
pub mod op;
pub mod orset;
pub mod order;
pub mod replay;
pub mod retention;
pub mod segment;
pub mod stale;
pub mod sync_port;

/// Version of the op envelope schema this build understands (D24).
pub const OP_ENVELOPE_VERSION: u32 = 1;

/// Pinned diff3 algorithm version (D19). Bumping this changes deterministic
/// merge output and must be accompanied by a new cross-target vector set.
pub const DIFF_ALGO_VERSION: u32 = 1;
