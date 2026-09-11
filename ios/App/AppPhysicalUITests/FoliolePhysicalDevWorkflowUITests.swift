import XCTest

final class FoliolePhysicalDevWorkflowUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testOpensAndOperatesBrowse() throws {
        let app = XCUIApplication()
        app.launchArguments += ["--foliole-physical-acceptance",
                                "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()

        let browse = app.buttons["Browse"]
        XCTAssertTrue(browse.waitForExistence(timeout: 45),
                      "Browse did not become available on the iPhone development build.")
        browse.tap()

        let capture = app.buttons["Capture"]
        XCTAssertTrue(capture.waitForExistence(timeout: 15),
                      "Capture is unavailable on the Browse surface.")
        capture.tap()

        let editor = app.textViews["Capture text"]
        XCTAssertTrue(editor.waitForExistence(timeout: 30),
                      "The Capture sheet did not open after the real device tap.")
        attachScreenshot(named: "Fri-dev-workflow-operated")

        let cancel = app.buttons["Cancel"]
        XCTAssertTrue(cancel.waitForExistence(timeout: 15), "Capture Cancel is unavailable.")
        cancel.tap()
        XCTAssertFalse(editor.waitForExistence(timeout: 5),
                       "Capture sheet remained open after the real device tap.")
    }

    func testKeepsDeviceAwakeDuringPreparation() throws {
        guard let rawDuration = ProcessInfo.processInfo.environment[
            "FOLIOLE_PHYSICAL_KEEP_AWAKE_SECONDS"
        ], let duration = TimeInterval(rawDuration), (1...3600).contains(duration) else {
            throw XCTSkip("Run this lease explicitly with a duration between 1 and 3600 seconds.")
        }

        let app = XCUIApplication()
        app.launchArguments += ["--foliole-physical-acceptance",
                                "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 30),
                      "The acceptance app did not enter the foreground for the keep-awake lease.")

        let deadline = Date().addingTimeInterval(duration)
        while Date() < deadline {
            XCTAssertEqual(app.state, .runningForeground,
                           "The acceptance app left the foreground during preparation.")
            let remaining = deadline.timeIntervalSinceNow
            if remaining <= 0 { break }
            Thread.sleep(forTimeInterval: min(5, remaining))
        }
    }

    private func attachScreenshot(named name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
