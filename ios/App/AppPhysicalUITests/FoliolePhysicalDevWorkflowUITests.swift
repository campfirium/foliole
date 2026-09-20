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
