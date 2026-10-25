import Darwin
import Foundation
import FolioleFramedSyncRuntime

extension FolioleAttachmentBlockStorage {
    func batchReceive(key: String, offset: UInt64, partialLength: UInt64, check: @escaping () throws -> Void,
                      finished: (() -> Void)? = nil) throws -> FolioleAttachmentReceiveFile {
        mutex.lock()
        do {
            guard !closing, !activeHash(key), !receiving.contains(where: { $0.prefix(64) == key.prefix(64) }), !isSending(key) else {
                throw FolioleFramedSyncValidationError("attachment_receive_busy")
            }
            try acquire(); receiving.insert(key); mutex.unlock()
        } catch { mutex.unlock(); throw error }
        do {
            return try FolioleAttachmentReceiveFile(path: resolve(key, partial: true), offset: offset, partialLength: partialLength, check: check) {
                if let finished { finished() } else { self.finishReceive(key) }
            }
        } catch { finishReceive(key); throw error }
    }
    func withSealedFile<T>(key: String, check: () throws -> Void, execute: (URL) throws -> T) throws -> T {
        try check()
        mutex.lock()
        guard !closing, receiving.contains(key) else { mutex.unlock(); throw FolioleFramedSyncValidationError("attachment_completion_missing") }
        operations += 1; mutex.unlock()
        defer {
            mutex.lock(); operations -= 1; if closing { close() }; mutex.unlock()
        }
        return try execute(resolve(key, partial: true))
    }
    func publishSealedFile(key: String) throws {
        mutex.lock(); defer { mutex.unlock() }
        guard !closing, receiving.contains(key) else { throw FolioleFramedSyncValidationError("attachment_completion_missing") }
        let source = try resolve(key, partial: true), target = try resolve(key, partial: false)
        if Darwin.rename(source.path, target.path) != 0 { throw posixError() }
    }
}
