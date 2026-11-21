import Capacitor
import Foundation

extension FolioleCompanionFolderBackupPlugin {
    @objc func prepareAttachmentDirectory(_ call: CAPPluginCall) {
        attachmentTask(call) { root, _, _ in
            _ = try FolioleFolderBackupAttachments.prepare(root)
            return [:]
        }
    }

    /// Copies a batch inside one security scope and coordination; keys after a stop are left unattempted.
    @objc func copyAttachments(_ call: CAPPluginCall) {
        let keys = call.getArray("storageKeys", String.self) ?? []
        let requestID = call.getString("requestId")
        attachmentTask(call) { root, profile, operation in
            guard keys.count <= 64 else { throw backupError("Invalid attachment batch.") }
            let roots = try [false, true].map { try FolioleAttachmentMaintenanceFiles.directory($0) }
            var results = JSArray()
            var published = false
            for key in keys {
                if self.attachmentStopRequested(requestID) { break }
                do {
                    let copied = try FolioleFolderBackupAttachments.copy(key, roots: roots, directory: root,
                        profile: profile.id, check: operation.checkActive)
                    published = published || copied
                    results.append(["storageKey": key, "copied": copied] as JSObject)
                } catch {
                    if (try? operation.checkActive()) == nil { break }
                    results.append(["storageKey": key, "errorMessage": error.localizedDescription] as JSObject)
                }
            }
            if published { try FolioleFolderBackupAttachments.persist(root) }
            return ["results": results]
        }
    }

    @objc func stopAttachments(_ call: CAPPluginCall) {
        attachmentStopLock.lock()
        stoppedAttachmentRequest = call.getString("requestId")
        attachmentStopLock.unlock()
        call.resolve()
    }

    private func attachmentStopRequested(_ requestID: String?) -> Bool {
        attachmentStopLock.lock(); defer { attachmentStopLock.unlock() }
        return requestID != nil && requestID == stoppedAttachmentRequest
    }

    @objc func deleteAttachment(_ call: CAPPluginCall) {
        attachmentTask(call) { root, _, operation in
            let roots = try [false, true].map { try FolioleAttachmentMaintenanceFiles.directory($0) }
            try FolioleAttachmentBlockFiles.withRemoval(call.getString("storageKey") ?? "") {
                try FolioleFolderBackupAttachments.delete(call.getString("storageKey") ?? "", roots: roots,
                    directory: root, check: operation.checkActive)
            }
            return [:]
        }
    }

    @objc func finishAttachments(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            do {
                guard let session = self.session, session.operation.requestID == call.getString("requestId"),
                      self.source?.epoch == session.operation.epoch else { throw backupError("Backup request changed.") }
                let pending = call.getInt("pending")
                let copied = call.getInt("copied") ?? 0
                guard copied >= 0, pending == nil || pending! >= 0 else { throw backupError("Invalid attachment result.") }
                let error = call.getString("errorMessage")
                try self.store.update(id: session.profile) { $0.attachmentFilesPending = pending; $0.attachmentError = error }
                self.phase = error != nil ? "failed" : pending == 0 ? "saved" : "pending"
                self.errorMessage = error
                self.roundRequest = nil
                var state = try self.state()
                state["attachmentFilesCopied"] = copied
                self.notifyListeners("backupStateChanged", data: ["state": state])
                call.resolve(state)
            } catch { call.reject(error.localizedDescription) }
        }
    }

    private func attachmentTask(_ call: CAPPluginCall,
                                execute: @escaping (URL, FolioleFolderBackupProfile, FolioleFolderBackupOperation) throws -> JSObject) {
        DispatchQueue.main.async {
            guard let session = self.session, session.operation.requestID == call.getString("requestId"),
                  session.operation.epoch == call.getString("sourceEpoch"), self.source?.epoch == session.operation.epoch else {
                call.reject("Backup database owner or request changed."); return
            }
            self.queue.async {
                do {
                    try session.operation.checkActive()
                    guard let profile = try self.store.load(), profile.id == session.profile else { throw backupError("Backup folder changed.") }
                    let value = try FolioleFolderBackupDirectory.access(profile) { root in
                        try session.operation.checkActive()
                        return try execute(root, profile, session.operation)
                    }
                    call.resolve(value)
                } catch { call.reject(error.localizedDescription) }
            }
        }
    }
}
