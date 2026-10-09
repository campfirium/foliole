import XCTest

extension FoliolePhysicalSyncGroupUITests {
    func verifyVisibleBodyAfterRelaunch(
        _ submittedBody: String, prefix: String, matching text: String, in app: XCUIApplication
    ) {
        let bodyAttachment = XCTAttachment(string: submittedBody)
        bodyAttachment.name = "Fri-visible-body-read-before-save"
        bodyAttachment.lifetime = .keepAlways
        add(bodyAttachment)

        app.launch()
        openBrowse(in: app)
        waitForVisibleTopicText(prefix: prefix, text: text, in: app)
        revealReadingChrome(in: app, matching: text)
        tapButton(named: "Edit topic", in: app, timeout: 30)
        let editor = app.textViews["Topic body"]
        XCTAssertTrue(editor.waitForExistence(timeout: 30))
        XCTAssertEqual(editor.value as? String, submittedBody,
                       "The visible body read before saving must survive application relaunch.")
        attachScreenshot(named: "Fri-visible-body-before-save-equals-relaunched-body")
        tapButton(named: "Done", in: app, timeout: 30)
    }
}
