import Foundation
import FolioleFramedSyncRuntime

final class FolioleAttachmentBatchFinalizer {
    private let receiver: FolioleAttachmentBatchReceiver
    private let check: () throws -> Void
    private let progress: () -> Void
    private let commit: (() throws -> Void) throws -> Void
    init(receiver: FolioleAttachmentBatchReceiver, check: @escaping () throws -> Void,
         progress: @escaping () -> Void, commit: @escaping (() throws -> Void) throws -> Void) {
        self.receiver = receiver; self.check = check; self.progress = progress; self.commit = commit
    }
    func verify(_ sequence: Int) throws -> Bool {
        try receiver.withFileOperation(sequence) { file in
            try receiver.storage.withSealedFile(key: file.key, check: check) { partial in
                let path = file.published ? try receiver.storage.resolve(file.key, partial: false) : partial
                let size = try path.resourceValues(forKeys: [.fileSizeKey]).fileSize
                let hash = try receiver.storage.digest(path) { try self.check(); self.progress() }
                file.verified = size == Int(file.length) && hash == file.key.prefix(64)
                return file.verified
            }
        }
    }
    func publish(_ sequence: Int) throws {
        try receiver.withFileOperation(sequence) { file in
            if file.published { return }
            guard file.verified else { throw FolioleFramedSyncValidationError("attachment_verification_required") }
            try commit { try receiver.storage.publishSealedFile(key: file.key) }
            file.published = true
        }
    }
    func discard(_ sequence: Int) throws {
        try receiver.withFileOperation(sequence) { file in
            guard !file.published else { return }
            try receiver.storage.withSealedFile(key: file.key, check: check) { path in
                try check()
                if FileManager.default.fileExists(atPath: path.path) { try FileManager.default.removeItem(at: path) }
            }
        }
    }
}
