import XCTest

final class FoliolePhysicalPermissionUITests: XCTestCase {
    func testEnablesLocalNetworkPermissionInSettings() throws {
        let settings = XCUIApplication(bundleIdentifier: "com.apple.Preferences")
        settings.launch()
        let appLabels = ["Apps", "App", "应用"]
        var apps = appLabels.lazy.map { settings.buttons[$0] }.first { $0.exists }
        for _ in 0..<8 where apps == nil {
            settings.swipeUp()
            apps = appLabels.lazy.map { settings.buttons[$0] }.first { $0.exists }
        }
        guard let apps else { return XCTFail("The Apps settings entry is unavailable on Fri.") }
        apps.tap()
        let search = settings.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 15), "Settings search is unavailable on Fri.")
        search.tap()
        let suffix = try XCTUnwrap(ProcessInfo.processInfo.environment["FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX"])
        let displayName = "Foliole\(suffix)"
        search.typeText(displayName)
        let appResult = settings.staticTexts[displayName].firstMatch
        XCTAssertTrue(appResult.waitForExistence(timeout: 20),
                      "The task-scoped Foliole settings entry is unavailable.")
        appResult.tap()
        let labels = ["Local Network", "本地网络"]
        let toggle = labels.lazy.map { settings.switches[$0] }.first { $0.waitForExistence(timeout: 2) }
        guard let toggle else {
            XCTFail("The task-scoped Foliole Local Network setting is unavailable.")
            return
        }
        if toggle.value as? String != "1" { toggle.tap() }
        XCTAssertEqual(toggle.value as? String, "1", "Local Network access was not enabled.")
        let attachment = XCTAttachment(screenshot: settings.screenshot())
        attachment.name = "Fri-local-network-settings-enabled"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
