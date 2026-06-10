//! Stage-2: the transport-agnostic `OpSyncPort` boundary, exercised via the
//! reference in-memory adapter. Proves a real adapter can move op-segment and
//! blob bytes — immutably, idempotently, content-addressed — with no cloud,
//! account, or file-coordination type anywhere in the core signatures.

use anchor_core::dto::Session;
use anchor_core::sync_port::{BlobId, MemoryOpSyncPort, MemoryPortError, OpSyncPort, SegmentId};

#[test]
fn memory_port_round_trips_immutably_and_idempotently() {
    let session = Session::open_fixture();
    let bytes = session.read_segment();
    let id = session.segment_id();
    assert_eq!(id, SegmentId::of_bytes(&bytes));

    let mut port = MemoryOpSyncPort::new();
    assert!(port.list_segments().unwrap().is_empty());

    // push → list → pull round-trips the exact bytes.
    port.push_segment(&id, &bytes).unwrap();
    assert_eq!(port.list_segments().unwrap(), vec![id.clone()]);
    assert_eq!(port.pull_segment(&id).unwrap(), bytes);
    assert_eq!(port.segment_count(), 1);

    // Re-delivering the same immutable segment is idempotent (no new object).
    port.push_segment(&id, &bytes).unwrap();
    assert_eq!(port.segment_count(), 1);

    // Mutating an immutable segment is rejected, not silently overwritten.
    let err = port.push_segment(&id, b"tampered").unwrap_err();
    assert_eq!(err, MemoryPortError::SegmentMutated(id.clone()));

    // Missing pulls surface a typed error.
    let missing = SegmentId::of_bytes(b"absent");
    assert_eq!(
        port.pull_segment(&missing).unwrap_err(),
        MemoryPortError::MissingSegment(missing)
    );
}

#[test]
fn memory_port_blobs_are_content_addressed() {
    let mut port = MemoryOpSyncPort::new();
    let data = b"attachment-bytes";
    let id = BlobId::of_bytes(data);
    port.push_blob(&id, data).unwrap();
    assert_eq!(port.pull_blob(&id).unwrap(), data);

    // First writer wins; re-push is a no-op.
    port.push_blob(&id, data).unwrap();
    assert_eq!(port.pull_blob(&id).unwrap(), data);

    let missing = BlobId::of_bytes(b"absent");
    assert_eq!(
        port.pull_blob(&missing).unwrap_err(),
        MemoryPortError::MissingBlob(missing)
    );
}
