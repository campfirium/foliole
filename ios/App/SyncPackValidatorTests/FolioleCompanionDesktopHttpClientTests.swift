import Foundation
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleCompanionDesktopHttpClientTests: XCTestCase {
    func testDesktopTransportKeepsSharedSessionStateless() {
        let configuration = FolioleCompanionDesktopHttpTransport.makeConfiguration()

        XCTAssertNil(configuration.httpCookieStorage)
        XCTAssertFalse(configuration.httpShouldSetCookies)
        XCTAssertEqual(configuration.requestCachePolicy, .reloadIgnoringLocalCacheData)
        XCTAssertNil(configuration.urlCache)
        XCTAssertNil(configuration.urlCredentialStorage)
        XCTAssertEqual(configuration.timeoutIntervalForResource, 300)
        XCTAssertTrue(configuration.waitsForConnectivity)
    }

    func testBonjourEndpointUsesResolvedServiceAddress() throws {
        XCTAssertEqual(FolioleCompanionBonjourEndpoint.preferredResolvedIPv4([
            "198.18.0.1", "169.254.12.28", "192.168.0.10"
        ], localSubnets: []), "192.168.0.10")
        XCTAssertEqual(FolioleCompanionBonjourEndpoint.preferredResolvedIPv4([
            "192.168.56.1", "192.168.111.1", "192.168.0.10", "172.26.144.1"
        ], localSubnets: [try XCTUnwrap(FolioleIPv4Subnet(
            address: "192.168.0.24", netmask: "255.255.255.0"
        ))]), "192.168.0.10")
        XCTAssertNil(FolioleCompanionBonjourEndpoint.preferredResolvedIPv4([
            "127.0.0.1", "169.254.12.28"
        ]))
        XCTAssertEqual(FolioleCompanionBonjourEndpoint.resolvedHost(" desktop.local. "),
                       "desktop.local")
        XCTAssertNil(FolioleCompanionBonjourEndpoint.resolvedHost(" . "))
        XCTAssertNil(FolioleCompanionBonjourEndpoint.resolvedHost(nil))
    }

    func testBonjourProjectsPreparedTopologyRoleFromSharedHostFixture() throws {
        let fixture = try JSONSerialization.jsonObject(with: Data(contentsOf: sharedFixtureURL()))
            as? [String: Any]
        let roleKey = try XCTUnwrap(fixture?["role_txt_key"] as? String)
        let record = NetService.data(fromTXTRecord: [
            roleKey: Data("anchor".utf8),
            "protocol_version": Data("5".utf8)
        ])
        let decoded = FolioleCompanionBonjourDiscoverySession.decodeTXT(record)

        XCTAssertEqual(decoded[roleKey], "anchor")
        XCTAssertEqual(decoded["protocol_version"], "5")
    }

    func testRefusesSignedRequestRedirects() throws {
        let session = URLSession(configuration: .ephemeral)
        defer { session.invalidateAndCancel() }
        let task = session.dataTask(with: try XCTUnwrap(URL(string: "http://192.168.1.2/sync")))
        let response = try XCTUnwrap(HTTPURLResponse(
            url: try XCTUnwrap(task.originalRequest?.url),
            statusCode: 302,
            httpVersion: nil,
            headerFields: ["Location": "https://example.com/capture"]
        ))
        let redirected = URLRequest(url: try XCTUnwrap(URL(string: "https://example.com/capture")))
        let completion = expectation(description: "redirect decision")

        FolioleCompanionRedirectBlocker().urlSession(
            session,
            task: task,
            willPerformHTTPRedirection: response,
            newRequest: redirected
        ) { request in
            XCTAssertNil(request)
            completion.fulfill()
        }

        wait(for: [completion], timeout: 1)
    }

    private func sharedFixtureURL() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("lib/platform/fixtures/sync-anchor-topology-v5.json")
    }
}
