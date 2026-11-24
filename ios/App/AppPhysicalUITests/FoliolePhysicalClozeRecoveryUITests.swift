import XCTest

extension FoliolePhysicalSyncGroupUITests {
    func testCapturesDeletesRestoresClozeAndReopens() throws {
        let app = acceptanceApplication()
        app.launch()
        let title = "Cloze recovery " + UUID().uuidString.prefix(8)
        let word = "Continuity"
        captureFact(named: title + "\n\n" + word, in: app)
        openRecoveryTopic(title, in: app)
        selectWord(word, in: app)
        tapButton(named: "Cloze", in: app, timeout: 15)
        attachScreenshot(named: "Fri-cloze-created")
        selectWord(word, in: app)
        tapButton(named: "Delete cloze", in: app, timeout: 15)
        XCTAssertTrue(app.staticTexts[word].firstMatch.waitForExistence(timeout: 15))
        attachScreenshot(named: "Fri-cloze-deleted-source-preserved")
        openBrowse(in: app)
        if app.buttons["Back"].exists { app.buttons["Back"].tap() }
        restoreTopicFromTrash(title: title, text: title, in: app)
        openRecoveryTopic(title, in: app)
        selectWord(word, in: app)
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
        selectWord(word, in: app)
        XCTAssertTrue(app.buttons["Delete cloze"].waitForExistence(timeout: 15),
                      "The restored cloze must survive a process restart.")
        attachScreenshot(named: "Fri-cloze-restored-after-relaunch")
    }

    func testPrefillsChatGPTFromSelectedWord() {
        let app = acceptanceApplication()
        app.launch()
        let title = "C447 Anchor Check"
        let word = "Silver"
        if !app.staticTexts[word].firstMatch.waitForExistence(timeout: 5) {
            openWebLookupFixture(title: title, word: word, in: app)
        }

        selectWord(word, in: app)
        tapButton(named: "More", in: app, timeout: 15)
        let chat = app.webViews.firstMatch.descendants(matching: .any)
            .matching(NSPredicate(format: "label == %@", "Chat with ChatGPT")).firstMatch
        XCTAssertTrue(chat.waitForExistence(timeout: 15), "The selection menu did not offer ChatGPT.")
        attachScreenshot(named: "T852-10-Fri-ChatGPT-selection-menu")
        chat.tap()

        let chatGPT = XCUIApplication(bundleIdentifier: "com.openai.chat")
        let opened = chatGPT.wait(for: .runningForeground, timeout: 15)
        if !opened { attachScreenshot(named: "T852-10-Fri-ChatGPT-after-tap") }
        XCTAssertTrue(opened, "The ChatGPT lookup did not bring the installed ChatGPT app to the foreground.")
        let expected = "\(word)（《\(title)》）"
        let value = NSPredicate(format: "value == %@", expected)
        let draft = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            chatGPT.textViews.matching(value).firstMatch.exists ||
                chatGPT.textFields.matching(value).firstMatch.exists
        }, object: chatGPT)
        let prefilled = XCTWaiter.wait(for: [draft], timeout: 25) == .completed
        attachScreenshot(named: "T852-10-Fri-ChatGPT-draft")
        XCTAssertTrue(prefilled, "ChatGPT did not show the expected unsent draft: \(expected)")
    }

    private func openWebLookupFixture(title: String, word: String, in app: XCUIApplication) {
        let topic = app.buttons["Open topic \(title)"].firstMatch
        if !app.buttons["Capture"].firstMatch.waitForExistence(timeout: 5) {
            tapButton(named: "Inbox", in: app, timeout: 15)
        }
        if !topic.exists {
            saveWebLookupFixture("\(title)\n\n\(word)", in: app)
        }
        if !topic.waitForExistence(timeout: 8) {
            let exit = localizedButton(named: "Exit", in: app)
            if exit.isHittable { exit.tap() }
            tapButton(named: "Inbox", in: app, timeout: 15)
        }
        XCTAssertTrue(topic.waitForExistence(timeout: 30), "The test topic is missing from Inbox.")
        topic.tap()
    }

    private func saveWebLookupFixture(_ text: String, in app: XCUIApplication) {
        tapButton(named: "Capture", in: app, timeout: 15)
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let alert = springboard.alerts.matching(NSPredicate(
            format: "label CONTAINS %@", "Foliole Mobile.dev"
        )).firstMatch
        let wirelessOnly = alert.buttons["仅限无线局域网"]
        if wirelessOnly.waitForExistence(timeout: 5) { alert.buttons["不允许"].tap() }

        let editor = app.textViews["Capture text"]
        XCTAssertTrue(editor.waitForExistence(timeout: 15))
        editor.tap()
        editor.typeText(text)
        XCTAssertEqual(editor.value as? String, text)
        let done = app.toolbars["Toolbar"].buttons["Done"]
        if done.waitForExistence(timeout: 3) { done.tap() }
        tapEnabledButton(named: "Save", in: app, timeout: 15)
        waitForDisappearance(editor, timeout: 15, message: "The test fixture was not saved.")
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

    private func selectWord(_ word: String, in app: XCUIApplication) {
        let passage = app.staticTexts[word].firstMatch
        XCTAssertTrue(passage.waitForExistence(timeout: 15))
        passage.press(forDuration: 1)
    }
}
