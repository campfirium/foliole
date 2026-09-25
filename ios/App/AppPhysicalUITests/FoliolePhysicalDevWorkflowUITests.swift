import XCTest

final class FoliolePhysicalDevWorkflowUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testOpensAndOperatesBrowse() throws {
        let app = XCUIApplication()
        app.launchArguments += ["--foliole-physical-acceptance",
                                "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()

        let browse = app.buttons["Browse"]
        if !browse.waitForExistence(timeout: 5) {
            let exit = app.buttons["Exit"]
            if exit.waitForExistence(timeout: 5) { exit.tap() }
        }
        XCTAssertTrue(browse.waitForExistence(timeout: 45),
                      "Browse did not become available on the iPhone development build.")
        browse.tap()

        let capture = app.buttons["Capture"]
        XCTAssertTrue(capture.waitForExistence(timeout: 15),
                      "Capture is unavailable on the Browse surface.")
        capture.tap()

        let editor = app.textViews["Capture text"]
        XCTAssertTrue(editor.waitForExistence(timeout: 30),
                      "The Capture sheet did not open after the real device tap.")
        attachScreenshot(named: "Fri-dev-workflow-operated")

        let cancel = app.buttons["Cancel"]
        XCTAssertTrue(cancel.waitForExistence(timeout: 15), "Capture Cancel is unavailable.")
        cancel.tap()
        XCTAssertFalse(editor.waitForExistence(timeout: 5),
                       "Capture sheet remained open after the real device tap.")
    }

    func testKeepsDeviceAwakeDuringPreparation() throws {
        guard let rawDuration = ProcessInfo.processInfo.environment[
            "FOLIOLE_PHYSICAL_KEEP_AWAKE_SECONDS"
        ], let duration = TimeInterval(rawDuration), (1...3600).contains(duration) else {
            throw XCTSkip("Run this lease explicitly with a duration between 1 and 3600 seconds.")
        }

        let app = XCUIApplication()
        app.launchArguments += ["--foliole-physical-acceptance",
                                "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 30),
                      "The acceptance app did not enter the foreground for the keep-awake lease.")

        let deadline = Date().addingTimeInterval(duration)
        while Date() < deadline {
            XCTAssertEqual(app.state, .runningForeground,
                           "The acceptance app left the foreground during preparation.")
            let remaining = deadline.timeIntervalSinceNow
            if remaining <= 0 { break }
            Thread.sleep(forTimeInterval: min(5, remaining))
        }
    }

    func testMeasuresLibraryCapacity() throws {
        executionTimeAllowance = 1200
        let app = XCUIApplication(bundleIdentifier: "com.foliole.ios.devworkflow")
        app.launchArguments += ["--foliole-physical-acceptance"]
        app.launch()
        let run = app.buttons["Run T219 capacity"]
        XCTAssertTrue(run.waitForExistence(timeout: 45))
        run.tap()
        let output = app.textViews["T219 capacity result"]
        let terminal = NSPredicate { _, _ in
            guard let text = output.value as? String,
                  let data = text.data(using: .utf8),
                  let result = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            else { return false }
            return ["passed", "failed"].contains(result["status"] as? String ?? "")
        }
        let expectation = XCTNSPredicateExpectation(predicate: terminal, object: output)
        XCTAssertEqual(XCTWaiter.wait(for: [expectation], timeout: 900), .completed)
        let text = try XCTUnwrap(output.value as? String)
        let data = try XCTUnwrap(text.data(using: .utf8))
        let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
        attachment.name = "T219-library-capacity.json"
        attachment.lifetime = .keepAlways
        add(attachment)
        attachScreenshot(named: "T219-library-capacity")
        try assertCapacityResult(data)
    }

    func testMeasuresLibraryWorkspaceCapacity() throws {
        executionTimeAllowance = 1200
        let app = XCUIApplication(bundleIdentifier: "com.foliole.ios.t219capacity")
        app.launchArguments += ["--foliole-physical-acceptance",
                                "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        var results: [[String: Any]] = []
        for target in [1000, 10000] {
            app.launch()
            dismissCapacityWirelessDataPrompt()
            results.append(try measureWorkspaceStage(target, in: app))
            if target == 1000 { app.terminate() }
        }
        let result: [String: Any] = ["status": "passed", "platform": "ios",
            "appId": "com.foliole.ios.t219capacity", "scenario": "library-capacity-workspace",
            "results": results]
        let data = try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted])
        let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
        attachment.name = "T219-library-workspace-capacity.json"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func measureWorkspaceStage(_ target: Int, in app: XCUIApplication) throws -> [String: Any] {
        let open = app.buttons["Open \(target / 1000)k workspace"]
        if !open.waitForExistence(timeout: 5) {
            let failure = app.staticTexts.matching(
                NSPredicate(format: "label BEGINSWITH %@", "T219 workspace failed:")
            ).firstMatch
            if failure.waitForExistence(timeout: 3) {
                XCTFail(failure.label)
                return [:]
            }
            let prepare = app.buttons["Prepare \(target == 1000 ? "1k" : "10k") workspace"]
            XCTAssertTrue(prepare.waitForExistence(timeout: 45), "T219 workspace preparation is unavailable.")
            prepare.tap()
            XCTAssertTrue(open.waitForExistence(timeout: 300), "T219 workspace stage was not prepared.")
        }
        let startupStarted = CFAbsoluteTimeGetCurrent()
        open.tap()
        try waitForWorkspaceStartup(in: app)
        let startupMs = elapsedMilliseconds(since: startupStarted)
        if app.buttons["Exit"].exists { app.buttons["Exit"].tap() }
        let readStarted = CFAbsoluteTimeGetCurrent()
        tap("Directory", in: app, timeout: 60)
        tap("Open folder Topic 0", in: app, timeout: 60)
        attachScreenshot(named: "T219-\(target)-directory")
        tap("Open topic Topic 1", in: app, timeout: 60)
        let body = app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "Synthetic measurement node 1.")
        ).firstMatch
        XCTAssertTrue(body.waitForExistence(timeout: 120), "T219 readable topic did not open.")
        let readMs = elapsedMilliseconds(since: readStarted)
        body.tap()
        tap("Edit topic", in: app, timeout: 30)
        let editor = app.textViews["Topic body"]
        XCTAssertTrue(editor.waitForExistence(timeout: 30), "T219 topic editor is unavailable.")
        let token = "T219 refreshed \(target)"
        editor.tap()
        dismissCapacityWirelessDataPrompt()
        editor.typeText("\n\n\(token)")
        let refreshStarted = CFAbsoluteTimeGetCurrent()
        tap("Done", in: app, timeout: 30)
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"), object: editor
        )], timeout: 30), .completed, "The topic editor did not finish saving.")
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", token)
        ).firstMatch.waitForExistence(timeout: 60), "T219 edit did not visibly refresh.")
        let refreshMs = elapsedMilliseconds(since: refreshStarted)
        attachScreenshot(named: "T219-\(target)-saved-topic")
        revealAndExitReading(in: app, matching: token)
        tap("Search", in: app, timeout: 30)
        let search = app.searchFields["Search synced topics"]
        XCTAssertTrue(search.waitForExistence(timeout: 30), "T219 search is unavailable.")
        search.tap()
        let searchStarted = CFAbsoluteTimeGetCurrent()
        search.typeText("Synthetic measurement node 1")
        XCTAssertTrue(app.buttons.matching(NSPredicate(
            format: "label BEGINSWITH %@", "Topic 1\n"
        )).firstMatch.waitForExistence(timeout: 60))
        let searchMs = elapsedMilliseconds(since: searchStarted)
        let keyboardDone = app.toolbars.buttons["Done"]
        if keyboardDone.exists { keyboardDone.tap() }
        attachScreenshot(named: "T219-\(target)-search")
        let flowStarted = CFAbsoluteTimeGetCurrent()
        tap("Flow", in: app, timeout: 30)
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "Synthetic measurement node")
        ).firstMatch.waitForExistence(timeout: 60), "T219 review flow is unavailable.")
        let flowMs = elapsedMilliseconds(since: flowStarted)
        attachScreenshot(named: "T219-\(target)-flow")
        return ["fixtureCount": target, "startupMs": startupMs,
                "readMs": readMs, "refreshMs": refreshMs,
                "searchMs": searchMs, "flowMs": flowMs]
    }

    private func waitForWorkspaceStartup(in app: XCUIApplication) throws {
        let ready = NSPredicate { _, _ in
            app.buttons["Exit"].exists || app.buttons["Browse"].exists
        }
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(
            predicate: ready, object: app)], timeout: 180), .completed,
            "Normal Companion did not reach an interactive startup surface.")
    }

    private func revealAndExitReading(in app: XCUIApplication, matching text: String) {
        if !app.buttons["Exit"].exists {
            let passage = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
            passage.tap()
        }
        tap("Exit", in: app, timeout: 30)
    }

    private func dismissCapacityWirelessDataPrompt() {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let alert = springboard.alerts.matching(NSPredicate(
            format: "label CONTAINS %@", "Foliole.t219capacity"
        )).firstMatch
        guard alert.waitForExistence(timeout: 3) else { return }
        let wirelessOnly = alert.buttons.matching(NSPredicate(
            format: "label IN %@", ["WLAN Only", "Wi-Fi Only", "仅限无线局域网"]
        )).firstMatch
        guard wirelessOnly.exists else { return }
        let deny = alert.buttons.matching(NSPredicate(
            format: "label IN %@", ["Don’t Allow", "Don't Allow", "不允许"]
        )).firstMatch
        XCTAssertTrue(deny.exists, "The isolated capacity app network decision is unavailable.")
        deny.tap()
        XCTAssertFalse(alert.exists, "The capacity app network prompt remained open.")
    }

    private func tap(_ label: String, in app: XCUIApplication, timeout: TimeInterval) {
        let button = app.buttons[label].firstMatch
        XCTAssertTrue(button.waitForExistence(timeout: timeout), "Missing button: \(label)")
        button.tap()
    }

    private func elapsedMilliseconds(since start: CFAbsoluteTime) -> Double {
        (CFAbsoluteTimeGetCurrent() - start) * 1000
    }

    private func assertCapacityResult(_ data: Data) throws {
        let result = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(result["status"] as? String, "passed", String(describing: result["error"]))
        XCTAssertEqual(result["appId"] as? String, "com.foliole.ios.devworkflow")
        XCTAssertEqual(result["platform"] as? String, "ios")
        XCTAssertEqual(result["scenario"] as? String, "library-capacity")
        let cases = try XCTUnwrap(result["results"] as? [[String: Any]])
        XCTAssertEqual(cases.count, 2)
        for (entry, count) in zip(cases, [1000, 10000]) {
            let fixture = try XCTUnwrap(entry["fixture"] as? [String: Any])
            XCTAssertEqual(fixture["count"] as? Int, count)
            XCTAssertEqual(fixture["bodyBytes"] as? Int, 4096)
            XCTAssertEqual(fixture["analyzed"] as? Bool, false)
            XCTAssertEqual(fixture["imports"] as? Int, 0)
            XCTAssertFalse(try XCTUnwrap(entry["plans"] as? [[String: Any]]).isEmpty)
            let runs = try XCTUnwrap(entry["runs"] as? [[String: Any]])
            XCTAssertEqual(runs.count, 4)
            let hashes = runs.compactMap { $0["snapshotHash"] as? String }
            XCTAssertEqual(hashes.count, 4)
            XCTAssertEqual(Set(hashes).count, 1)
            XCTAssertEqual(hashes.first?.count, 64)
            for run in runs {
                let elapsed = try XCTUnwrap(run["totalMs"] as? Double)
                XCTAssertTrue(elapsed.isFinite && elapsed >= 0)
                XCTAssertNotNil(run["queryWallMs"] as? Double)
                XCTAssertNotNil(run["jsResidualMs"] as? Double)
            }
        }
    }

    private func attachScreenshot(named name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
