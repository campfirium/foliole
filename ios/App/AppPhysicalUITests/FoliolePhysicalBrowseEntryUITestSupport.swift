import XCTest

// The development app keeps its own data, so a launch may restore a review topic or hit the one-shot
// "Cannot sync" notice when a retained group peer runs another sync protocol version. Smoke flows record
// and close that notice instead of treating the hidden surface underneath as missing.
extension XCTestCase {
    func openBrowseSurface(in app: XCUIApplication, timeout: TimeInterval = 45) {
        let browse = app.buttons["Browse"]
        let capture = app.buttons["Capture"]
        let exit = app.buttons["Exit"]
        let body = app.descendants(matching: .any).matching(identifier: "Topic body").firstMatch
        let notice = app.staticTexts["Cannot sync"]
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if notice.exists {
                dismissSyncNotice(notice, in: app)
            } else if browse.isHittable {
                browse.tap()
                if capture.waitForExistence(timeout: 5) { return }
            } else if exit.isHittable {
                exit.tap()
            } else if body.exists, body.staticTexts.firstMatch.isHittable {
                body.staticTexts.firstMatch.tap()
                _ = exit.waitForExistence(timeout: 5)
            } else {
                _ = browse.waitForExistence(timeout: 1)
            }
        }
        XCTFail("Browse did not become available on the iPhone development build.")
    }

    func waitDismissingSyncNotice(_ element: XCUIElement, in app: XCUIApplication,
                                  timeout: TimeInterval) -> Bool {
        let notice = app.staticTexts["Cannot sync"]
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if notice.exists {
                dismissSyncNotice(notice, in: app)
            } else if element.waitForExistence(timeout: min(1, max(0, deadline.timeIntervalSinceNow))),
                      !notice.exists {
                return true
            }
        }
        return element.exists && !notice.exists
    }

    private func dismissSyncNotice(_ notice: XCUIElement, in app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "Sync-protocol-notice-dismissed"
        attachment.lifetime = .keepAlways
        add(attachment)
        // The notice has no buttons; a tap outside its card closes only the topmost dialog.
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.15)).tap()
        XCTAssertTrue(notice.waitForNonExistence(timeout: 5),
                      "The sync protocol notice did not close after an outside tap.")
    }
}
