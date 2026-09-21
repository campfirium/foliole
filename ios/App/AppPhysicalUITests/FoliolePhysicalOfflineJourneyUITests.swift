import Network
import XCTest

extension FoliolePhysicalSyncGroupUITests {
    func testRetainsManuallyOfflineEditAcrossRelaunch() throws {
        let app = acceptanceApplication()
        app.launch()
        openSyncSettings(in: app)
        XCTAssertTrue(app.staticTexts["Current Sync Group"].waitForExistence(timeout: 30))
        openBrowse(in: app)
        waitForJourneyFacts(["A"], in: app)

        waitForManualNetworkIsolation()

        app.activate()
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
        waitForVisibleTopicText(prefix: "Multi-device sync A fact", text: edit, in: app)
        waitForVisibleTopic(prefix: title, in: app)
        tapButton(named: "Learn", in: app, timeout: 30)
        XCTAssertFalse(app.staticTexts["Multi-device sync D fact"].waitForExistence(timeout: 5),
                       "Fri restored the reading review as due after offline relaunch.")
        attachScreenshot(named: "Fri-S220-offline-capture-restored")
    }

    private func completeCachedReadingReview(in app: XCUIApplication) {
        tapButton(named: "Learn", in: app, timeout: 30)
        let cachedReading = app.staticTexts["Multi-device sync D fact"]
        XCTAssertTrue(cachedReading.waitForExistence(timeout: 30),
                      "Fri did not expose the cached reading review while offline.")
        tapButton(named: "Read", in: app, timeout: 30)
        XCTAssertFalse(cachedReading.waitForExistence(timeout: 10),
                       "Fri did not advance after recording the offline reading review.")
    }

    private func waitForManualNetworkIsolation() {
        let offline = expectation(description: "Fri network path becomes unavailable")
        let monitor = NWPathMonitor()
        var observedOnline = false
        var completedTransition = false
        monitor.pathUpdateHandler = { path in
            if path.status == .satisfied {
                observedOnline = true
            } else if observedOnline && !completedTransition && path.status == .unsatisfied {
                completedTransition = true
                offline.fulfill()
            }
        }
        monitor.start(queue: DispatchQueue(label: "com.foliole.tests.network-path"))
        defer { monitor.cancel() }
        print("[foliole-fri] waiting-for-manual-network-isolation")
        wait(for: [offline], timeout: 600)
    }
}
