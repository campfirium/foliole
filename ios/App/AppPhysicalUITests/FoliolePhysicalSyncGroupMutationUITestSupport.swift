import XCTest

extension FoliolePhysicalSyncGroupUITests {
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
        let passage = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
        XCTAssertTrue(passage.waitForExistence(timeout: 60), "Fri did not show the requested selection text.")
        passage.press(forDuration: 1.0)
        tapButton(named: "Highlight", in: app, timeout: 30)
        XCTAssertFalse(app.buttons["Highlight"].waitForExistence(timeout: 3),
                       "The selection annotation toolbar remained open after saving.")
    }

    func addCommentToHighlight(text: String, comment: String, in app: XCUIApplication) {
        let passage = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
        passage.tap()
        tapButton(named: "Add Comment", in: app, timeout: 30)
        let editor = app.textViews.firstMatch
        XCTAssertTrue(editor.waitForExistence(timeout: 30), "The existing highlight comment editor is unavailable.")
        editor.tap()
        editor.typeText(comment)
        tapButton(named: "Save", in: app, timeout: 30)

        passage.tap()
        tapButton(named: "Add Comment", in: app, timeout: 30)
        XCTAssertEqual(app.textViews.firstMatch.value as? String, comment,
                       "Fri did not persist the existing highlight comment.")
        tapButton(named: "Cancel", in: app, timeout: 30)
    }

    func restoreTopicFromTrash(title: String, in app: XCUIApplication) {
        openBrowse(in: app)
        tapButton(named: "Open folder Trash", in: app, timeout: 30)
        let topic = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH %@", "Open topic \(title)")
        ).firstMatch
        XCTAssertTrue(topic.waitForExistence(timeout: 120), "Fri did not show the requested trashed topic.")
        topic.tap()
        tapButton(named: "More", in: app, timeout: 30)
        tapButton(named: "Restore from Trash", in: app, timeout: 30)
        XCTAssertFalse(app.buttons["Restore from Trash"].waitForExistence(timeout: 3),
                       "Fri still exposed restore after the topic was restored.")
    }
}
