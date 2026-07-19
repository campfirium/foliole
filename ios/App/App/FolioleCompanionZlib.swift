import Foundation
import zlib

enum FolioleCompanionZlib {
    static func inflate(_ compressed: Data) throws -> Data {
        var stream = z_stream()
        let initialized = inflateInit_(&stream, ZLIB_VERSION, Int32(MemoryLayout<z_stream>.size))
        guard initialized == Z_OK else { throw error("init", initialized) }
        defer { inflateEnd(&stream) }

        return try compressed.withUnsafeBytes { source in
            guard let base = source.bindMemory(to: Bytef.self).baseAddress else {
                throw error("empty input", Z_DATA_ERROR)
            }
            stream.next_in = UnsafeMutablePointer(mutating: base)
            stream.avail_in = uInt(compressed.count)
            return try drain(&stream)
        }
    }

    private static func drain(_ stream: inout z_stream) throws -> Data {
        let capacity = 256 * 1024
        var output = Data()
        var status = Z_OK
        repeat {
            var buffer = [UInt8](repeating: 0, count: capacity)
            let written = buffer.withUnsafeMutableBytes { target -> Int in
                stream.next_out = target.bindMemory(to: Bytef.self).baseAddress
                stream.avail_out = uInt(capacity)
                status = zlib.inflate(&stream, Z_NO_FLUSH)
                return capacity - Int(stream.avail_out)
            }
            if written > 0 { output.append(contentsOf: buffer.prefix(written)) }
            guard status == Z_OK || status == Z_STREAM_END else { throw error("inflate", status) }
        } while status != Z_STREAM_END
        return output
    }

    private static func error(_ operation: String, _ status: Int32) -> Error {
        NSError(
            domain: "FolioleCompanionZlib",
            code: Int(status),
            userInfo: [NSLocalizedDescriptionKey: "Sync pack zlib \(operation) failed (\(status))."]
        )
    }
}
