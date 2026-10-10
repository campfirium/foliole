import Foundation

enum FolioleFramedSyncPayloadValidator {
    private typealias Value = FolioleFramedSyncValueValidator

    static func validate(_ message: Foliole_Sync_V22_ProtocolMessage) throws -> FolioleFramedSyncPayload {
        guard let payload = message.payload else {
            throw FolioleFramedSyncValidationError("protocol_payload_case_invalid")
        }
        switch payload {
        case .handshake(let value): try handshake(value); return .handshake(value)
        case .handshakeAcceptance(let value): try acceptance(value); return .handshakeAcceptance(value)
        case .inventoryBegin(let value): try inventoryBegin(value); return .inventoryBegin(value)
        case .inventoryChunk(let value): try inventoryChunk(value); return .inventoryChunk(value)
        case .inventoryEnd(let value): try inventoryEnd(value); return .inventoryEnd(value)
        case .differenceRequest(let value): try difference(value); return .differenceRequest(value)
        case .transferProposal(let value): try proposal(value); return .transferProposal(value)
        case .blobOffer(let value): try blobOffer(value); return .blobOffer(value)
        case .missingBlobSet(let value): try missingBlobs(value); return .missingBlobSet(value)
        case .transferHeader(let value): try header(value); return .transferHeader(value)
        case .fact(let value): try Value.fact(value); return .fact(value)
        case .factFragment(let value): try factFragment(value); return .factFragment(value)
        case .blobChunk(let value): try blobChunk(value); return .blobChunk(value)
        case .transferTrailer(let value): try trailer(value); return .transferTrailer(value)
        case .transferReceipt(let value): try receipt(value); return .transferReceipt(value)
        case .roundReceipt(let value): try roundReceipt(value); return .roundReceipt(value)
        case .transferTermination(let value): try termination(value); return .transferTermination(value)
        case .error(let value): try protocolError(value); return .protocolError(value)
        }
    }

    private static func handshake(_ value: Foliole_Sync_V22_Handshake) throws {
        try version(value.protocolVersion)
        try Value.text(value.groupID, "group_id")
        try Value.text(value.deviceID, "device_id")
        try Value.text(value.libraryEpoch, "library_epoch")
        try Value.fixed(value.sessionID, count: FolioleFramedSyncLimits.identifierBytes, "session_id")
        try Value.capabilities(value.capabilities)
    }

    private static func acceptance(_ value: Foliole_Sync_V22_HandshakeAcceptance) throws {
        try version(value.protocolVersion)
        try Value.fixed(value.sessionID, count: FolioleFramedSyncLimits.identifierBytes, "session_id")
        try Value.capabilities(value.capabilities)
    }

    private static func inventoryBegin(_ value: Foliole_Sync_V22_InventoryBegin) throws {
        try roundID(value.roundID)
        try Value.list(value.detailGlobalIds, limit: FolioleFramedSyncLimits.maxInventoryEntries)
        for id in value.detailGlobalIds { try Value.text(id, "detail_global_id") }
        try Value.unique(value.detailGlobalIds, "detail_global_id")
        guard value.entryCount <= UInt64(FolioleFramedSyncLimits.maxInventoryEntries) else {
            throw FolioleFramedSyncValidationError("inventory_entry_limit_exceeded")
        }
    }

    private static func inventoryChunk(_ value: Foliole_Sync_V22_InventoryChunk) throws {
        try roundID(value.roundID)
        try Value.list(value.entries, limit: FolioleFramedSyncLimits.maxInventoryEntriesPerFrame)
        var keys = [String]()
        for entry in value.entries {
            try Value.text(entry.objectType, "object_type")
            try Value.text(entry.globalID, "global_id")
            try Value.digest(entry.sharedStateHash, "shared_state_hash")
            try stringList(entry.frontierFactIds, "frontierFactIds")
            try stringList(entry.requiredRelationIds, "requiredRelationIds")
            try stringList(entry.reviewFactIds, "reviewFactIds")
            try stringList(entry.stateFactIds, "stateFactIds")
            try stringList(entry.versionStates, "versionStates")
            try digestList(entry.resourceHashes, "resource_hash", FolioleFramedSyncLimits.maxBlobsPerTransfer)
            keys.append("\(entry.objectType)\0\(entry.globalID)")
        }
        try Value.unique(keys, "inventory_entry")
    }

    private static func inventoryEnd(_ value: Foliole_Sync_V22_InventoryEnd) throws {
        try roundID(value.roundID)
        try Value.digest(value.inventoryHash, "inventory_hash")
    }

    private static func difference(_ value: Foliole_Sync_V22_DifferenceRequest) throws {
        try roundID(value.roundID)
        try Value.identities(value.facts)
        if !value.sourceStateHash.isEmpty { try Value.digest(value.sourceStateHash, "source_state_hash") }
        try digestList(value.blobHashes, "blob_hash", FolioleFramedSyncLimits.maxBlobsPerTransfer)
    }

    private static func proposal(_ value: Foliole_Sync_V22_TransferProposal) throws {
        try Value.digest(value.transferID, "transfer_id")
        try Value.digest(value.contentID, "content_id")
        try Value.text(value.senderDeviceID, "senderDeviceId")
        try Value.text(value.senderLibraryEpoch, "senderLibraryEpoch")
        try Value.text(value.receiverDeviceID, "receiverDeviceId")
        try Value.text(value.receiverLibraryEpoch, "receiverLibraryEpoch")
        guard value.factCount <= UInt64(FolioleFramedSyncLimits.maxFactsPerTransfer),
              value.blobCount <= UInt64(FolioleFramedSyncLimits.maxBlobsPerTransfer),
              value.totalBlobBytes <= FolioleFramedSyncLimits.maxTransferBytes else {
            throw FolioleFramedSyncValidationError("transfer_proposal_limit_exceeded")
        }
    }

    private static func blobOffer(_ value: Foliole_Sync_V22_BlobOffer) throws {
        try Value.digest(value.transferID, "transfer_id")
        _ = try Value.blobs(value.blobs, name: "blob_offer")
    }

    private static func missingBlobs(_ value: Foliole_Sync_V22_MissingBlobSet) throws {
        try Value.digest(value.transferID, "transfer_id")
        try digestList(value.missingHashes, "missing_blob_hash", FolioleFramedSyncLimits.maxBlobsPerTransfer)
    }

    private static func header(_ value: Foliole_Sync_V22_TransferHeader) throws {
        try Value.digest(value.transferID, "transfer_id")
        try Value.fixed(value.attemptID, count: FolioleFramedSyncLimits.identifierBytes, "attempt_id")
        guard value.hasManifest else {
            throw FolioleFramedSyncValidationError("protocol_object_required")
        }
        try Value.manifest(value.manifest)
    }

    private static func factFragment(_ value: Foliole_Sync_V22_FactFragment) throws {
        guard value.hasIdentity else { throw FolioleFramedSyncValidationError("protocol_object_required") }
        _ = try Value.identity(value.identity)
        try Value.digest(value.sharedStateHash, "shared_state_hash")
        try Value.digest(value.encodedSha256, "encoded_sha256")
        guard value.totalByteLength > UInt64(FolioleFramedSyncLimits.maxFrameMessageBytes),
              value.totalByteLength <= UInt64(FolioleFramedSyncLimits.maxFragmentedFactBytes),
              !value.data.isEmpty, value.data.count <= FolioleFramedSyncLimits.blobChunkBytes,
              value.offset < value.totalByteLength,
              UInt64(value.data.count) <= value.totalByteLength - value.offset else {
            throw FolioleFramedSyncValidationError("fact_fragment_range_invalid")
        }
    }

    private static func blobChunk(_ value: Foliole_Sync_V22_BlobChunk) throws {
        try Value.digest(value.transferID, "transfer_id")
        try Value.digest(value.blobHash, "blob_hash")
        let count = UInt64(value.data.count)
        guard count <= 1_048_576,
              value.offset <= FolioleFramedSyncLimits.maxBlobBytes,
              count <= FolioleFramedSyncLimits.maxBlobBytes - value.offset else {
            throw FolioleFramedSyncValidationError("blob_chunk_range_invalid")
        }
    }

    private static func trailer(_ value: Foliole_Sync_V22_TransferTrailer) throws {
        try Value.digest(value.transferID, "transfer_id")
        try Value.digest(value.manifestHash, "manifest_hash")
        guard value.factCount <= UInt64(FolioleFramedSyncLimits.maxFactsPerTransfer),
              value.blobCount <= UInt64(FolioleFramedSyncLimits.maxBlobsPerTransfer) else {
            throw FolioleFramedSyncValidationError("transfer_trailer_limit_exceeded")
        }
    }

    private static func receipt(_ value: Foliole_Sync_V22_TransferReceipt) throws {
        try Value.digest(value.transferID, "transfer_id")
        try Value.digest(value.contentID, "content_id")
        try Value.digest(value.appliedStateHash, "applied_state_hash")
        try Value.text(value.receiverDeviceID, "receiver_device_id")
        try Value.text(value.receiverLibraryEpoch, "receiver_library_epoch")
    }

    private static func roundReceipt(_ value: Foliole_Sync_V22_RoundReceipt) throws {
        try roundID(value.roundID)
        guard (1...2).contains(value.result.rawValue) else {
            throw FolioleFramedSyncValidationError("round_result_invalid")
        }
        try Value.identities(value.deferredFacts)
    }

    private static func termination(_ value: Foliole_Sync_V22_TransferTermination) throws {
        try Value.digest(value.transferID, "transfer_id")
        try Value.text(value.memberID, "member_id")
    }

    private static func protocolError(_ value: Foliole_Sync_V22_ProtocolError) throws {
        guard (1...8).contains(value.code.rawValue) else {
            throw FolioleFramedSyncValidationError("error_code_invalid")
        }
        try Value.text(value.message, "error_message")
        if !value.transferID.isEmpty { try Value.digest(value.transferID, "transfer_id") }
    }

    private static func version(_ value: UInt32) throws {
        guard value == FolioleFramedSyncLimits.protocolVersion else {
            throw FolioleFramedSyncValidationError("protocol_version_invalid")
        }
    }

    private static func roundID(_ value: Data) throws {
        try Value.fixed(value, count: FolioleFramedSyncLimits.identifierBytes, "round_id")
    }

    private static func stringList(_ values: [String], _ name: String) throws {
        try Value.list(values, limit: FolioleFramedSyncLimits.maxInventoryFactIDsPerEntry)
        try values.forEach { try Value.text($0, name) }
        try Value.unique(values, name)
    }

    private static func digestList(_ values: [Data], _ name: String, _ limit: Int) throws {
        try Value.list(values, limit: limit)
        try values.forEach { try Value.digest($0, name) }
        try Value.unique(values, name)
    }
}
