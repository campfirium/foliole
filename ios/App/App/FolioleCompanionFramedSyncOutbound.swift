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
        let preparedValue = try groupData.request("prepare_framed_outbound", [
            "group_id": groupID, "object_id": try framedRequired(call, "object_id"),
            "include_current_node": includeCurrentNode,
            "required_relation_ids": try framedStringArray(call, "required_relation_ids"),
            "review_fact_ids": try framedStringArray(call, "review_fact_ids"),
            "sender_device_id": senderDeviceID, "sender_library_epoch": senderEpoch,
            "receiver_device_id": receiverDeviceID, "receiver_library_epoch": receiverEpoch
        ])
        let groupKey = try Base64URL.decode(workgroupKey)
        guard groupKey.count == 32 else { throw invalid("sync_group_key_invalid") }
        let prepared = try FolioleCompanionFramedSyncPreparedOutbound.decode(preparedValue)
        let context = FolioleFramedSyncTransferContext(
            groupID: groupID, senderDeviceID: senderDeviceID, senderLibraryEpoch: senderEpoch,
            receiverDeviceID: receiverDeviceID, receiverLibraryEpoch: receiverEpoch
        )
        let database = try FolioleFramedSyncTransferDatabase(url: framedOutboundDatabaseURL())
        let staging = FolioleFramedSyncOutboundSQLite(database: database)
        let attempt = try FolioleFramedSyncTransferWriter.prepare(
            groupKey: groupKey, context: context, facts: prepared.facts,
            blobs: prepared.blobs, staging: staging
        )
        guard attempt.transferID == prepared.transferID else {
            throw invalid("framed_sync_transfer_identity_mismatch")
        }
        let body = try FolioleFramedSyncTransferWriter.replay(attempt, staging: staging)
        let path = try framedPath(senderDeviceID, senderEpoch, receiverDeviceID, receiverEpoch)
        let headers = framedHeaders(
            groupID: groupID, deviceID: senderDeviceID, workgroupKey: workgroupKey,
            path: path, body: body
        )
        let receiptData = try await framedPost(
            endpoint: endpoint, path: path, peer: .init(
                groupID: groupID, deviceID: receiverDeviceID,
                libraryEpoch: receiverEpoch, memberAuthHeaders: headers
            ), body: body
        )
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

    private func framedOutboundDatabaseURL() throws -> URL {
        let root = try FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask,
            appropriateFor: nil, create: true
        )
        return root.appendingPathComponent("Foliole/framed-sync/outbound.sqlite")
    }
}
