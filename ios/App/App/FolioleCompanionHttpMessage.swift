import CryptoKit
import Foundation

struct FolioleCompanionHttpMessage {
    static let maximumBytes = 256 * 1024
    var payloadBudget: FolioleFramedSyncPayloadBudget?
    var payloadCancellation: FolioleFramedSyncPayloadCancellation?
    let body: [String: Any]
    let bodyData: Data
    let bodyFile: FolioleCompanionHttpBodyFile?
    let headers: [String: String]
    let method: String
    let path: String

    init(body: [String: Any], bodyData: Data, headers: [String: String], method: String,
         path: String, bodyFile: FolioleCompanionHttpBodyFile? = nil) {
        self.body = body
        self.bodyData = bodyData
        self.headers = headers
        self.method = method
        self.path = path
        self.bodyFile = bodyFile
    }

    func header(_ name: String) -> String? { headers[name.lowercased()] }

    func rawBodyDigest() throws -> String {
        if let bodyFile {
            guard let digest = bodyFile.digest else { throw Self.invalid("incomplete_http_request") }
            return digest
        }
        return SHA256.hash(data: bodyData).map { String(format: "%02x", $0) }.joined()
    }

    func bodyPrefix(_ count: Int) throws -> Data {
        if let bodyFile { return try bodyFile.prefix(count) }
        return Data(bodyData.prefix(count))
    }

    func bodyStream() throws -> InputStream {
        if let bodyFile {
            guard let stream = InputStream(url: bodyFile.url) else { throw Self.invalid("http_body_file_unavailable") }
            return stream
        }
        return InputStream(data: bodyData)
    }

    static func expectedLength(_ data: Data) throws -> Int? {
        guard let head = try FolioleCompanionHttpHead.parse(data) else { return nil }
        return head.bodyOffset + head.bodyLength
    }

    static func parse(_ data: Data) throws -> FolioleCompanionHttpMessage {
        guard let head = try FolioleCompanionHttpHead.parse(data),
              data.count == head.bodyOffset + head.bodyLength else { throw invalid("invalid_http_request") }
        return try from(head: head, data: Data(data.dropFirst(head.bodyOffset)))
    }

    static func from(head: FolioleCompanionHttpHead, data: Data,
                     file: FolioleCompanionHttpBodyFile? = nil) throws -> Self {
        let mediaType = head.headers["content-type"]?.split(separator: ";", maxSplits: 1).first?
            .trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let body: [String: Any]
        if file != nil || data.isEmpty || mediaType == FolioleFramedSyncHTTPTransport.contentType { body = [:] }
        else {
            guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                throw invalid("invalid_json_body")
            }
            body = object
        }
        return Self(body: body, bodyData: data, headers: head.headers, method: head.method,
                    path: head.path, bodyFile: file)
    }

    static func response(status: Int, value: [String: Any]) throws -> Data {
        let body = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
        return response(status: status, contentType: "application/json; charset=utf-8", body: body)
    }

    static func response(
        status: Int, contentType: String, body: Data, originalContentType: String? = nil,
        totalBytes: Int? = nil, headers: [String: String] = [:]
    ) -> Data {
        let reason = status == 200 ? "OK" : status == 202 ? "Accepted" : status == 401 ? "Unauthorized" :
            status == 404 ? "Not Found" : status == 409 ? "Conflict" :
            status == 413 ? "Payload Too Large" : status == 500 ? "Internal Server Error" : "Bad Request"
        let original = originalContentType.map { "X-Foliole-Original-Content-Type: \($0)\r\n" } ?? ""
        let total = totalBytes.map { "X-Foliole-Resource-Total-Bytes: \($0)\r\n" } ?? ""
        let extra = headers.keys.sorted().map { "\($0): \(headers[$0]!)\r\n" }.joined()
        let head = "HTTP/1.1 \(status) \(reason)\r\nContent-Type: \(contentType)\r\n" + original + total + extra +
            "Content-Length: \(body.count)\r\nConnection: close\r\n\r\n"
        return Data(head.utf8) + body
    }

    private static func invalid(_ message: String) -> Error {
        NSError(domain: "FolioleCompanionHttpMessage", code: 1,
                userInfo: [NSLocalizedDescriptionKey: message])
    }
}
