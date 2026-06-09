import AnchorCoreBindings
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
let changedIDs = insert.changedIDs.joined(separator: ",")
let selectionStart = insert.selectionHint?.start ?? 0
let selectionEnd = insert.selectionHint?.end ?? 0
print("dispatch:insert changed=\(changedIDs) selection=\(selectionStart):\(selectionEnd)")

let delete = try session.dispatchDirectDelete(targetID: "blk_a")
precondition(delete.validationError != nil)
precondition(delete.validationError?.code == .directActiveToDeleted)
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

let asyncClient = try AnchorCoreClient()
let asyncBefore = try await asyncClient.summary()
precondition(asyncBefore.snapshotRevision == expectedSnapshot)
let asyncInsert = try await asyncClient.dispatchInsertText(targetID: "blk_a", at: 0, text: "🍎 ")
precondition(asyncInsert.validationError == nil)
precondition(asyncInsert.changedIDs == ["blk_a"])
precondition(asyncInsert.selectionHint?.start == 3)
let asyncSegment = try await asyncClient.readSegment()
precondition(!asyncSegment.isEmpty)
print("async:sendable summary=\(asyncBefore.snapshotRevision) changed=\(asyncInsert.changedIDs.joined(separator: ",")) segment=\(asyncSegment.count)")

for size in [1 << 20, 1 << 22, 1 << 24, 1 << 26] {
    let result = measureBlob(size: size)
    let milliseconds = String(format: "%.2f", result.milliseconds)
    print("bench:size=\(size) bytes=\(result.bytes) ms=\(milliseconds) maxrss=\(result.maxRSS) checksum=\(result.checksum)")
}
