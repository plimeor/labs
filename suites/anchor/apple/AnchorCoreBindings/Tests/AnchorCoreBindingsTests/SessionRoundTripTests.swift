//
//  SessionRoundTripTests.swift
//  AnchorCoreBindingsTests
//
//  Exercises the real C-ABI staticlib link + buffer-free path on macOS, and the
//  platform-stub contract elsewhere. Assertions are structural/self-consistent
//  (non-empty revision, noteCount == noteIDs.count, typed error vocabulary) and
//  deliberately do NOT hardcode/recompute the golden snapshot hash — that value
//  is owned by the Rust core (D24 golden); these only assert it survives the
//  binding boundary intact.
//

import Foundation
import Testing
@testable import AnchorCoreBindings

#if os(macOS)
@Suite struct SessionRoundTripTests {
    @Test func openFixtureVaultReturnsSelfConsistentSummary() throws {
        let summary = try openFixtureVault()
        #expect(!summary.vaultID.isEmpty)
        #expect(!summary.snapshotRevision.isEmpty)
        #expect(summary.noteCount == summary.noteIDs.count)
        #expect(summary.noteCount >= 1)
    }

    @Test func sessionSummaryAndSegmentRoundTripThroughFFI() throws {
        let session = try AnchorSession()
        let summary = try session.summary()
        #expect(!summary.snapshotRevision.isEmpty)
        #expect(summary.noteCount == summary.noteIDs.count)

        let segment = try session.readSegment()
        #expect(!segment.isEmpty)
    }

    @Test func insertDispatchDecodesTransactionResult() throws {
        // Binding-contract test: the intent is forwarded to core and core's
        // result (changed ids + selection hint) survives the C-ABI -> Decodable
        // boundary. Swift does not compute the selection offset; it asserts the
        // value core returned arrived intact.
        let session = try AnchorSession()
        let result = try session.dispatchInsertText(targetID: "blk_a", at: 0, text: "Hi ")
        #expect(result.validationError == nil)
        #expect(result.changedIDs == ["blk_a"])
        #expect(result.selectionHint?.start == 3)
    }

    @Test func directDeleteOnActiveBlockYieldsTypedValidationError() throws {
        let session = try AnchorSession()
        let result = try session.dispatchDirectDelete(targetID: "blk_a")
        #expect(result.validationError?.code == .directActiveToDeleted)
    }

    @Test func blobIDRoundTripsThroughFFI() throws {
        let blob = fixtureBlob(size: 64)
        #expect(blob.count == 64)
        let id = try blobID(bytes: blob)
        #expect(!id.isEmpty)
    }
}
#else
@Suite struct SessionStubContractTests {
    @Test func bindingThrowsUnavailableOnNonMacOS() {
        #expect(throws: AnchorBindingError.unavailableOnPlatform) {
            _ = try AnchorSession()
        }
        #expect(throws: AnchorBindingError.unavailableOnPlatform) {
            _ = try openFixtureVault()
        }
    }
}
#endif
