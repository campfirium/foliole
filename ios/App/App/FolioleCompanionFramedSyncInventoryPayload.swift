import Capacitor
import Foundation
import FolioleFramedSyncRuntime

extension FolioleCompanionSyncPlugin {
    func framedArray(_ call: CAPPluginCall, _ key: String) throws -> [String] {
        guard let raw = call.getArray(key) else { throw invalid("\(key)_required") }
        let result = raw.compactMap { ($0 as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) }
        guard result.count == raw.count, result.allSatisfy({ !$0.isEmpty }), Set(result).count == result.count
        else { throw invalid("\(key)_invalid") }
        return result
    }

    func framedDigests(_ call: CAPPluginCall, _ key: String) throws -> [Data] {
        try framedArray(call, key).map { try framedHex($0, key, byteCount: 32) }
    }

    func framedHex(_ call: CAPPluginCall, _ key: String, byteCount: Int) throws -> Data {
        try framedHex(framedRequired(call, key), key, byteCount: byteCount)
    }

    func framedHex(_ value: String, _ key: String, byteCount: Int) throws -> Data {
        guard value.count == byteCount * 2,
              value.range(of: "^[a-f0-9]+$", options: .regularExpression) != nil else {
            throw invalid("\(key)_invalid")
        }
        var result = Data(capacity: byteCount)
        for offset in stride(from: 0, to: value.count, by: 2) {
            let start = value.index(value.startIndex, offsetBy: offset)
            guard let byte = UInt8(value[start..<value.index(start, offsetBy: 2)], radix: 16) else {
                throw invalid("\(key)_invalid")
            }
            result.append(byte)
        }
        return result
    }

    func framedInboundDatabaseURL() throws -> URL {
        let root = try FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask,
            appropriateFor: nil, create: true
        )
        return root.appendingPathComponent("Foliole/framed-sync/ios-transfer.db")
    }

}
