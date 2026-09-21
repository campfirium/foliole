import XCTest

extension FoliolePhysicalSyncGroupUITests {
    func testRetainsManuallyOfflineEditAcrossRelaunch() throws {
        let app = acceptanceApplication()
        app.launch()
        openSyncSettings(in: app)
        XCTAssertTrue(app.staticTexts["Current Sync Group"].waitForExistence(timeout: 30))
        openBrowse(in: app)
        waitForJourneyFacts(["A"], in: app)

        let settings = XCUIApplication(bundleIdentifier: "com.apple.Preferences")
        settings.launch()
        let airplane = settings.switches["com.apple.settings.airplaneMode"]
        guard airplane.waitForExistence(timeout: 5), airplane.value as? String == "1" else {
            throw XCTSkip("Fri has not been manually put into Airplane Mode.")
        }
        let wifi = settings.buttons["com.apple.settings.wifi"]
        XCTAssertTrue(wifi.waitForExistence(timeout: 5))
        wifi.tap()
        let offlineWifi = settings.switches["无线局域网"]
        guard offlineWifi.waitForExistence(timeout: 5), offlineWifi.value as? String == "0" else {
            throw XCTSkip("Fri Wi-Fi is still enabled; no offline claim is possible.")
        }
        attachScreenshot(named: "Fri-S220-radios-off")

        app.activate()
        let title = "S220 Fri offline \(UUID().uuidString)"
        let edit = "S220 Fri offline edit \(UUID().uuidString)"
        print("[foliole-fri] s220-offline-fact-title \(title)")
        print("[foliole-fri] s220-offline-edit-text \(edit)")
        appendToVisibleTopic(prefix: "Multi-device sync A fact", existingText: "Multi-device sync A fact",
                             text: edit, in: app)
        captureFact(named: title, in: app)
        waitForVisibleTopic(prefix: title, in: app)
        app.terminate()
        XCTAssertTrue(app.wait(for: .notRunning, timeout: 30))
        app.launch()
        waitForVisibleTopicText(prefix: "Multi-device sync A fact", text: edit, in: app)
        waitForVisibleTopic(prefix: title, in: app)
        attachScreenshot(named: "Fri-S220-offline-capture-restored")
    }
}
