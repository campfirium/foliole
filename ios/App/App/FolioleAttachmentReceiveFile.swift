import Darwin
import Foundation
import FolioleFramedSyncRuntime

final class FolioleAttachmentReceiveFile {
    private let file: FileHandle
    private let check: () throws -> Void
    private let finished: () -> Void
    private var closed = false
    private var sealed = false
    init(path: URL, offset: UInt64, partialLength: UInt64? = nil, check: @escaping () throws -> Void, finished: @escaping () -> Void) throws {
        self.check = check; self.finished = finished
        try check()
        let fd = Darwin.open(path.path, O_RDWR | O_CREAT | O_NOFOLLOW, 0o600)
        guard fd >= 0 else { throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
        file = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        do {
            let expected = partialLength ?? offset
            guard offset <= expected, try file.seekToEnd() == expected else { throw FolioleFramedSyncValidationError("attachment_partial_length_changed") }
            try check(); try file.truncate(atOffset: offset); try file.seek(toOffset: offset)
        } catch { closed = true; try file.close(); throw error }
    }
    func append(offset: UInt64, data: Data) throws {
        try check()
        guard !closed, !sealed, data.count <= 524288, try file.seekToEnd() == offset else {
            throw FolioleFramedSyncValidationError("attachment_partial_length_changed")
        }
        try file.write(contentsOf: data)
    }
    func seal() throws {
        guard !sealed else { return }
        try file.close(); sealed = true
    }
    func close() throws {
        guard !closed else { return }
        closed = true
        defer { finished() }
        try seal()
    }
    deinit { try? close() }
}
