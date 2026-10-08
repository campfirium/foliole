import CryptoKit
import Foundation
import FolioleFramedSyncRuntime

struct FolioleFramedSyncReceivedTransfer {
    let transferID: Data
}

final class FolioleFramedSyncTransferReceiver {
    private let database: FolioleFramedSyncTransferDatabase
    private let owner: FolioleFramedSyncPayloadBudget?
    private let resourceRoot: URL?
    var databaseURL: URL { database.url }

    init(database: FolioleFramedSyncTransferDatabase, resourceRoot: URL? = nil, owner: FolioleFramedSyncPayloadBudget? = nil) {
        self.owner = owner; self.database = database; self.resourceRoot = resourceRoot
    }

    func receipt(groupKey: Data, value: [String: Any]) throws -> Data {
        try FolioleFramedSyncReceiptWriter.encode(groupKey: groupKey, value: value, database: database)
    }

    func withPublishedResources<T>(
        transferID: Data, operation: ([String]) throws -> T
    ) throws -> T {
        let root = try resourceRoot ?? FolioleCompanionFramedSyncResources.attachmentRoot()
        let publication = try FolioleFramedSyncResourcePublication(
            database: database, root: root, transferID: transferID
        )
        let result = try operation(publication.storageKeys)
        publication.commit()
        return result
    }

    func receive(
        _ data: Data, groupKey: Data, context: FolioleFramedSyncTransferContext
    ) throws -> FolioleFramedSyncReceivedTransfer {
        try receive(InputStream(data: data), groupKey: groupKey, context: context)
    }

    func receive(
        _ fileURL: URL, groupKey: Data, context: FolioleFramedSyncTransferContext,
        acceptHeader: ((Foliole_Sync_V22_TransferHeader) throws -> Void)? = nil
    ) throws -> FolioleFramedSyncReceivedTransfer {
        guard let input = InputStream(url: fileURL) else {
            throw invalid("framed_sync_response_file_unavailable")
        }
        return try receive(input, groupKey: groupKey, context: context, acceptHeader: acceptHeader)
    }

    private func receive(
        _ input: InputStream, groupKey: Data, context: FolioleFramedSyncTransferContext,
        acceptHeader: ((Foliole_Sync_V22_TransferHeader) throws -> Void)? = nil
    ) throws -> FolioleFramedSyncReceivedTransfer {
        let reader = FolioleFramedSyncStreamReader(input: input)
        let preamble = try reader.nextPreamble()
        guard preamble.contextKind == 2, preamble.startingSequence == 0 else {
            throw invalid("transfer_preamble_required")
        }
        let root = try resourceRoot ?? FolioleCompanionFramedSyncResources.attachmentRoot()
        let staging = try FolioleFramedSyncInboundStagingAdapter(
            databaseURL: database.url, resourceRoot: root
        )
        var transfer = FolioleFramedSyncReceivingTransfer(preamble: preamble)
        while try FolioleFramedSyncPayloadWorker.withLoan(owner, direction: .inbound, { _ in
            guard let frame = try reader.nextFrame() else { return false }
            guard transfer.frameCount < 4_130 else { throw invalid("transfer_frame_limit_exceeded") }
            let plaintext = try FolioleFramedSyncFrameCrypto.decrypt(
                groupKey: groupKey, preamble: preamble, frame: frame,
                expectedSequence: UInt64(transfer.frameCount)
            )
            let message = try FolioleFramedSyncCodec.decode(
                plaintext, authenticatedFrameType: frame.header.frameType.rawValue
            )
            if transfer.frameCount == 0, case .transferHeader(let header) = message.payload {
                try context.validate(preamble, header: header)
                try acceptHeader?(header)
            }
            try transfer.append(frame, plaintext: plaintext, message: message, context: context)
            _ = try staging.commitAuthenticatedFrame(.init(
                transferID: preamble.contextID, attemptID: preamble.identifier,
                preamble: preamble.encoded, header: frame.headerBytes,
                ciphertext: frame.ciphertext, plaintext: plaintext
            ), context: context)
            try transfer.completeFragment(database: database)
            return true
        }) {}
        let resources = try staging.finishResources(
            transferID: preamble.contextID, attemptID: preamble.identifier
        )
        try FolioleFramedSyncPayloadWorker.withLoan(owner, direction: .inbound) { _ in
            try transfer.finish(resourceHashes: resources, database: database)
            try markReady(transfer)
        }
        return .init(transferID: preamble.contextID)
    }

    private func markReady(_ value: FolioleFramedSyncReceivingTransfer) throws {
        guard let header = value.header else { throw invalid("transfer_header_required") }
        try database.transaction {
            try database.execute("DELETE FROM framed_sync_ios_blob_pins WHERE transfer_id = ?", [value.transferID])
            let bodies = FolioleFramedSyncBodyFrameIndex(database: database,
                transferID: value.transferID, attemptID: value.attemptID)
            for reference in header.manifest.blobs
                where reference.role == .nodeBody || reference.role == .externalDocument {
                guard reference.byteLength <= 1_048_576 else { throw invalid("blob_size_limit_exceeded") }
                let available = try database.rows("SELECT byte_length, data FROM framed_sync_ios_available_blobs WHERE sha256 = ?",
                    [reference.sha256]).first
                let data: Data
                if let available {
                    guard let length = available[0] as? Int, UInt64(length) == reference.byteLength,
                          let stored = available[1] as? Data else { throw invalid("blob_available_identity_conflict") }
                    data = stored
                } else if let entry = value.bodyFrames[reference.sha256] {
                    data = try bodies.data(for: entry, hash: reference.sha256)
                } else if reference.byteLength == 0 { data = Data() }
                else if !reference.required { continue }
                else { throw invalid("required_blob_unavailable") }
                guard reference.byteLength <= 1_048_576,
                      UInt64(data.count) == reference.byteLength,
                      String(data: data, encoding: .utf8) != nil,
                      Data(SHA256.hash(data: data)) == reference.sha256 else {
                    throw invalid("inbound_attempt_manifest_mismatch")
                }
                try database.execute("INSERT OR IGNORE INTO framed_sync_ios_available_blobs VALUES (?, ?, ?)",
                                     [reference.sha256, reference.byteLength, data])
                let stored = try database.rows("SELECT byte_length, data FROM framed_sync_ios_available_blobs WHERE sha256 = ?",
                    [reference.sha256]).first
                guard let length = stored?[0] as? Int, UInt64(length) == reference.byteLength,
                      stored?[1] as? Data == data else { throw invalid("blob_available_identity_conflict") }
                try pin(reference, transferID: value.transferID)
            }
            try database.execute("""
                UPDATE framed_sync_ios_transfers SET state = 'ready_to_apply'
                WHERE transfer_id = ? AND active_attempt_id = ? AND state = 'receiving'
                """, [value.transferID, value.attemptID])
            try FolioleFramedSyncCompletedInboundCleanup.retireReadyCopies(database: database, transferID: value.transferID)
        }
    }

    private func pin(_ reference: Foliole_Sync_V22_BlobReference, transferID: Data) throws {
        try database.execute("INSERT INTO framed_sync_ios_blob_pins VALUES (?, ?, ?, ?, ?)", [
            transferID, reference.sha256, reference.byteLength,
            Int(reference.role.rawValue), reference.required ? 1 : 0
        ])
    }

    private func invalid(_ code: String) -> FolioleFramedSyncValidationError { .init(code) }
}
