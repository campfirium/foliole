import CryptoKit
import Foundation

struct FramedSyncCorpus: Decodable {
    let corpusVersion: Int
    let malformed: [MalformedFrame]
    let messages: [GoldenMessage]
    let protocolVersion: Int
    let schemaSha256: String
}

struct GoldenMessage: Decodable {
    let base64: String
    let byteLength: Int
    let name: String
    let payloadCase: String
}

struct MalformedFrame: Decodable {
    let hex: String
    let name: String
}

struct FramedSyncMaliciousCorpus: Decodable {
    let acceptedMessages: [AcceptedMessage]
    let corpusVersion: Int
    let messages: [MaliciousMessage]
    let protocolVersion: Int
}

struct AcceptedMessage: Decodable {
    let base64: String
    let frameType: UInt16
    let name: String
    let payloadCase: String
}

struct MaliciousMessage: Decodable {
    let base64: String
    let expectedError: String
    let frameType: UInt16
    let name: String
    let payloadCase: String
}

enum FramedSyncFixture {
    static let protoRelativePath = "lib/core/sync/proto/foliole/sync/v22/framed_sync.proto"
    static let corpusRelativePath = "lib/core/sync/fixtures/framed-sync-v22-golden.json"
    static let maliciousRelativePath = "lib/core/sync/fixtures/framed-sync-v22-malicious.json"

    static func load() throws -> (corpus: FramedSyncCorpus, proto: Data, root: URL) {
        let root = try repositoryRoot()
        let proto = try Data(contentsOf: root.appendingPathComponent(protoRelativePath))
        let corpusData = try Data(contentsOf: root.appendingPathComponent(corpusRelativePath))
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return (try decoder.decode(FramedSyncCorpus.self, from: corpusData), proto, root)
    }

    static func repositoryRoot() throws -> URL {
        var candidate = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        for _ in 0..<8 {
            let proto = candidate.appendingPathComponent(protoRelativePath)
            if FileManager.default.fileExists(atPath: proto.path) {
                return candidate
            }
            candidate.deleteLastPathComponent()
        }
        throw FixtureError.repositoryRootNotFound
    }

    static func loadMalicious() throws -> FramedSyncMaliciousCorpus {
        let root = try repositoryRoot()
        let data = try Data(contentsOf: root.appendingPathComponent(maliciousRelativePath))
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(FramedSyncMaliciousCorpus.self, from: data)
    }

    static func sha256Hex(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }
}

enum FixtureError: Error {
    case repositoryRootNotFound
}

extension Data {
    init?(strictHex value: String) {
        guard value.count.isMultiple(of: 2) else { return nil }
        var bytes = [UInt8]()
        bytes.reserveCapacity(value.count / 2)
        var index = value.startIndex
        while index < value.endIndex {
            let next = value.index(index, offsetBy: 2)
            guard let byte = UInt8(value[index..<next], radix: 16) else { return nil }
            bytes.append(byte)
            index = next
        }
        self.init(bytes)
    }
}
