import XCTest

extension FoliolePhysicalSyncGroupUITests {
    func verifyRequestedJoinedTopicAfterRelaunch(in app: XCUIApplication) {
        let prefix = requiredEnvironment("FOLIOLE_PHYSICAL_TOPIC_PREFIX")
        let text = requiredEnvironment("FOLIOLE_PHYSICAL_EXPECTED_TEXT")
        openBrowse(in: app)
        waitForVisibleTopicText(prefix: prefix, text: text, in: app)
        attachScreenshot(named: "Fri-requested-topic-after-join")
        app.terminate()
        app.launch()
        openSyncSettings(in: app)
        XCTAssertTrue(app.staticTexts["Current Sync Group"].waitForExistence(timeout: 45),
                      "Fri did not retain its joined Sync Group after relaunch.")
        openBrowse(in: app)
        waitForVisibleTopicText(prefix: prefix, text: text, in: app)
        attachScreenshot(named: "Fri-requested-topic-after-join-relaunch")
    }

    func testInspectsExistingSyncSettings() throws {
        let app = acceptanceApplication()
        app.launch()
        openSyncSettings(in: app)
        attachScreenshot(named: "Fri-existing-sync-settings")
        let hierarchy = XCTAttachment(string: app.debugDescription)
        hierarchy.name = "Fri-existing-sync-settings-hierarchy"
        hierarchy.lifetime = .keepAlways
        add(hierarchy)
        guard localizedButton(named: "Details", in: app).waitForExistence(timeout: 3) else { return }
        tapButton(named: "Details", in: app, timeout: 3)
        attachScreenshot(named: "Fri-existing-sync-group-details")
        let details = XCTAttachment(string: app.debugDescription)
        details.name = "Fri-existing-sync-group-details-hierarchy"
        details.lifetime = .keepAlways
        add(details)
    }
}
