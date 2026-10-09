import XCTest

extension FoliolePhysicalSyncGroupUITests {
    func appendToVisibleTopic(prefix: String, existingText: String, text: String, in app: XCUIApplication) {
        openBrowse(in: app)
        let topics = visibleTopics(prefix: prefix, in: app)
        XCTAssertTrue(topics.firstMatch.waitForExistence(timeout: 120),
                      "Fri did not show the topic selected for editing.")
        XCTAssertEqual(topics.count, 1, "Fri must edit exactly one matching topic.")
        topics.firstMatch.tap()
        revealReadingChrome(in: app, matching: existingText)
        tapButton(named: "Edit topic", in: app, timeout: 30)
        let editor = app.textViews["Topic body"]
        XCTAssertTrue(editor.waitForExistence(timeout: 30), "The public topic editor is unavailable on Fri.")
        editor.tap()
        prepareLatinKeyboard(in: app)
        typeOnSoftwareKeyboard("\n\n\(text)", in: app)
        let submittedBody = editor.value as? String ?? ""
        XCTAssertTrue(submittedBody.contains(existingText), "Editing must preserve the existing text.")
        XCTAssertTrue(submittedBody.contains(text), "Editing must receive the complete new text.")
        tapButton(named: "Done", in: app, timeout: 30)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", text))
            .firstMatch.waitForExistence(timeout: 30), "Fri did not visibly save the requested edit.")
        revealReadingChrome(in: app, matching: text)
        tapButton(named: "Exit", in: app, timeout: 30)
        if ProcessInfo.processInfo.environment["FOLIOLE_PHYSICAL_VERIFY_BODY_RELAUNCH"] == "1" {
            verifyVisibleBodyAfterRelaunch(submittedBody, prefix: prefix, matching: text, in: app)
        }
    }

    private func typeOnSoftwareKeyboard(_ text: String, in app: XCUIApplication) {
        for character in text {
            let label = String(character)
            if character == "\n" || character == " " {
                let control = app.keyboards.descendants(matching: .any).matching(
                    NSPredicate(format: "label ==[c] %@", character == "\n" ? "return" : "space")
                ).firstMatch
                XCTAssertTrue(control.waitForExistence(timeout: 5), "Missing software keyboard control: \(label)")
                control.tap()
                continue
            }
            let key = app.keys[label]
            if !key.exists {
                let shift = app.keyboards.buttons.matching(NSPredicate(format: "label ==[c] %@", "shift")).firstMatch
                XCTAssertTrue(shift.exists, "The requested letter case is unavailable: \(label)")
                shift.tap()
            }
            XCTAssertTrue(key.waitForExistence(timeout: 5), "Missing software keyboard letter: \(label)")
            key.tap()
        }
    }

    private func prepareLatinKeyboard(in app: XCUIApplication) {
        if app.keys["f"].exists || app.keys["F"].exists { return }
        let next = app.buttons["Next keyboard"]
        XCTAssertTrue(next.waitForExistence(timeout: 10), "The software keyboard language selector is unavailable.")
        next.press(forDuration: 1)
        let english = app.staticTexts["English (US)"]
        XCTAssertTrue(english.waitForExistence(timeout: 10), "The configured English keyboard is unavailable.")
        english.tap()
        XCTAssertTrue(app.keys["f"].waitForExistence(timeout: 10) || app.keys["F"].exists,
                      "The English software keyboard did not become ready.")
    }

}
