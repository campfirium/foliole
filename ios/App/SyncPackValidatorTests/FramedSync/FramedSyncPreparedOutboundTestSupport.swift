import Foundation
@testable import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

enum FramedSyncPreparedOutboundFixture {
    static func headerBytes(facts: [Foliole_Sync_V22_FactRecord], contentID: Data,
                            transferID: Data, groupID: String = "fixture-group") throws -> [UInt8] {
        var header = Foliole_Sync_V22_TransferHeader()
        header.transferID = transferID; header.attemptID = Data(repeating: 0, count: 16)
        header.manifest.protocolVersion = 22; header.manifest.groupID = groupID
        header.manifest.contentID = contentID
        header.manifest.facts = facts.map { fact in
            var descriptor = Foliole_Sync_V22_FactDescriptor()
            descriptor.identity = fact.identity; descriptor.sharedStateHash = fact.sharedStateHash
            descriptor.requiredBlobHashes = fact.blobs.filter(\.required).map(\.sha256)
            return descriptor
        }
        var blobs = [Data: Foliole_Sync_V22_BlobReference]()
        for reference in facts.flatMap(\.blobs) { blobs[reference.sha256] = reference }
        header.manifest.blobs = blobs.values.sorted { $0.sha256.lexicographicallyPrecedes($1.sha256) }
        var message = Foliole_Sync_V22_ProtocolMessage(); message.payload = .transferHeader(header)
        return Array(try FolioleFramedSyncCodec.encode(
            FolioleFramedSyncCodec.validateOutbound(message, authenticatedFrameType: 2)))
    }
}
