import Foundation
import FolioleFramedSyncRuntime
import Network

extension FolioleCompanionSyncGroupJoinServer {
    func respondFramedTransfer(
        _ connection: NWConnection, _ request: FolioleCompanionHttpMessage,
        peer: String, localDevice: String, localEpoch: String,
        initiator: String, initiatorEpoch: String, groupKey: Data, owner: FolioleFramedSyncPayloadBudget
    ) throws {
        guard let prototype = framedTransfers, let rawBridge = dataBridge else { throw Self.invalid("sync_group_data_owner_unavailable") }
        let dataBridge = FolioleFramedSyncOwnedBridge(bridge: rawBridge, owner: owner)
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("foliole-framed-receipts-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var handedOff = false
        defer { if !handedOff { try? FileManager.default.removeItem(at: directory) } }
        let source: URL
        if let file = request.bodyFile { source = file.url }
        else {
            source = directory.appendingPathComponent("request.body")
            try FolioleFramedSyncPayloadWorker.withLoan(owner, direction: .inbound) { _ in try request.bodyData.write(to: source) }
        }
        let response = directory.appendingPathComponent("response.body")
        guard FileManager.default.createFile(atPath: response.path, contents: nil) else { throw Self.invalid("framed_sync_stream_write_failed") }
        let output = try FileHandle(forWritingTo: response)
        defer { try? output.close() }
        try FolioleFramedSyncTransferSequence.readEach(source, owner: owner) { unit in
            if unit.receipt {
                let original = FolioleFramedSyncTransferContext(groupID: provider.groupId,
                    senderDeviceID: localDevice, senderLibraryEpoch: localEpoch,
                    receiverDeviceID: peer, receiverLibraryEpoch: initiatorEpoch)
                guard let input = InputStream(url: unit.url) else { throw Self.invalid("framed_sync_response_file_unavailable") }
                try FolioleCompanionFramedSyncServerOutbound.receipt(input, bridge: dataBridge,
                    context: original, groupKey: groupKey, transferID: unit.preamble.contextID, owner: owner)
                try FolioleFramedSyncTransferSequence.appendReceipt(unit.url, to: output, owner: owner)
            } else {
                let receiver = try FolioleFramedSyncTransferReceiver(
                    database: FolioleFramedSyncTransferDatabase(url: prototype.databaseURL), owner: owner)
                try appendFramedTransferReceipt(unit.url, receiver: receiver, bridge: dataBridge, output: output,
                    peer: peer, localDevice: localDevice, localEpoch: localEpoch,
                    initiator: initiator, initiatorEpoch: initiatorEpoch, groupKey: groupKey, owner: owner)
            }
        }
        try output.synchronize(); try output.close()
        try FolioleFramedSyncFileResponse.sendFile(connection, url: response, directory: directory,
            deviceID: localDevice, epoch: localEpoch, owner: owner, lane: .receipt)
        handedOff = true
    }

    private func appendFramedTransferReceipt(_ file: URL, receiver framedTransfers: FolioleFramedSyncTransferReceiver,
        bridge dataBridge: FolioleCompanionSyncGroupDataRequesting, output: FileHandle,
        peer: String, localDevice: String, localEpoch: String, initiator: String, initiatorEpoch: String,
        groupKey: Data, owner: FolioleFramedSyncPayloadBudget) throws {
        let context = FolioleFramedSyncTransferContext(
            groupID: provider.groupId, senderDeviceID: initiator,
            senderLibraryEpoch: initiatorEpoch, receiverDeviceID: localDevice,
            receiverLibraryEpoch: localEpoch
        )
        let received = try framedTransfers.receive(file, groupKey: groupKey, context: context)
        let applied = try framedTransfers.withPublishedResources(
            transferID: received.transferID
        ) { resourceKeys in
            try dataBridge.request("apply_framed_transfer", [
                "staging_kind": "ios", "staging_path": framedTransfers.databaseURL.path,
                "transfer_id": received.transferID.hex,
                "sender_device_id": peer, "sender_library_epoch": initiatorEpoch,
                "receiver_device_id": localDevice, "receiver_library_epoch": localEpoch,
                "resource_storage_keys": resourceKeys
            ])
        }
        guard applied["transfer_id"] as? String == received.transferID.hex,
              applied["receiver_device_id"] as? String == localDevice,
              applied["receiver_library_epoch"] as? String == localEpoch else {
            throw Self.invalid("framed_sync_receipt_identity_mismatch")
        }
        try FolioleFramedSyncPayloadWorker.withLoan(owner, direction: .outbound, lane: .receipt) { _ in
            let receipt = try framedTransfers.receipt(groupKey: groupKey, value: applied)
            try output.write(contentsOf: receipt)
        }
    }
}
