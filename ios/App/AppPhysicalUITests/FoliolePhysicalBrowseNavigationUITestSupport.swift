import XCTest

extension FoliolePhysicalSyncGroupUITests {
    func openBrowse(in app: XCUIApplication) {
        let syncing = app.buttons["Sync in progress"]
        if syncing.exists {
            waitForDisappearance(syncing, timeout: 180,
                                 message: "Fri Sync was still running before Browse navigation.")
        }
        let body = app.descendants(matching: .any).matching(
            NSPredicate(format: "label == %@ OR identifier == %@", "Topic body", "Topic body")
        ).firstMatch
        let navigationReady = XCTNSPredicateExpectation(
            predicate: NSPredicate { _, _ in
                body.exists || app.buttons["Browse"].exists || app.buttons["Directory"].exists
            }, object: app
        )
        XCTAssertEqual(XCTWaiter.wait(for: [navigationReady], timeout: 45), .completed,
                       "Fri did not restore its reading or navigation surface.")
        if body.exists && !app.buttons["Exit"].exists {
            let passage = body.staticTexts.firstMatch
            XCTAssertTrue(passage.waitForExistence(timeout: 30), "The active topic text is unavailable.")
            passage.tap()
            XCTAssertTrue(app.buttons["Exit"].waitForExistence(timeout: 30),
                          "Tapping the active topic did not expose its exit control.")
        }
        let exit = app.buttons["Exit"]
        if exit.waitForExistence(timeout: 3) {
            exit.tap()
            waitForDisappearance(exit, timeout: 30,
                                 message: "Fri did not exit the active topic before Browse navigation.")
        }
        if app.buttons["Directory"].firstMatch.waitForExistence(timeout: 3) {
            app.buttons["Directory"].firstMatch.tap()
        } else {
            tapButton(named: "Browse", in: app, timeout: 30)
        }
        let inbox = app.buttons["Open folder Inbox"]
        if inbox.waitForExistence(timeout: 3) { inbox.tap() }
    }

}
