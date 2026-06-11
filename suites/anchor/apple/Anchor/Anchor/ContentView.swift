//
//  ContentView.swift
//  Anchor
//
//  Created by Plimeor on 6/11/26.
//

import SwiftUI

struct ContentView: View {
    @State private var store: WorkspacePreviewStore
    @State private var selection: NotePreview.ID?
    private let autoloadsProjection: Bool

    init(store: WorkspacePreviewStore = .preview, autoloadsProjection: Bool = true) {
        _store = State(initialValue: store)
        _selection = State(initialValue: store.defaultSelection)
        self.autoloadsProjection = autoloadsProjection
    }

    private var selectedNote: NotePreview? {
        store.note(id: selection)
    }

    var body: some View {
        NavigationSplitView {
            SidebarView(notes: store.notes, selection: $selection)
        } detail: {
            DetailLayout(note: selectedNote)
        }
        .navigationTitle("Anchor")
        .toolbar {
            ToolbarItemGroup {
                Button {} label: {
                    Label("New Note", systemImage: "square.and.pencil")
                }
                .disabled(true)

                Button {} label: {
                    Label("Sync", systemImage: "arrow.triangle.2.circlepath")
                }
                .disabled(true)
            }
        }
        .task { await loadProjectionIfNeeded() }
    }

    /// Loads the read-only core projection in `.task` (after the view appears)
    /// rather than in `init`, so the synchronous C-ABI/JSON work never blocks
    /// view construction and is not re-run on every view re-init. UI tests pass
    /// `-uiTestUseSampleStore` to keep the injected sample store and assert
    /// against deterministic data.
    private func loadProjectionIfNeeded() async {
        guard autoloadsProjection,
              !ProcessInfo.processInfo.arguments.contains("-uiTestUseSampleStore") else {
            return
        }

        store = WorkspacePreviewStore.current()
        if store.note(id: selection) == nil {
            selection = store.defaultSelection
        }
    }
}

private struct DetailLayout: View {
    let note: NotePreview?

    var body: some View {
        #if os(macOS)
        HSplitView {
            EditorView(note: note)
                .frame(minWidth: 520)

            InspectorView(note: note)
                .frame(minWidth: 240, idealWidth: 280, maxWidth: 340)
        }
        #else
        EditorView(note: note)
        #endif
    }
}

#Preview {
    ContentView(store: .preview, autoloadsProjection: false)
}
