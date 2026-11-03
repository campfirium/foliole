import XCTest

extension FoliolePhysicalSyncGroupUITests {
    func verifyVisibleBodyAfterRelaunch(
        _ submittedBody: String, prefix: String, matching text: String, in app: XCUIApplication
    ) {
        let bodyAttachment = XCTAttachment(string: submittedBody)
        bodyAttachment.name = "Fri-visible-body-read-before-save"
        bodyAttachment.lifetime = .keepAlways
        add(bodyAttachment)

        app.launch()
        openBrowse(in: app)
        waitForVisibleTopicText(prefix: prefix, text: text, in: app)
        revealReadingChrome(in: app, matching: text)
        tapButton(named: "Edit content", in: app, timeout: 30)
        let editor = app.textViews["Topic body"]
        XCTAssertTrue(editor.waitForExistence(timeout: 30))
        XCTAssertEqual(editor.value as? String, submittedBody,
                       "The visible body read before saving must survive application relaunch.")
        attachScreenshot(named: "Fri-visible-body-before-save-equals-relaunched-body")
        tapButton(named: "Done", in: app, timeout: 30)
    }
}

// Starts with an old-engine file staged by the explicit database-upgrade workflow.
final class FoliolePhysicalDatabaseUpgradeUITests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }

    func testRetainsLegacyFactsAcrossInstallAndRestart() throws {
        let app = XCUIApplication()
        app.launchArguments += ["--foliole-physical-acceptance",
                                "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        try openUpgradeSearch("Legacy upgrade retained sentence", in: app)
        app.terminate()
        app.launch()
        try openUpgradeSearch("Legacy upgrade retained sentence", in: app)
        openBrowseSurface(in: app)
        let capture = app.buttons["Capture"]
        XCTAssertTrue(waitDismissingSyncNotice(capture, in: app, timeout: 30))
        capture.tap()
        let editor = app.textViews["Capture text"]
        XCTAssertTrue(editor.waitForExistence(timeout: 30))
        editor.tap()
        editor.typeText("Fri upgrade subsequent write.")
        let save = app.buttons["Save"]
        XCTAssertTrue(save.waitForExistence(timeout: 30))
        save.tap()
        XCTAssertFalse(editor.waitForExistence(timeout: 5))
        app.terminate()
        app.launch()
        try openUpgradeSearch("Fri upgrade subsequent write", in: app)
        try openUpgradeSearch("Legacy upgrade retained sentence", in: app)
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Fri-old-database-retained-after-new-write-and-restart"
        screenshot.lifetime = .keepAlways
        add(screenshot)
        app.terminate()
    }

    private func openUpgradeSearch(_ text: String, in app: XCUIApplication) throws {
        openBrowseSurface(in: app)
        let searchButton = app.buttons["Search"]
        XCTAssertTrue(waitDismissingSyncNotice(searchButton, in: app, timeout: 45))
        searchButton.tap()
        let search = app.searchFields["Search synced topics"]
        XCTAssertTrue(search.waitForExistence(timeout: 30))
        search.tap()
        if let value = search.value as? String, !value.isEmpty, value != "Search synced topics" {
            search.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: value.count))
        }
        search.typeText(text)
        let result = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
        XCTAssertTrue(result.waitForExistence(timeout: 45), "Old database content was not searchable.")
        if app.toolbars.buttons["Done"].exists { app.toolbars.buttons["Done"].tap() }
        result.tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", text))
            .firstMatch.waitForExistence(timeout: 30), "Persisted content was not readable.")
    }
}
