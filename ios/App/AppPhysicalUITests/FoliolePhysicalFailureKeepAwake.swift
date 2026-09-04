import XCTest

func keepPhysicalAcceptanceAwakeAfterFailure(
    _ testRun: XCTestRun?,
    application app: XCUIApplication
) {
    guard testRun?.failureCount ?? 0 > 0,
          let rawDuration = ProcessInfo.processInfo.environment[
            "FOLIOLE_PHYSICAL_FAILURE_KEEP_AWAKE_SECONDS"
          ], let duration = TimeInterval(rawDuration), (1...3600).contains(duration) else { return }

    if app.state != .runningForeground {
        app.launch()
    }
    guard app.wait(for: .runningForeground, timeout: 30) else { return }
    print("[foliole-fri] failure keep-awake lease started for \(Int(duration)) seconds")
    let deadline = Date().addingTimeInterval(duration)
    while Date() < deadline, app.state == .runningForeground {
        Thread.sleep(forTimeInterval: min(5, deadline.timeIntervalSinceNow))
    }
}
