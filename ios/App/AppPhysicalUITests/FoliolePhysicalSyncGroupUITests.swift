import XCTest

final class FoliolePhysicalSyncGroupUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    override func tearDownWithError() throws {
        try super.tearDownWithError()
        keepPhysicalAcceptanceAwakeAfterFailure(testRun, application: acceptanceApplication())
    }

    func testPreparesLocalNetworkPermission() throws {
        let app = acceptanceApplication()
        app.launch()
        openSyncSettings(in: app)
        resetExistingSyncGroup(in: app)
        tapButton(named: "Connect to Sync Group", in: app, timeout: 30)
        waitForLocalNetworkDecision(allow: true)
        XCTAssertTrue(app.staticTexts["Searching..."].waitForExistence(timeout: 30),
                      "Local Network discovery did not enter its ready searching state.")
        attachScreenshot(named: "Fri-local-network-ready")
    }

    func testJoinsDiscoveredSyncGroupAndPersistsAfterRelaunch() throws {
        let app = acceptanceApplication()
        app.launch()

        openSyncSettings(in: app)
        if isTwoDeviceJourney {
            XCTAssertTrue(app.buttons["Connect to Sync Group"].waitForExistence(timeout: 30),
                          "The attempt-specific Fri acceptance container was not fresh.")
            captureFriFact(in: app)
            openSyncSettings(in: app)
        } else {
            resetExistingSyncGroup(in: app)
        }
        tapButton(named: "Connect to Sync Group", in: app, timeout: 30)
        waitForLocalNetworkDecision(allow: true)
        tapButton(named: "Join", in: app, timeout: 90)

        XCTAssertTrue(
            app.staticTexts["Current Sync Group"].waitForExistence(timeout: 120)
                || app.buttons["Leave Sync Group"].exists,
            "The accepted Sync Group was not activated on the physical iPhone."
        )
        enableAutomaticSync(in: app)
        openBrowse(in: app)
        waitForJourneyFacts(isTwoDeviceJourney ? ["A", "B"] : ["A", "B", "C"], in: app)
        if isTwoDeviceJourney { waitForJourneyFactCount("A", count: 2, in: app) }
        captureFriFact(in: app)
        if isTwoDeviceJourney {
            attachScreenshot(named: "Fri-two-device-joined-ready")
            print("[foliole-fri] t152-joined-ready")
            return
        }
        openSyncSettings(in: app)
        tapButton(named: "Sync Now", in: app, timeout: 30)
        waitForDisappearance(app.staticTexts["Never"], timeout: 45,
                             message: "The public Sync Now action did not update the last sync result.")
        attachScreenshot(named: "Fri-sync-group-joined")

        app.terminate()
        app.launch()
        openSyncSettings(in: app)
        XCTAssertTrue(
            app.buttons["Sync Now"].waitForExistence(timeout: 45),
            "The physical iPhone did not restore its Sync Group after relaunch."
        )
        XCTAssertFalse(app.buttons["Connect to Sync Group"].exists)
        tapEnabledButton(named: "Sync Now", in: app, timeout: 120)
        openBrowse(in: app)
        waitForJourneyFacts(isTwoDeviceJourney ? ["A", "B"] : ["A", "B", "C", "D"], in: app)
        attachScreenshot(named: "Fri-sync-group-restored")
    }

    func testCompletesTwoDeviceConflictAndRestart() throws {
        XCTAssertTrue(isTwoDeviceJourney, "This journey is reserved for a T152 two-Device attempt.")
        let app = acceptanceApplication()
        app.launch()
        openSyncSettings(in: app)
        XCTAssertTrue(app.buttons["Sync Now"].waitForExistence(timeout: 45),
                      "Fri did not retain the accepted attempt Sync Group.")
        tapButton(named: "Details", in: app, timeout: 30)
        tapButton(named: "Pause Sync", in: app, timeout: 30)
        forkVisibleConflictSeed(in: app)
        print("[foliole-fri] t152-conflict-fork-ready")
        openSyncSettings(in: app)
        tapButton(named: "Details", in: app, timeout: 30)
        tapButton(named: "Resume Sync", in: app, timeout: 30)
        openSyncSettings(in: app)
        tapEnabledButton(named: "Sync Now", in: app, timeout: 120)
        XCTAssertTrue(app.staticTexts["Issues to resolve"].waitForExistence(timeout: 120),
                      "Fri did not expose the concurrent business conflict.")

        app.terminate()
        app.launch()
        openSyncSettings(in: app)
        XCTAssertTrue(app.buttons["Sync Now"].waitForExistence(timeout: 45),
                      "Fri did not restore its attempt Sync Group after relaunch.")
        tapEnabledButton(named: "Sync Now", in: app, timeout: 120)
        openBrowse(in: app)
        waitForJourneyFacts(["A", "B"], in: app)
        attachScreenshot(named: "Fri-two-device-conflict-restored")
    }

    func testLocalNetworkDenialIsVisible() throws {
        let app = acceptanceApplication()
        app.launch()
        openSyncSettings(in: app)
        tapButton(named: "Connect to Sync Group", in: app, timeout: 30)
        waitForLocalNetworkDecision(allow: false)
        XCTAssertTrue(
            app.staticTexts["Allow Local Network access to find Sync Groups nearby."]
                .waitForExistence(timeout: 45),
            "The physical iPhone did not expose denied Local Network discovery."
        )
        attachScreenshot(named: "Fri-local-network-denied")
    }

    func testShowsRequestedSyncGroupDevices() throws {
        let app = acceptanceApplication()
        app.launch()
        openSyncSettings(in: app)
        tapButton(named: "Details", in: app, timeout: 30)
        waitForDeviceNames(requestedDeviceNames(), in: app)
        attachScreenshot(named: "Fri-sync-group-devices")
    }

    func testCapturesRequestedFact() throws {
        let app = acceptanceApplication()
        app.launch()
        captureFact(named: requiredEnvironment("FOLIOLE_PHYSICAL_FACT_TITLE"), in: app)
        openBrowse(in: app)
        waitForVisibleTopic(prefix: requiredEnvironment("FOLIOLE_PHYSICAL_FACT_TITLE"), in: app)
        attachScreenshot(named: "Fri-captured-fact")
    }

    func testWaitsForRequestedFact() throws {
        let app = acceptanceApplication()
        app.launch()
        openBrowse(in: app)
        waitForVisibleTopic(prefix: requiredEnvironment("FOLIOLE_PHYSICAL_FACT_TITLE"), in: app)
        attachScreenshot(named: "Fri-received-fact")
    }

    func testWaitsForRequestedTopicText() throws {
        let app = acceptanceApplication()
        app.launch()
        openBrowse(in: app)
        waitForVisibleTopicText(prefix: requiredEnvironment("FOLIOLE_PHYSICAL_TOPIC_PREFIX"),
                                text: requiredEnvironment("FOLIOLE_PHYSICAL_EXPECTED_TEXT"), in: app)
        attachScreenshot(named: "Fri-received-topic-edit")
    }

    func testAppendsToRequestedTopic() throws {
        let app = acceptanceApplication()
        app.launch()
        appendToVisibleTopic(prefix: requiredEnvironment("FOLIOLE_PHYSICAL_TOPIC_PREFIX"),
                             text: requiredEnvironment("FOLIOLE_PHYSICAL_APPEND_TEXT"), in: app)
        attachScreenshot(named: "Fri-edited-topic")
    }

    func testCreatesAndEditsRequestedHighlight() throws {
        let app = acceptanceApplication()
        app.launch()
        openRequestedTopic(in: app)
        createHighlight(for: requiredEnvironment("FOLIOLE_PHYSICAL_SELECTION_TEXT"), in: app)
        addCommentToHighlight(
            text: requiredEnvironment("FOLIOLE_PHYSICAL_SELECTION_TEXT"),
            comment: requiredEnvironment("FOLIOLE_PHYSICAL_ANNOTATION_NOTE"), in: app
        )
        attachScreenshot(named: "Fri-highlight-edited")
    }

    func testRestoresRequestedTopicFromTrash() throws {
        let app = acceptanceApplication()
        app.launch()
        restoreTopicFromTrash(
            title: requiredEnvironment("FOLIOLE_PHYSICAL_TRASH_TITLE"), in: app
        )
        attachScreenshot(named: "Fri-trash-restored")
    }

    func testPausesAutomaticSync() throws {
        let app = acceptanceApplication()
        app.launch()
        setAutomaticSyncPaused(true, in: app)
        attachScreenshot(named: "Fri-automatic-sync-paused")
    }

    func testPullsRequestedFactWithSyncNow() throws {
        let app = acceptanceApplication()
        app.launch()
        openSyncSettings(in: app)
        tapEnabledButton(named: "Sync Now", in: app, timeout: 120)
        openBrowse(in: app)
        waitForVisibleTopic(prefix: requiredEnvironment("FOLIOLE_PHYSICAL_FACT_TITLE"), in: app)
        attachScreenshot(named: "Fri-manual-sync-received")
    }

    func testResumesAutomaticSync() throws {
        let app = acceptanceApplication()
        app.launch()
        setAutomaticSyncPaused(false, in: app)
        attachScreenshot(named: "Fri-automatic-sync-resumed")
    }

    func testRestoresGroupAndRequestedFactAfterRelaunch() throws {
        let app = acceptanceApplication()
        app.launch()
        openSyncSettings(in: app)
        XCTAssertTrue(app.buttons["Sync Now"].waitForExistence(timeout: 45),
                      "Fri did not restore its accepted Sync Group.")
        openBrowse(in: app)
        waitForVisibleTopic(prefix: requiredEnvironment("FOLIOLE_PHYSICAL_FACT_TITLE"), in: app)
        attachScreenshot(named: "Fri-relaunch-restored")
    }

    func testStopsForForegroundCatchUp() throws {
        let app = acceptanceApplication()
        app.launch()
        openSyncSettings(in: app)
        XCTAssertTrue(app.buttons["Sync Now"].waitForExistence(timeout: 45),
                      "Fri did not restore its accepted Sync Group before stopping.")
        app.terminate()
        XCTAssertTrue(app.wait(for: .notRunning, timeout: 30),
                      "Fri remained runnable instead of entering the catch-up interval.")
        attachScreenshot(named: "Fri-stopped-for-foreground-catch-up")
    }

}
