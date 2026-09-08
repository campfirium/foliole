import XCTest

extension FoliolePhysicalSyncGroupUITests {
    func testPublishesTwoDeviceConflictFork() throws {
        XCTAssertTrue(isTwoDeviceJourney, "This journey is reserved for a T152 two-Device attempt.")
        let app = acceptanceApplication()
        app.launch()
        publishTwoDeviceConflictFork(in: app)
    }

    func prepareTwoDeviceConflictFork(in app: XCUIApplication) {
        app.launch()
        openSyncSettings(in: app)
        XCTAssertTrue(app.staticTexts["Current Sync Group"].waitForExistence(timeout: 45),
                      "Fri did not retain the accepted attempt Sync Group.")
        tapButton(named: "Details", in: app, timeout: 30)
        tapButton(named: "Pause Sync", in: app, timeout: 30)
        forkVisibleConflictSeed(in: app)
    }

    func finishTwoDeviceConflictAfterProviderConverges(in app: XCUIApplication) {
        pullTwoDeviceConflictAfterProviderConverges(in: app)
        verifyTwoDeviceConflictAfterProviderConverges(in: app)
    }

    func pullTwoDeviceConflictAfterProviderConverges(in app: XCUIApplication) {
        openSyncSettings(in: app)
        tapEnabledButton(named: "Sync Now", in: app, timeout: 120)
        waitForSyncNowCompletion(in: app)
    }

    func publishTwoDeviceConflictFork(in app: XCUIApplication) {
        openSyncSettings(in: app)
        tapButton(named: "Details", in: app, timeout: 30)
        tapButton(named: "Resume Sync", in: app, timeout: 30)
        openSyncSettings(in: app)
        tapEnabledButton(named: "Sync Now", in: app, timeout: 120)
        waitForSyncNowCompletion(in: app)
    }

    func verifyTwoDeviceConflictAfterProviderConverges(in app: XCUIApplication) {
        verifyConvergedConflictForks(in: app)

        app.terminate()
        app.launch()
        openSyncSettings(in: app)
        XCTAssertTrue(app.staticTexts["Current Sync Group"].waitForExistence(timeout: 45),
                      "Fri did not restore its attempt Sync Group after relaunch.")
        tapEnabledButton(named: "Sync Now", in: app, timeout: 120)
        openBrowse(in: app)
        waitForJourneyFacts(["A", "B"], in: app)
        attachScreenshot(named: "Fri-two-device-conflict-restored")
    }

    func triggerForegroundAutomaticSync(in app: XCUIApplication) {
        XCUIDevice.shared.press(.home)
        let backgroundInterval = expectation(description: "Fri foreground transition interval")
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { backgroundInterval.fulfill() }
        wait(for: [backgroundInterval], timeout: 3)
        app.activate()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 30),
                      "Fri did not return to the foreground for automatic Sync.")
        let catchUp = expectation(description: "Fri foreground automatic Sync")
        DispatchQueue.main.asyncAfter(deadline: .now() + 20) { catchUp.fulfill() }
        wait(for: [catchUp], timeout: 21)
    }

    func waitForSyncNowCompletion(in app: XCUIApplication) {
        let completed = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "enabled == true"), object: app.buttons["Sync Now"]
        )
        XCTAssertEqual(XCTWaiter.wait(for: [completed], timeout: 180), .completed,
                       "The public Sync Now action did not finish.")
    }

    func waitForRequestedSyncFact(in app: XCUIApplication) {
        openBrowse(in: app)
        let title = requiredEnvironment("FOLIOLE_PHYSICAL_FACT_TITLE")
        let expectedText = ProcessInfo.processInfo.environment["FOLIOLE_PHYSICAL_FACT_TEXT"]
        if let expectedText, !expectedText.isEmpty {
            waitForVisibleTopicText(prefix: title, text: expectedText, in: app)
        } else {
            waitForVisibleTopic(prefix: title, in: app)
        }
    }

    func verifyConvergedConflictForks(in app: XCUIApplication) {
        openBrowse(in: app)
        let topic = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH %@", "Open topic T152 conflict t152-conflict-")
        ).firstMatch
        XCTAssertTrue(topic.waitForExistence(timeout: 120),
                      "Fri did not retain the converged conflict topic.")
        topic.tap()
        for text in ["Fri conflict fork", "Desktop fork macos"] {
            let fork = app.staticTexts.matching(
                NSPredicate(format: "label CONTAINS %@", text)
            ).firstMatch
            XCTAssertTrue(fork.waitForExistence(timeout: 120),
                          "Fri did not retain concurrent content: \(text)")
        }
    }

    func revealReadingChrome(in app: XCUIApplication, matching text: String? = nil) {
        if app.buttons["Edit topic"].exists { return }
        let articleText = text.map {
            app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", $0)).firstMatch
        } ?? app.staticTexts.firstMatch
        XCTAssertTrue(articleText.waitForExistence(timeout: 30), "The readable topic body is unavailable.")
        articleText.tap()
        XCTAssertTrue(app.buttons["Edit topic"].waitForExistence(timeout: 30),
                      "Tapping the readable topic did not reveal its controls.")
    }

    func openRequestedTopic(in app: XCUIApplication) {
        openBrowse(in: app)
        let prefix = requiredEnvironment("FOLIOLE_PHYSICAL_TOPIC_PREFIX")
        let topic = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH %@", "Open topic \(prefix)")
        ).firstMatch
        XCTAssertTrue(topic.waitForExistence(timeout: 120), "Fri did not show the requested mutation topic.")
        topic.tap()
    }

    func createHighlight(for text: String, in app: XCUIApplication) {
        let passage = app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", text)
        ).firstMatch
        XCTAssertTrue(passage.waitForExistence(timeout: 60), "Fri did not show the requested selection text.")
        passage.press(forDuration: 1.0)
        if app.buttons["Close Highlight"].waitForExistence(timeout: 3) { return }
        if !app.buttons["Highlight"].waitForExistence(timeout: 3) {
            let overflow = app.buttons.matching(NSPredicate(
                format: "label == %@ OR label == %@ OR label == %@", "More", "Next", "Show More"
            )).firstMatch
            XCTAssertTrue(overflow.waitForExistence(timeout: 10),
                          "The iOS selection menu did not expose its overflow control.")
            overflow.tap()
        }
        tapButton(named: "Highlight", in: app, timeout: 30)
        XCTAssertFalse(app.buttons["Highlight"].waitForExistence(timeout: 3),
                       "The selection annotation toolbar remained open after saving.")
    }

    func addCommentToHighlight(text: String, comment: String, in app: XCUIApplication) {
        if !app.buttons["Add Comment"].exists {
            let passage = app.staticTexts.matching(
                NSPredicate(format: "label CONTAINS %@", text)
            ).firstMatch
            XCTAssertTrue(passage.waitForExistence(timeout: 30), "Fri did not render the new highlight target.")
            passage.tap()
        }
        tapButton(named: "Add Comment", in: app, timeout: 30)
        let editor = app.textViews.firstMatch
        XCTAssertTrue(editor.waitForExistence(timeout: 30), "The existing highlight comment editor is unavailable.")
        editor.tap()
        editor.typeText(comment)
        tapButton(named: "Save", in: app, timeout: 30)
        waitForDisappearance(editor, timeout: 30,
                             message: "Fri did not persist the existing highlight comment.")
        revealReadingChrome(in: app)
        tapButton(named: "More reading actions", in: app, timeout: 30)
        tapButton(named: "Highlight", in: app, timeout: 30)
        let savedHighlight = app.buttons.matching(
            NSPredicate(format: "label CONTAINS %@", text)
        ).firstMatch
        XCTAssertTrue(savedHighlight.waitForExistence(timeout: 30),
                      "Fri did not retain the edited highlight in the topic highlight list.")
    }

    func restoreTopicFromTrash(title: String, text: String, in app: XCUIApplication) {
        if app.buttons["Exit"].waitForExistence(timeout: 3) { app.buttons["Exit"].tap() }
        tapButton(named: "Directory", in: app, timeout: 30)
        tapButton(named: "Open folder Trash", in: app, timeout: 30)
        let topic = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH %@", "Open topic \(title)")
        ).firstMatch
        XCTAssertTrue(topic.waitForExistence(timeout: 120), "Fri did not show the requested trashed topic.")
        topic.tap()
        if topic.waitForExistence(timeout: 5) {
            topic.tap()
        }
        waitForDisappearance(topic, timeout: 30,
                             message: "Fri did not open the requested trashed topic.")
        revealReadingChrome(in: app, matching: text)
        tapButton(named: "More reading actions", in: app, timeout: 30)
        tapButton(named: "Restore from Trash", in: app, timeout: 30)
        XCTAssertFalse(app.buttons["Restore from Trash"].waitForExistence(timeout: 3),
                       "Fri still exposed restore after the topic was restored.")
    }
}
