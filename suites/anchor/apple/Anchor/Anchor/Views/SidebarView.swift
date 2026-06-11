//
//  SidebarView.swift
//  Anchor
//
//  Created by Plimeor on 6/11/26.
//

import SwiftUI

struct SidebarView: View {
    let notes: [NotePreview]
    @Binding var selection: NotePreview.ID?

    var body: some View {
        List(selection: $selection) {
            Section("Notes") {
                ForEach(notes) { note in
                    NoteRow(note: note)
                        .tag(note.id)
                }
            }
        }
        .listStyle(.sidebar)
        .navigationSplitViewColumnWidth(min: 220, ideal: 260, max: 320)
    }
}

private struct NoteRow: View {
    let note: NotePreview

    var body: some View {
        Label {
            VStack(alignment: .leading, spacing: 2) {
                Text(note.title)
                    .lineLimit(1)
                Text(note.collection)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        } icon: {
            Image(systemName: "doc.text")
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 3)
    }
}
