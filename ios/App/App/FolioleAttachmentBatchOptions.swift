import CoreFoundation
import Foundation
import FolioleFramedSyncRuntime

struct FolioleAttachmentBatchOptions {
    let requestID: Data
    let entries: [FolioleAttachmentBatchAuthorization.Entry]
    let context: FolioleFramedSyncSessionContext
    let initiatorEpoch: String
    init(_ value: [String: Any]) throws {
        guard let encoded = value["request_id_base64"] as? String, let requestID = Data(base64Encoded: encoded),
              let rawEntries = value["entries"] as? [[String: Any]], !rawEntries.isEmpty, rawEntries.count <= 256,
              let context = value["context"] as? [String: Any] else { throw invalid() }
        self.requestID = requestID
        entries = try rawEntries.map { entry in
            try .init(key: text(entry, "storage_key"), start: UInt64(number(entry, "offset")),
                knownLength: UInt64(number(entry, "byte_length")), partialLength: UInt64(number(entry, "partial_length")))
        }
        initiatorEpoch = try text(context, "initiator_library_epoch")
        self.context = try .init(groupID: text(context, "sync_group_id"), initiatorDeviceID: text(context, "initiator_device_id"),
            initiatorLibraryEpoch: initiatorEpoch, responderDeviceID: text(context, "receiver_device_id"), responderLibraryEpoch: text(context, "receiver_library_epoch"))
    }
    static func sequence(_ value: Any?) throws -> Int {
        let sequence = try number(["sequence": value as Any], "sequence")
        guard sequence >= 1, sequence <= 256 else { throw invalid() }; return sequence
    }
}
private func text(_ value: [String: Any], _ key: String) throws -> String {
    guard let text = value[key] as? String, !text.isEmpty else { throw invalid() }; return text
}
private func number(_ value: [String: Any], _ key: String) throws -> Int {
    guard let raw = value[key] as? NSNumber, CFGetTypeID(raw) != CFBooleanGetTypeID() else { throw invalid() }
    let number = raw.doubleValue
    guard number.isFinite, number >= 0, number <= 8589934592, number.rounded() == number else { throw invalid() }
    return Int(number)
}
private func invalid() -> Error { FolioleFramedSyncValidationError("attachment_batch_command_invalid") }
