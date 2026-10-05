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
        let prepared = try groupData.request("prepare_framed_outbound", [
            "group_id": groupID, "object_id": try framedRequired(call, "object_id"),
            "sender_device_id": senderDeviceID, "sender_library_epoch": senderEpoch,
            "receiver_device_id": receiverDeviceID, "receiver_library_epoch": receiverEpoch
        ])
        let groupKey = try Base64URL.decode(workgroupKey)
        guard groupKey.count == 32 else { throw invalid("sync_group_key_invalid") }
        let contentID = try framedDigest(prepared, "content_id")
        let expectedTransferID = try framedDigest(prepared, "transfer_id")
        let fact = try framedFact(prepared)
        let blobData = try framedBlobData(prepared)
        let context = FolioleFramedSyncTransferContext(
            groupID: groupID, senderDeviceID: senderDeviceID, senderLibraryEpoch: senderEpoch,
            receiverDeviceID: receiverDeviceID, receiverLibraryEpoch: receiverEpoch
        )
        let database = try FolioleFramedSyncTransferDatabase(url: framedOutboundDatabaseURL())
        let staging = FolioleFramedSyncOutboundSQLite(database: database)
        let attempt = try FolioleFramedSyncTransferWriter.prepare(
            groupKey: groupKey, context: context, facts: [fact],
            blobs: [.init(reference: try framedSingleBlob(fact), data: blobData)], staging: staging
        )
        guard attempt.transferID == expectedTransferID else {
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
            receiptData, groupKey: groupKey, transferID: attempt.transferID, contentID: contentID,
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

    private func framedPost(
        endpoint: String, path: String, peer: FolioleFramedSyncHTTPPeer, body: Data
    ) async throws -> Data {
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
        return try Data(contentsOf: responseURL)
    }

    private func framedHeaders(
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

    private func framedPath(
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

    private func framedFact(_ value: [String: Any]) throws -> Foliole_Sync_V22_FactRecord {
        guard let raw = value["fact_message_bytes"] as? [Any] else {
            throw invalid("framed_sync_fact_bytes_required")
        }
        let numbers = raw.compactMap { $0 as? NSNumber }
        guard numbers.count == raw.count else { throw invalid("framed_sync_fact_bytes_invalid") }
        let message = try FolioleFramedSyncCodec.decode(
            Data(numbers.map(\.uint8Value)), authenticatedFrameType: FolioleFramedSyncFrameType.fact.rawValue
        )
        guard case .fact(let fact) = message.payload else { throw invalid("framed_sync_fact_required") }
        return fact
    }

    private func framedBlobData(_ value: [String: Any]) throws -> Data {
        guard let blob = value["blob"] as? [String: Any],
              let text = blob["data_text"] as? String else { throw invalid("framed_sync_blob_required") }
        return Data(text.utf8)
    }

    private func framedSingleBlob(
        _ fact: Foliole_Sync_V22_FactRecord
    ) throws -> Foliole_Sync_V22_BlobReference {
        guard fact.blobs.count == 1, let blob = fact.blobs.first else {
            throw invalid("framed_sync_blob_set_unsupported")
        }
        return blob
    }

    private func framedDigest(_ value: [String: Any], _ key: String) throws -> Data {
        guard let text = value[key] as? String,
              text.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else {
            throw invalid("framed_sync_digest_invalid")
        }
        return Data(stride(from: 0, to: text.count, by: 2).compactMap { offset in
            let start = text.index(text.startIndex, offsetBy: offset)
            return UInt8(text[start..<text.index(start, offsetBy: 2)], radix: 16)
        })
    }

    private func framedRequired(_ call: CAPPluginCall, _ key: String) throws -> String {
        guard let value = call.getString(key)?.trimmingCharacters(in: .whitespacesAndNewlines),
              !value.isEmpty else { throw invalid("\(key)_required") }
        return value
    }

    private func framedOutboundDatabaseURL() throws -> URL {
        let root = try FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask,
            appropriateFor: nil, create: true
        )
        return root.appendingPathComponent("Foliole/framed-sync/outbound.sqlite")
    }
}
