import Foundation

#if os(macOS)
import AppKit
#endif

#if canImport(UIKit)
import UIKit
#endif

public enum EditorIntentProbe: Equatable {
    case insertText(blockID: String, atUTF16: Int, text: String)
    case splitBlock(blockID: String, atUTF16: Int)
    case mergeBackward(blockID: String)
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

#if os(macOS)
public struct AppKitTextSurfaceLifecycleResult: Equatable {
    public let initialBlockIDs: [String]
    public let afterInsertBlockIDs: [String]
    public let insertedSelection: NSRange
    public let afterMoveBlockIDs: [String]
    public let afterRemoveBlockIDs: [String]
    public let removedViewDetached: Bool
    public let remainingViewCount: Int
}

public struct AppKitFirstResponderKeyboardResult: Equatable {
    public let firstResponderAcceptedA: Bool
    public let firstResponderAcceptedB: Bool
    public let blockAIntents: [EditorIntentProbe]
    public let blockBIntents: [EditorIntentProbe]
}

public struct AppKitAccessibilityHierarchyResult: Equatable {
    public let childLabels: [String]
    public let selectedRanges: [NSRange]
}
#endif

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
private final class IntentCapturingTextView: NSTextView {
    private let blockID: String
    private let backingStorage: NSTextStorage?
    private(set) var capturedIntents: [EditorIntentProbe] = []

    init(blockID: String) {
        let stack = Self.makeTextKitStack()
        self.blockID = blockID
        self.backingStorage = stack.storage
        super.init(frame: NSRect(x: 0, y: 0, width: 400, height: 200), textContainer: stack.container)
        self.identifier = NSUserInterfaceItemIdentifier(blockID)
    }

    override init(frame frameRect: NSRect, textContainer container: NSTextContainer?) {
        self.blockID = "blk_unknown"
        self.backingStorage = nil
        super.init(frame: frameRect, textContainer: container)
    }

    private static func makeTextKitStack() -> (storage: NSTextStorage, container: NSTextContainer) {
        let storage = NSTextStorage()
        let layoutManager = NSLayoutManager()
        let container = NSTextContainer(containerSize: NSSize(width: 400, height: 200))
        storage.addLayoutManager(layoutManager)
        layoutManager.addTextContainer(container)
        return (storage, container)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) is unavailable for IntentCapturingTextView")
    }

    override func keyDown(with event: NSEvent) {
        let range = selectedRange()
        let characters = event.charactersIgnoringModifiers ?? event.characters ?? ""

        if characters == "\r" || characters == "\n" {
            capturedIntents.append(.splitBlock(blockID: blockID, atUTF16: range.location))
            return
        }

        if event.keyCode == 51 && range.location == 0 {
            capturedIntents.append(.mergeBackward(blockID: blockID))
            return
        }

        if let text = event.characters, !text.isEmpty, text != "\u{7F}" {
            capturedIntents.append(.insertText(blockID: blockID, atUTF16: range.location, text: text))
            return
        }

        super.keyDown(with: event)
    }
}

@MainActor
private final class AppKitTextSurfaceHost {
    private let container = NSView(frame: NSRect(x: 0, y: 0, width: 600, height: 400))
    private var surfaces: [(blockID: String, textView: NSTextView)] = []
    private var lastRemovedView: NSTextView?

    init(blocks: [TextSurfaceState]) {
        surfaces = blocks.map { block in
            (block.blockID, Self.makeTextView(for: block))
        }
        rebuildSubviews()
    }

    var blockIDsFromSubviews: [String] {
        container.subviews.compactMap { view in
            (view as? NSTextView)?.identifier?.rawValue
        }
    }

    var remainingViewCount: Int {
        container.subviews.count
    }

    var removedViewDetached: Bool {
        lastRemovedView?.superview == nil
    }

    func selectedRange(for blockID: String) -> NSRange {
        guard let textView = surfaces.first(where: { $0.blockID == blockID })?.textView else {
            return NSRange(location: NSNotFound, length: 0)
        }
        return textView.selectedRange()
    }

    func apply(_ patch: EditorPatchProbe) {
        switch patch {
        case let .replaceBlockText(blockID, text, selectionStartUTF16, selectionEndUTF16):
            guard let index = surfaces.firstIndex(where: { $0.blockID == blockID }) else {
                return
            }
            let textView = surfaces[index].textView
            textView.string = text
            textView.setSelectedRange(NSRange(location: selectionStartUTF16, length: selectionEndUTF16 - selectionStartUTF16))
        case let .insertTextSurface(afterBlockID, blockID, text, selectionStartUTF16, selectionEndUTF16):
            guard let afterIndex = surfaces.firstIndex(where: { $0.blockID == afterBlockID }) else {
                return
            }
            let surface = TextSurfaceState(
                blockID: blockID,
                text: text,
                selection: NSRange(location: selectionStartUTF16, length: selectionEndUTF16 - selectionStartUTF16)
            )
            surfaces.insert((blockID, Self.makeTextView(for: surface)), at: afterIndex + 1)
            rebuildSubviews()
        case let .moveTextSurface(blockID, toIndex):
            guard let fromIndex = surfaces.firstIndex(where: { $0.blockID == blockID }) else {
                return
            }
            let surface = surfaces.remove(at: fromIndex)
            let boundedIndex = min(max(toIndex, 0), surfaces.count)
            surfaces.insert(surface, at: boundedIndex)
            rebuildSubviews()
        case let .removeTextSurface(blockID):
            guard let index = surfaces.firstIndex(where: { $0.blockID == blockID }) else {
                return
            }
            let surface = surfaces.remove(at: index)
            lastRemovedView = surface.textView
            surface.textView.removeFromSuperview()
            rebuildSubviews()
        case let .selectBlocks(blockIDs):
            for surface in surfaces where blockIDs.contains(surface.blockID) {
                surface.textView.setSelectedRange(NSRange(location: 0, length: (surface.textView.string as NSString).length))
            }
        case let .focusEmbedded(blockID, startUTF16, endUTF16):
            guard let textView = surfaces.first(where: { $0.blockID == blockID })?.textView else {
                return
            }
            textView.setSelectedRange(NSRange(location: startUTF16, length: endUTF16 - startUTF16))
        }
    }

    private static func makeTextView(for state: TextSurfaceState) -> NSTextView {
        let textView = NSTextView(frame: NSRect(x: 0, y: 0, width: 600, height: 80))
        textView.identifier = NSUserInterfaceItemIdentifier(state.blockID)
        textView.string = state.text
        textView.setSelectedRange(state.selection)
        return textView
    }

    private func rebuildSubviews() {
        for view in container.subviews {
            view.removeFromSuperview()
        }

        for (index, surface) in surfaces.enumerated() {
            surface.textView.frame = NSRect(x: 0, y: index * 90, width: 600, height: 80)
            container.addSubview(surface.textView)
        }
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

    public func keyboardIntentCaptureProbe() -> [EditorIntentProbe] {
        let capturingView = IntentCapturingTextView(blockID: "blk_a")
        capturingView.string = "AB"
        capturingView.setSelectedRange(NSRange(location: 1, length: 0))
        capturingView.keyDown(with: keyEvent(characters: "\r", keyCode: 36))

        capturingView.setSelectedRange(NSRange(location: 0, length: 0))
        capturingView.keyDown(with: keyEvent(characters: "\u{7F}", keyCode: 51))

        return capturingView.capturedIntents
    }

    public func appKitViewLifecycleProbe() -> AppKitTextSurfaceLifecycleResult {
        let host = AppKitTextSurfaceHost(blocks: [
            TextSurfaceState(blockID: "blk_a", text: "Morning note."),
            TextSurfaceState(blockID: "code_1", text: "let x = 1")
        ])
        let initial = host.blockIDsFromSubviews

        host.apply(.insertTextSurface(
            afterBlockID: "blk_a",
            blockID: "blk_b",
            text: "Split tail.",
            selectionStartUTF16: 0,
            selectionEndUTF16: 5
        ))
        let afterInsert = host.blockIDsFromSubviews
        let insertedSelection = host.selectedRange(for: "blk_b")

        host.apply(.moveTextSurface(blockID: "code_1", toIndex: 0))
        let afterMove = host.blockIDsFromSubviews

        host.apply(.removeTextSurface(blockID: "blk_b"))
        return AppKitTextSurfaceLifecycleResult(
            initialBlockIDs: initial,
            afterInsertBlockIDs: afterInsert,
            insertedSelection: insertedSelection,
            afterMoveBlockIDs: afterMove,
            afterRemoveBlockIDs: host.blockIDsFromSubviews,
            removedViewDetached: host.removedViewDetached,
            remainingViewCount: host.remainingViewCount
        )
    }

    public func appKitFirstResponderKeyboardProbe() -> AppKitFirstResponderKeyboardResult {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 600, height: 300),
            styleMask: [.titled],
            backing: .buffered,
            defer: false
        )
        let viewA = IntentCapturingTextView(blockID: "blk_a")
        let viewB = IntentCapturingTextView(blockID: "code_1")
        viewA.frame = NSRect(x: 0, y: 150, width: 600, height: 140)
        viewB.frame = NSRect(x: 0, y: 0, width: 600, height: 140)
        viewA.string = "AB"
        viewB.string = "CD"
        viewA.setSelectedRange(NSRange(location: 1, length: 0))
        viewB.setSelectedRange(NSRange(location: 0, length: 0))
        window.contentView?.addSubview(viewA)
        window.contentView?.addSubview(viewB)

        let acceptedA = window.makeFirstResponder(viewA)
        window.sendEvent(keyEvent(characters: "\r", keyCode: 36, windowNumber: window.windowNumber))

        let acceptedB = window.makeFirstResponder(viewB)
        window.sendEvent(keyEvent(characters: "\u{7F}", keyCode: 51, windowNumber: window.windowNumber))

        return AppKitFirstResponderKeyboardResult(
            firstResponderAcceptedA: acceptedA,
            firstResponderAcceptedB: acceptedB,
            blockAIntents: viewA.capturedIntents,
            blockBIntents: viewB.capturedIntents
        )
    }

    public func appKitAccessibilityHierarchyProbe() -> AppKitAccessibilityHierarchyResult {
        let container = NSView(frame: NSRect(x: 0, y: 0, width: 600, height: 300))
        let viewA = NSTextView(frame: NSRect(x: 0, y: 150, width: 600, height: 140))
        let viewB = NSTextView(frame: NSRect(x: 0, y: 0, width: 600, height: 140))

        viewA.identifier = NSUserInterfaceItemIdentifier("blk_a")
        viewA.string = "A🍎B"
        viewA.setSelectedRange(NSRange(location: 1, length: 2))
        viewA.setAccessibilityLabel("Block blk_a")

        viewB.identifier = NSUserInterfaceItemIdentifier("code_1")
        viewB.string = "let x = 1"
        viewB.setSelectedRange(NSRange(location: 0, length: 3))
        viewB.setAccessibilityLabel("Block code_1")

        container.addSubview(viewA)
        container.addSubview(viewB)
        container.setAccessibilityChildren([viewA, viewB])

        let children = (container.accessibilityChildren() as? [NSTextView]) ?? []
        return AppKitAccessibilityHierarchyResult(
            childLabels: children.compactMap { $0.accessibilityLabel() },
            selectedRanges: children.map { $0.accessibilitySelectedTextRange() }
        )
    }

    private func keyEvent(characters: String, keyCode: UInt16, windowNumber: Int = 0) -> NSEvent {
        guard let event = NSEvent.keyEvent(
            with: .keyDown,
            location: .zero,
            modifierFlags: [],
            timestamp: 0,
            windowNumber: windowNumber,
            context: nil,
            characters: characters,
            charactersIgnoringModifiers: characters,
            isARepeat: false,
            keyCode: keyCode
        ) else {
            fatalError("NSEvent.keyEvent returned nil")
        }
        return event
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
