import Compression
import Foundation

/// Reads a backup zip through its central directory without extracting it to disk first.
/// Only stored and deflated entries are accepted, with zip64 sizes and offsets; every entry
/// is checked against its CRC-32. Anything else is not a backup this host can restore.
final class FolioleBackupRestoreZipReader {
    struct Entry {
        let name: String
        let method: UInt16
        let crc: UInt32
        let compressedSize: UInt64
        let size: UInt64
        let localHeaderOffset: UInt64
    }

    private static let chunk = 64 * 1024
    private let handle: FileHandle
    private let length: UInt64

    init(url: URL) throws {
        do { handle = try FileHandle(forReadingFrom: url) } catch { throw restoreError("restore_source_unreadable") }
        length = try handle.seekToEnd()
    }

    deinit { try? handle.close() }

    func entries() throws -> [Entry] {
        let (count, size, offset) = try centralDirectory()
        guard offset <= length, size <= length - offset else { throw restoreError("restore_not_archive") }
        let directory = try bytes(at: offset, count: Int(size))
        var entries: [Entry] = []
        var cursor = 0
        for _ in 0..<count {
            guard cursor + 46 <= directory.count, directory.u32(cursor) == 0x0201_4b50 else { throw restoreError("restore_not_archive") }
            let nameLength = Int(directory.u16(cursor + 28)), extraLength = Int(directory.u16(cursor + 30))
            let commentLength = Int(directory.u16(cursor + 32))
            let end = cursor + 46 + nameLength + extraLength + commentLength
            guard end <= directory.count else { throw restoreError("restore_not_archive") }
            if directory.u16(cursor + 8) & 1 != 0 { throw restoreError("restore_not_archive") }
            guard let name = String(data: directory.subdata(in: cursor + 46..<cursor + 46 + nameLength), encoding: .utf8) else {
                throw restoreError("restore_not_archive")
            }
            var sizes = Zip64Fields(size: UInt64(directory.u32(cursor + 24)), compressed: UInt64(directory.u32(cursor + 20)),
                                    offset: UInt64(directory.u32(cursor + 42)))
            try sizes.apply(directory.subdata(in: cursor + 46 + nameLength..<cursor + 46 + nameLength + extraLength))
            entries.append(Entry(name: name, method: directory.u16(cursor + 10), crc: directory.u32(cursor + 16),
                                 compressedSize: sizes.compressed, size: sizes.size, localHeaderOffset: sizes.offset))
            cursor = end
        }
        return entries
    }

    /// Streams the entry's uncompressed bytes to `sink` in chunks.
    func read(_ entry: Entry, into sink: (Data) throws -> Void) throws {
        let header = try bytes(at: entry.localHeaderOffset, count: 30)
        guard header.u32(0) == 0x0403_4b50 else { throw restoreError("restore_not_archive") }
        let start = entry.localHeaderOffset + 30 + UInt64(header.u16(26)) + UInt64(header.u16(28))
        guard start <= length, entry.compressedSize <= length - start else { throw restoreError("restore_not_archive") }
        try handle.seek(toOffset: start)
        var crc = FolioleRestoreCRC32()
        var produced: UInt64 = 0
        let counted: (Data) throws -> Void = { data in
            crc.update(data)
            produced += UInt64(data.count)
            try sink(data)
        }
        switch entry.method {
        case 0: try copyStored(entry.compressedSize, into: counted)
        case 8: try inflate(entry.compressedSize, into: counted)
        default: throw restoreError("restore_not_archive")
        }
        guard produced == entry.size, crc.value == entry.crc else { throw restoreError("restore_not_archive") }
    }

    private func copyStored(_ size: UInt64, into sink: (Data) throws -> Void) throws {
        var remaining = size
        while remaining > 0 {
            let data = try handle.read(upToCount: Int(min(remaining, UInt64(Self.chunk)))) ?? Data()
            guard !data.isEmpty else { throw restoreError("restore_not_archive") }
            remaining -= UInt64(data.count)
            try sink(data)
        }
    }

    private func inflate(_ size: UInt64, into sink: (Data) throws -> Void) throws {
        let stream = UnsafeMutablePointer<compression_stream>.allocate(capacity: 1)
        defer { stream.deallocate() }
        guard compression_stream_init(stream, COMPRESSION_STREAM_DECODE, COMPRESSION_ZLIB) == COMPRESSION_STATUS_OK else {
            throw restoreError("restore_not_archive")
        }
        defer { compression_stream_destroy(stream) }
        let source = UnsafeMutablePointer<UInt8>.allocate(capacity: Self.chunk)
        let target = UnsafeMutablePointer<UInt8>.allocate(capacity: Self.chunk)
        defer { source.deallocate(); target.deallocate() }
        var remaining = size
        stream.pointee.src_size = 0
        while true {
            if stream.pointee.src_size == 0 && remaining > 0 {
                let data = try handle.read(upToCount: Int(min(remaining, UInt64(Self.chunk)))) ?? Data()
                guard !data.isEmpty else { throw restoreError("restore_not_archive") }
                data.copyBytes(to: source, count: data.count)
                remaining -= UInt64(data.count)
                stream.pointee.src_ptr = UnsafePointer(source)
                stream.pointee.src_size = data.count
            }
            stream.pointee.dst_ptr = target
            stream.pointee.dst_size = Self.chunk
            let flags = remaining == 0 ? Int32(COMPRESSION_STREAM_FINALIZE.rawValue) : 0
            let status = compression_stream_process(stream, flags)
            let produced = Self.chunk - stream.pointee.dst_size
            if produced > 0 { try sink(Data(bytes: target, count: produced)) }
            if status == COMPRESSION_STATUS_END { return }
            if status != COMPRESSION_STATUS_OK { throw restoreError("restore_not_archive") }
            if remaining == 0 && stream.pointee.src_size == 0 && produced == 0 { throw restoreError("restore_not_archive") }
        }
    }

    /// Returns the entry count, size and offset of the central directory, following zip64 records.
    private func centralDirectory() throws -> (UInt64, UInt64, UInt64) {
        let tail = min(length, 65_557)
        let data = try bytes(at: length - tail, count: Int(tail))
        guard data.count >= 22,
              let end = stride(from: data.count - 22, through: 0, by: -1).first(where: { data.u32($0) == 0x0605_4b50 }) else {
            throw restoreError("restore_not_archive")
        }
        let count = UInt64(data.u16(end + 10)), size = UInt64(data.u32(end + 12)), offset = UInt64(data.u32(end + 16))
        guard count == 0xFFFF || size == 0xFFFF_FFFF || offset == 0xFFFF_FFFF else { return (count, size, offset) }
        guard end >= 20, data.u32(end - 20) == 0x0706_4b50 else { throw restoreError("restore_not_archive") }
        let record = try bytes(at: data.u64(end - 12), count: 56)
        guard record.u32(0) == 0x0606_4b50 else { throw restoreError("restore_not_archive") }
        return (record.u64(32), record.u64(40), record.u64(48))
    }

    private func bytes(at offset: UInt64, count: Int) throws -> Data {
        guard offset <= length, UInt64(count) <= length - offset else { throw restoreError("restore_not_archive") }
        try handle.seek(toOffset: offset)
        let data = try handle.read(upToCount: count) ?? Data()
        guard data.count == count else { throw restoreError("restore_not_archive") }
        return data
    }
}

/// Zip64 extra field: only the fields saturated in the fixed header are present, in this order.
private struct Zip64Fields {
    var size: UInt64
    var compressed: UInt64
    var offset: UInt64

    mutating func apply(_ extra: Data) throws {
        var cursor = 0
        while cursor + 4 <= extra.count {
            let id = extra.u16(cursor), length = Int(extra.u16(cursor + 2))
            guard cursor + 4 + length <= extra.count else { throw restoreError("restore_not_archive") }
            if id == 0x0001 {
                var field = cursor + 4
                for path in [\Zip64Fields.size, \Zip64Fields.compressed, \Zip64Fields.offset] where self[keyPath: path] == 0xFFFF_FFFF {
                    guard field + 8 <= cursor + 4 + length else { throw restoreError("restore_not_archive") }
                    self[keyPath: path] = extra.u64(field)
                    field += 8
                }
            }
            cursor += 4 + length
        }
    }
}

struct FolioleRestoreCRC32 {
    private static let table: [UInt32] = (0..<256).map { index in
        (0..<8).reduce(UInt32(index)) { value, _ in value & 1 == 1 ? 0xEDB8_8320 ^ (value >> 1) : value >> 1 }
    }
    private var state: UInt32 = 0xFFFF_FFFF
    var value: UInt32 { state ^ 0xFFFF_FFFF }

    mutating func update(_ data: Data) {
        var crc = state
        Self.table.withUnsafeBufferPointer { table in
            data.withUnsafeBytes { bytes in
                for byte in bytes { crc = table[Int((crc ^ UInt32(byte)) & 0xFF)] ^ (crc >> 8) }
            }
        }
        state = crc
    }
}

private extension Data {
    func u16(_ at: Int) -> UInt16 { UInt16(self[startIndex + at]) | UInt16(self[startIndex + at + 1]) << 8 }
    func u32(_ at: Int) -> UInt32 { UInt32(u16(at)) | UInt32(u16(at + 2)) << 16 }
    func u64(_ at: Int) -> UInt64 { UInt64(u32(at)) | UInt64(u32(at + 4)) << 32 }
}
