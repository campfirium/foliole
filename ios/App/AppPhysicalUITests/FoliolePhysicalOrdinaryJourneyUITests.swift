import XCTest

final class FoliolePhysicalOrdinaryJourneyUITests: XCTestCase {
    private let content = "Fri ordinary journey content"

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testCapturesContentAndPersistsAfterRelaunch() throws {
        let app = XCUIApplication()
        app.launchArguments += ["--foliole-physical-acceptance",
                                "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()

        assertOrdinaryControls(in: app)
        assertNotJoined(in: app)
        captureContent(in: app)
        assertContentVisible(in: app)
        attachScreenshot(named: "Fri-ordinary-before-relaunch")

        app.terminate()
        app.launch()
        assertOrdinaryControls(in: app)
        assertContentVisible(in: app)
        attachScreenshot(named: "Fri-ordinary-after-relaunch")
    }

    private func assertOrdinaryControls(in app: XCUIApplication) {
        XCTAssertTrue(app.buttons["Browse"].waitForExistence(timeout: 45),
                      "Browse did not become available after iPhone workspace loading.")
        app.buttons["Browse"].tap()
        XCTAssertTrue(app.buttons["Capture"].waitForExistence(timeout: 15),
                      "Capture is unavailable on the ordinary iPhone surface.")
    }

    private func assertNotJoined(in app: XCUIApplication) {
        tapButton(named: "Settings", in: app)
        let sync = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH %@", "Sync ")
        ).firstMatch
        XCTAssertTrue(sync.waitForExistence(timeout: 30), "Sync settings row is unavailable.")
        sync.tap()
        XCTAssertTrue(app.buttons["Connect to Sync Group"].waitForExistence(timeout: 30),
                      "The fresh ordinary journey container is already joined.")
    }

    private func captureContent(in app: XCUIApplication) {
        tapButton(named: "Browse", in: app)
        tapButton(named: "Capture", in: app)
        let editor = app.textViews["Capture text"]
        XCTAssertTrue(editor.waitForExistence(timeout: 30), "Capture editor is unavailable.")
        editor.tap()
        editor.typeText(content)
        tapButton(named: "Save", in: app)
        let closed = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"), object: editor
        )
        XCTAssertEqual(XCTWaiter.wait(for: [closed], timeout: 30), .completed,
                       "Captured content was not saved.")
    }

    private func assertContentVisible(in app: XCUIApplication) {
        tapButton(named: "Browse", in: app)
        let item = app.staticTexts.matching(
            NSPredicate(format: "label BEGINSWITH %@", content)
        ).firstMatch
        XCTAssertTrue(item.waitForExistence(timeout: 30),
                      "Ordinary journey content is not visible in Browse.")
    }

    private func tapButton(named name: String, in app: XCUIApplication) {
        let button = app.buttons[name]
        XCTAssertTrue(button.waitForExistence(timeout: 30), "Missing button: \(name)")
        button.tap()
    }

    private func attachScreenshot(named name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
