//
//  NotePreview.swift
//  Anchor
//
//  Created by Plimeor on 6/11/26.
//

import Foundation

struct NotePreview: Identifiable, Hashable {
    let id: String
    let title: String
    let collection: String
    let body: String
    let updated: String
    let revision: String
    let tags: [String]
    let metricLabel: String
    let metricValue: String
}

extension NotePreview {
    static let samples: [NotePreview] = [
        NotePreview(
            id: "note-product-loop",
            title: "Product loop",
            collection: "Workbench",
            body: """
            Anchor starts from a native Note model. The client presents intent, selection, and projection state; the Rust core owns validation, dispatch, and replay behavior.

            The macOS surface should make repeated editing fast: a stable sidebar, a focused editor, and an inspector that exposes revision and sync state without turning the editor into a dashboard.
            """,
            updated: "Today",
            revision: "3ef88671",
            tags: ["stage-3", "macOS"],
            metricLabel: "Blocks",
            metricValue: "8"
        ),
        NotePreview(
            id: "note-binding-plan",
            title: "Binding integration",
            collection: "Apple",
            body: """
            The product app consumes the generated Swift binding and the bytes fast path. Swift should never duplicate deterministic core behavior.

            The first macOS integration point is a read-only projection shell, followed by explicit editor intents routed through core dispatch.
            """,
            updated: "Yesterday",
            revision: "18582d53",
            tags: ["binding", "core"],
            metricLabel: "Blocks",
            metricValue: "6"
        ),
        NotePreview(
            id: "note-sync-boundary",
            title: "Sync boundary",
            collection: "iCloud",
            body: """
            iCloud Drive belongs behind OpSyncPort. The app can own file coordination, package discovery, and account state, but domain conflict resolution remains core-owned and policy-gated.

            Product UX must surface unresolved file-version conflicts instead of silently choosing a winner.
            """,
            updated: "Jun 10",
            revision: "jnl_f99080",
            tags: ["sync", "policy"],
            metricLabel: "Blocks",
            metricValue: "5"
        )
    ]
}
