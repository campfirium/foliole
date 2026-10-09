import XCTest

extension FoliolePhysicalSyncGroupUITests {
    func openBrowse(in app: XCUIApplication) {
        let syncing = app.buttons["Sync in progress"]
        if syncing.exists {
            waitForDisappearance(syncing, timeout: 180,
                                 message: "Fri Sync was still running before Browse navigation.")
        }
        let body = app.descendants(matching: .any).matching(identifier: "Topic body").firstMatch
        if body.waitForExistence(timeout: 3) { revealReadingChrome(in: app) }
        let exit = app.buttons["Exit"]
        if exit.waitForExistence(timeout: 3) {
            exit.tap()
            waitForDisappearance(exit, timeout: 30,
                                 message: "Fri did not exit the active topic before Browse navigation.")
        }
        if app.buttons["Directory"].firstMatch.waitForExistence(timeout: 3) {
            app.buttons["Directory"].firstMatch.tap()
        } else {
            tapButton(named: "Browse", in: app, timeout: 30)
        }
        let inbox = app.buttons["Open folder Inbox"]
        if inbox.waitForExistence(timeout: 3) { inbox.tap() }
    }

}
