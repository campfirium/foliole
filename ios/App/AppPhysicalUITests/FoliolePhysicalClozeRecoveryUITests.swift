import XCTest

extension FoliolePhysicalSyncGroupUITests {
    func testCapturesDeletesRestoresClozeAndReopens() throws {
        let app = acceptanceApplication()
        app.launch()
        let title = "Cloze recovery " + UUID().uuidString.prefix(8)
        let word = "Continuity"
        captureFact(named: title + "\n\n" + word, in: app)
        openRecoveryTopic(title, in: app)
        selectRecoveryWord(word, in: app)
        tapButton(named: "Cloze", in: app, timeout: 15)
        attachScreenshot(named: "Fri-cloze-created")
        selectRecoveryWord(word, in: app)
        tapButton(named: "Delete cloze", in: app, timeout: 15)
        XCTAssertTrue(app.staticTexts[word].firstMatch.waitForExistence(timeout: 15))
        attachScreenshot(named: "Fri-cloze-deleted-source-preserved")
        openBrowse(in: app)
        if app.buttons["Back"].exists { app.buttons["Back"].tap() }
        restoreTopicFromTrash(title: title, text: title, in: app)
        openRecoveryTopic(title, in: app)
        selectRecoveryWord(word, in: app)
        XCTAssertTrue(app.buttons["Delete cloze"].waitForExistence(timeout: 15),
                      "Restoring the derived item must restore the original cloze marker.")
        attachScreenshot(named: "Fri-cloze-restored")
        app.terminate()
        XCTAssertTrue(app.wait(for: .notRunning, timeout: 15))
        app.launch()
        let breadcrumb = app.descendants(matching: .any).matching(
            NSPredicate(format: "label BEGINSWITH %@", "Review breadcrumb")
        ).firstMatch
        XCTAssertTrue(breadcrumb.waitForExistence(timeout: 30))
        breadcrumb.buttons.firstMatch.tap()
        for _ in 0..<6 {
            if app.buttons["Open folder Inbox"].exists { break }
            guard app.buttons["Back"].exists else { break }
            app.buttons["Back"].tap()
        }
        openRecoveryTopic(title, in: app)
        selectRecoveryWord(word, in: app)
        XCTAssertTrue(app.buttons["Delete cloze"].waitForExistence(timeout: 15),
                      "The restored cloze must survive a process restart.")
        attachScreenshot(named: "Fri-cloze-restored-after-relaunch")
    }

    private func openRecoveryTopic(_ title: String, in app: XCUIApplication) {
        openBrowse(in: app)
        let topic = app.buttons["Open topic \(title)"].firstMatch
        XCTAssertTrue(topic.waitForExistence(timeout: 30))
        if !topic.isHittable { app.webViews.firstMatch.swipeDown() }
        let visible = XCTNSPredicateExpectation(predicate: NSPredicate(format: "hittable == true"), object: topic)
        XCTAssertEqual(XCTWaiter.wait(for: [visible], timeout: 15), .completed)
        topic.tap()
        XCTAssertTrue(app.staticTexts["Continuity"].firstMatch.waitForExistence(timeout: 30))
    }

    private func selectRecoveryWord(_ word: String, in app: XCUIApplication) {
        let passage = app.staticTexts[word].firstMatch
        XCTAssertTrue(passage.waitForExistence(timeout: 15))
        passage.press(forDuration: 1)
    }
}
