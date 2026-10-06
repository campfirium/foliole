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
        XCTAssertTrue(app.buttons["Use the sync group’s data to overwrite this device"]
            .waitForExistence(timeout: 15))
        XCTAssertFalse(app.buttons["Merge data"].exists)
        XCTAssertTrue(app.buttons["Use this device’s data to overwrite the entire group"].exists)
        attachScreenshot(named: "Fri-join-mode-choice")
        tapButton(named: "Cancel", in: app, timeout: 15)
        XCTAssertTrue(join.waitForExistence(timeout: 15), "Cancel did not retain the discovered group.")
        XCTAssertFalse(app.buttons["Use the sync group’s data to overwrite this device"].exists)
        XCTAssertFalse(app.staticTexts["Current Sync Group"].exists)
        attachScreenshot(named: "Fri-join-mode-cancelled")
    }

    func testUsesGroupDataAndPersistsAfterRelaunch() {
        let app = acceptanceApplication()
        app.launch()
        openSyncSettings(in: app)
        XCTAssertTrue(app.buttons["Connect to Sync Group"].waitForExistence(timeout: 30),
                      "The acceptance client must not already belong to a group.")
        tapButton(named: "Connect to Sync Group", in: app, timeout: 30)
        waitForLocalNetworkDecision(allow: true)
        let groupId = requiredEnvironment("FOLIOLE_PHYSICAL_SYNC_GROUP_ID")
        tapButton(named: "Join \(groupId)", in: app, timeout: 90)
        XCTAssertFalse(app.buttons["Merge data"].exists)
        tapButton(named: "Use the sync group’s data to overwrite this device", in: app, timeout: 30)
        XCTAssertTrue(app.staticTexts["Current Sync Group"].waitForExistence(timeout: 240),
                      "The group data was not adopted through the public join flow.")
        attachScreenshot(named: "Fri-use-group-joined")
        let fact = requiredEnvironment("FOLIOLE_PHYSICAL_FACT_TITLE")
        openBrowse(in: app)
        waitForVisibleTopic(prefix: fact, in: app)
        app.terminate()
        app.launch()
        openSyncSettings(in: app)
        XCTAssertTrue(app.staticTexts["Current Sync Group"].waitForExistence(timeout: 45),
                      "The adopted group was not persisted after relaunch.")
        XCTAssertFalse(app.buttons["Connect to Sync Group"].exists)
        openBrowse(in: app)
        waitForVisibleTopic(prefix: fact, in: app)
        attachScreenshot(named: "Fri-use-group-restored")
    }

    private func discoveredJoinButtons(in app: XCUIApplication) -> XCUIElementQuery {
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Join group-"))
    }
}
