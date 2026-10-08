import CryptoKit
import Foundation
import FolioleFramedSyncRuntime

struct FolioleCompanionHttpHead {
    let headers: [String: String]
    let method: String
    let path: String
    let bodyOffset: Int
    let bodyLength: Int
    var framed: Bool { method == "POST" && path.split(separator: "?").first == "/companion/framed-sync" }

    static func parse(_ data: Data) throws -> Self? {
        guard let separator = data.range(of: Data("\r\n\r\n".utf8)) else {
            if data.count > 16 * 1024 { throw invalid("http_header_too_large") }
            return nil
        }
        guard separator.lowerBound <= 16 * 1024,
              let text = String(data: data[..<separator.lowerBound], encoding: .utf8) else {
            throw invalid("invalid_http_headers")
        }
        let lines = text.components(separatedBy: "\r\n")
        let parts = (lines.first ?? "").split(separator: " ")
        guard parts.count == 3 else { throw invalid("invalid_http_request") }
        var headers = [String: String]()
        for line in lines.dropFirst() {
            guard let colon = line.firstIndex(of: ":") else { throw invalid("invalid_http_headers") }
            let name = line[..<colon].trimmingCharacters(in: .whitespaces).lowercased()
            guard !name.isEmpty, name != "content-length" || headers[name] == nil else {
                throw invalid("invalid_http_headers")
            }
            headers[name] = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
        }
        guard headers["transfer-encoding"] == nil,
              let length = Int(headers["content-length"] ?? "0"), length >= 0,
              length <= Int.max - separator.upperBound else { throw invalid("request_too_large") }
        let value = Self(headers: headers, method: String(parts[0]), path: String(parts[1]),
                         bodyOffset: separator.upperBound, bodyLength: length)
        let limit = value.method == "POST" && value.path.split(separator: "?").first == "/companion/sync-identity-push"
            ? 2 * 1024 * 1024 : FolioleCompanionHttpMessage.maximumBytes
        if !value.framed && value.bodyOffset + length > limit { throw invalid("request_too_large") }
        return value
    }

    static func invalid(_ message: String) -> NSError {
        NSError(domain: "FolioleCompanionHttpMessage", code: 1,
                userInfo: [NSLocalizedDescriptionKey: message])
    }
}

/** The request owns this file until authenticated bytes have been durably staged. */
final class FolioleCompanionHttpBodyFile {
    let url: URL
    private var output: FileHandle?
    private var hasher = SHA256()
    private(set) var byteLength = 0
    private(set) var digest: String?

    init(directory: URL) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        url = directory.appendingPathComponent("request-\(UUID().uuidString).body")
        guard FileManager.default.createFile(atPath: url.path, contents: nil) else {
            throw FolioleCompanionHttpHead.invalid("http_body_file_create_failed")
        }
        do { output = try FileHandle(forWritingTo: url) }
        catch { try? FileManager.default.removeItem(at: url); throw error }
    }

    func append(_ data: Data) throws {
        guard let output, digest == nil else { throw FolioleCompanionHttpHead.invalid("http_body_file_closed") }
        try output.write(contentsOf: data)
        hasher.update(data: data)
        byteLength += data.count
    }

    func finish() throws {
        guard digest == nil else { return }
        try output?.close()
        output = nil
        digest = hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }

    func prefix(_ count: Int) throws -> Data {
        guard digest != nil, (0...64 * 1024).contains(count) else {
            throw FolioleCompanionHttpHead.invalid("http_body_range_invalid")
        }
        let input = try FileHandle(forReadingFrom: url)
        defer { try? input.close() }
        return try input.read(upToCount: count) ?? Data()
    }

    deinit { try? output?.close(); try? FileManager.default.removeItem(at: url) }
}

final class FolioleCompanionHttpRequestReader {
    let payloadBudget: FolioleFramedSyncPayloadBudget?
    let payloadCancellation = FolioleFramedSyncPayloadCancellation()
    private var framedPrefix = Data()
    private var firstLane: FolioleFramedSyncPayloadBudget.Lane?
    var networkLane: FolioleFramedSyncPayloadBudget.Lane? {
        guard let head else { return nil }
        return head.framed ? firstLane : .payload
    }
    var networkReadBytes: Int {
        if head == nil { return max(1, 16 * 1024 + 4 - pending.count) }
        if head?.framed == true && firstLane == nil { return max(1, 112 - framedPrefix.count) }
        return 64 * 1024
    }
    private var pending = Data()
    private var head: FolioleCompanionHttpHead?
    private var file: FolioleCompanionHttpBodyFile?
    private var body = Data()
    private var received = 0
    private var finished = false
    private let directory: URL

    init(directory: URL = FileManager.default.temporaryDirectory.appendingPathComponent("Foliole-http"),
         payloadBudget: FolioleFramedSyncPayloadBudget? = nil) {
        self.directory = directory; self.payloadBudget = payloadBudget
    }

    func append(_ data: Data) throws -> FolioleCompanionHttpMessage? {
        guard !finished, data.count <= 64 * 1024 else { throw FolioleCompanionHttpHead.invalid("http_read_size_invalid") }
        if head == nil {
            pending.append(data)
            guard let parsed = try FolioleCompanionHttpHead.parse(pending) else { return nil }
            head = parsed
            if parsed.framed { file = try FolioleCompanionHttpBodyFile(directory: directory) }
            let bytes = Data(pending.dropFirst(parsed.bodyOffset))
            pending.removeAll(keepingCapacity: false)
            return try appendBody(bytes)
        }
        return try appendBody(data)
    }

    private func appendBody(_ data: Data) throws -> FolioleCompanionHttpMessage? {
        guard let head, data.count <= head.bodyLength - received else {
            throw FolioleCompanionHttpHead.invalid("http_body_length_exceeded")
        }
        if head.framed && firstLane == nil {
            framedPrefix.append(data.prefix(112 - framedPrefix.count))
            if framedPrefix.count == 112 {
                let header = try FolioleFramedSyncWireHeader(decoding: Data(framedPrefix.suffix(16)))
                firstLane = header.frameType == .transferReceipt ? .receipt : .payload
                if firstLane == .receipt && header.ciphertextBytes > 1_048_576 {
                    throw FolioleCompanionHttpHead.invalid("framed_sync_receipt_limit_exceeded")
                }
                framedPrefix.removeAll(keepingCapacity: false)
            }
        }
        if let file { try file.append(data) } else { body.append(data) }
        received += data.count
        guard received == head.bodyLength else { return nil }
        try file?.finish()
        var request = try FolioleCompanionHttpMessage.from(head: head, data: body, file: file)
        request.payloadBudget = payloadBudget; request.payloadCancellation = payloadCancellation
        finished = true
        self.file = nil
        return request
    }

    func finish() throws {
        guard finished else { throw FolioleCompanionHttpHead.invalid("incomplete_http_request") }
    }
}
