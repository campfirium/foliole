import XCTest

final class FoliolePhysicalReadonlySnapshotUITests: XCTestCase {
    func testReadonlySnapshotAllowsConcurrentWrite() throws {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "com.campfirium.foliole.ios.dev")
        app.launchArguments += ["--foliole-physical-acceptance"]
        app.launch()
        let button = app.buttons["Run isolated snapshot probe"]
        XCTAssertTrue(button.waitForExistence(timeout: 45))
        XCTAssertTrue(button.isHittable)
        button.tap()
        let output = app.textViews["Snapshot probe result"]
        let terminal = NSPredicate { _, _ in
            guard let text = output.value as? String,
                  let data = text.data(using: .utf8),
                  let result = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            else { return false }
            return ["passed", "failed"].contains(result["status"] as? String ?? "")
        }
        let waited = XCTWaiter.wait(for: [XCTNSPredicateExpectation(
            predicate: terminal, object: output)], timeout: 90)
        XCTAssertEqual(waited, .completed, "Last result: \(String(describing: output.value))")
        let data = try XCTUnwrap((output.value as? String)?.data(using: .utf8))
        let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
        attachment.name = "F1-readonly-snapshot.json"
        attachment.lifetime = .keepAlways
        add(attachment)
        let result = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(result["status"] as? String, "passed", String(describing: result["error"]))
        XCTAssertEqual(result["platform"] as? String, "ios")
        XCTAssertEqual(result["appId"] as? String, "com.campfirium.foliole.ios.dev")
        XCTAssertEqual(result["cleanup"] as? Bool, true)
        let rounds = try XCTUnwrap(result["rounds"] as? [[String: Any]])
        XCTAssertEqual(rounds.count, 6)
        for (index, round) in rounds.enumerated() {
            XCTAssertEqual(round["before"] as? Int, index)
            XCTAssertEqual(round["during"] as? [Int], [index, index, index])
            XCTAssertEqual(round["after"] as? Int, index + 1)
            XCTAssertEqual(round["cancelled"] as? Bool, (index + 1) % 2 == 0)
        }
    }
}
