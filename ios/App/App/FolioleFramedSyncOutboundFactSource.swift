import CryptoKit
import Foundation
import FolioleFramedSyncRuntime

/** Each bridge result lives only until the synchronous durable consumer returns. */
final class FolioleFramedSyncOutboundFactSource {
    let owner: FolioleFramedSyncPayloadBudget?
    let header: Foliole_Sync_V22_TransferHeader
    private let directory: URL
    private let read: (Int, Int, (Data, Bool) throws -> Void) throws -> Void
    private var digests = [Int: Data]()
    private struct Frame { let url: URL; let digest: Data; let last: Bool }
    private var frozenFrames = [Int: [Frame]]()

    init(header: Foliole_Sync_V22_TransferHeader, directory: URL, owner: FolioleFramedSyncPayloadBudget? = nil,
         read: @escaping (Int, Int, (Data, Bool) throws -> Void) throws -> Void) {
        self.owner = owner; self.header = header; self.directory = directory; self.read = read
    }

    var orderedIndices: [Int] {
        header.manifest.facts.indices.sorted {
            FolioleFramedSyncCanonicalManifest.identityOrder(
                header.manifest.facts[$0].identity, header.manifest.facts[$1].identity)
        }
    }

    func fact(at index: Int) throws -> Foliole_Sync_V22_FactRecord {
        let url = directory.appendingPathComponent("fact-\(UUID().uuidString).partial")
        guard FileManager.default.createFile(atPath: url.path, contents: nil) else { throw invalid() }
        defer { try? FileManager.default.removeItem(at: url) }
        let handle = try FileHandle(forWritingTo: url)
        var small: Foliole_Sync_V22_FactRecord?
        do {
            try forEachMessage(at: index) { _, payload in
                switch payload {
                case .fact(let fact): small = fact
                case .factFragment(let fragment): try handle.write(contentsOf: fragment.data)
                default: throw self.invalid()
                }
            }
            try handle.synchronize(); try handle.close()
        } catch { try? handle.close(); throw error }
        if let small { return small }
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        guard let size = attributes[.size] as? NSNumber,
              size.intValue <= FolioleFramedSyncLimits.maxFragmentedFactBytes else { throw invalid() }
        let message = try FolioleFramedSyncCodec.decodeCompletedFact(Data(contentsOf: url))
        guard case .fact(let fact) = message.payload else { throw invalid() }
        try validate(fact, index: index)
        return fact
    }

    func forEachMessage(at index: Int, consume: (Data, FolioleFramedSyncPayload) throws -> Void) throws {
        guard header.manifest.facts.indices.contains(index) else { throw invalid() }
        var tracker: FolioleFramedSyncFactFragmentTracker?
        var hash = SHA256()
        for fragmentIndex in 0..<4_130 {
            let finished = try withMessage(index: index, fragmentIndex: fragmentIndex) { bytes, last in
                let decoded = try FolioleFramedSyncCodec.decode(bytes, authenticatedFrameType: 3)
                switch decoded.payload {
                case .fact(let fact):
                    guard fragmentIndex == 0, last else { throw self.invalid() }
                    try self.validate(fact, index: index)
                    try self.checkDigest(Data(SHA256.hash(data: bytes)), index: index)
                case .factFragment(let fragment):
                    let declared = self.header.manifest.facts[index]
                    guard fragment.identity == declared.identity,
                          fragment.sharedStateHash == declared.sharedStateHash else { throw self.invalid() }
                    if tracker == nil { tracker = try .init(first: fragment, sequence: 0) }
                    try tracker!.append(fragment, sequence: UInt64(fragmentIndex))
                    hash.update(data: fragment.data)
                    guard last == tracker!.complete else { throw self.invalid() }
                    if last {
                        let digest = Data(hash.finalize())
                        guard digest == tracker!.encodedSHA256 else { throw self.invalid() }
                        try self.checkDigest(digest, index: index)
                    }
                default: throw self.invalid()
                }
                try consume(bytes, decoded.payload)
                return last
            }
            if finished { return }
        }
        throw invalid()
    }

    private func withMessage(index: Int, fragmentIndex: Int,
                             consume: (Data, Bool) throws -> Bool) throws -> Bool {
        try autoreleasepool {
            if let frames = frozenFrames[index], frames.indices.contains(fragmentIndex) {
                let frame = frames[fragmentIndex]
                let attributes = try FileManager.default.attributesOfItem(atPath: frame.url.path)
                guard let size = attributes[.size] as? NSNumber,
                      size.intValue <= FolioleFramedSyncLimits.maxFrameMessageBytes else { throw invalid() }
                return try FolioleFramedSyncPayloadWorker.withLoan(owner, direction: .outbound) { _ in
                    let bytes = try Data(contentsOf: frame.url)
                    guard Data(SHA256.hash(data: bytes)) == frame.digest else { throw invalid() }
                    return try consume(bytes, frame.last)
                }
            }
            var result: Bool?
            try read(index, fragmentIndex) { bytes, last in
                guard result == nil else { throw self.invalid() }
                result = try consume(bytes, last)
                let url = self.directory.appendingPathComponent("fact-message-\(UUID().uuidString)")
                try bytes.write(to: url, options: .atomic)
                self.frozenFrames[index, default: []].append(.init(url: url, digest: Data(SHA256.hash(data: bytes)), last: last))
            }
            guard let result else { throw invalid() }
            return result
        }
    }

    private func validate(_ fact: Foliole_Sync_V22_FactRecord, index: Int) throws {
        let declared = header.manifest.facts[index]
        guard fact.identity == declared.identity, fact.sharedStateHash == declared.sharedStateHash,
              Set(fact.blobs.filter(\.required).map(\.sha256)) == Set(declared.requiredBlobHashes),
              fact.blobs.allSatisfy({ header.manifest.blobs.contains($0) }) else { throw invalid() }
    }

    private func checkDigest(_ digest: Data, index: Int) throws {
        if let old = digests[index], old != digest { throw invalid() }
        digests[index] = digest
    }

    private func invalid() -> FolioleFramedSyncValidationError {
        .init("framed_sync_outbound_fact_source_changed")
    }
}
