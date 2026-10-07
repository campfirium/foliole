import Capacitor
import CryptoKit
import Foundation
import FolioleFramedSyncRuntime

extension FolioleCompanionSyncPlugin {
    @objc func sendFramedSyncTransfer(_ call: CAPPluginCall) {
        Task.detached { [weak self] in
            guard let self else { return call.reject("Companion Sync plugin is unavailable") }
            do { call.resolve(try await self.sendFramedTransfer(call)) }
            catch { call.reject("Failed to send framed Sync transfer: \(error.localizedDescription)", nil, error) }
        }
    }

    private func sendFramedTransfer(_ call: CAPPluginCall) async throws -> [String: Any] {
        let groupID = try framedRequired(call, "sync_group_id")
        let endpoint = try framedRequired(call, "endpoint_url")
        let receiverDeviceID = try framedRequired(call, "receiver_device_id")
        let receiverEpoch = try framedRequired(call, "receiver_library_epoch")
        let credential = try groupData.request("load_current_credential", ["group_id": groupID])
        let senderDeviceID = try required(credential, "device_id")
        let workgroupKey = try required(credential, "workgroup_key")
        let state = try groupData.request("load_member_state", [:])
        let senderEpoch = try required(state, "library_epoch")
        guard let includeCurrentNode = call.getBool("include_current_node") else {
            throw invalid("include_current_node_required")
        }
        var selection: [String: Any] = [
            "object_type": try framedRequired(call, "object_type"),
            "group_id": groupID, "object_id": try framedRequired(call, "object_id"),
            "include_current_node": includeCurrentNode,
            "required_relation_ids": try framedStringArray(call, "required_relation_ids"),
            "review_fact_ids": try framedStringArray(call, "review_fact_ids"),
            "state_fact_ids": try framedStringArray(call, "state_fact_ids"),
            "sender_device_id": senderDeviceID, "sender_library_epoch": senderEpoch,
            "receiver_device_id": receiverDeviceID, "receiver_library_epoch": receiverEpoch
        ]
        if let transferID = call.getString("transfer_id") { selection["transfer_id"] = transferID }
        let inspected = try groupData.request("inspect_framed_outbound", selection)
        let resources = try FolioleCompanionFramedSyncResources.describe(inspected)
        selection.merge(resources.0) { _, replacement in replacement }
        let preparedValue = try groupData.request("prepare_framed_outbound", selection)
        let groupKey = try Base64URL.decode(workgroupKey)
        guard groupKey.count == 32 else { throw invalid("sync_group_key_invalid") }
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("foliole-framed-outbound-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let prepared = try FolioleCompanionFramedSyncPreparedOutbound.decode(
            preparedValue, resourceFiles: resources.1, verifiedBodyFile: { reference in
                try self.preparedFramedBody(reference, selection: selection,
                    transferID: self.required(preparedValue, "transfer_id"), directory: directory)
            }
        )
        let context = FolioleFramedSyncTransferContext(
            groupID: groupID, senderDeviceID: senderDeviceID, senderLibraryEpoch: senderEpoch,
            receiverDeviceID: receiverDeviceID, receiverLibraryEpoch: receiverEpoch
        )
        return try await sendPreparedFramedTransfer(
            prepared, context: context, groupKey: groupKey, workgroupKey: workgroupKey,
            endpoint: endpoint, directory: directory
        )
    }

    private func sendPreparedFramedTransfer(
        _ prepared: FolioleCompanionFramedSyncPreparedOutbound, context: FolioleFramedSyncTransferContext,
        groupKey: Data, workgroupKey: String, endpoint: String, directory: URL
    ) async throws -> [String: Any] {
        let groupID = context.groupID
        let senderDeviceID = context.senderDeviceID
        let senderEpoch = context.senderLibraryEpoch
        let receiverDeviceID = context.receiverDeviceID
        let receiverEpoch = context.receiverLibraryEpoch
        let database = try FolioleFramedSyncTransferDatabase(url: FolioleFramedSyncOutboundSQLite.applicationDatabaseURL())
        let staging = try FolioleFramedSyncOutboundSQLite(database: database)
        try staging.discard(transferID: prepared.transferID)
        defer { try? staging.discard(transferID: prepared.transferID) }
        let attempt = try staging.loadLatestReplayableAttempt(transferID: prepared.transferID) ??
            FolioleFramedSyncTransferWriter.prepare(
                groupKey: groupKey, context: context, facts: prepared.facts,
                blobs: prepared.blobs, staging: staging
            )
        guard attempt.transferID == prepared.transferID else {
            throw invalid("framed_sync_transfer_identity_mismatch")
        }
        let path = try framedPath(senderDeviceID, senderEpoch, receiverDeviceID, receiverEpoch)
        let requestURL = directory.appendingPathComponent("request.bin")
        let responseURL = directory.appendingPathComponent("response.bin")
        guard let output = OutputStream(url: requestURL, append: false) else {
            throw invalid("framed_sync_stream_write_failed")
        }
        try FolioleFramedSyncTransferWriter.replay(attempt, staging: staging, output: output)
        let headers = try framedHeaders(
            groupID: groupID, deviceID: senderDeviceID, workgroupKey: workgroupKey,
            path: path, bodyURL: requestURL
        )
        guard let base = URL(string: endpoint), let url = URL(string: path, relativeTo: base) else {
            throw invalid("framed_sync_endpoint_invalid")
        }
        _ = try await FolioleFramedSyncHTTPTransport.post(
            endpoint: url.absoluteURL, peer: .init(
                groupID: groupID, deviceID: receiverDeviceID,
                libraryEpoch: receiverEpoch, memberAuthHeaders: headers
            ), requestBodyURL: requestURL, responseBodyURL: responseURL
        )
        let receiptData = try Data(contentsOf: responseURL)
        let receipt = try FolioleFramedSyncReceiptReader.read(
            receiptData, groupKey: groupKey, transferID: attempt.transferID, contentID: prepared.contentID,
            receiverDeviceID: receiverDeviceID, receiverLibraryEpoch: receiverEpoch
        )
        let result: [String: Any] = [
            "applied_state_hash": receipt.appliedStateHash.hex,
            "content_id": receipt.contentID.hex,
            "receiver_device_id": receipt.receiverDeviceID,
            "receiver_library_epoch": receipt.receiverLibraryEpoch,
            "transfer_id": receipt.transferID.hex
        ]
        _ = try groupData.request("complete_framed_outbound", result)
        try staging.discard(transferID: prepared.transferID)
        return result
    }

    func framedPost(
        endpoint: String, path: String, peer: FolioleFramedSyncHTTPPeer, body: Data
    ) async throws -> Data {
        try await withFramedPostResponseFile(
            endpoint: endpoint, path: path, peer: peer, body: body
        ) { try Data(contentsOf: $0) }
    }

    func withFramedPostResponseFile<T>(
        endpoint: String, path: String, peer: FolioleFramedSyncHTTPPeer, body: Data,
        consume: (URL) throws -> T
    ) async throws -> T {
        guard let base = URL(string: endpoint), let url = URL(string: path, relativeTo: base) else {
            throw invalid("framed_sync_endpoint_invalid")
        }
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("foliole-framed-outbound-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let requestURL = directory.appendingPathComponent("request.bin")
        let responseURL = directory.appendingPathComponent("response.bin")
        try body.write(to: requestURL, options: .atomic)
        _ = try await FolioleFramedSyncHTTPTransport.post(
            endpoint: url.absoluteURL, peer: peer,
            requestBodyURL: requestURL, responseBodyURL: responseURL
        )
        return try consume(responseURL)
    }

    func framedHeaders(
        groupID: String, deviceID: String, workgroupKey: String, path: String, body: Data
    ) -> [String: String] {
        let timestamp = ISO8601DateFormatter().string(from: Date())
        let nonce = UUID().uuidString.lowercased()
        let digest = Data(SHA256.hash(data: body)).hex
        let canonical = ["POST", path, timestamp, nonce, digest].joined(separator: "\n")
        let signature = HMAC<SHA256>.authenticationCode(
            for: Data(canonical.utf8), using: SymmetricKey(data: Data(workgroupKey.utf8))
        ).map { String(format: "%02x", $0) }.joined()
        return ["X-Device-Id": deviceID, "X-Nonce": nonce, "X-Signature": signature,
                "X-Timestamp": timestamp, "X-Sync-Group-Id": groupID,
                "X-Foliole-Body-Sha256": digest]
    }

    func framedHeaders(
        groupID: String, deviceID: String, workgroupKey: String, path: String, bodyURL: URL
    ) throws -> [String: String] {
        let handle = try FileHandle(forReadingFrom: bodyURL)
        defer { try? handle.close() }
        var hasher = SHA256()
        while let chunk = try handle.read(upToCount: 64 * 1024), !chunk.isEmpty {
            hasher.update(data: chunk)
        }
        let timestamp = ISO8601DateFormatter().string(from: Date())
        let nonce = UUID().uuidString.lowercased()
        let digest = Data(hasher.finalize()).hex
        let canonical = ["POST", path, timestamp, nonce, digest].joined(separator: "\n")
        let signature = HMAC<SHA256>.authenticationCode(
            for: Data(canonical.utf8), using: SymmetricKey(data: Data(workgroupKey.utf8))
        ).map { String(format: "%02x", $0) }.joined()
        return ["X-Device-Id": deviceID, "X-Nonce": nonce, "X-Signature": signature,
                "X-Timestamp": timestamp, "X-Sync-Group-Id": groupID,
                "X-Foliole-Body-Sha256": digest]
    }

    func framedPath(
        _ senderDeviceID: String, _ senderEpoch: String,
        _ receiverDeviceID: String, _ receiverEpoch: String
    ) throws -> String {
        var value = URLComponents(); value.path = "/companion/framed-sync"
        value.queryItems = [
            .init(name: "initiator_device_id", value: senderDeviceID),
            .init(name: "initiator_library_epoch", value: senderEpoch),
            .init(name: "responder_device_id", value: receiverDeviceID),
            .init(name: "responder_library_epoch", value: receiverEpoch)
        ]
        guard let path = value.string else { throw invalid("framed_sync_identity_context_invalid") }
        return path
    }

    func framedRequired(_ call: CAPPluginCall, _ key: String) throws -> String {
        guard let value = call.getString(key)?.trimmingCharacters(in: .whitespacesAndNewlines),
              !value.isEmpty else { throw invalid("\(key)_required") }
        return value
    }

    private func framedStringArray(_ call: CAPPluginCall, _ key: String) throws -> [String] {
        guard let raw = call.getArray(key) else { throw invalid("\(key)_required") }
        let values = raw.compactMap { ($0 as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) }
        guard values.count == raw.count, values.allSatisfy({ !$0.isEmpty }),
              Set(values).count == values.count else { throw invalid("\(key)_invalid") }
        return values
    }

}
