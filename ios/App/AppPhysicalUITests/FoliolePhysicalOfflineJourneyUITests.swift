import CoreFoundation
import XCTest

private let friOfflineSignalCallback: CFNotificationCallback = { _, observer, _, _, _ in
    guard let observer else { return }
    Unmanaged<XCTestExpectation>.fromOpaque(observer).takeUnretainedValue().fulfill()
}

extension FoliolePhysicalSyncGroupUITests {
    func testRetainsManuallyOfflineEditAcrossRelaunch() throws {
        let app = acceptanceApplication()
        app.launch()
        openSyncSettings(in: app)
        XCTAssertTrue(app.staticTexts["Current Sync Group"].waitForExistence(timeout: 30))
        openBrowse(in: app)
        waitForJourneyFacts(["A"], in: app)

        waitForExternalOfflineSignal()
        attachScreenshot(named: "Fri-S220-offline-ready")
        completeCachedReadingReview(in: app)
        let title = "S220 Fri offline \(UUID().uuidString)"
        let edit = "S220 Fri offline edit \(UUID().uuidString)"
        print("[foliole-fri] s220-offline-fact-title \(title)")
        print("[foliole-fri] s220-offline-edit-text \(edit)")
        appendToVisibleTopic(prefix: "Multi-device sync A fact", existingText: "Multi-device sync A fact",
                             text: edit, in: app)
        captureFact(named: title, in: app)
        waitForVisibleTopic(prefix: title, in: app)
        app.terminate()
        XCTAssertTrue(app.wait(for: .notRunning, timeout: 30))
        app.launch()
        openBrowse(in: app)
        waitForVisibleTopicText(prefix: "Multi-device sync A fact", text: edit, in: app)
        openBrowse(in: app)
        waitForVisibleTopic(prefix: title, in: app)
        tapButton(named: "Exit", in: app, timeout: 30)
        tapButton(named: "Learn", in: app, timeout: 30)
        XCTAssertFalse(app.staticTexts["Multi-device sync D fact"].waitForExistence(timeout: 5),
                       "Fri restored the reading review as due after offline relaunch.")
        attachScreenshot(named: "Fri-S220-offline-capture-restored")
    }

    private func completeCachedReadingReview(in app: XCUIApplication) {
        let cachedReading = app.staticTexts["Multi-device sync D fact"]
        if !cachedReading.exists {
            if app.buttons["Exit"].waitForExistence(timeout: 3) {
                app.buttons["Exit"].tap()
            }
            tapButton(named: "Learn", in: app, timeout: 30)
        }
        XCTAssertTrue(cachedReading.waitForExistence(timeout: 30),
                      "Fri did not expose the cached reading review while offline.")
        tapButton(named: "Read", in: app, timeout: 30)
        XCTAssertFalse(cachedReading.waitForExistence(timeout: 10),
                       "Fri did not advance after recording the offline reading review.")
    }

    private func waitForExternalOfflineSignal() {
        let received = expectation(description: "Fri receives USB offline confirmation")
        let center = CFNotificationCenterGetDarwinNotifyCenter()
        let observer = UnsafeRawPointer(Unmanaged.passUnretained(received).toOpaque())
        let name = CFNotificationName(
            rawValue: "com.foliole.s220.fri.offline-continue" as CFString
        )
        CFNotificationCenterAddObserver(center, observer, friOfflineSignalCallback,
                                        name.rawValue, nil, .deliverImmediately)
        defer { CFNotificationCenterRemoveObserver(center, observer, name, nil) }
        print("[foliole-fri] waiting-for-external-offline-signal")
        wait(for: [received], timeout: 600)
        print("[foliole-fri] received-external-offline-signal")
    }
}
