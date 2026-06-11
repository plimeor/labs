//
//  ProjectionMappingTests.swift
//  AnchorUnitTests
//
//  Fast, host-side unit tests for the product app's presentation layer:
//  the FixtureSummary -> NotePreview projection mapping, sample-data
//  invariants, and store lookup. These assert UI projection shape only and
//  never recompute deterministic core semantics in Swift.
//

import Foundation
import Testing
import AnchorCoreBindings
@testable import Anchor

@Suite struct ProjectionMappingTests {
    private func summary(_ json: String) throws -> FixtureSummary {
        try JSONDecoder().decode(FixtureSummary.self, from: Data(json.utf8))
    }

    @Test func mapsFixtureSummaryToReadOnlyNote() throws {
        let summary = try summary(
            #"{"vault_id":"vault_demo_0001","note_count":1,"snapshot_revision":"3ef88671e9a2","note_ids":["jnl_f99080"]}"#
        )
        let note = AnchorCoreProjectionClient.note(from: summary, segmentBytes: 3148)
        #expect(note.id == "jnl_f99080")
        #expect(note.title == "jnl_f99080")
        #expect(note.collection == "Core binding")
        #expect(note.revision == "3ef88671") // 8-char prefix of the snapshot revision
        #expect(note.metricLabel == "Segment bytes")
        #expect(note.metricValue == "3148")
        #expect(note.tags.contains("read-only"))
        #expect(note.body.contains("vault_demo_0001"))
        #expect(note.body.contains("3148"))
    }

    @Test func fallsBackToVaultIDWhenSummaryHasNoNotes() throws {
        let summary = try summary(
            #"{"vault_id":"vault_only","note_count":0,"snapshot_revision":"abcdefgh1234","note_ids":[]}"#
        )
        let note = AnchorCoreProjectionClient.note(from: summary, segmentBytes: 0)
        #expect(note.id == "vault_only")
        #expect(note.revision == "abcdefgh")
    }
}

@Suite struct WorkspacePreviewStoreTests {
    @Test func previewExposesStableUniqueSamples() {
        let store = WorkspacePreviewStore.preview
        #expect(store.notes.count == NotePreview.samples.count)
        #expect(store.notes.count >= 1)
        #expect(Set(store.notes.map(\.id)).count == store.notes.count) // unique ids
        #expect(store.notes.allSatisfy { !$0.body.isEmpty })
    }

    @Test func defaultSelectionAndLookupResolveExpectedNotes() {
        let store = WorkspacePreviewStore.preview
        #expect(store.defaultSelection == store.notes.first?.id)
        #expect(store.note(id: store.defaultSelection)?.id == store.notes.first?.id)
        #expect(store.note(id: nil) == nil)
        #expect(store.note(id: "does-not-exist") == nil)
    }
}
