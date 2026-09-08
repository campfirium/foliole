import XCTest

extension XCTestCase {
    func startAcceptanceApplication(_ app: XCUIApplication) {
        if ProcessInfo.processInfo.environment["FOLIOLE_ATTACH_TO_RUNNING_APP"] == "1" {
            app.activate()
        } else {
            app.launch()
        }
    }

    func prepareRunnerLocalNetworkPermission() throws {
        let environment = ProcessInfo.processInfo.environment
        let suffix = try XCTUnwrap(environment["FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX"])
        let endpoint = try XCTUnwrap(environment["FOLIOLE_PHYSICAL_SYNC_GROUP_ENDPOINT_URL"])
        let url = try XCTUnwrap(URL(string: endpoint + "/companion/discovery"))
        XCUIApplication(bundleIdentifier:
            "com.foliole.ios.physical-uitests\(suffix).xctrunner").activate()

        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForResource = 30
        configuration.waitsForConnectivity = true
        let task = URLSession(configuration: configuration).dataTask(with: url)
        task.resume()

        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        for _ in 0..<2 {
            let alert = springboard.alerts.firstMatch
            guard alert.waitForExistence(timeout: 5) else { break }
            let labels = ["Allow", "允许", "WLAN & Cellular Data", "Wi-Fi & Cellular Data",
                          "无线局域网与蜂窝网络"]
            let decision = labels.lazy.map { alert.buttons[$0] }.first { $0.exists }
            XCTAssertNotNil(decision, "Missing xctrunner network permission decision.")
            decision?.tap()
            let dismissed = XCTNSPredicateExpectation(
                predicate: NSPredicate(format: "exists == false"), object: alert
            )
            XCTAssertEqual(XCTWaiter.wait(for: [dismissed], timeout: 10), .completed,
                           "The xctrunner network permission card did not close.")
        }
        task.cancel()
    }
}

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
