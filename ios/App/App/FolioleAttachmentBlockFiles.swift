import Capacitor
import Foundation
import FolioleFramedSyncRuntime

final class FolioleAttachmentBlockFiles {
    private static let mutex = NSRecursiveLock()
    private static var owners = [ObjectIdentifier: FolioleAttachmentBlockStorage]()

    static func access(_ owner: FolioleFramedSyncPayloadBudget, _ call: CAPPluginCall) throws -> JSObject {
        mutex.lock(); defer { mutex.unlock() }
        try owner.requireActive()
        let id = ObjectIdentifier(owner)
        let files: FolioleAttachmentBlockStorage
        if let existing = owners[id] { files = existing }
        else {
            files = try FolioleAttachmentBlockStorage(
                root: FolioleAttachmentMaintenanceFiles.directory(false).resolvingSymlinksInPath(),
                trash: { try FolioleAttachmentMaintenanceFiles.directory(true) })
            owners[id] = files
            owner.onAttachmentClose { close(owner) }
        }
        try owner.requireActive()
        return try files.execute(action: call.getString("action") ?? "", key: call.getString("key") ?? "",
                                 partial: call.getBool("partial") ?? false,
                                 number: { call.getDouble($0) }, base64: call.getString("base64")) as! JSObject
    }

    static func close(_ owner: FolioleFramedSyncPayloadBudget) {
        mutex.lock(); defer { mutex.unlock() }
        owners.removeValue(forKey: ObjectIdentifier(owner))?.close()
    }

    static func requireNotSending(_ key: String) throws {
        mutex.lock(); defer { mutex.unlock() }
        guard !owners.values.contains(where: { $0.isSending(key) }) else {
            throw FolioleFramedSyncValidationError("attachment_send_busy")
        }
    }

    static func withRemoval<T>(_ key: String, execute: () throws -> T) throws -> T {
        mutex.lock(); defer { mutex.unlock() }
        try requireNotSending(key)
        return try execute()
    }
}
