//! `OpSyncPort` — the transport-agnostic sync boundary (plan §8.1, D03/D37).
//!
//! The core defines this trait; platform adapters (first-release cloud file
//! transport, later object-store, etc.) implement it OUTSIDE the core. The trait
//! traffics ONLY in `SegmentId` / `BlobId` + bytes — never a cloud, account, or
//! file-coordination type. This is what keeps the core a pure dispatch truth
//! layer while transports stay swappable shells.

use crate::hash;
use alloc::collections::BTreeMap;
use alloc::format;
use alloc::string::String;
use alloc::vec::Vec;

/// Identity of one immutable op-segment (content-addressed over its bytes).
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct SegmentId(pub String);

impl SegmentId {
    pub fn of_bytes(bytes: &[u8]) -> Self {
        SegmentId(format!("seg_{}", hash::hash_hex(bytes)))
    }
}

/// Identity of one content-addressed attachment blob.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct BlobId(pub String);

impl BlobId {
    pub fn of_bytes(bytes: &[u8]) -> Self {
        BlobId(format!("blob_{}", hash::hash_hex(bytes)))
    }
}

/// Transport-agnostic sync port. Adapters move bytes; they never own merge.
///
/// Every method is byte-in / byte-out keyed by id. The associated `Error` lets
/// platform adapters surface their own typed failures without leaking any of
/// their types into the core's signatures.
pub trait OpSyncPort {
    type Error;

    /// List the segment ids the transport currently holds.
    fn list_segments(&self) -> Result<Vec<SegmentId>, Self::Error>;

    /// Pull one segment's bytes (already downloaded & coordinated by the adapter).
    fn pull_segment(&self, id: &SegmentId) -> Result<Vec<u8>, Self::Error>;

    /// Push one immutable segment's bytes (write-once; never modified).
    fn push_segment(&mut self, id: &SegmentId, bytes: &[u8]) -> Result<(), Self::Error>;

    /// Pull one blob's bytes.
    fn pull_blob(&self, id: &BlobId) -> Result<Vec<u8>, Self::Error>;

    /// Push one blob's bytes.
    fn push_blob(&mut self, id: &BlobId, bytes: &[u8]) -> Result<(), Self::Error>;
}

/// Typed failures of the in-memory reference port. A real adapter surfaces its
/// own transport errors via the `OpSyncPort::Error` associated type; these never
/// leak into the core's `Op` / dispatch signatures.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MemoryPortError {
    MissingSegment(SegmentId),
    MissingBlob(BlobId),
    /// Segments are immutable + content-addressed: re-pushing the same id with
    /// different bytes is a contract violation, not a silent overwrite.
    SegmentMutated(SegmentId),
}

/// A reference in-memory `OpSyncPort`: the concrete shape a real cloud-file or
/// object-store adapter mirrors, and the testing double for the
/// dispatch → segment-bytes → transport → ingest loop. It is a pure byte store
/// (no cloud / account / file-coordination type), proving the sync boundary is
/// satisfiable without any of them. Re-delivering an immutable segment is
/// idempotent; mutating one is rejected.
#[derive(Default, Clone, Debug)]
pub struct MemoryOpSyncPort {
    segments: BTreeMap<SegmentId, Vec<u8>>,
    blobs: BTreeMap<BlobId, Vec<u8>>,
}

impl MemoryOpSyncPort {
    pub fn new() -> Self {
        MemoryOpSyncPort::default()
    }

    /// Number of distinct segments held (the synced-object count a budget gate
    /// would track — see `segment` module).
    pub fn segment_count(&self) -> usize {
        self.segments.len()
    }
}

impl OpSyncPort for MemoryOpSyncPort {
    type Error = MemoryPortError;

    fn list_segments(&self) -> Result<Vec<SegmentId>, Self::Error> {
        Ok(self.segments.keys().cloned().collect())
    }

    fn pull_segment(&self, id: &SegmentId) -> Result<Vec<u8>, Self::Error> {
        self.segments
            .get(id)
            .cloned()
            .ok_or_else(|| MemoryPortError::MissingSegment(id.clone()))
    }

    fn push_segment(&mut self, id: &SegmentId, bytes: &[u8]) -> Result<(), Self::Error> {
        match self.segments.get(id) {
            Some(existing) if existing.as_slice() != bytes => {
                Err(MemoryPortError::SegmentMutated(id.clone()))
            }
            Some(_) => Ok(()), // idempotent re-delivery of an immutable segment
            None => {
                self.segments.insert(id.clone(), bytes.to_vec());
                Ok(())
            }
        }
    }

    fn pull_blob(&self, id: &BlobId) -> Result<Vec<u8>, Self::Error> {
        self.blobs
            .get(id)
            .cloned()
            .ok_or_else(|| MemoryPortError::MissingBlob(id.clone()))
    }

    fn push_blob(&mut self, id: &BlobId, bytes: &[u8]) -> Result<(), Self::Error> {
        // Blobs are content-addressed; first writer wins, re-push is a no-op.
        self.blobs.entry(id.clone()).or_insert_with(|| bytes.to_vec());
        Ok(())
    }
}
