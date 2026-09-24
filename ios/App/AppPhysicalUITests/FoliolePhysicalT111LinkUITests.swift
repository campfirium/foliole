import XCTest

final class FoliolePhysicalT111LinkUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @available(iOS 16.4, *)
    func testColdTargetAndRejectedLinks() throws {
        let environment = ProcessInfo.processInfo.environment
        guard let group = environment["FOLIOLE_T111_GROUP_ID"],
              let node = environment["FOLIOLE_T111_NODE_ID"],
              let expectedText = environment["FOLIOLE_T111_TARGET_TEXT"] else {
            throw XCTSkip("T111 requires an isolated library's group, node, and expected text.")
        }

        let app = XCUIApplication(bundleIdentifier: "com.foliole.ios.t219capacity")
        app.launchArguments = ["--foliole-physical-acceptance",
                               "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]

        let target = URL(string: "foliole://node/v1?group=\(group)&id=\(node)")!
        app.open(target)
        XCTAssertTrue(app.staticTexts[expectedText].waitForExistence(timeout: 45),
                      "The cold system URL did not show the target text.")
        attachScreenshot(named: "T111-Fri-cold-target")

        let missing = URL(string: "foliole://node/v1?group=\(group)&id=missing-t111-node")!
        let malformed = URL(string: "foliole://node/v1?group=\(group)&id=\(node)&extra=1")!
        for (name, url) in [("missing", missing), ("malformed", malformed)] {
            app.open(url)
            let rejection = app.staticTexts["This link cannot be opened in this library."]
            XCTAssertTrue(rejection.waitForExistence(timeout: 45),
                          "The \(name) link did not show a rejection.")
            XCTAssertTrue(app.wait(for: .runningForeground, timeout: 15))
            attachScreenshot(named: "T111-Fri-\(name)-rejected")
        }
    }

    private func attachScreenshot(named name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
