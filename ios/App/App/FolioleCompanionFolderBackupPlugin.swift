import Capacitor
import Foundation
import UniformTypeIdentifiers
import SQLCipher

@objc(FolioleCompanionFolderBackupPlugin)
public final class FolioleCompanionFolderBackupPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FolioleCompanionFolderBackupPlugin"
    public let jsName = "FolioleCompanionFolderBackup"
    public let pluginMethods: [CAPPluginMethod] = ["openSource", "closeSource", "getState", "clearDirectory", "backupDatabase",
        "cancelDatabase", "prepareAttachmentDirectory", "copyAttachments", "stopAttachments", "deleteAttachment",
        "finishAttachments"]
        .map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }
    let store = FolioleFolderBackupProfileStore()
    let queue = DispatchQueue(label: "FolioleFolderBackup", qos: .utility)
    var source: (epoch: String, path: String)?
    var operation: FolioleFolderBackupOperation?
    var session: (operation: FolioleFolderBackupOperation, profile: String)?
    var pickerCall: CAPPluginCall?
    var phase = "idle"
    var errorMessage: String?
    let attachmentStopLock = NSLock()
    var stoppedAttachmentRequest: String?
    /// The latest request that reached the native round; only it may be ended as failed by its caller.
    var roundRequest: String?

    @objc func openSource(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            do {
                let contract = try FolioleCompanionContractStore().folderBackupContract()
                guard let name = contract["databaseName"], let epoch = call.getString("sourceEpoch"), !epoch.isEmpty,
                      let path = call.getString("databasePath") else { throw backupError("Invalid backup source.") }
                let expected = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0]
                    .appendingPathComponent("CapacitorDatabase/" + name + "SQLite.db").resolvingSymlinksInPath().path
                guard URL(fileURLWithPath: path).resolvingSymlinksInPath().path == expected,
                      FileManager.default.fileExists(atPath: expected) else { throw backupError("Invalid active database path.") }
                guard self.source == nil || self.source?.epoch == epoch else { throw backupError("Previous database owner is still open.") }
                self.source = (epoch, expected)
                call.resolve()
            } catch { call.reject(error.localizedDescription) }
        }
    }

    @objc func closeSource(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.source?.epoch == call.getString("sourceEpoch") else { call.resolve(); return }
            self.source = nil
            self.session?.operation.cancel()
            self.session = nil
            if let operation = self.operation { operation.cancel { call.resolve() } }
            else { call.resolve() }
        }
    }

    @objc func getState(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            do { call.resolve(try self.state()) } catch { call.reject(error.localizedDescription) }
        }
    }

    @objc func clearDirectory(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            do {
                guard self.operation == nil, self.pickerCall == nil else { throw backupError("A backup is already running.") }
                self.session?.operation.cancel()
                self.session = nil
                try self.store.clear()
                self.phase = "idle"
                self.errorMessage = nil
                call.resolve(try self.state())
            } catch { call.reject(error.localizedDescription) }
        }
    }

    @objc func cancelDatabase(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let request = call.getString("requestId")
            if self.operation?.requestID == request { self.operation?.cancel() }
            if self.session?.operation.requestID == request { self.session?.operation.cancel() }
            // A failure reported by the caller is the latest round's real outcome; keep it instead of the last phase.
            if let failure = call.getString("errorMessage"), !failure.isEmpty, let request, request == self.roundRequest,
               self.operation == nil, self.pickerCall == nil {
                self.roundRequest = nil
                self.phase = "failed"
                self.errorMessage = failure
                if let id = try? self.store.load()?.id { try? self.store.update(id: id) { $0.attachmentError = failure } }
                if let state = try? self.state() { self.notifyListeners("backupStateChanged", data: ["state": state]) }
            }
            call.resolve()
        }
    }

    @objc func backupDatabase(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            do {
                guard self.operation == nil, self.pickerCall == nil else { throw backupError("A backup is already running.") }
                guard let source = self.source, source.epoch == call.getString("sourceEpoch"),
                      let request = call.getString("requestId"), !request.isEmpty else { throw backupError("Database owner is closed.") }
                self.session?.operation.cancel()
                self.session = nil
                self.roundRequest = request
                self.operation = FolioleFolderBackupOperation(requestID: request, epoch: source.epoch, source: source.path, store: self.store)
                let profile = try self.store.load()
                if call.getBool("chooseDirectory") == true || profile == nil { try self.presentPicker(call) }
                else { self.start(call) }
            } catch { self.operation = nil; call.reject(error.localizedDescription) }
        }
    }

    func start(_ call: CAPPluginCall) {
        guard let operation, source?.epoch == operation.epoch else {
            self.operation = nil; call.reject("Database owner is closed."); return
        }
        phase = "working"
        errorMessage = nil
        queue.async {
            let result = Result { () throws -> (FolioleBackupResult, String) in
                guard let profile = try self.store.load(),
                      let filename = try FolioleCompanionContractStore().folderBackupContract()["databaseFileName"] else {
                    throw backupError("Backup folder is not configured.")
                }
                let value = try FolioleFolderBackupDirectory.access(profile) {
                    try operation.run(directory: $0, profile: profile, filename: filename)
                }
                return (value, profile.id)
            }
            DispatchQueue.main.async {
                self.operation = nil
                do {
                    let (value, profile) = try result.get()
                    try operation.checkActive()
                    guard self.source?.epoch == operation.epoch else { throw backupError("Database owner is closed.") }
                    self.session = (operation, profile)
                    self.phase = value.cleanupPending == 0 ? "saved" : "pending"
                    call.resolve(try self.response(call, result: value))
                } catch {
                    self.phase = "failed"
                    self.errorMessage = error.localizedDescription
                    call.reject(error.localizedDescription)
                }
            }
        }
    }

    func state() throws -> [String: Any] {
        let profile = try store.load()
        return ["configured": profile != nil, "directoryLabel": profile?.label as Any? ?? NSNull(),
                "directoryId": profile?.id as Any? ?? NSNull(),
                "databaseSavedAt": profile?.savedAt as Any? ?? NSNull(), "phase": phase,
                "errorMessage": errorMessage as Any? ?? profile?.attachmentError as Any? ?? NSNull(),
                "attachmentFilesPending": profile?.attachmentFilesPending as Any? ?? NSNull()]
    }

    func response(_ call: CAPPluginCall, cancelled: Bool = false, result: FolioleBackupResult? = nil) throws -> [String: Any] {
        ["requestId": call.getString("requestId") ?? "", "cancelled": cancelled,
         "databaseCommitted": result?.committed == 1, "sourcePages": result?.sourcePages ?? 0,
         "changedPages": result?.pagesSent ?? 0, "state": try state()]
    }
}
