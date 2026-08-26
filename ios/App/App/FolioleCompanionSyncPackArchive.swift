import CryptoKit
import Foundation

enum FolioleCompanionSyncPackArchive {
    static func deflate(_ source: Data) throws -> Data {
        try FolioleCompanionZlib.deflate(source)
    }

    static func zip(entries: [(String, Data)]) -> Data {
        var body = Data(), directory = Data(), offsets: [UInt32] = []
        for (name, value) in entries {
            let nameData = Data(name.utf8), checksum = crc32(value)
            offsets.append(UInt32(body.count))
            body.appendLE(UInt32(0x04034b50)); body.appendLE(UInt16(20)); body.appendLE(UInt16(0))
            body.appendLE(UInt16(0)); body.appendLE(UInt16(0)); body.appendLE(UInt16(0)); body.appendLE(checksum)
            body.appendLE(UInt32(value.count)); body.appendLE(UInt32(value.count)); body.appendLE(UInt16(nameData.count))
            body.appendLE(UInt16(0)); body.append(nameData); body.append(value)
        }
        for (index, entry) in entries.enumerated() {
            let nameData = Data(entry.0.utf8), value = entry.1, checksum = crc32(value)
            directory.appendLE(UInt32(0x02014b50)); directory.appendLE(UInt16(20)); directory.appendLE(UInt16(20))
            directory.appendLE(UInt16(0)); directory.appendLE(UInt16(0)); directory.appendLE(UInt16(0)); directory.appendLE(UInt16(0))
            directory.appendLE(checksum); directory.appendLE(UInt32(value.count)); directory.appendLE(UInt32(value.count))
            directory.appendLE(UInt16(nameData.count)); directory.appendLE(UInt16(0)); directory.appendLE(UInt16(0))
            directory.appendLE(UInt16(0)); directory.appendLE(UInt16(0)); directory.appendLE(UInt32(0))
            directory.appendLE(offsets[index]); directory.append(nameData)
        }
        let directoryOffset = UInt32(body.count); body.append(directory)
        body.appendLE(UInt32(0x06054b50)); body.appendLE(UInt16(0)); body.appendLE(UInt16(0))
        body.appendLE(UInt16(entries.count)); body.appendLE(UInt16(entries.count))
        body.appendLE(UInt32(directory.count)); body.appendLE(directoryOffset); body.appendLE(UInt16(0))
        return body
    }

    static func sha256(_ value: Data) -> String {
        "sha256:" + SHA256.hash(data: value).map { String(format: "%02x", $0) }.joined()
    }

    private static func crc32(_ value: Data) -> UInt32 {
        value.reduce(UInt32(0xffffffff)) { partial, byte in
            var result = partial ^ UInt32(byte)
            for _ in 0..<8 { result = (result >> 1) ^ (result & 1 == 1 ? 0xedb88320 : 0) }
            return result
        } ^ 0xffffffff
    }

    private static func invalid(_ message: String) -> NSError {
        NSError(domain: "FolioleCompanionSyncPackArchive", code: 1,
                userInfo: [NSLocalizedDescriptionKey: message])
    }
}

private extension Data {
    mutating func appendLE<T: FixedWidthInteger>(_ value: T) {
        var little = value.littleEndian
        Swift.withUnsafeBytes(of: &little) { append(contentsOf: $0) }
    }
}
