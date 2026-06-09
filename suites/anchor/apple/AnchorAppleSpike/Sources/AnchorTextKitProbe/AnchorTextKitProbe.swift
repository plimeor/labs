import Foundation

#if os(macOS)
import AppKit
#endif

#if canImport(UIKit)
import UIKit
#endif

public enum EditorIntentProbe: Equatable {
    case insertText(blockID: String, atUTF16: Int, text: String)
    case selectBlock(blockID: String)
    case embeddedSelection(blockID: String, startUTF16: Int, endUTF16: Int)
}

public enum EditorPatchProbe: Equatable {
    case replaceBlockText(blockID: String, text: String, selectionStartUTF16: Int, selectionEndUTF16: Int)
    case insertTextSurface(afterBlockID: String, blockID: String, text: String, selectionStartUTF16: Int, selectionEndUTF16: Int)
    case moveTextSurface(blockID: String, toIndex: Int)
    case removeTextSurface(blockID: String)
    case selectBlocks([String])
    case focusEmbedded(blockID: String, startUTF16: Int, endUTF16: Int)
}

public struct UTF16Fixture: Equatable {
    public let name: String
    public let text: String
    public let utf16Count: Int
    public let scalarCount: Int
    public let crlfRanges: [NSRange]
}

public func utf16Fixtures() -> [UTF16Fixture] {
    [
        fixture(name: "emoji", text: "A🍎B"),
        fixture(name: "zwj", text: "👨‍👩‍👧‍👦"),
        fixture(name: "combining", text: "e\u{301} cafe"),
        fixture(name: "crlf", text: "a\r\nb\nc"),
        fixture(name: "mixed", text: "A👩‍💻e\u{301}\r\nB")
    ]
}

private func fixture(name: String, text: String) -> UTF16Fixture {
    let nsText = text as NSString
    var crlfRanges: [NSRange] = []
    var searchRange = NSRange(location: 0, length: nsText.length)
    while true {
        let range = nsText.range(of: "\r\n", options: [], range: searchRange)
        if range.location == NSNotFound {
            break
        }
        crlfRanges.append(range)
        let next = range.location + range.length
        searchRange = NSRange(location: next, length: nsText.length - next)
    }
    return UTF16Fixture(
        name: name,
        text: text,
        utf16Count: nsText.length,
        scalarCount: text.unicodeScalars.count,
        crlfRanges: crlfRanges
    )
}

public struct TextSurfaceState: Equatable {
    public let blockID: String
    public var text: String
    public var selection: NSRange

    public init(blockID: String, text: String, selection: NSRange = NSRange(location: 0, length: 0)) {
        self.blockID = blockID
        self.text = text
        self.selection = selection
    }
}

public struct MarkedTextCommitProbeResult: Equatable {
    public let hadMarkedText: Bool
    public let markedRange: NSRange
    public let committedText: String
    public let intent: EditorIntentProbe
}

public final class NativeEditorAdapterProbe {
    private(set) public var blocks: [TextSurfaceState]

    public init(blocks: [TextSurfaceState]) {
        self.blocks = blocks
    }

    public func intentForInsert(blockID: String, selectedRange: NSRange, replacement: String) -> EditorIntentProbe {
        EditorIntentProbe.insertText(blockID: blockID, atUTF16: selectedRange.location, text: replacement)
    }

    public func intentForBlockHit(blockID: String) -> EditorIntentProbe {
        EditorIntentProbe.selectBlock(blockID: blockID)
    }

    public func intentForEmbeddedSelection(blockID: String, selectedRange: NSRange) -> EditorIntentProbe {
        EditorIntentProbe.embeddedSelection(
            blockID: blockID,
            startUTF16: selectedRange.location,
            endUTF16: selectedRange.location + selectedRange.length
        )
    }

    public func apply(_ patch: EditorPatchProbe) {
        switch patch {
        case let .replaceBlockText(blockID, text, selectionStartUTF16, selectionEndUTF16):
            guard let index = blocks.firstIndex(where: { $0.blockID == blockID }) else {
                return
            }
            blocks[index].text = text
            blocks[index].selection = NSRange(
                location: selectionStartUTF16,
                length: selectionEndUTF16 - selectionStartUTF16
            )
        case let .insertTextSurface(afterBlockID, blockID, text, selectionStartUTF16, selectionEndUTF16):
            guard let afterIndex = blocks.firstIndex(where: { $0.blockID == afterBlockID }) else {
                return
            }
            let surface = TextSurfaceState(
                blockID: blockID,
                text: text,
                selection: NSRange(location: selectionStartUTF16, length: selectionEndUTF16 - selectionStartUTF16)
            )
            blocks.insert(surface, at: afterIndex + 1)
        case let .moveTextSurface(blockID, toIndex):
            guard let fromIndex = blocks.firstIndex(where: { $0.blockID == blockID }) else {
                return
            }
            let surface = blocks.remove(at: fromIndex)
            let boundedIndex = min(max(toIndex, 0), blocks.count)
            blocks.insert(surface, at: boundedIndex)
        case let .removeTextSurface(blockID):
            blocks.removeAll { $0.blockID == blockID }
        case let .selectBlocks(blockIDs):
            blocks = blocks.map { block in
                guard blockIDs.contains(block.blockID) else { return block }
                var copy = block
                copy.selection = NSRange(location: 0, length: (block.text as NSString).length)
                return copy
            }
        case let .focusEmbedded(blockID, startUTF16, endUTF16):
            guard let index = blocks.firstIndex(where: { $0.blockID == blockID }) else {
                return
            }
            blocks[index].selection = NSRange(location: startUTF16, length: endUTF16 - startUTF16)
        }
    }
}

#if os(macOS)
@MainActor
private final class UndoEventRecorder: NSObject {
    var events: [String] = []

    func recordSemanticInverseIntent() {
        events.append("semantic-inverse-intent")
    }
}

@MainActor
public final class MacTextKitRuntimeProbe {
    private let textView: NSTextView
    private let semanticUndoManager = UndoManager()

    public init(text: String) {
        self.textView = NSTextView(frame: NSRect(x: 0, y: 0, width: 400, height: 200))
        self.textView.string = text
    }

    public func selectedRangeAfterSetting(_ range: NSRange) -> NSRange {
        textView.setSelectedRange(range)
        return textView.selectedRange()
    }

    public func hasLayoutSurface() -> Bool {
        textView.layoutManager != nil && textView.textContainer != nil
    }

    public func performSemanticUndoProbe() -> [String] {
        let recorder = UndoEventRecorder()
        semanticUndoManager.registerUndo(withTarget: recorder) { target in
            target.recordSemanticInverseIntent()
        }
        semanticUndoManager.undo()
        return recorder.events
    }

    public func performMarkedTextCommitProbe() -> MarkedTextCommitProbeResult {
        textView.string = "A"
        textView.setSelectedRange(NSRange(location: 1, length: 0))
        textView.setMarkedText(
            "拼",
            selectedRange: NSRange(location: 1, length: 0),
            replacementRange: NSRange(location: 1, length: 0)
        )

        let hadMarkedText = textView.hasMarkedText()
        let markedRange = textView.markedRange()
        textView.insertText("拼", replacementRange: markedRange)

        return MarkedTextCommitProbeResult(
            hadMarkedText: hadMarkedText,
            markedRange: markedRange,
            committedText: textView.string,
            intent: EditorIntentProbe.insertText(blockID: "blk_a", atUTF16: markedRange.location, text: "拼")
        )
    }

    public func hitTestInsertionIndexProbe() -> Int {
        guard let layoutManager = textView.layoutManager,
              let textContainer = textView.textContainer else {
            return NSNotFound
        }
        layoutManager.ensureLayout(for: textContainer)
        let glyphIndex = min(1, max(0, layoutManager.numberOfGlyphs - 1))
        let glyphLocation = layoutManager.location(forGlyphAt: glyphIndex)
        return textView.characterIndexForInsertion(at: glyphLocation)
    }

    public func directBufferUndoSuppressed() -> Bool {
        textView.allowsUndo = false
        textView.string = "undo probe"
        textView.replaceCharacters(in: NSRange(location: 0, length: 0), with: "x")
        textView.undoManager?.undo()
        return textView.allowsUndo == false && textView.string == "xundo probe"
    }

    public func accessibilitySelectedTextRangeProbe() -> NSRange {
        textView.string = "A🍎B"
        textView.setSelectedRange(NSRange(location: 1, length: 2))
        return textView.accessibilitySelectedTextRange()
    }
}
#endif

#if canImport(UIKit)
@MainActor
public final class IOSTextKitCompileProbe {
    private let textView: UITextView

    public init(text: String) {
        self.textView = UITextView(frame: .zero)
        self.textView.text = text
    }

    public func selectedRangeAfterSetting(_ range: NSRange) -> NSRange {
        textView.selectedRange = range
        return textView.selectedRange
    }

    public func markedTextIsTransient() -> Bool {
        textView.markedTextRange == nil || textView.position(from: textView.markedTextRange!.start, offset: 0) != nil
    }
}
#endif
