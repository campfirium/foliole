import CoreFoundation
import XCTest

private let friOfflineSignalCallback: CFNotificationCallback = { _, observer, _, _, _ in
    guard let observer else { return }
    Unmanaged<XCTestExpectation>.fromOpaque(observer).takeUnretainedValue().fulfill()
}

extension FoliolePhysicalSyncGroupUITests {
    func testS220ReadOnlyNavigationPreflight() throws {
        let app = acceptanceApplication()
        app.launch()
        assertS220GroupAndCachedFacts(in: app)
        attachScreenshot(named: "Fri-S220-read-only-navigation-ready")
        print("[foliole-fri] s220-read-only-navigation-ready attempt=\(s220AttemptId)")
    }

    func testS220OfflineBatchRetainsChangesAcrossRelaunch() throws {
        let app = acceptanceApplication()
        app.launch()
        assertS220GroupAndCachedFacts(in: app)
        print("[foliole-fri] s220-offline-window-ready attempt=\(s220AttemptId)")

        waitForExternalOfflineSignal()
        app.activate()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 30),
                      "Fri did not return to the foreground after the external offline switch.")
        assertPublicSyncNowFailsOffline(in: app)
        completeCachedReadingReview(in: app)
        appendToVisibleTopic(prefix: s220SourceTitle, existingText: s220SourceTitle,
                             text: s220EditMarker, in: app)
        captureFact(named: s220CaptureTitle, in: app)
        assertS220LocalState(in: app, afterRelaunch: true)
        print("[foliole-fri] s220-offline-batch-complete attempt=\(s220AttemptId)")
    }

    func testS220OnlineBatchConvergesAfterSyncNow() throws {
        let app = acceptanceApplication()
        app.launch()
        openSyncSettings(in: app)
        XCTAssertTrue(app.staticTexts["Current Sync Group"].waitForExistence(timeout: 30))
        tapEnabledButton(named: "Sync Now", in: app, timeout: 120)
        waitForSyncNowCompletion(in: app)
        assertS220LocalState(in: app, afterRelaunch: true)
        print("[foliole-fri] s220-online-batch-complete attempt=\(s220AttemptId)")
    }

    private var s220AttemptId: String {
        String(requiredEnvironment("FOLIOLE_PHYSICAL_SYNC_GROUP_ID").suffix(12))
    }

    private var s220SourceTitle: String { "Multi-device sync A fact" }
    private var s220ReviewTitle: String { "Multi-device sync D fact" }
    private var s220CaptureTitle: String { "S220 Fri capture \(s220AttemptId)" }
    private var s220EditMarker: String { "S220 Fri edit \(s220AttemptId)." }

    private func assertS220GroupAndCachedFacts(in app: XCUIApplication) {
        openSyncSettings(in: app)
        XCTAssertTrue(app.staticTexts["Current Sync Group"].waitForExistence(timeout: 30),
                      "Fri did not retain the isolated S220 Sync Group.")
        openBrowse(in: app)
        waitForVisibleTopic(prefix: s220SourceTitle, in: app)
        openLearn(in: app)
        XCTAssertTrue(app.staticTexts[s220ReviewTitle].waitForExistence(timeout: 30),
                      "Fri did not cache the S220 reading review before the offline window.")
    }

    private func assertPublicSyncNowFailsOffline(in app: XCUIApplication) {
        openSyncSettings(in: app)
        tapEnabledButton(named: "Sync Now", in: app, timeout: 120)
        waitForSyncNowCompletion(in: app)
        let failure = app.staticTexts.matching(NSPredicate(
            format: "label CONTAINS[c] 'failed' OR label CONTAINS[c] 'could not connect'"
        )).firstMatch
        XCTAssertTrue(failure.waitForExistence(timeout: 45),
                      "Public Sync Now did not expose a product-level offline failure.")
        attachScreenshot(named: "Fri-S220-public-sync-offline-failed")
    }

    private func completeCachedReadingReview(in app: XCUIApplication) {
        openLearn(in: app)
        let cachedReading = app.staticTexts[s220ReviewTitle]
        XCTAssertTrue(cachedReading.waitForExistence(timeout: 30),
                      "Fri did not expose the cached reading review while offline.")
        tapButton(named: "Read", in: app, timeout: 30)
        XCTAssertFalse(cachedReading.waitForExistence(timeout: 10),
                       "Fri did not advance after recording the offline reading review.")
    }

    private func assertS220LocalState(in app: XCUIApplication, afterRelaunch: Bool) {
        if afterRelaunch {
            app.terminate()
            XCTAssertTrue(app.wait(for: .notRunning, timeout: 30))
            app.launch()
        }
        openBrowse(in: app)
        waitForVisibleTopicText(prefix: s220SourceTitle, text: s220EditMarker, in: app)
        openBrowse(in: app)
        waitForVisibleTopic(prefix: s220CaptureTitle, in: app)
        openLearn(in: app)
        XCTAssertFalse(app.staticTexts[s220ReviewTitle].waitForExistence(timeout: 5),
                       "Fri restored the completed reading review as due.")
        attachScreenshot(named: "Fri-S220-state-restored")
    }

    private func openLearn(in app: XCUIApplication) {
        if app.staticTexts[s220ReviewTitle].exists { return }
        if app.buttons["Exit"].waitForExistence(timeout: 3) { app.buttons["Exit"].tap() }
        let flow = app.buttons["Flow"]
        if flow.waitForExistence(timeout: 30) {
            flow.tap()
            return
        }
        tapButton(named: "Learn", in: app, timeout: 5)
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
        wait(for: [received], timeout: 600)
    }
}
