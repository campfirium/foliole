import Capacitor
import Foundation
import UniformTypeIdentifiers

extension FolioleCompanionFolderBackupPlugin: UIDocumentPickerDelegate {
    func presentPicker(_ call: CAPPluginCall) throws {
        guard let view = bridge?.viewController, view.presentedViewController == nil else {
            throw backupError("Cannot open the folder picker.")
        }
        pickerCall = call
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.folder])
        picker.delegate = self
        picker.allowsMultipleSelection = false
        view.present(picker, animated: true)
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        guard let call = pickerCall else { return }
        pickerCall = nil
        operation = nil
        round.pickerCancelled(call.getString("requestId") ?? "")
        do { call.resolve(try response(call, cancelled: true)) } catch { call.reject(error.localizedDescription) }
        notifyState()
        resumeWaitingOpen()
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let call = pickerCall else { return }
        pickerCall = nil
        do {
            guard let directory = urls.first, let operation, round.epoch == operation.epoch else {
                throw backupError("Database owner is closed.")
            }
            try operation.checkActive()
            let access = directory.startAccessingSecurityScopedResource()
            defer { if access { directory.stopAccessingSecurityScopedResource() } }
            let bookmark = try directory.bookmarkData(options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil)
            let old = try store.load()
            var stale = false
            let oldURL = try old.map { try URL(resolvingBookmarkData: $0.bookmark, options: [], relativeTo: nil, bookmarkDataIsStale: &stale) }
            if oldURL?.standardizedFileURL != directory.standardizedFileURL {
                try store.save(FolioleFolderBackupProfile(bookmark: bookmark, label: directory.lastPathComponent))
            } else if var old { old.bookmark = bookmark; try store.save(old) }
            start(call)
        } catch {
            operation = nil
            round.databaseFailed(call.getString("requestId") ?? "", message: error.localizedDescription)
            notifyState()
            call.reject(error.localizedDescription)
            resumeWaitingOpen()
        }
    }
}
