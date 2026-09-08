import Network
import XCTest

extension XCTestCase {
    func startAcceptanceApplication(_ app: XCUIApplication) {
        if ProcessInfo.processInfo.environment["FOLIOLE_ATTACH_TO_RUNNING_APP"] == "1" {
            XCTAssertEqual(app.state, .runningForeground,
                           "The normally launched Fri acceptance app is not in the foreground.")
        } else {
            app.launch()
        }
    }

    func prepareRunnerLocalNetworkPermission() throws {
        let environment = ProcessInfo.processInfo.environment
        let endpoint = try XCTUnwrap(environment["FOLIOLE_PHYSICAL_SYNC_GROUP_ENDPOINT_URL"])
        let components = endpoint.split(separator: ":", maxSplits: 1).map(String.init)
        XCTAssertEqual(components.count, 2, "Invalid Fri LAN authority: \(endpoint)")
        let host = components.first ?? ""
        let port = components.last ?? ""
        let suffix = try XCTUnwrap(environment["FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX"])
        XCUIApplication(bundleIdentifier:
            "com.foliole.ios.physical-uitests\(suffix).xctrunner")
            .activate()

        if tryRunnerLanConnection(host: host, port: port, timeout: 8) { return }
        enableLocalNetworkPermissionInSettings(displayName: "AppPhysicalUITests-Runner")
        XCUIApplication(bundleIdentifier:
            "com.foliole.ios.physical-uitests\(suffix).xctrunner")
            .activate()
        XCTAssertTrue(tryRunnerLanConnection(host: host, port: port, timeout: 30),
                      "The Fri UI test runner could not reach the Mac LAN provider.")
    }

    private func tryRunnerLanConnection(host: String, port: String,
                                        timeout: TimeInterval) -> Bool {
        let triggerURL = URL(string: "http://\(host):\(port)/companion/discovery")!
        let triggerConfiguration = URLSessionConfiguration.ephemeral
        triggerConfiguration.waitsForConnectivity = true
        let permissionTrigger = URLSession(configuration: triggerConfiguration)
            .dataTask(with: triggerURL)
        permissionTrigger.resume()
        let connected = expectation(description: "The Fri UI test runner reached the Mac LAN provider.")
        let connection = NWConnection(host: NWEndpoint.Host(host),
                                      port: NWEndpoint.Port(port)!, using: .tcp)
        connection.stateUpdateHandler = { state in
            if case .ready = state { connected.fulfill() }
            if case let .failed(error) = state { print("[foliole-fri] runner LAN failed: \(error)") }
        }
        connection.start(queue: DispatchQueue(label: "com.foliole.fri-runner-lan"))

        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        for _ in 0..<2 {
            let alert = springboard.alerts.firstMatch
            guard alert.waitForExistence(timeout: 5) else { break }
            let labels = ["Allow", "允许", "WLAN & Cellular Data", "Wi-Fi & Cellular Data",
                          "无线局域网与蜂窝网络", "无线局域网与蜂窝数据"]
            let decision = labels.lazy.map { alert.buttons[$0] }.first { $0.exists }
            XCTAssertNotNil(decision, "Missing xctrunner network permission decision.")
            decision?.tap()
            let dismissed = XCTNSPredicateExpectation(
                predicate: NSPredicate(format: "exists == false"), object: alert
            )
            XCTAssertEqual(XCTWaiter.wait(for: [dismissed], timeout: 10), .completed,
                           "The xctrunner network permission card did not close.")
        }
        let reached = XCTWaiter.wait(for: [connected], timeout: timeout) == .completed
        permissionTrigger.cancel()
        connection.cancel()
        return reached
    }

    func enableLocalNetworkPermissionInSettings(displayName: String) {
        let settings = XCUIApplication(bundleIdentifier: "com.apple.Preferences")
        settings.terminate()
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
        search.typeText(displayName)
        let appResult = settings.staticTexts[displayName].firstMatch
        XCTAssertTrue(appResult.waitForExistence(timeout: 20),
                      "The requested Local Network settings entry is unavailable.")
        appResult.tap()
        let labels = ["Local Network", "本地网络"]
        let toggle = labels.lazy.map { settings.switches[$0] }.first { $0.waitForExistence(timeout: 2) }
        if let toggle {
            if toggle.value as? String != "1" { toggle.tap() }
            XCTAssertEqual(toggle.value as? String, "1", "Local Network access was not enabled.")
        }
        let wireless = settings.buttons.matching(
            NSPredicate(format: "identifier ENDSWITH %@", ".wireless")
        ).firstMatch
        let hasWirelessSetting = wireless.waitForExistence(timeout: 5)
        if hasWirelessSetting {
            wireless.tap()
            let fullAccessLabels = ["WLAN & Cellular Data", "Wi-Fi & Cellular Data",
                                    "无线局域网与蜂窝网络", "无线局域网与蜂窝数据"]
            let fullAccess = fullAccessLabels.lazy.map { settings.cells[$0] }
                .first { $0.waitForExistence(timeout: 2) }
            XCTAssertNotNil(fullAccess, "The full Wireless Data option is unavailable on Fri.")
            fullAccess?.tap()
        }
        XCTAssertTrue(toggle != nil || hasWirelessSetting,
                      "Network access settings are unavailable on Fri.")
        let attachment = XCTAttachment(screenshot: settings.screenshot())
        attachment.name = "Fri-local-network-settings-enabled-\(displayName)"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}

final class FoliolePhysicalPermissionUITests: XCTestCase {
    func testEnablesLocalNetworkPermissionInSettings() throws {
        let suffix = try XCTUnwrap(ProcessInfo.processInfo.environment["FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX"])
        enableLocalNetworkPermissionInSettings(displayName: "Foliole\(suffix)")
    }
}
