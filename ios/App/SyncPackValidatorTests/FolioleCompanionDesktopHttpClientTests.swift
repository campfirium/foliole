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
}
