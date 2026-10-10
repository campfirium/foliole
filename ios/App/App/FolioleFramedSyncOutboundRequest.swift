import Foundation
import FolioleFramedSyncRuntime

struct FolioleFramedSyncOutboundRequest {
    let endpoint: String
    let context: FolioleFramedSyncTransferContext
    let workgroupKey: String
    let groupKey: Data

    static func validateMetadata(_ value: [String: Any]) throws {
        guard JSONSerialization.isValidJSONObject(value),
              try JSONSerialization.data(withJSONObject: value, options: [.withoutEscapingSlashes]).count <= 768 * 1024 else {
            throw invalid("framed_sync_transfer_batch_metadata_limit_exceeded")
        }
    }

    static func decode(_ value: [String: Any], bridge: FolioleCompanionSyncGroupDataRequesting) throws -> Self {
        let group = try text(value, "sync_group_id")
        let credential = try bridge.request("load_current_credential", ["group_id": group])
        let state = try bridge.request("load_member_state", [:])
        let secret = try text(credential, "workgroup_key"), key = try Base64URL.decode(secret)
        guard key.count == 32 else { throw invalid("sync_group_key_invalid") }
        return .init(endpoint: try text(value, "endpoint_url"), context: .init(groupID: group,
            senderDeviceID: try text(credential, "device_id"), senderLibraryEpoch: try text(state, "library_epoch"),
            receiverDeviceID: try text(value, "receiver_device_id"), receiverLibraryEpoch: try text(value, "receiver_library_epoch")),
            workgroupKey: secret, groupKey: key)
    }

    func selections(_ raw: Any?) throws -> [[String: Any]] {
        guard let values = raw as? [[String: Any]], (1...128).contains(values.count) else {
            throw Self.invalid("framed_sync_transfer_batch_invalid")
        }
        return try values.map(selection)
    }

    func selection(_ value: [String: Any]) throws -> [String: Any] {
        guard let include = value["include_current_node"] as? Bool else { throw Self.invalid("include_current_node_required") }
        var result: [String: Any] = ["group_id": context.groupID,
            "object_id": try Self.text(value, "object_id"), "object_type": try Self.text(value, "object_type"),
            "include_current_node": include, "sender_device_id": context.senderDeviceID,
            "sender_library_epoch": context.senderLibraryEpoch, "receiver_device_id": context.receiverDeviceID,
            "receiver_library_epoch": context.receiverLibraryEpoch]
        if let ids = value["frontier_fact_ids"] as? [String] { result["frontier_fact_ids"] = ids }
        for key in ["required_relation_ids", "review_fact_ids", "state_fact_ids"] {
            guard let raw = value[key] as? [String] else { throw Self.invalid("\(key)_required") }
            let ids = raw.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            guard ids.allSatisfy({ !$0.isEmpty }), Set(ids).count == ids.count else { throw Self.invalid("\(key)_invalid") }
            result[key] = ids
        }
        if let transfer = value["transfer_id"] as? String { result["transfer_id"] = transfer }
        return result
    }

    static func text(_ value: [String: Any], _ key: String) throws -> String {
        guard let text = value[key] as? String, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw invalid("\(key)_required")
        }
        return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    private static func invalid(_ code: String) -> Error { FolioleFramedSyncValidationError(code) }
}
