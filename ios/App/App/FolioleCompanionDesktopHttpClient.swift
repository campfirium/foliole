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

struct FolioleCompanionContentBlobPart {
    let data: Data
    let hash: String
}

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
        let (data, response) = try await FolioleCompanionDesktopHttpTransport.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw invalid("Desktop response was not HTTP.") }
        return [
            try key("body", in: contract.networkResponseKeys): String(decoding: data, as: UTF8.self),
            try key("status", in: contract.networkResponseKeys): http.statusCode
        ]
    }

    static func requestContentBlobBatch(
        url: String,
        headers: [String: String],
        body: String,
        contract: FolioleCompanionContentBlobContract
    ) async throws -> [FolioleCompanionContentBlobPart] {
        guard let endpoint = URL(string: url), ["http", "https"].contains(endpoint.scheme?.lowercased() ?? "") else {
            throw invalid("Desktop URL must use HTTP or HTTPS.")
        }
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.timeoutInterval = 30
        request.httpBody = Data(body.utf8)
        headers.forEach { request.setValue($0.value, forHTTPHeaderField: $0.key) }
        let (data, response) = try await FolioleCompanionDesktopHttpTransport.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw invalid("Desktop response was not HTTP.") }
        guard (200..<300).contains(http.statusCode) else { throw invalid("Desktop returned \(http.statusCode).") }
        guard let contentType = http.value(forHTTPHeaderField: "Content-Type") else {
            throw invalid("Desktop content body batch response has no Content-Type.")
        }
        return try parseMultipart(data, contentType: contentType, hashHeader: contract.responseHeaderKey)
    }

    static func parseMultipart(_ data: Data, contentType: String, hashHeader: String) throws -> [FolioleCompanionContentBlobPart] {
        let boundary = try multipartBoundary(contentType)
        let marker = Data("--\(boundary)".utf8)
        let crlf = Data([13, 10])
        let headerSeparator = Data([13, 10, 13, 10])
        var cursor = 0
        var result: [FolioleCompanionContentBlobPart] = []
        while cursor < data.count {
            try requirePrefix(marker, in: data, at: cursor)
            cursor += marker.count
            if data.hasPrefix(Data([45, 45]), at: cursor) { return result }
            try requirePrefix(crlf, in: data, at: cursor)
            cursor += crlf.count
            guard let headerRange = data.range(of: headerSeparator, in: cursor..<data.count) else {
                throw invalid("Desktop content body batch response is truncated.")
            }
            let headers = try multipartHeaders(data[cursor..<headerRange.lowerBound])
            cursor = headerRange.upperBound
            guard let lengthText = headers["content-length"], let length = Int(lengthText), length >= 0,
                  cursor + length <= data.count else {
                throw invalid("Desktop content body batch Content-Length is invalid.")
            }
            guard let hash = headers[hashHeader.lowercased()]?.trimmingCharacters(in: .whitespacesAndNewlines), !hash.isEmpty else {
                throw invalid("Desktop content body batch hash header is missing.")
            }
            result.append(FolioleCompanionContentBlobPart(data: data[cursor..<(cursor + length)], hash: hash))
            cursor += length
            try requirePrefix(crlf, in: data, at: cursor)
            cursor += crlf.count
        }
        throw invalid("Desktop content body batch closing boundary is missing.")
    }

    private static func multipartBoundary(_ contentType: String) throws -> String {
        guard contentType.lowercased().contains("multipart/"),
              let raw = contentType.split(separator: ";").map({ $0.trimmingCharacters(in: .whitespaces) })
                .first(where: { $0.lowercased().hasPrefix("boundary=") })?
                .dropFirst("boundary=".count),
              !raw.isEmpty else {
            throw invalid("Desktop content body batch boundary is missing.")
        }
        return raw.trimmingCharacters(in: CharacterSet(charactersIn: "\""))
    }

    private static func multipartHeaders(_ data: Data.SubSequence) throws -> [String: String] {
        guard let text = String(data: data, encoding: .utf8) else { throw invalid("Multipart headers are invalid.") }
        return try text.components(separatedBy: "\r\n").reduce(into: [:]) { result, line in
            guard let separator = line.firstIndex(of: ":") else { throw invalid("Multipart header is invalid.") }
            let name = line[..<separator].trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let value = line[line.index(after: separator)...].trimmingCharacters(in: .whitespacesAndNewlines)
            guard !name.isEmpty, result[name] == nil else { throw invalid("Multipart header is invalid.") }
            result[name] = value
        }
    }

    private static func requirePrefix(_ prefix: Data, in data: Data, at offset: Int) throws {
        guard data.hasPrefix(prefix, at: offset) else { throw invalid("Desktop content body batch response is invalid.") }
    }

    private static func key(_ name: String, in values: [String: String]) throws -> String {
        guard let value = values[name] else { throw invalid("Missing network contract key \(name).") }
        return value
    }

    private static func invalid(_ message: String) -> NSError {
        NSError(domain: "FolioleCompanionDesktopHttp", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}

private extension Data {
    func hasPrefix(_ prefix: Data, at offset: Int) -> Bool {
        guard offset >= 0, offset + prefix.count <= count else { return false }
        return self[offset..<(offset + prefix.count)].elementsEqual(prefix)
    }
}

enum FolioleCompanionContentBlobBridgePayload {
    static func requestedHashes(_ body: String, contract: FolioleCompanionContentBlobContract) throws -> [String] {
        guard let payload = try JSONSerialization.jsonObject(with: Data(body.utf8)) as? [String: Any],
              let hashes = payload["hashes"] as? [String], Set(hashes).count == hashes.count else {
            throw invalid("Content blob batch hashes are invalid.")
        }
        let expression = try NSRegularExpression(pattern: contract.hashPattern)
        guard hashes.allSatisfy({ hash in
            let range = NSRange(hash.startIndex..<hash.endIndex, in: hash)
            return expression.firstMatch(in: hash, range: range)?.range == range
        }) else { throw invalid("Content blob batch hash is invalid.") }
        return hashes
    }

    static func downloadResponse(
        _ token: String,
        parts: [FolioleCompanionContentBlobPart],
        failed: [String],
        started: Date,
        contract: FolioleCompanionContentBlobContract
    ) throws -> [String: Any] {
        let keys = contract.batchResponseKeys
        return [
            try key("batchToken", keys): token,
            try key("failedHashes", keys): failed,
            try key("httpElapsedMs", keys): elapsedMs(since: started),
            try key("parseElapsedMs", keys): 0,
            try key("syncedHashes", keys): parts.map(\.hash),
            try key("totalElapsedMs", keys): elapsedMs(since: started)
        ]
    }

    static func commitResponse(
        _ hashes: [String],
        elapsedMs: Int,
        contract: FolioleCompanionContentBlobContract
    ) throws -> [String: Any] {
        [try key("databaseElapsedMs", contract.batchResponseKeys): elapsedMs,
         try key("syncedHashes", contract.batchResponseKeys): hashes]
    }

    static func elapsedMs(since date: Date) -> Int { max(0, Int(Date().timeIntervalSince(date) * 1_000)) }

    private static func key(_ name: String, _ values: [String: String]) throws -> String {
        guard let value = values[name] else { throw invalid("Missing content blob contract key \(name).") }
        return value
    }
    private static func invalid(_ message: String) -> NSError {
        NSError(domain: "FolioleContentBlobBridgePayload", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}

actor FolioleCompanionContentBlobSessions {
    struct Batch { let failedHashes: [String]; let parts: [FolioleCompanionContentBlobPart] }
    private var batches: [String: Batch] = [:]
    private var committedHashes: [String: [String]] = [:]

    func create(parts: [FolioleCompanionContentBlobPart], failedHashes: [String]) -> String {
        let token = UUID().uuidString
        batches[token] = Batch(failedHashes: failedHashes, parts: parts)
        return token
    }
    func load(_ token: String) -> Batch? { batches[token] }
    func committed(_ token: String) -> [String]? { committedHashes[token] }
    func markCommitted(_ token: String, hashes: [String]) {
        committedHashes[token] = hashes
        batches[token] = nil
    }
}
