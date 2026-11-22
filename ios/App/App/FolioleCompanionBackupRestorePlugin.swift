import Capacitor
import Foundation

/// Copies a chosen backup zip or folder into app-private staging; the active library is untouched
/// until the web layer has prepared the candidate and asks for the swap.
@objc(FolioleCompanionBackupRestorePlugin)
public final class FolioleCompanionBackupRestorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FolioleCompanionBackupRestorePlugin"
    public let jsName = "FolioleCompanionBackupRestore"
    public let pluginMethods: [CAPPluginMethod] = ["stage", "cancel", "discard", "commit", "revert", "previous"]
        .map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }
    static let stagingDatabase = "foliole-restore-staging"
    let queue = DispatchQueue(label: "FolioleBackupRestore", qos: .utility)
    /// Main-thread state: one picker, staging read or swap at a time.
    var running = false
    var pickerCall: (call: CAPPluginCall, folder: Bool)?
    private let cancelLock = NSLock()
    private var cancelledFlag = false
    private var lastProgress = Date.distantPast

    /// Finish an interrupted library swap before the web layer opens any database. The bridge
    /// loads registered plugins before it loads the page.
    override public func load() {
        do {
            let swap = try FolioleBackupRestorePaths.current().swap()
            if swap.interrupted { try swap.commit(Self.now()) }
        } catch { NSLog("FolioleBackupRestore cannot finish interrupted restore: \(error.localizedDescription)") }
    }

    @objc func stage(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard !self.running else { call.reject("restore_already_running"); return }
            self.cancelled = false
            do { try self.presentPicker(call, folder: call.getString("source") != "zip") }
            catch { call.reject("restore_picker_unavailable") }
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        cancelled = true
        call.resolve()
    }

    @objc func discard(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard !self.running else { call.reject("restore_already_running"); return }
            do { try self.discardStaging(); call.resolve() } catch { call.reject(error.localizedDescription) }
        }
    }

    @objc func commit(_ call: CAPPluginCall) { replace(call, revert: false) }
    @objc func revert(_ call: CAPPluginCall) { replace(call, revert: true) }

    @objc func previous(_ call: CAPPluginCall) {
        do {
            let savedAt = try FolioleBackupRestorePaths.current().swap().previousSavedAt()
            call.resolve(["exists": savedAt != nil, "savedAt": savedAt as Any? ?? NSNull()])
        } catch { call.reject(error.localizedDescription) }
    }

    private func replace(_ call: CAPPluginCall, revert: Bool) {
        DispatchQueue.main.async {
            guard !self.running else { call.reject("restore_already_running"); return }
            self.running = true
            self.queue.async {
                do {
                    let swap = try FolioleBackupRestorePaths.current().swap()
                    if revert { try swap.revert(Self.now()) } else { try swap.commit(Self.now()) }
                    call.resolve()
                } catch { call.reject(error.localizedDescription) }
                DispatchQueue.main.async { self.running = false }
            }
        }
    }

    /// Reads the picked local source into a fresh staging area; runs on `queue`.
    func run(_ source: URL, folder: Bool) throws -> [String: Any] {
        let paths = try FolioleBackupRestorePaths.current()
        let staging = paths.staging(cancelled: { [weak self] in self?.cancelled ?? true }, progress: { [weak self] in
            self?.progress(bytes: $0, files: $1)
        })
        try staging.reset()
        if folder { try FolioleBackupRestoreSources.readFolder(source, databaseName: paths.databaseFileName, staging: staging) }
        else { try FolioleBackupRestoreSources.readZip(source, databaseName: paths.databaseFileName, staging: staging) }
        return ["cancelled": false, "database": Self.stagingDatabase, "sourceLabel": source.lastPathComponent,
                "storageKeys": staging.stagedKeys, "skippedFiles": staging.skippedFiles, "damagedFiles": staging.damagedFiles]
    }

    func discardStaging() throws {
        let paths = try FolioleBackupRestorePaths.current()
        try paths.staging(cancelled: { false }, progress: nil).reset()
        try FolioleBackupRestoreStaging.deleteTree(paths.stagingRoot)
    }

    private var cancelled: Bool {
        get { cancelLock.lock(); defer { cancelLock.unlock() }; return cancelledFlag }
        set { cancelLock.lock(); cancelledFlag = newValue; cancelLock.unlock() }
    }

    private func progress(bytes: Int64, files: Int) {
        let now = Date()
        guard now.timeIntervalSince(lastProgress) >= 0.3 else { return }
        lastProgress = now
        notifyListeners("restoreProgress", data: ["bytes": bytes, "files": files])
    }

    static func now() -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: Date())
    }
}

/// Where the library and its restore staging live; mirrors the folder backup host's paths.
struct FolioleBackupRestorePaths {
    let database: URL
    let stagedDatabase: URL
    let files: URL
    let stagingRoot: URL
    let attachmentDirectory: String
    let databaseFileName: String

    static func current() throws -> FolioleBackupRestorePaths {
        let contract = try FolioleCompanionContractStore()
        guard let name = try contract.folderBackupContract()["databaseName"],
              let fileName = try contract.folderBackupContract()["databaseFileName"] else {
            throw restoreError("restore_contract_missing")
        }
        let manager = FileManager.default
        let databases = manager.urls(for: .libraryDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("CapacitorDatabase", isDirectory: true)
        let files = try manager.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        return FolioleBackupRestorePaths(
            database: databases.appendingPathComponent(name + "SQLite.db"),
            stagedDatabase: databases.appendingPathComponent(FolioleCompanionBackupRestorePlugin.stagingDatabase + "SQLite.db"),
            files: files, stagingRoot: files.appendingPathComponent("restore-staging", isDirectory: true),
            attachmentDirectory: try contract.attachmentResourceContract().directoryName, databaseFileName: fileName)
    }

    func swap() -> FolioleBackupRestoreSwap {
        FolioleBackupRestoreSwap(database: database, stagedDatabase: stagedDatabase, files: files, stagingRoot: stagingRoot,
                                 attachmentDirectory: attachmentDirectory)
    }

    func staging(cancelled: @escaping () -> Bool, progress: ((Int64, Int) -> Void)?) -> FolioleBackupRestoreStaging {
        FolioleBackupRestoreStaging(database: stagedDatabase,
                                    attachments: stagingRoot.appendingPathComponent(attachmentDirectory, isDirectory: true),
                                    cancelled: cancelled, progress: progress)
    }
}
