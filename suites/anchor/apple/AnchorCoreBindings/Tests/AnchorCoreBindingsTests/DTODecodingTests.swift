//
//  DTODecodingTests.swift
//  AnchorCoreBindingsTests
//
//  Pure, FFI-free tests that lock the C-ABI JSON -> Swift DTO contract
//  (CodingKeys snake_case <-> camelCase, nested/optional decoding, and the
//  hand-mirrored ValidationErrorCode vocabulary). These assert only that the
//  bytes core emits decode into the expected DTO shape — they never recompute
//  merge/diff3/order-key/normalization/op-shape/BLAKE3 in Swift; that
//  determinism is owned by the Rust core tests.
//

import Foundation
import Testing
@testable import AnchorCoreBindings

@Suite struct DTODecodingTests {
    private let decoder = JSONDecoder()

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try decoder.decode(type, from: Data(json.utf8))
    }

    @Test func fixtureSummaryDecodesSnakeCaseKeys() throws {
        let summary = try decode(
            FixtureSummary.self,
            #"{"vault_id":"vault_demo_0001","note_count":3,"snapshot_revision":"18582d53ab","note_ids":["a","b","c"]}"#
        )
        #expect(summary.vaultID == "vault_demo_0001")
        #expect(summary.noteCount == 3)
        #expect(summary.snapshotRevision == "18582d53ab")
        #expect(summary.noteIDs == ["a", "b", "c"])
    }

    @Test func transactionResultDecodesNestedAndOptionalFields() throws {
        let result = try decode(
            TransactionResult.self,
            """
            {
              "changed_ids": ["blk_a"],
              "validation_error": null,
              "new_revisions": {"blk_a": "rev1"},
              "selection_hint": {"kind": "caret", "block_id": "blk_a", "start": 3, "end": 3},
              "editor_patches": [
                {"kind": "replace_block_text", "after_block_id": null, "block_id": "blk_a", "text": "Hi ", "selection_start": 3, "selection_end": 3}
              ],
              "undo_group": {"group_id": "g1", "label": "Insert text", "inverse_patches": []},
              "conflicts": [],
              "projection_fresh": true,
              "mirror_fresh": false
            }
            """
        )
        #expect(result.changedIDs == ["blk_a"])
        #expect(result.validationError == nil)
        #expect(result.newRevisions["blk_a"] == "rev1")
        #expect(result.selectionHint?.blockID == "blk_a")
        #expect(result.selectionHint?.start == 3)
        #expect(result.editorPatches.first?.kind == "replace_block_text")
        #expect(result.editorPatches.first?.text == "Hi ")
        #expect(result.undoGroup?.groupID == "g1")
        #expect(result.undoGroup?.inversePatches.isEmpty == true)
        #expect(result.conflicts.isEmpty)
        #expect(result.projectionFresh)
        #expect(result.mirrorFresh == false)
    }

    @Test func conflictRecordDecodesSnakeCaseKeys() throws {
        let conflict = try decode(
            ConflictRecord.self,
            #"{"target_id":"blk_a","kind":"split_merge_structural","sub_field_key":null,"live_op_id":"op_2","losing_op_ids":["op_1"],"pinned_op_ids":[]}"#
        )
        #expect(conflict.targetID == "blk_a")
        #expect(conflict.kind == "split_merge_structural")
        #expect(conflict.liveOpID == "op_2")
        #expect(conflict.losingOpIDs == ["op_1"])
        #expect(conflict.pinnedOpIDs.isEmpty)
    }

    @Test func validationErrorCodeDecodesKnownVocabulary() throws {
        let cases: [(String, ValidationErrorCode)] = [
            ("invalid_utf16_offset", .invalidUTF16Offset),
            ("direct_active_to_deleted", .directActiveToDeleted),
            ("structural_dispatch_deferred", .structuralDispatchDeferred),
            ("adapter_null_session", .adapterNullSession),
            ("adapter_parse_error", .adapterParseError),
        ]
        for (raw, expected) in cases {
            let error = try decode(ValidationError.self, #"{"code":"\#(raw)","message":"x"}"#)
            #expect(error.code == expected)
            #expect(error.code.rawValue == raw)
        }
    }

    @Test func unknownValidationCodeDegradesInsteadOfFailingDecode() throws {
        // Forward-compatibility guard: a code core may add later must NOT fail
        // the whole TransactionResult decode — it degrades to .unknown(raw).
        let error = try decode(ValidationError.self, #"{"code":"some_future_code","message":"x"}"#)
        #expect(error.code == .unknown("some_future_code"))
        #expect(error.code.rawValue == "some_future_code")
    }
}
