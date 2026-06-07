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

        adapter.apply(.selectBlocks(["blk_a"]))
        precondition(adapter.blocks[0].selection.length == ("Mxorning note." as NSString).length)

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
        #else
        print("textkit:runtime=not-run-on-this-platform")
        #endif
    }
}
