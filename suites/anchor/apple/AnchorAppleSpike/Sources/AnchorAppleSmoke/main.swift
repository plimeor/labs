import AnchorCoreBindings
import AnchorICloudDriveProbe
import AnchorTextKitProbe
import Darwin
import Foundation

func maxResidentBytes() -> Int64 {
    var usage = rusage()
    getrusage(RUSAGE_SELF, &usage)
    return Int64(usage.ru_maxrss)
}

func measureBlob(size: Int) -> (milliseconds: Double, bytes: Int, checksum: UInt64, maxRSS: Int64) {
    let start = DispatchTime.now().uptimeNanoseconds
    let blob = fixtureBlob(size: size)
    let elapsed = DispatchTime.now().uptimeNanoseconds - start
    let checksum = blob.prefix(4096).reduce(UInt64(0)) { partial, byte in
        ((partial << 5) &+ partial) &+ UInt64(byte)
    }
    return (Double(elapsed) / 1_000_000.0, blob.count, checksum, maxResidentBytes())
}

let expectedSnapshot = "3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63"

func applyCorePatches(_ patches: [EditorPatch], to adapter: NativeEditorAdapterProbe) {
    for patch in patches {
        switch patch.kind {
        case "replace_block_text":
            guard
                let blockID = patch.blockID,
                let text = patch.text,
                let start = patch.selectionStart,
                let end = patch.selectionEnd
            else {
                fatalError("Malformed replace_block_text patch")
            }
            adapter.apply(.replaceBlockText(
                blockID: blockID,
                text: text,
                selectionStartUTF16: Int(start),
                selectionEndUTF16: Int(end)
            ))
        case "insert_text_surface":
            guard
                let afterBlockID = patch.afterBlockID,
                let blockID = patch.blockID,
                let text = patch.text,
                let start = patch.selectionStart,
                let end = patch.selectionEnd
            else {
                fatalError("Malformed insert_text_surface patch")
            }
            adapter.apply(.insertTextSurface(
                afterBlockID: afterBlockID,
                blockID: blockID,
                text: text,
                selectionStartUTF16: Int(start),
                selectionEndUTF16: Int(end)
            ))
        case "remove_text_surface":
            guard let blockID = patch.blockID else {
                fatalError("Malformed remove_text_surface patch")
            }
            adapter.apply(.removeTextSurface(blockID: blockID))
        default:
            fatalError("Unknown core editor patch kind: \(patch.kind)")
        }
    }
}

let summary = try openFixtureVault()
precondition(summary.vaultID == "vault_demo_0001")
precondition(summary.noteCount == 1)
precondition(summary.snapshotRevision == expectedSnapshot)
print("fixture:vault=\(summary.vaultID) notes=\(summary.noteCount) snapshot=\(summary.snapshotRevision)")

let session = try AnchorSession()
let before = try session.summary()
precondition(before.snapshotRevision == expectedSnapshot)

let insert = try session.dispatchInsertText(targetID: "blk_a", at: 0, text: "🍎 ")
precondition(insert.validationError == nil)
precondition(insert.changedIDs == ["blk_a"])
precondition(insert.selectionHint?.kind == "text")
precondition(insert.selectionHint?.start == 3)
precondition(insert.selectionHint?.end == 3)
precondition(insert.editorPatches.count == 1)
precondition(insert.editorPatches[0].kind == "replace_block_text")
precondition(insert.editorPatches[0].blockID == "blk_a")
precondition(insert.editorPatches[0].text == "🍎 Morning note.")
precondition(insert.undoGroup?.label == "replace_block_text")
precondition(insert.undoGroup?.inversePatches.count == 1)
let changedIDs = insert.changedIDs.joined(separator: ",")
let selectionStart = insert.selectionHint?.start ?? 0
let selectionEnd = insert.selectionHint?.end ?? 0
print("dispatch:insert changed=\(changedIDs) selection=\(selectionStart):\(selectionEnd) patches=\(insert.editorPatches.count) undo=\(insert.undoGroup?.label ?? "none")")

let delete = try session.dispatchDirectDelete(targetID: "blk_a")
precondition(delete.validationError != nil)
precondition(delete.validationError?.code == .directActiveToDeleted)
precondition(delete.editorPatches.isEmpty)
precondition(delete.undoGroup == nil)
let validationError = delete.validationError?.code.rawValue ?? "none"
print("dispatch:error validation=\(validationError)")

let segment = try session.readSegment()
precondition(!segment.isEmpty)
print("segment:bytes=\(segment.count)")

let textKitSession = try AnchorSession()
let adapter = NativeEditorAdapterProbe(blocks: [
    TextSurfaceState(blockID: "blk_a", text: "Morning note.")
])
let intent = adapter.intentForInsert(
    blockID: "blk_a",
    selectedRange: NSRange(location: 1, length: 0),
    replacement: "x"
)
guard case let .insertText(blockID, atUTF16, text) = intent else {
    fatalError("Expected insertText intent from TextKit adapter probe")
}
let bridgedInsert = try textKitSession.dispatchInsertText(
    targetID: blockID,
    at: UInt32(atUTF16),
    text: text
)
precondition(bridgedInsert.validationError == nil)
precondition(bridgedInsert.changedIDs == ["blk_a"])
precondition(bridgedInsert.selectionHint?.kind == "text")
precondition(bridgedInsert.selectionHint?.start == UInt32(atUTF16 + (text as NSString).length))
precondition(bridgedInsert.selectionHint?.end == UInt32(atUTF16 + (text as NSString).length))
let bridgedSegment = try textKitSession.readSegment()
precondition(!bridgedSegment.isEmpty)
let bridgedSelectionStart = bridgedInsert.selectionHint?.start ?? 0
let bridgedSelectionEnd = bridgedInsert.selectionHint?.end ?? 0
print(
    "textkit:core_dispatch_bridge=insert changed=\(bridgedInsert.changedIDs.joined(separator: ",")) selection=\(bridgedSelectionStart):\(bridgedSelectionEnd) segment=\(bridgedSegment.count)"
)

let structuralSession = try AnchorSession()
let splitIntent = EditorIntentProbe.splitBlock(blockID: "blk_a", atUTF16: 1)
guard case let .splitBlock(splitBlockID, splitAtUTF16) = splitIntent else {
    fatalError("Expected splitBlock structural intent")
}
let splitResult = try structuralSession.dispatchSplitBlock(
    targetID: splitBlockID,
    at: UInt32(splitAtUTF16)
)
precondition(splitResult.validationError == nil)
precondition(splitResult.changedIDs.count == 2)
precondition(splitResult.changedIDs.first == "blk_a")
let splitCreatedBlockID = splitResult.changedIDs[1]
precondition(splitCreatedBlockID.hasPrefix("blk_op_split_block_"))
precondition(splitResult.selectionHint?.kind == "text")
precondition(splitResult.selectionHint?.blockID == splitCreatedBlockID)
precondition(splitResult.selectionHint?.start == 0)
precondition(splitResult.selectionHint?.end == 0)
precondition(splitResult.editorPatches.map(\.kind) == ["replace_block_text", "insert_text_surface"])
let splitAdapter = NativeEditorAdapterProbe(blocks: [
    TextSurfaceState(blockID: "blk_a", text: "Morning note.")
])
applyCorePatches(splitResult.editorPatches, to: splitAdapter)
precondition(splitAdapter.blocks.map(\.blockID) == ["blk_a", splitCreatedBlockID])
precondition(splitAdapter.blocks[0].text == "M")
precondition(splitAdapter.blocks[1].text == "orning note.")
precondition(splitResult.undoGroup?.label == "split_block")
precondition(splitResult.undoGroup?.inversePatches.map(\.kind) == ["replace_block_text", "remove_text_surface"])
applyCorePatches(splitResult.undoGroup?.inversePatches ?? [], to: splitAdapter)
precondition(splitAdapter.blocks.map(\.blockID) == ["blk_a"])
precondition(splitAdapter.blocks[0].text == "Morning note.")

let mergeSession = try AnchorSession()
let mergeIntent = EditorIntentProbe.mergeBackward(blockID: "blk_b")
guard case let .mergeBackward(mergeBlockID) = mergeIntent else {
    fatalError("Expected mergeBackward structural intent")
}
let mergeResult = try mergeSession.dispatchMergeBackward(targetID: mergeBlockID)
precondition(mergeResult.validationError == nil)
precondition(mergeResult.changedIDs == ["blk_a", "blk_b"])
precondition(mergeResult.selectionHint?.kind == "text")
precondition(mergeResult.selectionHint?.blockID == "blk_a")
precondition(mergeResult.selectionHint?.start == 13)
precondition(mergeResult.selectionHint?.end == 13)
precondition(mergeResult.editorPatches.map(\.kind) == ["replace_block_text", "remove_text_surface"])
let mergeAdapter = NativeEditorAdapterProbe(blocks: [
    TextSurfaceState(blockID: "blk_a", text: "Morning note."),
    TextSurfaceState(blockID: "blk_b", text: "Evening note.")
])
applyCorePatches(mergeResult.editorPatches, to: mergeAdapter)
precondition(mergeAdapter.blocks.map(\.blockID) == ["blk_a"])
precondition(mergeAdapter.blocks[0].text == "Morning note.Evening note.")
precondition(mergeAdapter.blocks[0].selection == NSRange(location: 13, length: 0))
precondition(mergeResult.undoGroup?.label == "merge_backward")
precondition(mergeResult.undoGroup?.inversePatches.map(\.kind) == ["replace_block_text", "insert_text_surface"])
applyCorePatches(mergeResult.undoGroup?.inversePatches ?? [], to: mergeAdapter)
precondition(mergeAdapter.blocks.map(\.blockID) == ["blk_a", "blk_b"])
precondition(mergeAdapter.blocks[0].text == "Morning note.")
precondition(mergeAdapter.blocks[1].text == "Evening note.")
print("textkit:core_dispatch_bridge=structural split=changed:\(splitResult.changedIDs.joined(separator: ",")) merge=changed:\(mergeResult.changedIDs.joined(separator: ",")) patches=split:\(splitResult.editorPatches.count),merge:\(mergeResult.editorPatches.count) undo=split:\(splitResult.undoGroup?.inversePatches.count ?? 0),merge:\(mergeResult.undoGroup?.inversePatches.count ?? 0)")

let unavailableAccountState = ICloudDriveAdapterProbe.classifyAccountState(
    explicitContainerURL: nil,
    implicitContainerURL: nil
)
precondition(unavailableAccountState.explicitContainerAvailable == false)
precondition(unavailableAccountState.implicitContainerAvailable == false)
precondition(unavailableAccountState.adapterStatus == .blockedNoUbiquityContainer)
print(
    "icloud:account_state_classifier=\(unavailableAccountState.adapterStatus.rawValue) explicit=\(unavailableAccountState.explicitContainerAvailable) implicit=\(unavailableAccountState.implicitContainerAvailable)"
)

let asyncClient = try AnchorCoreClient()
let asyncBefore = try await asyncClient.summary()
precondition(asyncBefore.snapshotRevision == expectedSnapshot)
let asyncInsert = try await asyncClient.dispatchInsertText(targetID: "blk_a", at: 0, text: "🍎 ")
precondition(asyncInsert.validationError == nil)
precondition(asyncInsert.changedIDs == ["blk_a"])
precondition(asyncInsert.selectionHint?.start == 3)
precondition(asyncInsert.undoGroup?.label == "replace_block_text")
let asyncSegment = try await asyncClient.readSegment()
precondition(!asyncSegment.isEmpty)
print("async:sendable summary=\(asyncBefore.snapshotRevision) changed=\(asyncInsert.changedIDs.joined(separator: ",")) segment=\(asyncSegment.count)")

for size in [1 << 20, 1 << 22, 1 << 24, 1 << 26] {
    let result = measureBlob(size: size)
    let milliseconds = String(format: "%.2f", result.milliseconds)
    print("bench:size=\(size) bytes=\(result.bytes) ms=\(milliseconds) maxrss=\(result.maxRSS) checksum=\(result.checksum)")
}
