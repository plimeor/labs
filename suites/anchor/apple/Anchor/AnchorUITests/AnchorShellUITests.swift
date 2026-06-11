//
//  AnchorShellUITests.swift
//  AnchorUITests
//
//  Deterministic UI regression checks that REPLACE the previous Codex
//  computer-use screenshot / get_app_state verification loop. The app is
//  launched with `-uiTestUseSampleStore` so assertions run against the stable
//  NotePreview.samples data instead of live core-fixture content. Assertions
//  use accessibility identifiers/labels, never pixel or screenshot comparison.
//

import XCTest

final class AnchorShellUITests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    private func launchApp() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += ["-uiTestUseSampleStore"]
        app.launch()
        return app
    }

    private func select(_ element: XCUIElement) {
        #if os(macOS)
        element.click()
        #else
        element.tap()
        #endif
    }

    func testToolbarWriteActionsAreDisabled() {
        let app = launchApp()
        let newNote = app.buttons["New Note"]
        XCTAssertTrue(newNote.waitForExistence(timeout: 20))
        XCTAssertFalse(newNote.isEnabled, "New Note must stay disabled until the write-dispatch gate closes")

        let sync = app.buttons["Sync"]
        XCTAssertTrue(sync.exists)
        XCTAssertFalse(sync.isEnabled, "Sync must stay disabled until the iCloud delivery gate closes")
    }

    func testSidebarSelectionUpdatesInspectorRevision() {
        let app = launchApp()
        // Default selection is the first sample (Product loop, revision 3ef88671).
        XCTAssertTrue(app.staticTexts["3ef88671"].waitForExistence(timeout: 20))

        // Selecting a different note updates the inspector's revision value.
        let row = app.staticTexts["Binding integration"]
        XCTAssertTrue(row.waitForExistence(timeout: 5))
        select(row)
        XCTAssertTrue(app.staticTexts["18582d53"].waitForExistence(timeout: 5))
    }

    #if os(macOS)
    func testEditorExposesTextKitBody() {
        let app = launchApp()
        // The read-only core projection renders through TextKit; assert the
        // NSTextView is present via its accessibility identifier.
        let body = app.textViews["coreProjectionTextKitView"]
        XCTAssertTrue(body.waitForExistence(timeout: 20))
    }
    #endif
}
