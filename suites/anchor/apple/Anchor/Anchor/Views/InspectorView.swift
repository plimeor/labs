//
//  InspectorView.swift
//  Anchor
//
//  Created by Plimeor on 6/11/26.
//

import SwiftUI

struct InspectorView: View {
    let note: NotePreview?

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Inspector")
                .font(.headline)

            if let note {
                LabeledContent("Updated", value: note.updated)
                LabeledContent("Revision", value: note.revision)
                LabeledContent(note.metricLabel, value: note.metricValue)

                Divider()

                VStack(alignment: .leading, spacing: 8) {
                    Text("Tags")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    TagList(tags: note.tags)
                }
            } else {
                Text("No selection")
                    .foregroundStyle(.secondary)
            }

            Spacer()
        }
        .padding(20)
        .background(.regularMaterial)
    }
}

private struct TagList: View {
    let tags: [String]

    var body: some View {
        FlowLayout(spacing: 6) {
            ForEach(tags, id: \.self) { tag in
                Text(tag)
                    .font(.caption)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(.quaternary, in: Capsule())
            }
        }
    }
}

private struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = rows(for: subviews, proposal: proposal)
        let height = rows.reduce(CGFloat.zero) { result, row in
            result + row.height
        } + CGFloat(max(rows.count - 1, 0)) * spacing
        let width = proposal.width ?? rows.map(\.width).max() ?? 0
        return CGSize(width: width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var origin = bounds.origin

        for row in rows(for: subviews, proposal: ProposedViewSize(width: bounds.width, height: proposal.height)) {
            var x = origin.x

            for item in row.items {
                subviews[item.index].place(
                    at: CGPoint(x: x, y: origin.y),
                    proposal: ProposedViewSize(item.size)
                )
                x += item.size.width + spacing
            }

            origin.y += row.height + spacing
        }
    }

    private func rows(for subviews: Subviews, proposal: ProposedViewSize) -> [FlowRow] {
        let maxWidth = proposal.width ?? .infinity
        var rows: [FlowRow] = []
        var current = FlowRow()

        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            let nextWidth = current.items.isEmpty ? size.width : current.width + spacing + size.width

            if nextWidth > maxWidth, !current.items.isEmpty {
                rows.append(current)
                current = FlowRow()
            }

            current.append(FlowItem(index: index, size: size), spacing: spacing)
        }

        if !current.items.isEmpty {
            rows.append(current)
        }

        return rows
    }
}

private struct FlowRow {
    var items: [FlowItem] = []
    var width: CGFloat = 0
    var height: CGFloat = 0

    mutating func append(_ item: FlowItem, spacing: CGFloat) {
        if !items.isEmpty {
            width += spacing
        }

        items.append(item)
        width += item.size.width
        height = max(height, item.size.height)
    }
}

private struct FlowItem {
    let index: Int
    let size: CGSize
}
