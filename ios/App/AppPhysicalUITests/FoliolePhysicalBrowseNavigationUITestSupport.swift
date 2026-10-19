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
        var browseSelected = false
        while Date() < deadline {
            let directory = localizedButton(named: "Directory", in: app)
            let browse = localizedButton(named: "Browse", in: app)
            let ready = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
                body.exists || directory.isHittable || browse.isHittable
            }, object: app)
            guard XCTWaiter.wait(for: [ready], timeout: max(0, deadline.timeIntervalSinceNow)) == .completed
            else { break }
            if !browseSelected && browse.isHittable {
                browse.tap()
                browseSelected = true
            } else if directory.isHittable {
                let reviewToolbar = app.descendants(matching: .any)
                    .matching(NSPredicate(format: "label == %@", "Companion review toolbar")).firstMatch
                XCTAssertFalse(reviewToolbar.exists, "Leave review before opening the browse directory.")
                directory.tap()
                return
            } else if browse.isHittable {
                browse.tap()
                browseSelected = true
            } else if openReviewBreadcrumb(in: app) {
                continue
            } else if body.exists {
                if !localizedButton(named: "Exit", in: app).exists {
                    let passage = body.staticTexts.firstMatch
                    XCTAssertTrue(passage.waitForExistence(timeout: 30), "The active topic text is unavailable.")
                    passage.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
                }
                if directory.isHittable || browse.isHittable { continue }
                tapButton(named: "Exit", in: app, timeout: 30)
                waitForDisappearance(body, timeout: 30,
                                     message: "Fri did not leave its restored topic.")
            }
        }
        XCTFail("Fri did not reach Browse directory from its restored surface.")
    }

    private func openReviewBreadcrumb(in app: XCUIApplication) -> Bool {
        let breadcrumb = app.descendants(matching: .any).matching(NSPredicate(
            format: "label BEGINSWITH %@ OR label BEGINSWITH %@",
            "Review breadcrumb", "复习面包屑"
        )).firstMatch
        guard breadcrumb.exists else { return false }
        let destination = breadcrumb.buttons.firstMatch
        guard destination.isHittable else { return false }
        destination.tap()
        waitForDisappearance(breadcrumb, timeout: 30,
                             message: "Fri did not leave review through its breadcrumb.")
        return true
    }
}
