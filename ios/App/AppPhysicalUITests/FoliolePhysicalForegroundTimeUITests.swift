import XCTest

final class FoliolePhysicalForegroundTimeUITests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }

    func testCountsForegroundAndPreservesTimeAfterBackgroundAndRelaunch() throws {
        let app = XCUIApplication()
        app.launchArguments += ["--foliole-physical-acceptance",
                                "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        try openStatistics(app)
        let initial = try minutes(app)
        let increased = NSPredicate { _, _ in
            guard let current = try? self.minutes(app) else { return false }
            return current > initial
        }
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(
            predicate: increased, object: app
        )], timeout: 90), .completed, "Passive foreground reading must increase daily time.")
        let beforeBackground = try minutes(app)
        XCUIDevice.shared.press(.home)
        XCTAssertTrue(app.wait(for: .runningBackground, timeout: 10))
        Thread.sleep(forTimeInterval: 5)
        app.activate()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 10))
        let resumed = try minutes(app)
        XCTAssertGreaterThanOrEqual(resumed, beforeBackground)
        XCTAssertLessThanOrEqual(resumed, beforeBackground + 1)
        attachScreenshot("Fri-foreground-time-resumed")
        app.terminate()
        app.launch()
        try openStatistics(app)
        XCTAssertGreaterThanOrEqual(try minutes(app), resumed,
                                    "Recorded daily time must survive process relaunch.")
        attachScreenshot("Fri-foreground-time-relaunched")
    }

    private func openStatistics(_ app: XCUIApplication) throws {
        let settings = app.buttons["Settings"]
        if !settings.waitForExistence(timeout: 5) {
            let exit = app.buttons["Exit"]
            if exit.waitForExistence(timeout: 5) { exit.tap() }
        }
        XCTAssertTrue(settings.waitForExistence(timeout: 45))
        settings.tap()
        let foreground = app.buttons["Foreground time"]
        XCTAssertTrue(foreground.waitForExistence(timeout: 15))
        foreground.tap()
        XCTAssertTrue(duration(app).waitForExistence(timeout: 15))
    }

    private func duration(_ app: XCUIApplication) -> XCUIElement {
        app.staticTexts.matching(NSPredicate(
            format: "label MATCHES %@", "<?[0-9]+m|[0-9]+h( [0-9]+m)?"
        )).firstMatch
    }

    private func minutes(_ app: XCUIApplication) throws -> Int {
        let label = duration(app).label
        if label.hasPrefix("<") { return 0 }
        let expression = try NSRegularExpression(pattern: "([0-9]+)(h|m)")
        let text = label as NSString
        let matches = expression.matches(in: label, range: NSRange(location: 0, length: text.length))
        XCTAssertFalse(matches.isEmpty, "Daily duration is unavailable: \(label)")
        return matches.reduce(0) { total, match in
            let value = Int(text.substring(with: match.range(at: 1))) ?? 0
            return total + value * (text.substring(with: match.range(at: 2)) == "h" ? 60 : 1)
        }
    }

    private func attachScreenshot(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
