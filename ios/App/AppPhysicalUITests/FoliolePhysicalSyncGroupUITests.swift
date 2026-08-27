import XCTest

final class FoliolePhysicalSyncGroupUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testPreparesLocalNetworkPermission() throws {
        let app = acceptanceApplication()
        app.launch()
        openSyncSettings(in: app)
        resetExistingSyncGroup(in: app)
        tapButton(named: "Connect to Sync Group", in: app, timeout: 30)
        waitForLocalNetworkDecision(allow: true)
        XCTAssertTrue(app.staticTexts["Searching..."].waitForExistence(timeout: 30),
                      "Local Network discovery did not enter its ready searching state.")
        attachScreenshot(named: "Fri-local-network-ready")
    }

    func testJoinsDiscoveredSyncGroupAndPersistsAfterRelaunch() throws {
        let app = acceptanceApplication()
        app.launch()

        openSyncSettings(in: app)
        resetExistingSyncGroup(in: app)
        tapButton(named: "Connect to Sync Group", in: app, timeout: 30)
        waitForLocalNetworkDecision(allow: true)
        tapButton(named: "Join", in: app, timeout: 90)

        XCTAssertTrue(
            app.staticTexts["Asking a Sync Group member to approve this device"]
                .waitForExistence(timeout: 30),
            "The physical iPhone did not publish a visible join request state."
        )
        XCTAssertTrue(
            app.buttons["Sync Now"].waitForExistence(timeout: 120),
            "The accepted Sync Group was not activated on the physical iPhone."
        )
        attachScreenshot(named: "Fri-sync-group-joined")

        app.terminate()
        app.launch()
        openSyncSettings(in: app)
        XCTAssertTrue(
            app.buttons["Sync Now"].waitForExistence(timeout: 45),
            "The physical iPhone did not restore its Sync Group after relaunch."
        )
        XCTAssertFalse(app.buttons["Connect to Sync Group"].exists)
        attachScreenshot(named: "Fri-sync-group-restored")
    }

    func testLocalNetworkDenialIsVisible() throws {
        let app = acceptanceApplication()
        app.launch()
        openSyncSettings(in: app)
        tapButton(named: "Connect to Sync Group", in: app, timeout: 30)
        waitForLocalNetworkDecision(allow: false)
        XCTAssertTrue(
            app.staticTexts["Allow Local Network access to find Sync Groups nearby."]
                .waitForExistence(timeout: 45),
            "The physical iPhone did not expose denied Local Network discovery."
        )
        attachScreenshot(named: "Fri-local-network-denied")
    }

    private func acceptanceApplication() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += ["--foliole-physical-acceptance",
                                "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        return app
    }

    private func openSyncSettings(in app: XCUIApplication) {
        tapButton(named: "Settings", in: app, timeout: 45)
        let sync = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH %@", "Sync ")
        ).firstMatch
        XCTAssertTrue(sync.waitForExistence(timeout: 30), "Sync settings row is unavailable.")
        sync.tap()
    }

    private func resetExistingSyncGroup(in app: XCUIApplication) {
        guard app.buttons["Sync Now"].exists else { return }
        tapButton(named: "Details", in: app, timeout: 15)
        tapButton(named: "Leave Sync Group", in: app, timeout: 15)
        tapButton(named: "Leave Sync Group", in: app, timeout: 15)
        if app.buttons["Connect to Sync Group"].waitForExistence(timeout: 30) { return }
        openSyncSettings(in: app)
        XCTAssertTrue(app.buttons["Connect to Sync Group"].waitForExistence(timeout: 30),
                      "The isolated physical acceptance Sync Group was not reset.")
    }

    private func tapButton(named name: String, in app: XCUIApplication, timeout: TimeInterval) {
        let button = app.buttons[name]
        XCTAssertTrue(button.waitForExistence(timeout: timeout), "Missing button: \(name)")
        button.tap()
    }

    private func waitForLocalNetworkDecision(allow: Bool) {
        let labels = allow ? ["Allow", "允许"] : ["Don’t Allow", "不允许"]
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let alert = springboard.alerts.firstMatch
        guard alert.waitForExistence(timeout: 8) else { return }
        XCTAssertTrue(labels.contains { alert.buttons[$0].exists },
                      "Missing Local Network decision button.")
        attachScreenshot(named: allow ? "Fri-local-network-allow" : "Fri-local-network-deny")
        let dismissed = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"), object: alert
        )
        XCTAssertEqual(XCTWaiter.wait(for: [dismissed], timeout: 180), .completed,
                       "The Local Network decision was not completed on Fri.")
    }

    private func attachScreenshot(named name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
