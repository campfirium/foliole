import Foundation

final class FolioleCompanionRedirectBlocker: NSObject, URLSessionTaskDelegate {
    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping @Sendable (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }
}

enum FolioleCompanionDesktopHttpTransport {
    private static let session = URLSession(configuration: makeConfiguration())

    static func makeConfiguration() -> URLSessionConfiguration {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.urlCache = nil
        configuration.urlCredentialStorage = nil
        configuration.timeoutIntervalForResource = 300
        configuration.waitsForConnectivity = true
        return configuration
    }

    static func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        return try await session.data(for: request, delegate: FolioleCompanionRedirectBlocker())
    }

    static func download(for request: URLRequest) async throws -> (URL, URLResponse) {
        return try await session.download(for: request, delegate: FolioleCompanionRedirectBlocker())
    }
}

enum FolioleCompanionDesktopHttpClient {
    static func request(
        url: String,
        method: String,
        headers: [String: String],
        body: String?,
        contract: FolioleCompanionNetworkContract
    ) async throws -> [String: Any] {
        guard let endpoint = URL(string: url), ["http", "https"].contains(endpoint.scheme?.lowercased() ?? "") else {
            throw invalid("Desktop URL must use HTTP or HTTPS.")
        }
        var request = URLRequest(url: endpoint)
        let normalizedMethod = method.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        request.httpMethod = normalizedMethod
        request.timeoutInterval = 30
        headers.forEach { request.setValue($0.value, forHTTPHeaderField: $0.key) }
        let signed = try FolioleCompanionSignedClientRequests.claim(
            url: endpoint, method: normalizedMethod, headers: headers, body: body.map { Data($0.utf8) }
        )
        request.httpBody = signed?.body ?? body.map { Data($0.utf8) }
        let (data, response) = try await FolioleCompanionDesktopHttpTransport.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw invalid("Desktop response was not HTTP.") }
        let responseBody = try signed?.decrypt(data, response: http).0 ?? data
        return [
            try key("body", in: contract.networkResponseKeys): String(decoding: responseBody, as: UTF8.self),
            try key("status", in: contract.networkResponseKeys): http.statusCode
        ]
    }

    private static func key(_ name: String, in values: [String: String]) throws -> String {
        guard let value = values[name] else { throw invalid("Missing network contract key \(name).") }
        return value
    }

    private static func invalid(_ message: String) -> NSError {
        NSError(domain: "FolioleCompanionDesktopHttp", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}
