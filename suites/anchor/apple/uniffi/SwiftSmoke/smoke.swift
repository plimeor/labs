import Darwin
import Foundation

func maxResidentBytes() -> Int64 {
    var usage = rusage()
    getrusage(RUSAGE_SELF, &usage)
    return Int64(usage.ru_maxrss)
}

func checksum(_ data: Data) -> UInt64 {
    data.prefix(4096).reduce(UInt64(0)) { partial, byte in
        ((partial << 5) &+ partial) &+ UInt64(byte)
    }
}

@main
struct SmokeMain {
    static func main() {
        let expectedSnapshot = "3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63"

        let summary = openFixtureVault()
        precondition(summary.vaultId == "vault_demo_0001")
        precondition(summary.noteCount == 1)
        precondition(summary.snapshotRevision == expectedSnapshot)
        print("uniffi:fixture vault=\(summary.vaultId) notes=\(summary.noteCount) snapshot=\(summary.snapshotRevision)")

        let insertIntent = EditorIntentDto(
            kind: "insert_text",
            targetId: "blk_a",
            at: 0,
            text: "🍎 ",
            life: ""
        )
        let insert = dispatchEditorIntent(intent: insertIntent)
        precondition(!insert.hasValidationError)
        precondition(insert.changedIds == ["blk_a"])
        precondition(insert.selectionKind == "text")
        precondition(insert.selectionStart == 3)
        precondition(insert.selectionEnd == 3)
        print("uniffi:dispatch insert changed=\(insert.changedIds.joined(separator: ",")) selection=\(insert.selectionStart):\(insert.selectionEnd)")

        let deleteIntent = EditorIntentDto(
            kind: "set_life",
            targetId: "blk_a",
            at: 0,
            text: "",
            life: "deleted"
        )
        let delete = dispatchEditorIntent(intent: deleteIntent)
        precondition(delete.hasValidationError)
        precondition(delete.validationErrorCode == .directActiveToDeleted)
        print("uniffi:dispatch error=\(delete.validationErrorCode) message=\(delete.validationErrorMessage)")

        let roundTrip = roundTripInsert(intent: insertIntent)
        precondition(roundTrip.before.snapshotRevision == expectedSnapshot)
        precondition(roundTrip.transaction.changedIds == ["blk_a"])
        precondition(roundTrip.after.snapshotRevision != expectedSnapshot)
        precondition(roundTrip.segmentLen > 0)
        precondition(roundTrip.segmentId.hasPrefix("seg_"))
        print("uniffi:roundtrip before=\(roundTrip.before.snapshotRevision) after=\(roundTrip.after.snapshotRevision) segment=\(roundTrip.segmentLen) id=\(roundTrip.segmentId)")

        let segment = readFixtureSegment()
        precondition(!segment.isEmpty)
        print("uniffi:segment bytes=\(segment.count) checksum=\(checksum(segment))")

        for size in [1 << 20, 1 << 22, 1 << 24, 1 << 26] {
            let start = DispatchTime.now().uptimeNanoseconds
            let blob = fixtureBlob(size: UInt64(size))
            let elapsed = DispatchTime.now().uptimeNanoseconds - start
            let milliseconds = Double(elapsed) / 1_000_000.0
            print("uniffi:bench size=\(size) bytes=\(blob.count) ms=\(String(format: "%.2f", milliseconds)) maxrss=\(maxResidentBytes()) checksum=\(checksum(blob))")
        }
    }
}
