import Foundation

struct FolioleCompanionHttpMessage {
    static let maximumBytes = 256 * 1024
    let body: [String: Any]
    let bodyData: Data
    let headers: [String: String]
    let method: String
    let path: String

    func header(_ name: String) -> String? { headers[name.lowercased()] }

    static func expectedLength(_ data: Data) throws -> Int? {
        guard data.count <= maximumBytes else { throw invalid("request_too_large") }
        guard let separator = data.range(of: Data("\r\n\r\n".utf8)) else { return nil }
        guard let headers = String(data: data[..<separator.lowerBound], encoding: .utf8) else {
            throw invalid("invalid_http_headers")
        }
        let length = headers.split(separator: "\r\n").dropFirst().compactMap { line -> Int? in
            let parts = line.split(separator: ":", maxSplits: 1)
            guard parts.count == 2, parts[0].trimmingCharacters(in: .whitespaces).lowercased() == "content-length"
            else { return nil }
            return Int(parts[1].trimmingCharacters(in: .whitespaces))
        }.first ?? 0
        guard length >= 0, separator.upperBound + length <= maximumBytes else {
            throw invalid("request_too_large")
        }
        return separator.upperBound + length
    }

    static func parse(_ data: Data) throws -> FolioleCompanionHttpMessage {
        guard let expected = try expectedLength(data), data.count >= expected,
              let separator = data.range(of: Data("\r\n\r\n".utf8)),
              let head = String(data: data[..<separator.lowerBound], encoding: .utf8),
              let requestLine = head.split(separator: "\r\n").first else {
            throw invalid("invalid_http_request")
        }
        let parts = requestLine.split(separator: " ")
        guard parts.count == 3 else { throw invalid("invalid_http_request") }
        let rawBody = Data(data[separator.upperBound..<expected])
        let headerLines = head.split(separator: "\r\n").dropFirst()
        let headers = headerLines.reduce(into: [String: String]()) { result, line in
            let pair = line.split(separator: ":", maxSplits: 1)
            if pair.count == 2 {
                result[pair[0].trimmingCharacters(in: .whitespaces).lowercased()] =
                    pair[1].trimmingCharacters(in: .whitespaces)
            }
        }
        let body: [String: Any]
        if rawBody.isEmpty { body = [:] }
        else {
            let value = try JSONSerialization.jsonObject(with: rawBody)
            guard let object = value as? [String: Any] else { throw invalid("invalid_json_body") }
            body = object
        }
        return FolioleCompanionHttpMessage(
            body: body, bodyData: rawBody, headers: headers,
            method: String(parts[0]), path: String(parts[1])
        )
    }

    static func response(status: Int, value: [String: Any]) throws -> Data {
        let body = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
        return response(status: status, contentType: "application/json; charset=utf-8", body: body)
    }

    static func response(
        status: Int, contentType: String, body: Data, originalContentType: String? = nil
    ) -> Data {
        let reason = status == 200 ? "OK" : status == 202 ? "Accepted" : status == 401 ? "Unauthorized" :
            status == 404 ? "Not Found" : status == 409 ? "Conflict" :
            status == 413 ? "Payload Too Large" : status == 500 ? "Internal Server Error" : "Bad Request"
        let original = originalContentType.map { "X-Foliole-Original-Content-Type: \($0)\r\n" } ?? ""
        let head = "HTTP/1.1 \(status) \(reason)\r\nContent-Type: \(contentType)\r\n" + original +
            "Content-Length: \(body.count)\r\nConnection: close\r\n\r\n"
        return Data(head.utf8) + body
    }

    private static func invalid(_ message: String) -> Error {
        NSError(domain: "FolioleCompanionHttpMessage", code: 1,
                userInfo: [NSLocalizedDescriptionKey: message])
    }
}
