import AnchorCoreC
import Foundation

public struct FixtureSummary: Decodable, Equatable, Sendable {
    public let vaultID: String
    public let noteCount: Int
    public let snapshotRevision: String
    public let noteIDs: [String]

    enum CodingKeys: String, CodingKey {
        case vaultID = "vault_id"
        case noteCount = "note_count"
        case snapshotRevision = "snapshot_revision"
        case noteIDs = "note_ids"
    }
}

public struct SelectionHint: Decodable, Equatable, Sendable {
    public let kind: String
    public let blockID: String?
    public let start: UInt32?
    public let end: UInt32?

    enum CodingKeys: String, CodingKey {
        case kind
        case blockID = "block_id"
        case start
        case end
    }
}

public struct ConflictRecord: Decodable, Equatable, Sendable {
    public let targetID: String
    public let kind: String
    public let subFieldKey: String?
    public let liveOpID: String?
    public let losingOpIDs: [String]
    public let pinnedOpIDs: [String]

    enum CodingKeys: String, CodingKey {
        case targetID = "target_id"
        case kind
        case subFieldKey = "sub_field_key"
        case liveOpID = "live_op_id"
        case losingOpIDs = "losing_op_ids"
        case pinnedOpIDs = "pinned_op_ids"
    }
}

public struct EditorPatch: Decodable, Equatable, Sendable {
    public let kind: String
    public let afterBlockID: String?
    public let blockID: String?
    public let text: String?
    public let selectionStart: UInt32?
    public let selectionEnd: UInt32?

    enum CodingKeys: String, CodingKey {
        case kind
        case afterBlockID = "after_block_id"
        case blockID = "block_id"
        case text
        case selectionStart = "selection_start"
        case selectionEnd = "selection_end"
    }
}

public struct UndoGroup: Decodable, Equatable, Sendable {
    public let groupID: String
    public let label: String
    public let inversePatches: [EditorPatch]

    enum CodingKeys: String, CodingKey {
        case groupID = "group_id"
        case label
        case inversePatches = "inverse_patches"
    }
}

/// Validation-error vocabulary for the C-ABI binding path.
///
/// AUTHORITY: the three core codes (`invalid_utf16_offset`, `direct_active_to_deleted`,
/// `structural_dispatch_deferred`) are owned by Rust `anchor_core::dto::ValidationError::code()`.
/// This is a hand-mirror of that source of truth (the C-ABI wrapper, not the
/// UniFFI-generated DTO) — if core's vocabulary changes, update these raw values
/// to match. `adapterNullSession`/`adapterParseError` are adapter-local codes
/// emitted only by this FFI layer and have no core counterpart.
public enum ValidationErrorCode: String, Decodable, Equatable, Sendable {
    case invalidUTF16Offset = "invalid_utf16_offset"
    case directActiveToDeleted = "direct_active_to_deleted"
    case structuralDispatchDeferred = "structural_dispatch_deferred"
    case adapterNullSession = "adapter_null_session"
    case adapterParseError = "adapter_parse_error"
}

public struct ValidationError: Decodable, Equatable, Sendable {
    public let code: ValidationErrorCode
    public let message: String
}

public struct TransactionResult: Decodable, Equatable, Sendable {
    public let changedIDs: [String]
    public let validationError: ValidationError?
    public let newRevisions: [String: String]
    public let selectionHint: SelectionHint?
    public let editorPatches: [EditorPatch]
    public let undoGroup: UndoGroup?
    public let conflicts: [ConflictRecord]
    public let projectionFresh: Bool
    public let mirrorFresh: Bool

    enum CodingKeys: String, CodingKey {
        case changedIDs = "changed_ids"
        case validationError = "validation_error"
        case newRevisions = "new_revisions"
        case selectionHint = "selection_hint"
        case editorPatches = "editor_patches"
        case undoGroup = "undo_group"
        case conflicts
        case projectionFresh = "projection_fresh"
        case mirrorFresh = "mirror_fresh"
    }
}

public enum AnchorBindingError: Error, Equatable, Sendable {
    case nullSession
    case decode(String)
}

private func data(from buffer: AnchorByteBuffer) -> Data {
    defer { anchor_buffer_free(buffer) }
    guard let pointer = buffer.ptr, buffer.len > 0 else {
        return Data()
    }
    return Data(bytes: pointer, count: Int(buffer.len))
}

private func string(from buffer: AnchorByteBuffer) -> String {
    String(decoding: data(from: buffer), as: UTF8.self)
}

private func decode<T: Decodable>(_ type: T.Type, from buffer: AnchorByteBuffer) throws -> T {
    let payload = data(from: buffer)
    do {
        return try JSONDecoder().decode(type, from: payload)
    } catch {
        let text = String(decoding: payload, as: UTF8.self)
        throw AnchorBindingError.decode("\(error): \(text)")
    }
}

public func openFixtureVault() throws -> FixtureSummary {
    try decode(FixtureSummary.self, from: anchor_core_fixture_summary_json())
}

public func fixtureBlob(size: Int) -> Data {
    data(from: anchor_fixture_blob(UInt(size)))
}

public func blobID(bytes: Data) throws -> String {
    struct BlobID: Decodable { let blob_id: String }
    let buffer = bytes.withUnsafeBytes { rawBuffer in
        anchor_blob_id_json(rawBuffer.bindMemory(to: UInt8.self).baseAddress, UInt(bytes.count))
    }
    return try decode(BlobID.self, from: buffer).blob_id
}

public final class AnchorSession {
    private var handle: OpaquePointer?

    public init() throws {
        guard let handle = anchor_session_open_fixture() else {
            throw AnchorBindingError.nullSession
        }
        self.handle = handle
    }

    deinit {
        if let handle {
            anchor_session_free(handle)
        }
    }

    public func summary() throws -> FixtureSummary {
        guard let handle else { throw AnchorBindingError.nullSession }
        return try decode(FixtureSummary.self, from: anchor_session_summary_json(handle))
    }

    public func dispatchInsertText(targetID: String, at: UInt32, text: String) throws -> TransactionResult {
        guard let handle else { throw AnchorBindingError.nullSession }
        let targetBytes = Array(targetID.utf8)
        let textBytes = Array(text.utf8)
        return try targetBytes.withUnsafeBufferPointer { targetBuffer in
            try textBytes.withUnsafeBufferPointer { textBuffer in
                try decode(
                    TransactionResult.self,
                    from: anchor_session_dispatch_insert_text_json(
                        handle,
                        targetBuffer.baseAddress,
                        UInt(targetBuffer.count),
                        at,
                        textBuffer.baseAddress,
                        UInt(textBuffer.count)
                    )
                )
            }
        }
    }

    public func dispatchDirectDelete(targetID: String) throws -> TransactionResult {
        guard let handle else { throw AnchorBindingError.nullSession }
        let targetBytes = Array(targetID.utf8)
        return try targetBytes.withUnsafeBufferPointer { targetBuffer in
            try decode(
                TransactionResult.self,
                from: anchor_session_dispatch_direct_delete_json(
                    handle,
                    targetBuffer.baseAddress,
                    UInt(targetBuffer.count)
                )
            )
        }
    }

    public func dispatchSplitBlock(targetID: String, at: UInt32) throws -> TransactionResult {
        guard let handle else { throw AnchorBindingError.nullSession }
        let targetBytes = Array(targetID.utf8)
        return try targetBytes.withUnsafeBufferPointer { targetBuffer in
            try decode(
                TransactionResult.self,
                from: anchor_session_dispatch_split_block_json(
                    handle,
                    targetBuffer.baseAddress,
                    UInt(targetBuffer.count),
                    at
                )
            )
        }
    }

    public func dispatchMergeBackward(targetID: String) throws -> TransactionResult {
        guard let handle else { throw AnchorBindingError.nullSession }
        let targetBytes = Array(targetID.utf8)
        return try targetBytes.withUnsafeBufferPointer { targetBuffer in
            try decode(
                TransactionResult.self,
                from: anchor_session_dispatch_merge_backward_json(
                    handle,
                    targetBuffer.baseAddress,
                    UInt(targetBuffer.count)
                )
            )
        }
    }

    public func readSegment() throws -> Data {
        guard let handle else { throw AnchorBindingError.nullSession }
        return data(from: anchor_session_read_segment(handle))
    }
}

public actor AnchorCoreClient {
    private let session: AnchorSession

    public init() throws {
        self.session = try AnchorSession()
    }

    public func summary() throws -> FixtureSummary {
        try session.summary()
    }

    public func dispatchInsertText(targetID: String, at: UInt32, text: String) throws -> TransactionResult {
        try session.dispatchInsertText(targetID: targetID, at: at, text: text)
    }

    public func dispatchDirectDelete(targetID: String) throws -> TransactionResult {
        try session.dispatchDirectDelete(targetID: targetID)
    }

    public func dispatchSplitBlock(targetID: String, at: UInt32) throws -> TransactionResult {
        try session.dispatchSplitBlock(targetID: targetID, at: at)
    }

    public func dispatchMergeBackward(targetID: String) throws -> TransactionResult {
        try session.dispatchMergeBackward(targetID: targetID)
    }

    public func readSegment() throws -> Data {
        try session.readSegment()
    }
}
