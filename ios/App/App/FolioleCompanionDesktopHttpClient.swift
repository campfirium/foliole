import Foundation

enum FolioleCompanionDesktopHttpClient {
    static func request(
        url: String,
        method: String,
        headers: [String: String],
        body: String?,
        contract: FolioleCompanionPairingContract
    ) async throws -> [String: Any] {
        guard let endpoint = URL(string: url), ["http", "https"].contains(endpoint.scheme?.lowercased() ?? "") else {
            throw invalid("Desktop URL must use HTTP or HTTPS.")
        }
        var request = URLRequest(url: endpoint)
        request.httpMethod = method.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        request.timeoutInterval = 30
        headers.forEach { request.setValue($0.value, forHTTPHeaderField: $0.key) }
        if let body { request.httpBody = Data(body.utf8) }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.waitsForConnectivity = true
        let (data, response) = try await URLSession(configuration: configuration).data(for: request)
        guard let http = response as? HTTPURLResponse else { throw invalid("Desktop response was not HTTP.") }
        return [
            try key("body", in: contract.networkResponseKeys): String(decoding: data, as: UTF8.self),
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
