import XCTest

extension FoliolePhysicalSyncGroupUITests {
    func acceptanceApplication() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += ["--foliole-physical-acceptance",
                                "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        return app
    }

    func openSyncSettings(in app: XCUIApplication) {
        resolveOptionalCellularDataDecision()
        if app.buttons["Exit"].waitForExistence(timeout: 3) {
            app.buttons["Exit"].tap()
        }
        tapButton(named: "Settings", in: app, timeout: 45)
        let sync = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH %@", "Sync ")
        ).firstMatch
        XCTAssertTrue(sync.waitForExistence(timeout: 30), "Sync settings row is unavailable.")
        sync.tap()
    }

    func openBrowse(in app: XCUIApplication) {
        if app.buttons["Exit"].waitForExistence(timeout: 3) { app.buttons["Exit"].tap() }
        tapButton(named: "Browse", in: app, timeout: 30)
    }

    func enableAutomaticSync(in app: XCUIApplication) {
        if app.buttons["Pause Sync"].exists { return }
        if app.buttons["Resume Sync"].exists {
            app.buttons["Resume Sync"].tap()
            XCTAssertTrue(app.buttons["Pause Sync"].waitForExistence(timeout: 30),
                          "Automatic Sync did not resume after joining the Sync Group.")
            return
        }
        let toggle = app.switches["Sync"].firstMatch
        XCTAssertTrue(toggle.waitForExistence(timeout: 30), "The automatic Sync switch is unavailable.")
        if (toggle.value as? String) != "1" { toggle.tap() }
    }

    func waitForJourneyFacts(_ origins: [String], in app: XCUIApplication) {
        for origin in origins {
            let fact = visibleTopics(prefix: "Multi-device sync \(origin) fact", in: app).firstMatch
            XCTAssertTrue(fact.waitForExistence(timeout: 120),
                          "Missing \(origin) business fact on Fri.")
        }
    }

    func waitForJourneyFactCount(_ origin: String, count: Int, in app: XCUIApplication) {
        let facts = visibleTopics(prefix: "Multi-device sync \(origin) fact", in: app)
        let enough = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "count >= %d", count), object: facts
        )
        XCTAssertEqual(XCTWaiter.wait(for: [enough], timeout: 120), .completed,
                       "Missing repeated \(origin) automatic-sync facts on Fri.")
    }

    func captureFriFact(in app: XCUIApplication) {
        captureFact(named: "Multi-device sync \(isTwoDeviceJourney ? "B" : "D") fact", in: app)
    }

    func captureFact(named title: String, in app: XCUIApplication) {
        if app.buttons["Exit"].waitForExistence(timeout: 3) { app.buttons["Exit"].tap() }
        tapButton(named: "Capture", in: app, timeout: 30)
        let editor = app.textViews["Capture text"]
        XCTAssertTrue(editor.waitForExistence(timeout: 30), "The public Capture editor is unavailable.")
        editor.tap()
        editor.typeText(title)
        let keyboardDone = app.toolbars["Toolbar"].buttons["Done"]
        XCTAssertTrue(keyboardDone.waitForExistence(timeout: 15), "The Capture keyboard cannot be dismissed.")
        keyboardDone.tap()
        tapEnabledButton(named: "Save", in: app, timeout: 30)
        waitForDisappearance(editor, timeout: 30, message: "The Fri business fact was not saved.")
    }

    func waitForVisibleTopic(prefix: String, in app: XCUIApplication) {
        let topics = visibleTopics(prefix: prefix, in: app)
        XCTAssertTrue(topics.firstMatch.waitForExistence(timeout: 120),
                      "Fri did not show the requested synced topic: \(prefix)")
        XCTAssertEqual(topics.count, 1, "Fri must show the requested synced topic exactly once.")
    }

    func waitForVisibleTopicText(prefix: String, text: String, in app: XCUIApplication) {
        let topics = visibleTopics(prefix: prefix, in: app)
        XCTAssertTrue(topics.firstMatch.waitForExistence(timeout: 120),
                      "Fri did not show the topic selected for content verification.")
        XCTAssertEqual(topics.count, 1, "Fri must verify exactly one matching topic.")
        topics.firstMatch.tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", text))
            .firstMatch.waitForExistence(timeout: 120), "Fri did not show the requested synced topic edit.")
    }

    func appendToVisibleTopic(prefix: String, text: String, in app: XCUIApplication) {
        openBrowse(in: app)
        let topics = visibleTopics(prefix: prefix, in: app)
        XCTAssertTrue(topics.firstMatch.waitForExistence(timeout: 120),
                      "Fri did not show the topic selected for editing.")
        XCTAssertEqual(topics.count, 1, "Fri must edit exactly one matching topic.")
        topics.firstMatch.tap()
        revealReadingChrome(in: app)
        tapButton(named: "Edit topic", in: app, timeout: 30)
        let editor = app.textViews["Topic body"]
        XCTAssertTrue(editor.waitForExistence(timeout: 30), "The public topic editor is unavailable on Fri.")
        editor.tap()
        editor.typeText("\n\n\(text)")
        tapButton(named: "Done", in: app, timeout: 30)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", text))
            .firstMatch.waitForExistence(timeout: 30), "Fri did not visibly save the requested edit.")
        tapButton(named: "Exit", in: app, timeout: 30)
    }

    func setAutomaticSyncPaused(_ paused: Bool, in app: XCUIApplication) {
        openSyncSettings(in: app)
        tapButton(named: "Details", in: app, timeout: 30)
        let requested = paused ? "Pause Sync" : "Resume Sync"
        let resulting = paused ? "Resume Sync" : "Pause Sync"
        tapButton(named: requested, in: app, timeout: 30)
        XCTAssertTrue(app.buttons[resulting].waitForExistence(timeout: 30),
                      "Fri did not persist the requested automatic Sync participation state.")
    }

    func waitForDeviceNames(_ names: [String], in app: XCUIApplication) {
        for name in names {
            XCTAssertTrue(app.staticTexts[name].waitForExistence(timeout: 60),
                          "Fri did not show Sync Group Device: \(name)")
        }
    }

    func requestedDeviceNames() -> [String] {
        requiredEnvironment("FOLIOLE_PHYSICAL_DEVICE_NAMES").split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    func requiredEnvironment(_ key: String) -> String {
        let value = ProcessInfo.processInfo.environment[key]?.trimmingCharacters(in: .whitespacesAndNewlines)
        XCTAssertFalse(value?.isEmpty ?? true, "Missing required physical acceptance value: \(key)")
        return value ?? ""
    }

    func forkVisibleConflictSeed(in app: XCUIApplication) {
        openBrowse(in: app)
        let topics = visibleTopics(prefix: "T152 conflict t152-conflict-", in: app)
        XCTAssertTrue(topics.firstMatch.waitForExistence(timeout: 120),
                      "Fri did not receive the conflict seed through product sync.")
        XCTAssertEqual(topics.count, 1, "Fri must fork exactly one attempt conflict seed.")
        topics.firstMatch.tap()
        revealReadingChrome(in: app)
        tapButton(named: "Edit topic", in: app, timeout: 30)
        let editor = app.textViews["Topic body"]
        XCTAssertTrue(editor.waitForExistence(timeout: 30),
                      "The public topic editor is unavailable on Fri.")
        editor.tap()
        editor.typeText("\n\nFri conflict fork")
        tapButton(named: "Done", in: app, timeout: 30)
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "Fri conflict fork")
        ).firstMatch.waitForExistence(timeout: 30), "Fri conflict fork was not visibly saved.")
        tapButton(named: "Exit", in: app, timeout: 30)
    }

    var isTwoDeviceJourney: Bool {
        ProcessInfo.processInfo.environment["FOLIOLE_T152_TWO_DEVICE"] == "1"
    }

    private func visibleTopics(prefix: String, in app: XCUIApplication) -> XCUIElementQuery {
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Open topic \(prefix)"))
    }

    func waitForDisappearance(_ element: XCUIElement, timeout: TimeInterval, message: String) {
        let expectation = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"), object: element
        )
        XCTAssertEqual(XCTWaiter.wait(for: [expectation], timeout: timeout), .completed, message)
    }

    func resetExistingSyncGroup(in app: XCUIApplication) {
        if app.buttons["Cancel"].exists {
            app.buttons["Cancel"].tap()
            XCTAssertTrue(app.buttons["Connect to Sync Group"].waitForExistence(timeout: 30),
                          "The expired physical acceptance request was not reset.")
            return
        }
        guard app.staticTexts["Current Sync Group"].exists
                || app.buttons["Sync Now"].exists else { return }
        tapButton(named: "Details", in: app, timeout: 15)
        tapButton(named: "Leave Sync Group", in: app, timeout: 15)
        tapButton(named: "Leave Sync Group", in: app, timeout: 15)
        if app.buttons["Connect to Sync Group"].waitForExistence(timeout: 30) { return }
        openSyncSettings(in: app)
        XCTAssertTrue(app.buttons["Connect to Sync Group"].waitForExistence(timeout: 30),
                      "The isolated physical acceptance Sync Group was not reset.")
    }

    func tapButton(named name: String, in app: XCUIApplication, timeout: TimeInterval) {
        let button = app.buttons[name]
        XCTAssertTrue(button.waitForExistence(timeout: timeout), "Missing button: \(name)")
        button.tap()
    }

    func tapEnabledButton(named name: String, in app: XCUIApplication, timeout: TimeInterval) {
        let button = app.buttons[name]
        XCTAssertTrue(button.waitForExistence(timeout: timeout), "Missing button: \(name)")
        let enabled = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "enabled == true"), object: button
        )
        XCTAssertEqual(XCTWaiter.wait(for: [enabled], timeout: timeout), .completed,
                       "Button did not become enabled: \(name)")
        button.tap()
    }

    func waitForLocalNetworkDecision(allow: Bool) {
        let labels = allow ? ["Allow", "允许"] : ["Don’t Allow", "不允许"]
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let alert = springboard.alerts.firstMatch
        guard alert.waitForExistence(timeout: 8) else { return }
        let decision = labels.lazy.map { alert.buttons[$0] }.first { $0.exists }
        XCTAssertNotNil(decision, "Missing Local Network decision button.")
        guard let decision else { return }
        attachScreenshot(named: allow ? "Fri-local-network-allow" : "Fri-local-network-deny")
        decision.tap()
        if allow { resolveOptionalCellularDataDecision() }
        let dismissed = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"), object: alert
        )
        XCTAssertEqual(XCTWaiter.wait(for: [dismissed], timeout: 30), .completed,
                       "The Local Network decision was not completed on Fri.")
    }

    func resolveOptionalCellularDataDecision() {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let wlanOnly = springboard.buttons.matching(NSPredicate(
            format: "label IN %@", ["WLAN Only", "Wi-Fi Only", "仅限无线局域网"]
        )).firstMatch
        if wlanOnly.waitForExistence(timeout: 3) { wlanOnly.tap() }
    }

    func attachScreenshot(named name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
