import XCTest

final class FoliolePhysicalFontUITests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }

    func testSystemFontAndCustomFontImport() throws {
        let app = XCUIApplication(bundleIdentifier: "com.campfirium.foliole.ios.dev")
        app.launchArguments = ["--foliole-physical-acceptance",
                               "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        prepareArticle(named: "Font acceptance \(UUID().uuidString.prefix(8))", in: app)
        openAppearance(in: app)
        XCTAssertTrue(app.descendants(matching: .any).matching(
            NSPredicate(format: "label == %@", "Device fonts")
        ).firstMatch.waitForExistence(timeout: 15))
        XCTAssertTrue(app.buttons["Add font"].exists)
        screenshot("Fri-font-appearance")
        app.buttons["Device fonts"].tap()
        let systemFont = app.buttons["PingFang SC"]
        XCTAssertTrue(systemFont.waitForExistence(timeout: 10))
        systemFont.tap()
        XCTAssertEqual(app.buttons["Device fonts"].value as? String, "PingFang SC")
        screenshot("Fri-system-font-selected")
        let importedFonts = app.switches.matching(identifier: "RobotoMono-Regular")
        let previousImportCount = importedFonts.count
        app.buttons["Add font"].tap()
        XCTAssertTrue(app.otherElements["Browse View (Picker)"].waitForExistence(timeout: 15))
        app.buttons["Recents"].tap()
        app.buttons["Browse"].tap()
        let downloads = app.cells["DOC.sidebar.item.Downloads"]
        for _ in 0..<3 where !downloads.exists {
            let back = app.buttons["Back"]
            if !back.isHittable { break }
            back.tap()
        }
        if !downloads.exists { app.buttons["Browse"].tap() }
        XCTAssertTrue(downloads.waitForExistence(timeout: 10))
        downloads.tap()
        let fontFile = app.cells["RobotoMono-Regular.otf, otf"]
        XCTAssertTrue(fontFile.waitForExistence(timeout: 10))
        fontFile.tap()
        let selectedFont = app.switches.matching(NSPredicate(
            format: "label == %@ AND value == %@", "RobotoMono-Regular", "1"
        )).firstMatch
        XCTAssertTrue(selectedFont.waitForExistence(timeout: 20))
        XCTAssertEqual(importedFonts.count, previousImportCount + 1)
        screenshot("Fri-custom-font-selected")
    }

    private func prepareArticle(named title: String, in app: XCUIApplication) {
        let browse = app.buttons["Browse"]
        if !browse.waitForExistence(timeout: 8) {
            let exit = app.buttons["Exit"]
            if exit.waitForExistence(timeout: 8) { exit.tap() }
        }
        XCTAssertTrue(browse.waitForExistence(timeout: 45))
        browse.tap()
        tap("Capture", in: app)
        let editor = app.textViews["Capture text"]
        XCTAssertTrue(editor.waitForExistence(timeout: 30))
        editor.tap()
        resolveOptionalNetworkDecision()
        editor.typeText("\(title)\n\nThe quick brown fox jumps over the lazy dog.")
        XCTAssertTrue((editor.value as? String)?.contains("The quick brown fox") == true)
        let keyboardDone = app.toolbars["Toolbar"].buttons["Done"]
        if keyboardDone.waitForExistence(timeout: 5) { keyboardDone.tap() }
        tap("Save", in: app)
        XCTAssertFalse(editor.waitForExistence(timeout: 30))
        let inbox = app.buttons["Open topic Inbox"]
        if inbox.waitForExistence(timeout: 3) { inbox.tap() }
        let topic = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH %@", "Open topic \(title)")
        ).firstMatch
        XCTAssertTrue(topic.waitForExistence(timeout: 30))
        if !topic.isHittable { app.swipeDown() }
        XCTAssertTrue(topic.isHittable)
        topic.tap()
        let body = app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "The quick brown fox")
        ).firstMatch
        XCTAssertTrue(body.waitForExistence(timeout: 30))
        body.tap()
    }

    private func openAppearance(in app: XCUIApplication) {
        tap("More reading actions", in: app)
        tap("Appearance", in: app)
    }

    private func tap(_ name: String, in app: XCUIApplication) {
        let button = app.buttons[name].firstMatch
        XCTAssertTrue(button.waitForExistence(timeout: 30), "Missing button: \(name)")
        button.tap()
    }

    private func screenshot(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func resolveOptionalNetworkDecision() {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let allow = springboard.buttons.matching(NSPredicate(
            format: "label IN %@", ["Allow", "允许"]
        )).firstMatch
        if allow.waitForExistence(timeout: 1) { allow.tap() }
        let fullAccess = springboard.buttons.matching(NSPredicate(
            format: "label IN %@", ["WLAN & Cellular Data", "Wi-Fi & Cellular Data",
                                      "无线局域网与蜂窝网络", "无线局域网与蜂窝数据"]
        )).firstMatch
        if fullAccess.waitForExistence(timeout: 3) { fullAccess.tap() }
    }
}
