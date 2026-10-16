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
    }
}
