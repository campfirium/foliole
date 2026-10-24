import Darwin
import Foundation
import FolioleFramedSyncRuntime

final class FolioleAttachmentReceiveFile {
    private let file: FileHandle
    private let check: () throws -> Void
    private let finished: () -> Void
    private var closed = false
    init(path: URL, offset: UInt64, check: @escaping () throws -> Void, finished: @escaping () -> Void) throws {
        self.check = check; self.finished = finished
        let fd = Darwin.open(path.path, O_RDWR | O_NOFOLLOW)
        guard fd >= 0 else { throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
        file = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        guard try file.seekToEnd() == offset else { closed = true; try file.close(); throw FolioleFramedSyncValidationError("attachment_partial_length_changed") }
    }
    func append(offset: UInt64, data: Data) throws {
        try check()
        guard !closed, data.count <= 524288, try file.seekToEnd() == offset else {
            throw FolioleFramedSyncValidationError("attachment_partial_length_changed")
        }
        try file.write(contentsOf: data)
    }
    func close() throws {
        guard !closed else { return }
        closed = true
        defer { finished() }
        try file.close()
    }
    deinit { try? close() }
}
