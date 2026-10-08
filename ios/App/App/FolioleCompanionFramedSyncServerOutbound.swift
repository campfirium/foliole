import Foundation
import FolioleFramedSyncRuntime
import Network

enum FolioleCompanionFramedSyncServerOutbound {
    static func respond(_ connection: NWConnection, bridge: FolioleCompanionSyncGroupDataRequesting,
        context: FolioleFramedSyncTransferContext, groupKey: Data, requests: [Data], owner: FolioleFramedSyncPayloadBudget) throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("foliole-framed-response-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        do {
            let database = try FolioleFramedSyncTransferDatabase(url: FolioleFramedSyncOutboundSQLite.applicationDatabaseURL())
            let staging = try FolioleFramedSyncOutboundSQLite(database: database, owner: owner)
            let url = try build(requests, bridge: bridge, context: context, groupKey: groupKey,
                directory: directory, owner: owner, staging: staging)
            try FolioleFramedSyncFileResponse.sendFile(connection, url: url, directory: directory,
                deviceID: context.senderDeviceID, epoch: context.senderLibraryEpoch, owner: owner)
        } catch {
            try? FileManager.default.removeItem(at: directory)
            throw error
        }
    }

    static func build(_ requests: [Data], bridge: FolioleCompanionSyncGroupDataRequesting,
        context: FolioleFramedSyncTransferContext, groupKey: Data, directory: URL,
        owner: FolioleFramedSyncPayloadBudget, staging: FolioleFramedSyncOutboundSQLite) throws -> URL {
        return try FolioleFramedSyncServerBatchResponse.write(requests,
                to: directory.appendingPathComponent("response.body"), owner: owner, inspect: { encoded in
                    var payload = selection(context)
                    payload["difference_request_hex"] = encoded.hex
                    try FolioleFramedSyncBridgeFactSource.metadata("inspect_framed_outbound", payload: payload,
                        bridge: bridge, owner: owner) { _ in () }
                }, seal: { encoded, index in
                    try seal(encoded, index: index, bridge: bridge, context: context,
                        groupKey: groupKey, directory: directory, owner: owner, staging: staging)
                })
    }

    private static func seal(_ encoded: Data, index: Int, bridge: FolioleCompanionSyncGroupDataRequesting,
        context: FolioleFramedSyncTransferContext, groupKey: Data, directory: URL,
        owner: FolioleFramedSyncPayloadBudget, staging: FolioleFramedSyncOutboundSQLite) throws -> FolioleFramedSyncServerBatchResponse.Unit {
        try autoreleasepool {
            var payload = selection(context)
            payload["difference_request_hex"] = encoded.hex
            let resources = try FolioleFramedSyncBridgeFactSource.metadata("inspect_framed_outbound", payload: payload,
                bridge: bridge, owner: owner, consume: FolioleCompanionFramedSyncResources.describe)
            payload.merge(resources.0) { _, replacement in replacement }
            let metadata = try FolioleFramedSyncBridgeFactSource.preparedMetadata(bridge: bridge, selection: payload, owner: owner)
            let unitDirectory = directory.appendingPathComponent(String(index), isDirectory: true)
            try FileManager.default.createDirectory(at: unitDirectory, withIntermediateDirectories: true)
            let url = try responseFile(metadata.0, header: metadata.1, selection: payload, resources: resources.1,
                bridge: bridge, context: context, groupKey: groupKey, directory: unitDirectory, owner: owner, staging: staging)
            let size = try FolioleFramedSyncTransferSequence.transferSize(url)
            return .init(url: url, messageBytes: size.bytes,
                batchReady: FolioleFramedSyncOutboundPreparation.batchReady(metadata.0["batch_ready"]) && !size.compressed,
                dispose: { try? FileManager.default.removeItem(at: unitDirectory) })
        }
    }

    private static func responseFile(_ value: [String: Any], header: Foliole_Sync_V22_TransferHeader, selection: [String: Any], resources: [String: URL],
        bridge: FolioleCompanionSyncGroupDataRequesting, context: FolioleFramedSyncTransferContext,
        groupKey: Data, directory: URL, owner: FolioleFramedSyncPayloadBudget, staging: FolioleFramedSyncOutboundSQLite) throws -> URL {
        let transferID = try FolioleCompanionFramedSyncPreparedOutbound.digest(value, "transfer_id")
        let prepared = try FolioleCompanionFramedSyncPreparedOutbound.decodeMetadata(value, header: header, resourceFiles: resources, frozenBodyFile: {
            try FolioleFramedSyncBodyResponse.writeFrozen($0, selection: selection,
                transferID: transferID.hex, directory: directory, bridge: bridge, owner: owner)
        })
        let attempt = try staging.loadLatestReplayableAttempt(transferID: transferID) ??
            FolioleFramedSyncTransferWriter.prepare(groupKey: groupKey, context: context,
                prepared: prepared, source: FolioleFramedSyncBridgeFactSource.make(prepared: prepared,
                    selection: selection, bridge: bridge, directory: directory, owner: owner), staging: staging)
        guard attempt.transferID == transferID else {
            throw FolioleFramedSyncValidationError("framed_sync_transfer_identity_mismatch")
        }
        let url = directory.appendingPathComponent("response.body")
        guard let output = OutputStream(url: url, append: false) else {
            throw FolioleFramedSyncValidationError("framed_sync_stream_write_failed")
        }
        try FolioleFramedSyncTransferWriter.replay(attempt, staging: staging, output: output)
        return url
    }

    static func receipt(_ input: InputStream, bridge: FolioleCompanionSyncGroupDataRequesting,
        context: FolioleFramedSyncTransferContext, groupKey: Data, transferID: Data, owner: FolioleFramedSyncPayloadBudget) throws {
        try completeReceipt(input, bridge: bridge, context: context, groupKey: groupKey, transferID: transferID, owner: owner)
        let database = try FolioleFramedSyncTransferDatabase(url: FolioleFramedSyncOutboundSQLite.applicationDatabaseURL())
        try FolioleFramedSyncOutboundSQLite(database: database, owner: owner).discard(transferID: transferID)
    }

    static func completeReceipt(_ input: InputStream, bridge: FolioleCompanionSyncGroupDataRequesting,
        context: FolioleFramedSyncTransferContext, groupKey: Data, transferID: Data, owner: FolioleFramedSyncPayloadBudget) throws {
        try FolioleFramedSyncPayloadWorker.withLoan(owner, direction: .inbound, lane: .receipt) { _ in
        var payload = selection(context)
        payload["transfer_id"] = transferID.hex
        payload["receipt_only"] = true
        let contentID = try FolioleCompanionFramedSyncPreparedOutbound.digest(
            bridge.request("inspect_framed_outbound", payload), "content_id")
        let receipt = try FolioleFramedSyncReceiptReader.read(input, groupKey: groupKey, transferID: transferID,
            contentID: contentID,
            receiverDeviceID: context.receiverDeviceID, receiverLibraryEpoch: context.receiverLibraryEpoch)
        _ = try bridge.request("complete_framed_outbound", [
            "transfer_id": receipt.transferID.hex, "content_id": receipt.contentID.hex,
            "applied_state_hash": receipt.appliedStateHash.hex, "receiver_device_id": receipt.receiverDeviceID,
            "receiver_library_epoch": receipt.receiverLibraryEpoch
        ])
        }
    }

    private static func selection(_ context: FolioleFramedSyncTransferContext) -> [String: Any] {
        ["group_id": context.groupID, "sender_device_id": context.senderDeviceID,
         "sender_library_epoch": context.senderLibraryEpoch, "receiver_device_id": context.receiverDeviceID,
         "receiver_library_epoch": context.receiverLibraryEpoch]
    }
}
