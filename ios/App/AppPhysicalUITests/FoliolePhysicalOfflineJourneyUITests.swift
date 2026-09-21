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
        startS220OnlineConvergence(in: app)
        assertS220LocalState(in: app, afterRelaunch: true,
                             allowingBackgroundSync: true)
        attachScreenshot(named: "Fri-S220-online-attempt-converged")
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

    private func startS220OnlineConvergence(in app: XCUIApplication) {
        if s220AutomaticSyncIsRunning(in: app) {
            print("[foliole-fri] s220-online-auto-sync-took-over attempt=\(s220AttemptId)")
            return
        }
        let syncNow = app.buttons["Sync Now"]
        if syncNow.waitForExistence(timeout: 15) {
            if s220AutomaticSyncIsRunning(in: app) {
                print("[foliole-fri] s220-online-auto-sync-took-over attempt=\(s220AttemptId)")
                return
            }
            XCTAssertTrue(syncNow.isEnabled, "The public Sync Now action was not available.")
            syncNow.tap()
            waitForSyncNowCompletion(in: app)
            XCTAssertFalse(app.staticTexts["Sync failed."].waitForExistence(timeout: 3),
                           "The public Sync Now action explicitly failed.")
            print("[foliole-fri] s220-online-manual-sync-complete attempt=\(s220AttemptId)")
            return
        }
        XCTAssertTrue(s220AutomaticSyncIsRunning(in: app),
                      "Neither automatic Sync nor the public Sync Now action was available.")
        print("[foliole-fri] s220-online-auto-sync-took-over attempt=\(s220AttemptId)")
    }

    private func s220AutomaticSyncIsRunning(in app: XCUIApplication) -> Bool {
        app.buttons["Syncing"].exists
            || app.buttons["Sync in progress"].exists
            || app.staticTexts["Syncing"].exists
    }

    private func assertS220LocalState(in app: XCUIApplication, afterRelaunch: Bool,
                                      allowingBackgroundSync: Bool = false) {
        if afterRelaunch {
            app.terminate()
            XCTAssertTrue(app.wait(for: .notRunning, timeout: 30))
            app.launch()
        }
        openS220Browse(in: app, allowingBackgroundSync: allowingBackgroundSync)
        waitForVisibleTopicText(prefix: s220SourceTitle, text: s220EditMarker, in: app)
        openS220Browse(in: app, allowingBackgroundSync: allowingBackgroundSync)
        waitForVisibleTopic(prefix: s220CaptureTitle, in: app)
        openLearn(in: app)
        XCTAssertFalse(app.staticTexts[s220ReviewTitle].waitForExistence(timeout: 5),
                       "Fri restored the completed reading review as due.")
        attachScreenshot(named: "Fri-S220-state-restored")
    }

    private func openS220Browse(in app: XCUIApplication, allowingBackgroundSync: Bool) {
        guard allowingBackgroundSync else {
            openBrowse(in: app)
            return
        }
        let exit = app.buttons["Exit"]
        if exit.waitForExistence(timeout: 3) {
            exit.tap()
            waitForDisappearance(exit, timeout: 30,
                                 message: "Fri did not exit before S220 Browse verification.")
        }
        if app.buttons["Directory"].waitForExistence(timeout: 3) {
            app.buttons["Directory"].tap()
        } else {
            if !app.buttons["Browse"].exists,
               app.buttons["Settings"].waitForExistence(timeout: 3) {
                app.buttons["Settings"].tap()
            }
            tapButton(named: "Browse", in: app, timeout: 30)
        }
        let inbox = app.buttons["Open topic Inbox"]
        if inbox.waitForExistence(timeout: 3) { inbox.tap() }
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
