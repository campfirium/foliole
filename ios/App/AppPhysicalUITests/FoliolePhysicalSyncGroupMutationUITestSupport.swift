import XCTest

extension FoliolePhysicalSyncGroupUITests {
    func revealReadingChrome(in app: XCUIApplication) {
        if app.buttons["Edit topic"].exists { return }
        let articleText = app.staticTexts.firstMatch
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
        let passage = app.staticTexts[text]
        XCTAssertTrue(passage.waitForExistence(timeout: 60), "Fri did not show the requested selection text.")
        passage.press(forDuration: 1.0)
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
        let passage = app.staticTexts[text]
        XCTAssertTrue(passage.waitForExistence(timeout: 30), "Fri did not render the new highlight target.")
        passage.tap()
        tapButton(named: "Add Comment", in: app, timeout: 30)
        let editor = app.textViews.firstMatch
        XCTAssertTrue(editor.waitForExistence(timeout: 30), "The existing highlight comment editor is unavailable.")
        editor.tap()
        editor.typeText(comment)
        tapButton(named: "Save", in: app, timeout: 30)

        let savedPassage = app.staticTexts[text]
        XCTAssertTrue(savedPassage.waitForExistence(timeout: 30), "Fri lost the saved highlight target.")
        savedPassage.tap()
        tapButton(named: "Add Comment", in: app, timeout: 30)
        XCTAssertEqual(app.textViews.firstMatch.value as? String, comment,
                       "Fri did not persist the existing highlight comment.")
        tapButton(named: "Cancel", in: app, timeout: 30)
    }

    func restoreTopicFromTrash(title: String, in app: XCUIApplication) {
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
        revealReadingChrome(in: app)
        tapButton(named: "More reading actions", in: app, timeout: 30)
        tapButton(named: "Restore from Trash", in: app, timeout: 30)
        XCTAssertFalse(app.buttons["Restore from Trash"].waitForExistence(timeout: 3),
                       "Fri still exposed restore after the topic was restored.")
    }
}
