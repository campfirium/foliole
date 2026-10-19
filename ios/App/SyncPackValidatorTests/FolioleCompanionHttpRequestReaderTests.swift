import CryptoKit
import FolioleFramedSyncRuntime
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleCompanionHttpRequestReaderTests: XCTestCase {
    func testAndroidChunkedRequestSpoolsDecodedBytesAcrossNetworkBoundaries() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        var payload = Data(repeating: 42, count: 1024)
        let header = try FolioleFramedSyncWireHeader(ciphertextBytes: 512, sequence: 0, frameType: .sessionControl)
        payload.replaceSubrange(96..<112, with: header.encode())
        let head = Data("POST /companion/framed-sync HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\n".utf8)
        let wire = head + Data("400\r\n".utf8) + payload + Data("\r\n0\r\n\r\n".utf8)
        for stride in [1, 7, 111, 4096] {
            let reader = FolioleCompanionHttpRequestReader(directory: directory)
            var request: FolioleCompanionHttpMessage?
            for offset in Swift.stride(from: 0, to: wire.count, by: stride) {
                request = try reader.append(Data(wire[offset..<min(offset + stride, wire.count)]))
            }
            try reader.finish()
            XCTAssertEqual(request?.bodyData.count, 0)
            XCTAssertEqual(request?.bodyFile?.byteLength, payload.count)
            XCTAssertEqual(try request?.bodyPrefix(payload.count), payload)
            let digest = SHA256.hash(data: payload).map { String(format: "%02x", $0) }.joined()
            XCTAssertEqual(try request?.rawBodyDigest(), digest)
        }
    }

    func testChunkedJsonAndTrailersPreserveBodyAndOriginalHeaders() throws {
        let reader = FolioleCompanionHttpRequestReader()
        let wire = "POST /companion/join HTTP/1.1\r\nTransfer-Encoding: chunked\r\nX-Tag: original\r\n\r\n" +
            "3;extension=value\r\n{\"a\r\n4\r\n\":1}\r\n0\r\nX-Tag: ignored\r\n\r\n"
        var request: FolioleCompanionHttpMessage?
        for byte in wire.utf8 { request = try reader.append(Data([byte])) }
        try reader.finish()
        XCTAssertEqual(request?.body["a"] as? Int, 1)
        XCTAssertEqual(request?.header("x-tag"), "original")
    }

    func testChunkedRejectsAmbiguousLengthsMalformedFramingAndTruncation() throws {
        let head = "POST /companion/framed-sync HTTP/1.1\r\nTransfer-Encoding: chunked\r\n"
        for extra in ["Content-Length: 1\r\n", "Transfer-Encoding: chunked\r\n"] {
            XCTAssertThrowsError(try FolioleCompanionHttpRequestReader().append(Data((head + extra + "\r\n").utf8)))
        }
        for body in ["-1\r\nx\r\n0\r\n\r\n", "xyz\r\n", "FFFFFFFFFFFFFFFFFFFFFFFF\r\n",
                     "1\r\nx!!", "0\r\n\r\nextra", String(repeating: "a", count: 17000)] {
            XCTAssertThrowsError(try FolioleCompanionHttpRequestReader().append(Data((head + "\r\n" + body).utf8)))
        }
        for body in ["", "1\r\nx", "0\r\n", "0\r\nX-Trailer: value\r\n"] {
            let reader = FolioleCompanionHttpRequestReader()
            XCTAssertNil(try reader.append(Data((head + "\r\n" + body).utf8)))
            XCTAssertThrowsError(try reader.finish())
        }
    }

    func testChunkedOrdinaryRequestKeepsSizeLimit() throws {
        let reader = FolioleCompanionHttpRequestReader()
        XCTAssertNil(try reader.append(Data("POST /companion/join HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\n40000\r\n".utf8)))
        let part = Data(repeating: 32, count: 64 * 1024)
        for _ in 0..<3 { XCTAssertNil(try reader.append(part)) }
        XCTAssertThrowsError(try reader.append(part))
    }

    func testSpoolsFiftyMiBRawBytesAndSignsTheirExactDigest() throws {
        try verifyLargeSignedRequest(chunked: false)
        try verifyLargeSignedRequest(chunked: true)
    }

    private func verifyLargeSignedRequest(chunked: Bool) throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        var chunk = Data((0..<64 * 1024).map { UInt8(truncatingIfNeeded: $0 &* 131 &+ 17) })
        let header = try FolioleFramedSyncWireHeader(ciphertextBytes: 512, sequence: 0, frameType: .sessionControl)
        chunk.replaceSubrange(96..<112, with: header.encode())
        var hash = SHA256()
        for _ in 0..<800 { hash.update(data: chunk) }
        let digest = hash.finalize().map { String(format: "%02x", $0) }.joined()
        let key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        let path = "/companion/framed-sync?round=one"
        let timestamp = ISO8601DateFormatter().string(from: Date())
        let nonce = UUID().uuidString
        let canonical = ["POST", path, timestamp, nonce, digest].joined(separator: "\n")
        let signature = HMAC<SHA256>.authenticationCode(for: Data(canonical.utf8),
            using: SymmetricKey(data: Data(key.utf8))).map { String(format: "%02x", $0) }.joined()
        let framing = chunked ? "Transfer-Encoding: chunked" : "Content-Length: \(50 * 1024 * 1024)"
        let head = "POST \(path) HTTP/1.1\r\n\(framing)\r\n" +
            "Content-Type: application/vnd.foliole.framed-sync\r\nX-Device-Id: device\r\n" +
            "X-Sync-Group-Id: group\r\nX-Timestamp: \(timestamp)\r\nX-Nonce: \(nonce)\r\n" +
            "X-Signature: \(signature)\r\n\r\n"
        let reader = FolioleCompanionHttpRequestReader(directory: directory)
        XCTAssertNil(try reader.append(Data(head.utf8)))
        var request: FolioleCompanionHttpMessage?
        for index in 0..<800 {
            if chunked { XCTAssertNil(try reader.append(Data("10000\r\n".utf8))) }
            let next = try reader.append(chunk)
            if chunked || index < 799 { XCTAssertNil(next) }
            else { request = next }
            if chunked { XCTAssertNil(try reader.append(Data("\r\n".utf8))) }
        }
        if chunked { request = try reader.append(Data("0\r\n\r\n".utf8)) }
        try reader.finish()
        XCTAssertEqual(request?.bodyData.count, 0)
        XCTAssertEqual(request?.bodyFile?.byteLength, 50 * 1024 * 1024)
        XCTAssertEqual(try request?.rawBodyDigest(), digest)
        XCTAssertEqual(try request?.bodyPrefix(96), chunk.prefix(96))
        XCTAssertEqual(try FolioleCompanionSyncGroupWorkgroup.authenticate(
            XCTUnwrap(request), groupId: "group", workgroupKey: key, dataBridge: DeviceBridge()), "device")
        var bad = try XCTUnwrap(request)
        bad = FolioleCompanionHttpMessage(body: bad.body, bodyData: bad.bodyData,
            headers: bad.headers.merging(["x-signature": String(repeating: "0", count: 64)]) { _, new in new },
            method: bad.method, path: bad.path, bodyFile: bad.bodyFile)
        XCTAssertThrowsError(try FolioleCompanionSyncGroupWorkgroup.authenticate(
            bad, groupId: "group", workgroupKey: key, dataBridge: DeviceBridge()))
    }

    func testSplitsHeadersAndKeepsOrdinaryJsonBehavior() throws {
        let wire = Data("POST /companion/join HTTP/1.1\r\nX-Tag: first\r\nX-Tag: second\r\nContent-Length: 7\r\n\r\n{\"a\":1}".utf8)
        let reader = FolioleCompanionHttpRequestReader()
        var request: FolioleCompanionHttpMessage?
        for byte in wire { request = try reader.append(Data([byte])) }
        XCTAssertEqual(request?.body["a"] as? Int, 1)
        XCTAssertNil(request?.bodyFile)
        XCTAssertEqual(request?.header("x-tag"), "second")
        XCTAssertEqual(request?.bodyData, Data("{\"a\":1}".utf8))
    }

    func testRejectsHeaderAmbiguityTruncationAndExcessBytes() throws {
        let duplicate = Data("POST /companion/framed-sync HTTP/1.1\r\nContent-Length: 2\r\nContent-Length: 1\r\n\r\n".utf8)
        XCTAssertThrowsError(try FolioleCompanionHttpRequestReader().append(duplicate))
        XCTAssertThrowsError(try FolioleCompanionHttpRequestReader().append(Data(repeating: 120, count: 17 * 1024)))
        let reader = FolioleCompanionHttpRequestReader()
        XCTAssertNil(try reader.append(Data("POST /companion/framed-sync HTTP/1.1\r\nContent-Length: 2\r\n\r\nx".utf8)))
        XCTAssertThrowsError(try reader.finish())
        XCTAssertThrowsError(try reader.append(Data("xx".utf8)))
    }

    func testRequestOwnerDeletesCompletedAndInterruptedFiles() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        var reader: FolioleCompanionHttpRequestReader? = .init(directory: directory)
        XCTAssertNil(try reader?.append(Data("POST /companion/framed-sync HTTP/1.1\r\nContent-Length: 2\r\n\r\nx".utf8)))
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: directory.path).count, 1)
        reader = nil
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: directory.path).count, 0)
        reader = .init(directory: directory)
        var request = try reader?.append(Data("POST /companion/framed-sync HTTP/1.1\r\nContent-Length: 1\r\n\r\nx".utf8))
        reader = nil
        let file = try XCTUnwrap(request?.bodyFile?.url)
        XCTAssertTrue(FileManager.default.fileExists(atPath: file.path))
        request = nil
        XCTAssertFalse(FileManager.default.fileExists(atPath: file.path))
    }
}

private struct DeviceBridge: FolioleCompanionSyncGroupDataRequesting {
    func request(_ operation: String, _ payload: [String: Any]) throws -> [String: Any] { ["active": true] }
}
