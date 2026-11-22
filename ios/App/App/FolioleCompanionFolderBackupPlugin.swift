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
    var sourcePath: String?
    var operation: FolioleFolderBackupOperation?
    var session: (operation: FolioleFolderBackupOperation, profile: String)?
    var pickerCall: CAPPluginCall?
    let attachmentStopLock = NSLock()
    var stoppedAttachmentRequest: String?
    /// A reloaded page's owner waiting for the previous page's picker or database operation to stop.
    var waitingOpen: (call: CAPPluginCall, path: String)?
    lazy var round: FolioleFolderBackupRound = {
        let store = self.store
        return FolioleFolderBackupRound(resumed: (try? store.load())?.phase) { phase, error in
            guard let id = try? store.load()?.id else { return }
            try? store.update(id: id) { $0.phase = phase; $0.attachmentError = error }
        }
    }()

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
                try self.openOwner(call, path: expected)
            } catch { call.reject(error.localizedDescription) }
        }
    }

    private func openOwner(_ call: CAPPluginCall, path: String) throws {
        let previous = round.request
        let reclaim = call.getBool("reclaim") == true
        let opened = try round.open(call.getString("sourceEpoch") ?? "", reclaim: reclaim)
        if reclaim {
            // The page that owned these is gone; stop its native work instead of waiting for it.
            operation?.cancel()
            session?.operation.cancel()
            session = nil
            if previous != nil, previous != round.request { notifyState() }
        }
        if !opened {
            waitingOpen?.call.reject("Database owner was replaced.")
            waitingOpen = (call, path)
            return
        }
        sourcePath = path
        call.resolve()
    }

    func resumeWaitingOpen() {
        guard let waiting = waitingOpen, !round.running else { return }
        waitingOpen = nil
        do { try openOwner(waiting.call, path: waiting.path) } catch { waiting.call.reject(error.localizedDescription) }
    }

    @objc func closeSource(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.round.close(call.getString("sourceEpoch")) else { call.resolve(); return }
            self.sourcePath = nil
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
                try self.round.clear()
                self.session?.operation.cancel()
                self.session = nil
                try self.store.clear()
                call.resolve(try self.state())
            } catch { call.reject(error.localizedDescription) }
        }
    }

    @objc func cancelDatabase(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let request = call.getString("requestId")
            if self.operation?.requestID == request { self.operation?.cancel() }
            if self.session?.operation.requestID == request { self.session?.operation.cancel() }
            // A failure reported by the caller is the open round's real outcome; keep it instead of the last phase.
            if self.round.cancel(request, failure: call.getString("errorMessage")) { self.notifyState() }
            call.resolve()
        }
    }

    @objc func backupDatabase(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            do {
                guard self.operation == nil, self.pickerCall == nil else { throw backupError("A backup is already running.") }
                try self.round.begin(call.getString("sourceEpoch"), request: call.getString("requestId"))
            } catch { call.reject(error.localizedDescription); return }
            let request = call.getString("requestId") ?? ""
            do {
                guard let path = self.sourcePath, let epoch = self.round.epoch else { throw backupError("Database owner is closed.") }
                self.session?.operation.cancel()
                self.session = nil
                self.operation = FolioleFolderBackupOperation(requestID: request, epoch: epoch, source: path, store: self.store)
                let profile = try self.store.load()
                if call.getBool("chooseDirectory") == true || profile == nil { try self.presentPicker(call) }
                else { self.start(call) }
            } catch {
                self.operation = nil
                self.round.databaseFailed(request, message: error.localizedDescription)
                self.notifyState()
                call.reject(error.localizedDescription)
                self.resumeWaitingOpen()
            }
        }
    }

    func start(_ call: CAPPluginCall) {
        let request = call.getString("requestId") ?? ""
        guard let operation, round.epoch == operation.epoch else {
            self.operation = nil
            round.databaseFailed(request, message: "Database owner is closed.")
            notifyState()
            call.reject("Database owner is closed.")
            resumeWaitingOpen()
            return
        }
        round.started()
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
                    guard self.round.epoch == operation.epoch else { throw backupError("Database owner is closed.") }
                    if self.round.databaseEnded(request, committed: value.committed == 1, cleanupPending: value.cleanupPending != 0) {
                        self.session = (operation, profile)
                    }
                    call.resolve(try self.response(call, result: value))
                } catch {
                    self.round.databaseFailed(request, message: error.localizedDescription)
                    call.reject(error.localizedDescription)
                }
                self.notifyState()
                self.resumeWaitingOpen()
            }
        }
    }

    func notifyState() {
        if let state = try? state() { notifyListeners("backupStateChanged", data: ["state": state]) }
    }

    func state() throws -> [String: Any] {
        let profile = try store.load()
        return ["configured": profile != nil, "directoryLabel": profile?.label as Any? ?? NSNull(),
                "directoryId": profile?.id as Any? ?? NSNull(),
                "databaseSavedAt": profile?.savedAt as Any? ?? NSNull(), "phase": round.phase,
                "errorMessage": round.errorMessage as Any? ?? profile?.attachmentError as Any? ?? NSNull(),
                "attachmentFilesPending": profile?.attachmentFilesPending as Any? ?? NSNull()]
    }

    func response(_ call: CAPPluginCall, cancelled: Bool = false, result: FolioleBackupResult? = nil) throws -> [String: Any] {
        ["requestId": call.getString("requestId") ?? "", "cancelled": cancelled,
         "databaseCommitted": result?.committed == 1, "sourcePages": result?.sourcePages ?? 0,
         "changedPages": result?.pagesSent ?? 0, "state": try state()]
    }
}
