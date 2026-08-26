import XCTest

final class FoliolePhysicalSyncGroupUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testJoinsDiscoveredSyncGroupAndPersistsAfterRelaunch() throws {
        let app = XCUIApplication()
        app.launchArguments += ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        installLocalNetworkPermissionHandler(allow: true)
        app.launch()

        openSyncSettings(in: app)
        tapButton(named: "Connect to Sync Group", in: app, timeout: 30)
        dismissLocalNetworkPromptIfNeeded(in: app)
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
        let app = XCUIApplication()
        app.launchArguments += ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        installLocalNetworkPermissionHandler(allow: false)
        app.launch()
        openSyncSettings(in: app)
        tapButton(named: "Connect to Sync Group", in: app, timeout: 30)
        app.tap()
        XCTAssertTrue(
            app.staticTexts["Allow Local Network access to find Sync Groups nearby."]
                .waitForExistence(timeout: 45),
            "The physical iPhone did not expose denied Local Network discovery."
        )
        attachScreenshot(named: "Fri-local-network-denied")
    }

    private func openSyncSettings(in app: XCUIApplication) {
        tapButton(named: "Settings", in: app, timeout: 45)
        let sync = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH %@", "Sync ")
        ).firstMatch
        XCTAssertTrue(sync.waitForExistence(timeout: 30), "Sync settings row is unavailable.")
        sync.tap()
    }

    private func tapButton(named name: String, in app: XCUIApplication, timeout: TimeInterval) {
        let button = app.buttons[name]
        XCTAssertTrue(button.waitForExistence(timeout: timeout), "Missing button: \(name)")
        button.tap()
    }

    private func installLocalNetworkPermissionHandler(allow: Bool) {
        addUIInterruptionMonitor(withDescription: "Local Network") { alert in
            let labels = allow ? ["Allow", "允许"] : ["Don’t Allow", "不允许"]
            for label in labels where alert.buttons[label].exists {
                alert.buttons[label].tap()
                return true
            }
            return false
        }
    }

    private func dismissLocalNetworkPromptIfNeeded(in app: XCUIApplication) {
        app.tap()
    }

    private func attachScreenshot(named name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
