import Foundation

public enum FolioleFramedSyncLimits {
    static let protocolVersion: UInt32 = 22
    static let digestBytes = 32
    static let identifierBytes = 16
    static let blobChunkBytes = 512 * 1024
    static let maxBlobBytes: UInt64 = 8 * 1024 * 1024 * 1024
    public static let maxBodyBytes: UInt64 = 1_048_576
    static let maxTransferBytes: UInt64 = 32 * 1024 * 1024 * 1024
    static let maxBlobsPerTransfer = 4_096
    static let maxCanonicalDepth = 32
    static let maxCanonicalStringBytes = 1536 * 1024
    public static let maxCanonicalManifestBytes = 8 * 1024 * 1024
    static let maxDecodedRepeatedItems = 100_000
    static let maxFactsPerTransfer = 4_096
    public static let maxInventoryEntries = 100_000
    public static let maxInventoryEntriesPerFrame = 128
    public static let maxInventoryFactIDsPerEntry = 100_000
    public static let maxSessionBytes = 64 * 1024 * 1024
    public static let maxSessionFrames = 16_384
    static let maxFactBlobEdges = 4_096
    static let maxProtocolCapabilities = 64
    static let maxProtocolStringBytes = 64 * 1024
    public static let maxControlMessageBytes = 768 * 1024
    static let maxManifestBytes = 768 * 1024
    public static let maxFrameMessageBytes = 2 * 1024 * 1024
    public static let maxFragmentedFactBytes = 2 * maxCanonicalManifestBytes
}

public enum FolioleFramedSyncFrameType: UInt16, Sendable {
    case sessionControl = 1
    case transferHeader = 2
    case fact = 3
    case blobChunk = 4
    case transferTrailer = 5
    case transferReceipt = 6
}

public struct FolioleFramedSyncValidationError: Error, Equatable, LocalizedError {
    public let code: String

    public init(_ code: String) {
        self.code = code
    }

    public var errorDescription: String? { code }
}

public enum FolioleFramedSyncPayload: Sendable {
    case handshake(Foliole_Sync_V22_Handshake)
    case handshakeAcceptance(Foliole_Sync_V22_HandshakeAcceptance)
    case inventoryBegin(Foliole_Sync_V22_InventoryBegin)
    case inventoryChunk(Foliole_Sync_V22_InventoryChunk)
    case inventoryEnd(Foliole_Sync_V22_InventoryEnd)
    case differenceRequest(Foliole_Sync_V22_DifferenceRequest)
    case transferProposal(Foliole_Sync_V22_TransferProposal)
    case blobOffer(Foliole_Sync_V22_BlobOffer)
    case missingBlobSet(Foliole_Sync_V22_MissingBlobSet)
    case transferHeader(Foliole_Sync_V22_TransferHeader)
    case fact(Foliole_Sync_V22_FactRecord)
    case factFragment(Foliole_Sync_V22_FactFragment)
    case blobChunk(Foliole_Sync_V22_BlobChunk)
    case transferTrailer(Foliole_Sync_V22_TransferTrailer)
    case transferReceipt(Foliole_Sync_V22_TransferReceipt)
    case roundReceipt(Foliole_Sync_V22_RoundReceipt)
    case transferTermination(Foliole_Sync_V22_TransferTermination)
    case protocolError(Foliole_Sync_V22_ProtocolError)

    public var corpusName: String {
        switch self {
        case .handshake: "handshake"
        case .handshakeAcceptance: "handshake_acceptance"
        case .inventoryBegin: "inventory_begin"
        case .inventoryChunk: "inventory_chunk"
        case .inventoryEnd: "inventory_end"
        case .differenceRequest: "difference_request"
        case .transferProposal: "transfer_proposal"
        case .blobOffer: "blob_offer"
        case .missingBlobSet: "missing_blob_set"
        case .transferHeader: "transfer_header"
        case .fact: "fact"
        case .factFragment: "fact_fragment"
        case .blobChunk: "blob_chunk"
        case .transferTrailer: "transfer_trailer"
        case .transferReceipt: "transfer_receipt"
        case .roundReceipt: "round_receipt"
        case .transferTermination: "transfer_termination"
        case .protocolError: "error"
        }
    }
}
