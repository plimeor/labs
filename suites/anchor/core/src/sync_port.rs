//! `OpSyncPort` — the transport-agnostic sync boundary (plan §8.1, D03/D37).
//!
//! The core defines this trait; platform adapters (first-release cloud file
//! transport, later object-store, etc.) implement it OUTSIDE the core. The trait
//! traffics ONLY in `SegmentId` / `BlobId` + bytes — never a cloud, account, or
//! file-coordination type. This is what keeps the core a pure dispatch truth
//! layer while transports stay swappable shells.

use crate::hash;
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
