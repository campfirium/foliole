import Foundation
import FolioleFramedSyncRuntime

final class FolioleFramedSyncFileReceiver {
    private static let receiving = NSLock()
    private let owner: FolioleFramedSyncPayloadBudget?
    private let testFiles: FolioleFramedSyncFiles?
    private let resourceRoot: URL?
    var databaseURL: URL { URL(fileURLWithPath: "/files") }

    init(owner: FolioleFramedSyncPayloadBudget? = nil) { self.owner = owner; testFiles = nil; resourceRoot = nil }

    init(files: FolioleFramedSyncFiles, resourceRoot: URL) {
        testFiles = files; self.resourceRoot = resourceRoot; owner = nil
    }

    private func storage() throws -> FolioleFramedSyncFiles {
        if let testFiles { return testFiles }
        let current = try FolioleFramedSyncPayloadBudgetRegistry.shared.requireCurrent()
        if let owner {
            try owner.requireActive()
            guard current === owner else { throw invalid("framed_sync_file_owner_mismatch") }
        }
        return try FolioleFramedSyncFiles(libraryKey: current.libraryKey)
    }

    func receipt(groupKey: Data, value: [String: Any]) throws -> Data {
        try FolioleFramedSyncReceiptWriter.encode(groupKey: groupKey, value: value, files: storage())
    }

    func withPublishedResources<T>(transferID: Data, operation: ([String]) throws -> T) throws -> T {
        let publication = try FolioleFramedSyncResourcePublication(files: storage(),
            root: resourceRoot ?? FolioleCompanionFramedSyncResources.attachmentRoot(), transferID: transferID)
        let result = try operation(publication.storageKeys)
        publication.commit()
        return result
    }

    func receive(_ fileURL: URL, groupKey: Data, context: FolioleFramedSyncTransferContext,
                 acceptHeader: ((Foliole_Sync_V22_TransferHeader) throws -> Void)? = nil) throws -> FolioleFramedSyncReceivedTransfer {
        Self.receiving.lock()
        defer { Self.receiving.unlock() }
        guard let input = InputStream(url: fileURL) else { throw invalid("framed_sync_response_file_unavailable") }
        let files = try storage()
        let reader = FolioleFramedSyncStreamReader(input: input)
        let preamble = try reader.nextPreamble()
        guard preamble.contextKind == 2, preamble.startingSequence == 0 else { throw invalid("transfer_preamble_required") }
        let frames = FolioleFramedSyncFileFrames(files: files)
        let blobs = try FolioleFramedSyncFileBlobs(files: files,
            root: resourceRoot ?? FolioleCompanionFramedSyncResources.attachmentRoot(), transferID: preamble.contextID, attemptID: preamble.identifier)
        let key = try FolioleFramedSyncFileRecords.directory(preamble.contextID) + "/transfer.json"
        var record = try FolioleFramedSyncFileRecords.read(files, key)
        var transfer = FolioleFramedSyncReceivingTransfer(preamble: preamble)
        var retained = false
        defer {
            if retained, let old = record?["header"] as? [String: Any],
               let attempt = try? FolioleFramedSyncFileRecords.bytes(old["attemptId"]), attempt != preamble.identifier {
                if let header = transfer.header { blobs.discardResources(header) }
                try? files.remove(FolioleFramedSyncFileRecords.attempt(preamble.contextID, preamble.identifier))
            }
        }
        while try FolioleFramedSyncPayloadWorker.withLoan(owner, direction: .inbound, { _ in
            guard let frame = try reader.nextFrame() else { return false }
            guard transfer.frameCount < 4_130 else { throw invalid("transfer_frame_limit_exceeded") }
            let plaintext = try FolioleFramedSyncFrameCrypto.decrypt(groupKey: groupKey, preamble: preamble,
                frame: frame, expectedSequence: UInt64(transfer.frameCount))
            let message = try FolioleFramedSyncCodec.decode(plaintext, authenticatedFrameType: frame.header.frameType.rawValue)
            if transfer.frameCount == 0, case .transferHeader(let header) = message.payload {
                try context.validate(preamble, header: header)
                try acceptHeader?(header)
                let admitted = try admit(files, key: key, prior: record, header: header, context: context)
                retained = admitted.retained
                record = admitted.record
            }
            try transfer.append(frame, plaintext: plaintext, message: message, context: context)
            var compact = false
            if case .blobChunk(let chunk) = message.payload {
                guard let header = transfer.header else { throw invalid("transfer_header_required") }
                try blobs.stage(chunk, header: header)
                compact = true
            }
            try frames.commit(.init(transferID: preamble.contextID, attemptID: preamble.identifier,
                preamble: preamble.encoded, header: frame.headerBytes, ciphertext: frame.ciphertext, plaintext: plaintext), compact: compact)
            try transfer.completeFragment { try frames.fact(preamble.contextID, preamble.identifier, $0) }
            return true
        }) {}
        guard let header = transfer.header, var ready = record else { throw invalid("transfer_header_required") }
        try FolioleFramedSyncPayloadWorker.withLoan(owner, direction: .inbound) { _ in
            let resources = try blobs.finish(header)
            try transfer.finish(resourceHashes: resources) { try frames.fact(preamble.contextID, preamble.identifier, $0) }
            if !retained {
                ready["verifiedManifest"] = Array(header.manifest.contentID)
                ready["state"] = "ready_to_apply"
                try FolioleFramedSyncFileRecords.write(files, key, ready)
            }
        }
        return .init(transferID: preamble.contextID)
    }

    private func admit(_ files: FolioleFramedSyncFiles, key: String, prior: [String: Any]?,
                       header: Foliole_Sync_V22_TransferHeader, context: FolioleFramedSyncTransferContext)
        throws -> (record: [String: Any], retained: Bool) {
        let proposal = try FolioleFramedSyncFileRecords.proposal(header, context)
        if let prior {
            guard let old = prior["proposal"] as? [String: Any], FolioleFramedSyncFileRecords.same(old, proposal) else {
                throw invalid("inbound_proposal_conflict")
            }
            if prior["receipt"] != nil || prior["state"] as? String == "ready_to_apply" {
                guard var old = prior["header"] as? [String: Any], let reservation = prior["reservationId"] as? String else {
                    throw invalid("inbound_header_identity_conflict")
                }
                old["attemptId"] = Array(header.attemptID)
                guard FolioleFramedSyncFileRecords.same(old,
                    FolioleFramedSyncFileRecords.header(header, proposal: proposal, reservation: reservation)) else {
                    throw invalid("inbound_header_identity_conflict")
                }
                return (prior, true)
            }
        }
        return (try prepare(files, key: key, prior: prior, header: header, proposal: proposal), false)
    }

    private func discardAttempt(_ files: FolioleFramedSyncFiles, transfer: Data, attempt: Data) throws {
        let path = try FolioleFramedSyncFileRecords.attempt(transfer, attempt)
        if try files.read(path + "/frames/0.frame") != nil {
            let plaintext = try FolioleFramedSyncFileFrames(files: files).plaintext(transfer, attempt, 0)
            let message = try Foliole_Sync_V22_ProtocolMessage(serializedBytes: plaintext)
            let blobs = try FolioleFramedSyncFileBlobs(files: files,
                root: resourceRoot ?? FolioleCompanionFramedSyncResources.attachmentRoot(), transferID: transfer, attemptID: attempt)
            blobs.discardResources(message.transferHeader)
        }
        try files.remove(path)
    }

    private func prepare(_ files: FolioleFramedSyncFiles, key: String, prior: [String: Any]?,
                         header: Foliole_Sync_V22_TransferHeader, proposal: [String: Any]) throws -> [String: Any] {
        let reservation = prior?["reservationId"] as? String ?? UUID().uuidString.lowercased()
        let declared = FolioleFramedSyncFileRecords.header(header, proposal: proposal, reservation: reservation)
        if let old = prior?["header"] as? [String: Any] {
            let attempt = try FolioleFramedSyncFileRecords.bytes(old["attemptId"])
            if attempt == header.attemptID {
                guard FolioleFramedSyncFileRecords.same(old, declared) else { throw invalid("inbound_header_identity_conflict") }
            } else { try discardAttempt(files, transfer: header.transferID, attempt: attempt) }
        }
        let value: [String: Any] = ["proposal": proposal, "reservationId": reservation, "header": declared, "state": "receiving"]
        try FolioleFramedSyncFileRecords.write(files, key, value)
        try files.write(FolioleFramedSyncFileRecords.attempt(header.transferID, header.attemptID) + "/offers.json",
            data: JSONSerialization.data(withJSONObject: header.manifest.blobs.map(FolioleFramedSyncFileRecords.blob)))
        return value
    }

    private func invalid(_ code: String) -> Error { FolioleFramedSyncValidationError(code) }
}
