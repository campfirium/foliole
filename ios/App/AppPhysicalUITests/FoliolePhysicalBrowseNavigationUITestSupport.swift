import XCTest

extension FoliolePhysicalSyncGroupUITests {
    func openBrowse(in app: XCUIApplication) {
        let syncing = localizedButton(named: "Sync in progress", in: app)
        if syncing.exists {
            waitForDisappearance(syncing, timeout: 180,
                                 message: "Fri Sync was still running before Browse navigation.")
        }
        let body = app.descendants(matching: .any).matching(
            NSPredicate(format: "label == %@ OR identifier == %@", "Topic body", "Topic body")
        ).firstMatch
        navigateToBrowseDirectory(in: app, body: body)
        let inbox = app.buttons.matching(NSPredicate(format: "label IN %@",
                                                     ["Open folder Inbox", "打开文件夹 Inbox"])).firstMatch
        if inbox.waitForExistence(timeout: 3) { inbox.tap() }
    }

    private func navigateToBrowseDirectory(in app: XCUIApplication, body: XCUIElement) {
        let deadline = Date().addingTimeInterval(60)
        while Date() < deadline {
            let directory = localizedButton(named: "Directory", in: app)
            let browse = localizedButton(named: "Browse", in: app)
            let ready = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
                body.exists || directory.isHittable || browse.isHittable
            }, object: app)
            guard XCTWaiter.wait(for: [ready], timeout: max(0, deadline.timeIntervalSinceNow)) == .completed
            else { break }
            if body.exists {
                if !localizedButton(named: "Exit", in: app).exists {
                    let passage = body.staticTexts.firstMatch
                    XCTAssertTrue(passage.waitForExistence(timeout: 30), "The active topic text is unavailable.")
                    passage.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
                }
                tapButton(named: "Exit", in: app, timeout: 30)
                waitForDisappearance(body, timeout: 30,
                                     message: "Fri did not leave its restored topic.")
            } else if directory.isHittable {
                directory.tap()
                return
            } else if browse.isHittable {
                browse.tap()
            }
        }
        XCTFail("Fri did not reach Browse directory from its restored surface.")
    }
}
