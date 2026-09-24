import XCTest

final class FoliolePhysicalArticleImageUITests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }

    func testLocalizesRemoteImageAndPersistsAcrossRestart() throws { try verifyImageCase("localized", available: true) }
    func testExistingImageSurvivesColdLaunch() throws { try verifyImageCase("existing", available: true) }
    func testMissingImageRestoresOriginalBytes() throws { try verifyImageCase("same", available: true) }
    func testChangedRemoteImageUpdatesRequestingArticle() throws { try verifyImageCase("changed", available: true) }
    func testFailedSourcePreservesArticle() throws { try verifyImageCase("failed", available: false) }
    func testLocalImageWithoutSourceRemainsMissing() throws { try verifyImageCase("local", available: false) }

    func testAttachmentSettingsPersistAcrossRestart() throws {
        let app = XCUIApplication(bundleIdentifier: "com.foliole.ios.s203acceptance")
        app.launchArguments = ["--foliole-physical-acceptance", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        openAttachmentSettings(in: app)
        allowWirelessDataForAcceptanceApp()
        let threshold = app.textFields["Cleanup threshold"]
        XCTAssertTrue(threshold.waitForExistence(timeout: 30))
        threshold.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
        let oldValue = try XCTUnwrap(threshold.value as? String)
        threshold.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: oldValue.count) + "3")
        app.staticTexts["Local attachments"].tap()
        XCTAssertEqual(threshold.value as? String, "3")
        let automatic = app.switches["Automatic cleanup"]
        XCTAssertTrue(automatic.waitForExistence(timeout: 15))
        if automatic.value as? String != "1" { automatic.tap() }
        XCTAssertEqual(automatic.value as? String, "1")
        screenshot("S203-attachment-settings-before-restart")
        app.terminate()
        app.launch()
        openAttachmentSettings(in: app)
        XCTAssertEqual(app.textFields["Cleanup threshold"].value as? String, "3")
        XCTAssertEqual(app.switches["Automatic cleanup"].value as? String, "1")
        screenshot("S203-attachment-settings-after-restart")
    }

    private func openAttachmentSettings(in app: XCUIApplication) {
        tap("Settings", in: app)
        let storage = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Storage ")).firstMatch
        XCTAssertTrue(storage.waitForExistence(timeout: 30), "Attachment storage settings are unavailable.")
        storage.tap()
        XCTAssertTrue(app.staticTexts["Local attachments"].waitForExistence(timeout: 30))
    }

    private func allowWirelessDataForAcceptanceApp() {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let alert = springboard.alerts.firstMatch
        guard alert.waitForExistence(timeout: 5) else { return }
        let wirelessOnly = alert.buttons.matching(NSPredicate(
            format: "label IN %@", ["WLAN Only", "Wi-Fi Only", "仅限无线局域网"]
        )).firstMatch
        XCTAssertTrue(wirelessOnly.exists, "The isolated app wireless-data choice is unavailable.")
        wirelessOnly.tap()
        XCTAssertFalse(alert.exists)
    }

    private func verifyImageCase(_ scenario: String, available: Bool) throws {
        let environment = ProcessInfo.processInfo.environment
        XCTAssertEqual(environment["FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX"], ".s203acceptance",
                       "S203 scenarios require the isolated acceptance application.")
        let key = try XCTUnwrap(environment["FOLIOLE_S203_EXPECTED_\(scenario.uppercased())_KEY"],
                               "Prepare the S203 fixture and its read-only precondition projection first.")
        XCTAssertNotNil(key.range(of: #"^[a-f0-9]{64}\.png$"#, options: .regularExpression))
        let app = XCUIApplication(bundleIdentifier: "com.foliole.ios.s203acceptance")
        app.launchArguments = ["--foliole-physical-acceptance", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        openArticle(scenario, in: app)
        assertImage(scenario, available: available, in: app)
        assertBody(scenario, key: key, in: app)
        screenshot("S203-\(scenario)-before-restart")
        app.terminate()
        app.launch()
        openArticle(scenario, in: app)
        assertImage(scenario, available: available, in: app)
        assertBody(scenario, key: key, in: app)
        screenshot("S203-\(scenario)-after-restart")
    }

    private func openArticle(_ scenario: String, in app: XCUIApplication) {
        if !app.buttons["Browse"].isHittable {
            let marker = app.staticTexts["S203 \(scenario) marker"]
            if marker.exists { marker.tap() }
        }
        if app.buttons["Exit"].exists { app.buttons["Exit"].tap() }
        tap("Browse", in: app)
        let inbox = app.buttons["Open topic Inbox"]
        if inbox.waitForExistence(timeout: 3) { inbox.tap() }
        let topic = app.buttons["Open topic S203 \(scenario)"]
        XCTAssertTrue(topic.waitForExistence(timeout: 30), "Missing prepared S203 \(scenario) fixture.")
        topic.tap()
    }

    private func assertImage(_ scenario: String, available: Bool, in app: XCUIApplication) {
        let image = app.images["S203 \(scenario) image"]
        if available {
            XCTAssertTrue(image.waitForExistence(timeout: 45), "Recovered image is not exposed on the reading surface.")
            XCTAssertTrue(image.isHittable)
        } else {
            XCTAssertTrue(app.staticTexts["Image unavailable"].waitForExistence(timeout: 45))
            XCTAssertFalse(image.exists, "Failed recovery must not show cached image content.")
        }
    }

    private func assertBody(_ scenario: String, key: String, in app: XCUIApplication) {
        let marker = app.staticTexts["S203 \(scenario) marker"]
        XCTAssertTrue(marker.waitForExistence(timeout: 15))
        marker.tap()
        tap("Edit topic", in: app)
        let editor = app.textViews["Topic body"]
        XCTAssertTrue(editor.waitForExistence(timeout: 15))
        XCTAssertEqual(editor.value as? String,
                       "S203 \(scenario) marker\n\n![S203 \(scenario) image](asset://\(key))")
        tap("Done", in: app)
    }

    private func tap(_ name: String, in app: XCUIApplication) {
        let button = app.buttons[name]
        XCTAssertTrue(button.waitForExistence(timeout: 30), "Missing semantic button: \(name)")
        button.tap()
    }

    private func screenshot(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
