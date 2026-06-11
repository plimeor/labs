//
//  WorkspacePreviewStore.swift
//  Anchor
//
//  Created by Plimeor on 6/11/26.
//

import Foundation
import os

struct WorkspacePreviewStore {
    let notes: [NotePreview]

    var defaultSelection: NotePreview.ID? {
        notes.first?.id
    }

    func note(id: NotePreview.ID?) -> NotePreview? {
        guard let id else {
            return nil
        }

        return notes.first { $0.id == id }
    }
}

extension WorkspacePreviewStore {
    static let preview = WorkspacePreviewStore(notes: NotePreview.samples)

    private static let logger = Logger(subsystem: "Anchor", category: "projection")

    /// Loads the read-only core projection, falling back to sample data on
    /// failure. The failure is LOGGED (not silently swallowed) so a broken
    /// binding/ABI contract surfaces instead of masquerading as real content —
    /// exactly the regression the Swift test suite is meant to catch.
    static func current() -> WorkspacePreviewStore {
        do {
            return try AnchorCoreProjectionClient().loadReadOnlyStore()
        } catch {
            logger.error("core projection unavailable, using sample store: \(error, privacy: .public)")
            return preview
        }
    }
}
