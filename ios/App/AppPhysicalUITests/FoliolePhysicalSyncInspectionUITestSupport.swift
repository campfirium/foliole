import XCTest

extension FoliolePhysicalSyncGroupUITests {
    func testInspectsExistingSyncSettings() throws {
        let app = acceptanceApplication()
        app.launch()
        openSyncSettings(in: app)
        attachScreenshot(named: "Fri-existing-sync-settings")
        let hierarchy = XCTAttachment(string: app.debugDescription)
        hierarchy.name = "Fri-existing-sync-settings-hierarchy"
        hierarchy.lifetime = .keepAlways
        add(hierarchy)
        guard localizedButton(named: "Details", in: app).waitForExistence(timeout: 3) else { return }
        tapButton(named: "Details", in: app, timeout: 3)
        attachScreenshot(named: "Fri-existing-sync-group-details")
        let details = XCTAttachment(string: app.debugDescription)
        details.name = "Fri-existing-sync-group-details-hierarchy"
        details.lifetime = .keepAlways
        add(details)
    }
}
