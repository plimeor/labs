//
//  EditorView.swift
//  Anchor
//
//  Created by Plimeor on 6/11/26.
//

import SwiftUI

struct EditorView: View {
    let note: NotePreview?

    var body: some View {
        Group {
            if let note {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(note.collection)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .textCase(.uppercase)
                            Text(note.title)
                                .font(.largeTitle.weight(.semibold))
                                .textSelection(.enabled)
                        }

                        #if os(macOS)
                        TextKitNoteBodyView(text: note.body)
                            .frame(minHeight: 260)
                            .accessibilityIdentifier("coreProjectionTextKitHost")
                        #else
                        Text(note.body)
                            .font(.body)
                            .lineSpacing(4)
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        #endif
                    }
                    .padding(.horizontal, 36)
                    .padding(.vertical, 32)
                    .frame(maxWidth: 820, alignment: .leading)
                }
                .background(.background)
            } else {
                EmptyNoteView()
            }
        }
    }
}

private struct EmptyNoteView: View {
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "sidebar.left")
                .font(.system(size: 32))
                .foregroundStyle(.secondary)
            Text("Select a note")
                .font(.headline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
