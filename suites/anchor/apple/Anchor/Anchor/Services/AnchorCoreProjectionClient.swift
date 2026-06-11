//
//  AnchorCoreProjectionClient.swift
//  Anchor
//
//  Created by Codex on 6/11/26.
//

import Foundation

#if canImport(AnchorCoreBindings)
import AnchorCoreBindings
#endif

enum AnchorCoreProjectionError: Error {
    case bindingUnavailable
}

struct AnchorCoreProjectionClient {
    func loadReadOnlyStore() throws -> WorkspacePreviewStore {
        #if canImport(AnchorCoreBindings) && os(macOS)
        let session = try AnchorSession()
        let summary = try session.summary()
        let segmentBytes = try session.readSegment().count
        return WorkspacePreviewStore(notes: [Self.note(from: summary, segmentBytes: segmentBytes)])
        #else
        throw AnchorCoreProjectionError.bindingUnavailable
        #endif
    }
}

#if canImport(AnchorCoreBindings)
extension AnchorCoreProjectionClient {
    /// Pure projection mapping (no FFI): a core fixture summary becomes the
    /// presentation note. Kept separate from `loadReadOnlyStore()` so it is
    /// unit-testable without opening a session.
    static func note(from summary: FixtureSummary, segmentBytes: Int) -> NotePreview {
        let noteID = summary.noteIDs.first ?? summary.vaultID
        return NotePreview(
            id: noteID,
            title: noteID,
            collection: "Core binding",
            body: """
            Read-only projection loaded from anchor-core through the Apple C ABI binding.

            Vault: \(summary.vaultID)
            Notes: \(summary.noteCount)
            Snapshot: \(summary.snapshotRevision)
            Segment bytes: \(segmentBytes)

            Product writes and sync remain disabled until the dispatch, persistence, and Apple delivery gates close.
            """,
            updated: "Core fixture",
            revision: String(summary.snapshotRevision.prefix(8)),
            tags: ["core", "binding", "read-only"],
            metricLabel: "Segment bytes",
            metricValue: "\(segmentBytes)"
        )
    }
}
#endif
