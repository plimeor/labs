import AnchorTextKitProbe
import Foundation

@main
struct AnchorTextKitSmoke {
    @MainActor
    static func main() {
        let adapter = NativeEditorAdapterProbe(blocks: [
            TextSurfaceState(blockID: "blk_a", text: "Morning note."),
            TextSurfaceState(blockID: "code_1", text: "let x = 1")
        ])

        let insert = adapter.intentForInsert(
            blockID: "blk_a",
            selectedRange: NSRange(location: 1, length: 0),
            replacement: "x"
        )
        precondition(insert == .insertText(blockID: "blk_a", atUTF16: 1, text: "x"))

        adapter.apply(.replaceBlockText(blockID: "blk_a", text: "Mxorning note.", selectionStartUTF16: 2, selectionEndUTF16: 2))
        precondition(adapter.blocks[0].selection.location == 2)

        adapter.apply(.insertTextSurface(
            afterBlockID: "blk_a",
            blockID: "blk_b",
            text: "Split tail.",
            selectionStartUTF16: 0,
            selectionEndUTF16: 5
        ))
        precondition(adapter.blocks.map(\.blockID) == ["blk_a", "blk_b", "code_1"])
        precondition(adapter.blocks[1].selection.location == 0 && adapter.blocks[1].selection.length == 5)

        adapter.apply(.moveTextSurface(blockID: "code_1", toIndex: 0))
        precondition(adapter.blocks.map(\.blockID) == ["code_1", "blk_a", "blk_b"])

        adapter.apply(.removeTextSurface(blockID: "blk_b"))
        precondition(adapter.blocks.map(\.blockID) == ["code_1", "blk_a"])
        print("textkit:patch_replay_split_move_remove=true")

        adapter.apply(.selectBlocks(["blk_a"]))
        precondition(adapter.blocks[1].selection.length == ("Mxorning note." as NSString).length)

        let embedded = adapter.intentForEmbeddedSelection(blockID: "code_1", selectedRange: NSRange(location: 4, length: 5))
        precondition(embedded == .embeddedSelection(blockID: "code_1", startUTF16: 4, endUTF16: 9))

        for fixture in utf16Fixtures() {
            print("utf16:\(fixture.name)=\(fixture.utf16Count) scalars=\(fixture.scalarCount) crlf=\(fixture.crlfRanges.count)")
        }

        #if os(macOS)
        let runtime = MacTextKitRuntimeProbe(text: "A🍎B")
        let selected = runtime.selectedRangeAfterSetting(NSRange(location: 1, length: 2))
        precondition(selected.location == 1 && selected.length == 2)
        precondition(runtime.hasLayoutSurface())
        precondition(runtime.performSemanticUndoProbe() == ["semantic-inverse-intent"])
        print("textkit:mac:selected=\(selected.location):\(selected.length) layout=true undo=semantic-inverse-intent")

        let marked = runtime.performMarkedTextCommitProbe()
        precondition(marked.hadMarkedText)
        precondition(marked.markedRange.location == 1)
        precondition(marked.committedText == "A拼")
        precondition(marked.intent == .insertText(blockID: "blk_a", atUTF16: 1, text: "拼"))
        print("textkit:ime_marked=true commit=\(marked.committedText) intent_insert_at=\(marked.markedRange.location)")

        let hitIndex = runtime.hitTestInsertionIndexProbe()
        precondition(hitIndex != NSNotFound)
        print("textkit:hittest_index=\(hitIndex)")

        precondition(runtime.directBufferUndoSuppressed())
        print("textkit:direct_buffer_undo_suppressed=true")

        let accessibilityRange = runtime.accessibilitySelectedTextRangeProbe()
        precondition(accessibilityRange.location == 1 && accessibilityRange.length == 2)
        print("textkit:accessibility_selected_range=\(accessibilityRange.location):\(accessibilityRange.length)")

        let keyboardIntents = runtime.keyboardIntentCaptureProbe()
        let expectedKeyboardIntents: [EditorIntentProbe] = [
            .splitBlock(blockID: "blk_a", atUTF16: 1),
            .mergeBackward(blockID: "blk_a")
        ]
        precondition(keyboardIntents == expectedKeyboardIntents)
        print("textkit:keyboard_intents=split@1,merge_backward")

        let lifecycle = runtime.appKitViewLifecycleProbe()
        precondition(lifecycle.initialBlockIDs == ["blk_a", "code_1"])
        precondition(lifecycle.afterInsertBlockIDs == ["blk_a", "blk_b", "code_1"])
        precondition(lifecycle.insertedSelection.location == 0 && lifecycle.insertedSelection.length == 5)
        precondition(lifecycle.afterMoveBlockIDs == ["code_1", "blk_a", "blk_b"])
        precondition(lifecycle.afterRemoveBlockIDs == ["code_1", "blk_a"])
        precondition(lifecycle.removedViewDetached)
        precondition(lifecycle.remainingViewCount == 2)
        print("textkit:appkit_view_lifecycle=insert_move_remove")

        let routedKeyboard = runtime.appKitFirstResponderKeyboardProbe()
        precondition(routedKeyboard.firstResponderAcceptedA)
        precondition(routedKeyboard.firstResponderAcceptedB)
        precondition(routedKeyboard.blockAIntents == [.splitBlock(blockID: "blk_a", atUTF16: 1)])
        precondition(routedKeyboard.blockBIntents == [.mergeBackward(blockID: "code_1")])
        print("textkit:appkit_first_responder_keyboard=blk_a:split@1,code_1:merge_backward")

        let accessibilityHierarchy = runtime.appKitAccessibilityHierarchyProbe()
        precondition(accessibilityHierarchy.childLabels == ["Block blk_a", "Block code_1"])
        precondition(accessibilityHierarchy.selectedRanges.map { "\($0.location):\($0.length)" } == ["1:2", "0:3"])
        print("textkit:appkit_accessibility_children=2 ranges=1:2,0:3")

        let menuRouting = runtime.appKitMenuCommandRoutingProbe()
        precondition(menuRouting.splitActionHandled)
        precondition(menuRouting.mergeActionHandled)
        precondition(menuRouting.blockAIntents == [.splitBlock(blockID: "blk_a", atUTF16: 1)])
        precondition(menuRouting.blockBIntents == [.mergeBackward(blockID: "code_1")])
        precondition(menuRouting.blockATextAfterAction == "AB")
        precondition(menuRouting.blockBTextAfterAction == "CD")
        print("textkit:appkit_menu_commands=blk_a:split@1,code_1:merge_backward")

        let responderUndo = runtime.appKitResponderUndoSuppressionProbe()
        precondition(responderUndo.undoActionHandled)
        precondition(responderUndo.semanticUndoEvents == ["semantic-inverse-intent"])
        precondition(responderUndo.textAfterUndoAction == "edited text")
        precondition(!responderUndo.textViewAllowsUndo)
        print("textkit:appkit_responder_undo=semantic-inverse-intent buffer_unchanged=true")

        let focusLifecycle = runtime.appKitFocusLifecycleProbe()
        precondition(focusLifecycle.splitViewSubviewCount == 2)
        precondition(focusLifecycle.scrollDocumentIDs == ["blk_a", "code_1"])
        precondition(focusLifecycle.firstResponderAcceptedA)
        precondition(focusLifecycle.firstResponderAcceptedB)
        precondition(focusLifecycle.firstResponderAfterA == "blk_a")
        precondition(focusLifecycle.firstResponderAfterB == "code_1")
        precondition(focusLifecycle.selectionA.location == 1 && focusLifecycle.selectionA.length == 0)
        precondition(focusLifecycle.selectionB.location == 0 && focusLifecycle.selectionB.length == 0)
        print("textkit:appkit_focus_lifecycle=split_scroll blk_a->code_1 selections=1:0,0:0")
        #else
        print("textkit:runtime=not-run-on-this-platform")
        #endif
    }
}
