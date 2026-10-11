import Foundation
import FolioleFramedSyncRuntime

enum FolioleRequestSyncHTTPChunks {
    static let chunkBytes = 512 * 1024

    static func assemble(files: FolioleFramedSyncFiles, directory: String, count: Int, output: URL) throws {
        guard count > 0 else { throw invalid("request_sync_http_request_invalid") }
        guard FileManager.default.createFile(atPath: output.path, contents: nil) else {
            throw invalid("request_sync_http_file_create_failed")
        }
        let handle = try FileHandle(forWritingTo: output)
        defer { try? handle.close() }
        for index in 0..<count {
            try Task.checkCancellation()
            guard let data = try files.read("\(directory)/http-out-\(index)"),
                  !data.isEmpty, data.count <= chunkBytes else {
                throw invalid("request_sync_http_request_truncated")
            }
            try handle.write(contentsOf: data)
        }
    }

    static func split(files: FolioleFramedSyncFiles, directory: String, input: URL) throws -> [String: Int] {
        let handle = try FileHandle(forReadingFrom: input)
        defer { try? handle.close() }
        var count = 0, length = 0
        while true {
            try Task.checkCancellation()
            var chunk = Data()
            while chunk.count < chunkBytes {
                let part = try handle.read(upToCount: chunkBytes - chunk.count) ?? Data()
                if part.isEmpty { break }
                chunk.append(part)
            }
            if chunk.isEmpty { break }
            try files.write("\(directory)/http-in-\(count)", data: chunk)
            count += 1; length += chunk.count
        }
        return ["response_chunk_count": count, "response_byte_length": length]
    }

    private static func invalid(_ code: String) -> FolioleFramedSyncValidationError { .init(code) }
}
