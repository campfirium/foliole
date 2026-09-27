import XCTest

extension FoliolePhysicalSyncGroupUITests {
    func runT262ManualSiblingOrderAcceptance() {
        let app = acceptanceApplication()
        app.launch()
        openSyncSettings(in: app)
        tapEnabledButton(named: "Sync Now", in: app, timeout: 120)
        waitForSyncNowCompletion(in: app)
        assertT262ManualSiblingOrder(in: app)
        attachScreenshot(named: "Fri-t262-manual-order-received")

        app.terminate()
        app.launch()
        assertT262ManualSiblingOrder(in: app)
        attachScreenshot(named: "Fri-t262-manual-order-restored")
    }

    private func assertT262ManualSiblingOrder(in app: XCUIApplication) {
        let folder = "T262 order acceptance 2026-09-27"
        let titles = ["Beta", "Gamma", "Alpha"]
        openBrowse(in: app)
        if app.buttons["Exit"].exists { app.buttons["Exit"].tap() }
        if app.buttons["Back"].exists { app.buttons["Back"].tap() }

        let folderButton = app.buttons["Open folder \(folder)"]
        for _ in 0..<8 where !folderButton.exists { app.swipeUp() }
        XCTAssertTrue(folderButton.waitForExistence(timeout: 30), "T262 folder is absent on Fri.")
        folderButton.tap()

        tapButton(named: "More", in: app, timeout: 30)
        let sortButton = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Sort ")).firstMatch
        XCTAssertTrue(sortButton.waitForExistence(timeout: 30), "Browse sort is unavailable.")
        sortButton.tap()
        tapButton(named: "Manual", in: app, timeout: 30)
        tapButton(named: "Cancel", in: app, timeout: 30)

        let expected = titles.map { "Open topic \($0)" }
        for label in expected {
            XCTAssertTrue(app.buttons[label].waitForExistence(timeout: 30), "Missing T262 sibling: \(label)")
        }
        let actual = app.buttons.allElementsBoundByIndex.map(\.label).filter { expected.contains($0) }
        XCTAssertEqual(actual, expected, "Fri did not display the received same-folder manual order.")
    }
}
