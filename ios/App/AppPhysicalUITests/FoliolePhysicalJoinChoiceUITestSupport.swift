import XCTest

extension FoliolePhysicalSyncGroupUITests {
    func waitForDiscoveryReady(in app: XCUIApplication) {
        let ready = NSPredicate { _, _ in
            app.staticTexts["Searching..."].exists || self.discoveredJoinButtons(in: app).count > 0
        }
        let expectation = XCTNSPredicateExpectation(predicate: ready, object: app)
        XCTAssertEqual(XCTWaiter.wait(for: [expectation], timeout: 30), .completed,
                       "Local Network discovery neither searched nor exposed a Sync Group.")
    }

    func verifyJoinModeCancellation() {
        let app = acceptanceApplication()
        app.launch()
        openSyncSettings(in: app)
        if app.buttons["Connect to Sync Group"].exists {
            app.buttons["Connect to Sync Group"].tap()
            waitForLocalNetworkDecision(allow: true)
        }
        let groupId = requiredEnvironment("FOLIOLE_PHYSICAL_SYNC_GROUP_ID")
        let join = app.buttons["Join \(groupId)"]
        XCTAssertTrue(join.waitForExistence(timeout: 45), "The requested Sync Group was not discovered.")
        join.tap()
        XCTAssertTrue(app.buttons["Merge data"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.buttons["Use this device’s data to overwrite the entire group"].exists)
        attachScreenshot(named: "Fri-join-mode-choice")
        tapButton(named: "Cancel", in: app, timeout: 15)
        XCTAssertTrue(join.waitForExistence(timeout: 15), "Cancel did not retain the discovered group.")
        XCTAssertFalse(app.buttons["Merge data"].exists)
        XCTAssertFalse(app.staticTexts["Current Sync Group"].exists)
        attachScreenshot(named: "Fri-join-mode-cancelled")
    }

    private func discoveredJoinButtons(in app: XCUIApplication) -> XCUIElementQuery {
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Join group-"))
    }
}
