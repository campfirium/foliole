import Capacitor
import Foundation
import FolioleFramedSyncRuntime

private let framedFileQueue = DispatchQueue(label: "com.campfirium.foliole.sync-files", qos: .utility)

extension FolioleCompanionSyncPlugin {
    @objc func accessFramedSyncFile(_ call: CAPPluginCall) {
        // The transport queue may be waiting for JS business apply; file calls must remain independent.
        framedFileQueue.async {
            do { call.resolve(try Self.accessFile(call)) }
            catch { call.reject("Failed to access Sync file: \(error.localizedDescription)") }
        }
    }

    private static func accessFile(_ call: CAPPluginCall) throws -> JSObject {
        let owner = try FolioleFramedSyncPayloadBudgetRegistry.shared.requireCurrent()
        guard owner.libraryKey == call.getString("library_key"),
              owner.generationID == call.getString("generation_id"), let key = call.getString("key") else {
            throw FolioleFramedSyncValidationError("framed_sync_file_owner_mismatch")
        }
        let files = try FolioleFramedSyncFiles(libraryKey: owner.libraryKey)
        if call.getString("operation") == "attachment" { return try FolioleAttachmentBlockFiles.access(owner, call) }
        switch call.getString("operation") {
        case "read":
            if let data = try files.read(key) { return ["base64": data.base64EncodedString()] }
            return ["base64": NSNull()]
        case "write":
            guard let encoded = call.getString("base64"), let data = Data(base64Encoded: encoded) else {
                throw FolioleFramedSyncValidationError("framed_sync_file_bytes_invalid")
            }
            try files.write(key, data: data)
            return [:]
        case "list": return ["entries": try files.list(key)]
        case "remove": try files.remove(key); return [:]
        default: throw FolioleFramedSyncValidationError("framed_sync_file_operation_invalid")
        }
    }
}
