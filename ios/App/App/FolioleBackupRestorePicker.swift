import Capacitor
import Foundation
import UniformTypeIdentifiers

/// The system picker is the only user-facing source; once picked, the backup is read inside its
/// security scope and file coordination so iCloud and other providers deliver complete files.
extension FolioleCompanionBackupRestorePlugin: UIDocumentPickerDelegate {
    func presentPicker(_ call: CAPPluginCall, folder: Bool) throws {
        guard let view = bridge?.viewController, view.presentedViewController == nil else {
            throw restoreError("restore_picker_unavailable")
        }
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: folder ? [.folder] : [.zip])
        picker.delegate = self
        picker.allowsMultipleSelection = false
        running = true
        pickerCall = (call, folder)
        view.present(picker, animated: true)
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        guard let picked = pickerCall else { return }
        pickerCall = nil
        running = false
        picked.call.resolve(["cancelled": true])
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let picked = pickerCall else { return }
        pickerCall = nil
        guard let source = urls.first else {
            running = false
            picked.call.resolve(["cancelled": true])
            return
        }
        queue.async {
            let call = picked.call
            do { call.resolve(try self.coordinatedRun(source, folder: picked.folder)) }
            catch is FolioleRestoreCancelled { self.discardQuietly(); call.resolve(["cancelled": true]) }
            catch { self.discardQuietly(); call.reject(error.localizedDescription) }
            DispatchQueue.main.async { self.running = false }
        }
    }

    private func coordinatedRun(_ source: URL, folder: Bool) throws -> [String: Any] {
        let access = source.startAccessingSecurityScopedResource()
        defer { if access { source.stopAccessingSecurityScopedResource() } }
        var coordination: NSError?
        var result: Result<[String: Any], Error> = .failure(restoreError("restore_source_unreadable"))
        NSFileCoordinator().coordinate(readingItemAt: source, options: [], error: &coordination) { local in
            result = Result { try self.run(local, folder: folder) }
        }
        if coordination != nil { throw restoreError("restore_source_unreadable") }
        return try result.get()
    }

    private func discardQuietly() {
        do { try discardStaging() } catch { NSLog("FolioleBackupRestore cannot discard staging: \(error.localizedDescription)") }
    }
}
