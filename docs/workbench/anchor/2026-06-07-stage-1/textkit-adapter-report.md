# Anchor Stage 1 - TextKit Adapter Report

Date: 2026-06-07
Owner: Codex / Apple verifier
Status: workbench artifact, not a public interface contract

## Conclusion

TextKit adapter status is **mechanism viable for Stage 1, not complete for product editor runtime**.

Observed in this run:

- SwiftPM TextKit probe builds on macOS.
- `AnchorTextKitProbe` builds for iOS Simulator with Xcode 26.5 and Swift 6.
- Adapter-level event mapping can produce `EditorIntentProbe` for single-block insert, block selection, and embedded/code selection.
- Adapter-level `EditorPatchProbe` can update a native view model projection without making TextKit the truth model.
- macOS `NSTextView` runtime can set UTF-16 `NSRange` selection and expose layout/text-container surface.
- Semantic undo via `UndoManager` can dispatch an inverse-intent callback on `MainActor`.
- UTF-16 fixture counts were observed for emoji, ZWJ, combining mark, CRLF, and mixed strings.

Not observed:

- Real keyboard/input event interception.
- IME marked-text commit path.
- Accessibility range behavior.
- Hit-testing against rendered block geometry.
- Direct buffer undo suppression in a real app responder chain.
- Cross-view continuous text selection.
- `EditorPatch` replay against disappearing/splitting/moving real views.

## Created probe files

- `suites/anchor/apple/AnchorAppleSpike/Sources/AnchorTextKitProbe/AnchorTextKitProbe.swift`
- `suites/anchor/apple/AnchorAppleSpike/Sources/AnchorTextKitSmoke/main.swift`

These are adapter probes only. They do not implement core merge, normalization, op creation, diff3, order-key, or persistent writes.

## Commands and results

| Command | Result |
|---|---|
| `ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-darwin/release swift run --package-path suites/anchor/apple/AnchorAppleSpike --scratch-path /tmp/anchor-apple-stage1/swift-build-textkit AnchorTextKitSmoke` | passed |
| `ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-ios-sim/release xcodebuild -scheme AnchorTextKitProbe -destination 'generic/platform=iOS Simulator' -configuration Debug -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/textkit-ios-3 -quiet build` | passed |

TextKit smoke output:

```text
utf16:emoji=4 scalars=3 crlf=0
utf16:zwj=11 scalars=7 crlf=0
utf16:combining=7 scalars=7 crlf=0
utf16:crlf=6 scalars=6 crlf=1
utf16:mixed=11 scalars=9 crlf=1
textkit:mac:selected=1:2 layout=true undo=semantic-inverse-intent
```

## Surface coverage

| Item | Status | Evidence |
|---|---|---|
| NSTextView input/layout/selection surface | partial passed | macOS runtime set selection `1:2`; layout manager and text container available |
| UITextView compile surface | passed | `AnchorTextKitProbe` iOS Simulator build exit 0 |
| Event to `EditorIntent` | partial passed | probe maps insert, block hit, and embedded selection into intent-shaped values |
| `EditorPatch` to native view model | partial passed | probe applies replace-text, select-blocks, and focus-embedded patches to local projection state |
| Single-block text selection | passed as projection | UTF-16 `NSRange` selection observed |
| Block selection | passed as adapter model | block id selection maps to full block projection selection |
| Embedded/code selection | passed as adapter model | embedded selection maps to UTF-16 start/end |
| Semantic undo | partial passed | adapter-owned `UndoManager` invokes semantic inverse-intent callback |
| IME marked text | not run | compile-only UIKit hook exists; no runtime IME composition |
| Accessibility | not run | no runtime accessibility range probe |
| Hit-testing | not run | no rendered block geometry or app shell |
| Direct buffer undo suppression | not run | no product app responder chain |
| Cross-block continuous selection | not run | deliberately spike-only, not product commitment |

## Swift 6 / MainActor finding

`NSTextView` and `UndoManager` APIs are `MainActor` isolated under Swift 6. The first macOS smoke compile surfaced strict-concurrency errors around undo registration and captured mutable state. The probe was corrected by moving the AppKit runtime surface to `@MainActor` and using an `UndoEventRecorder`.

This should be carried into the product adapter: TextKit runtime work belongs on the main actor, while core dispatch remains a binding call that returns DTO/patch data.

## Boundary check

The TextKit probe does not make TextKit buffer a truth model.

Allowed behavior observed:

- native selection and view state are transient projections
- insert/block/embedded actions are represented as intent-shaped values
- patch replay mutates only view-model projection
- semantic undo routes through an inverse-intent callback

Forbidden behavior not introduced:

- no Swift merge
- no Swift normalization
- no Swift op creation
- no Swift tree invariant validation
- no Swift diff3
- no Swift order-key generation
- no persistent application write

## Remaining CP-1 work

Before TextKit can pass CP-1 as an editor adapter, a real app-shell or focused runtime harness still needs:

- keyboard/input interception into `EditorIntent`
- IME marked-text fixture with commit boundary
- accessibility range mapping
- hit-testing from rendered blocks to block ids/ranges
- direct buffer undo suppression
- patch replay over disappearing/splitting/moving views
- explicit cross-block selection decision as spike-only or product-supported
