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
        let wrongGroup = URL(string: "foliole://node/v1?group=t111-other-group&id=\(node)")!
        for (name, url) in [("missing", missing), ("malformed", malformed),
                            ("wrong-group", wrongGroup)] {
            app.open(url)
            let rejection = app.staticTexts["This link cannot be opened in this library."]
            XCTAssertTrue(rejection.waitForExistence(timeout: 45),
                          "The \(name) link did not show a rejection.")
            XCTAssertTrue(app.wait(for: .runningForeground, timeout: 15))
            attachScreenshot(named: "T111-Fri-\(name)-rejected")
        }

        app.open(target)
        XCTAssertTrue(app.staticTexts[expectedText].waitForExistence(timeout: 45),
                      "Opening the same target again did not show its text.")
        attachScreenshot(named: "T111-Fri-reopened-target")
    }

    @available(iOS 16.4, *)
    func testFolderLinkShowsExactDestination() throws {
        let environment = ProcessInfo.processInfo.environment
        guard let group = environment["FOLIOLE_T111_GROUP_ID"],
              let folder = environment["FOLIOLE_T111_FOLDER_ID"],
              let title = environment["FOLIOLE_T111_FOLDER_TITLE"] else {
            throw XCTSkip("T111 requires an isolated library's folder identity and title.")
        }

        let app = XCUIApplication(bundleIdentifier: "com.foliole.ios.t219capacity")
        app.launchArguments = ["--foliole-physical-acceptance",
                               "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        let url = URL(string: "foliole://node/v1?group=\(group)&id=\(folder)")!
        app.terminate()
        XCTAssertTrue(app.wait(for: .notRunning, timeout: 15))
        app.open(url)

        XCTAssertTrue(app.staticTexts[title].waitForExistence(timeout: 45),
                      "The system URL did not identify the requested folder.")
        XCTAssertTrue(app.buttons["Open topic working-set"].waitForExistence(timeout: 30),
                      "The requested folder did not show its known topic.")
        attachScreenshot(named: "T111-Fri-exact-folder")
    }

    @available(iOS 16.4, *)
    func testDeletedTopicLinkIsRejected() throws {
        guard let group = ProcessInfo.processInfo.environment["FOLIOLE_T111_GROUP_ID"] else {
            throw XCTSkip("T111 requires the isolated library's group identity.")
        }
        let app = XCUIApplication(bundleIdentifier: "com.foliole.ios.t219capacity")
        app.launchArguments = ["--foliole-physical-acceptance",
                               "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        let exit = app.buttons["Exit"]
        if exit.waitForExistence(timeout: 3) { exit.tap() }
        let directory = app.buttons["Directory"].firstMatch
        if directory.waitForExistence(timeout: 5) {
            directory.tap()
        } else {
            let browse = app.buttons["Browse"]
            XCTAssertTrue(browse.waitForExistence(timeout: 30))
            browse.tap()
        }
        let trash = app.buttons["Open folder Trash"]
        XCTAssertTrue(trash.waitForExistence(timeout: 30))
        trash.tap()
        let deletedTopic = app.buttons["Open topic Topic 49"]
        guard deletedTopic.waitForExistence(timeout: 30) else {
            throw XCTSkip("The isolated device does not show Topic 49 in Trash.")
        }
        attachScreenshot(named: "T111-Fri-deleted-topic-in-trash")

        let deleted = URL(string: "foliole://node/v1?group=\(group)&id=node-49")!
        app.open(deleted)
        XCTAssertTrue(app.staticTexts["This link cannot be opened in this library."].waitForExistence(timeout: 45),
                      "A real deleted topic link did not show a rejection.")
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 15))
        attachScreenshot(named: "T111-Fri-deleted-topic-rejected")
    }

    private func attachScreenshot(named name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
