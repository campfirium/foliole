import Foundation
import FolioleFramedSyncRuntime

enum FolioleCompanionFramedSyncResourceRequest {
    static func read(_ raw: Any?) throws -> [Foliole_Sync_V22_ResourceDemand] {
        guard let raw else { return [] }
        guard let values = raw as? [[String: Any]] else { throw invalid("resources_invalid") }
        return try values.map { row in
            func text(_ key: String) throws -> String {
                guard let value = row[key] as? String, !value.isEmpty else { throw invalid("resource_\(key)_invalid") }
                return value
            }
            var value = Foliole_Sync_V22_ResourceDemand()
            value.demandID = try text("demand_id")
            value.globalID = try text("global_id")
            value.versionID = try text("version_id")
            value.bodyHash = try text("body_hash")
            value.storageKey = try text("storage_key")
            let hex = try text("shared_state_hash")
            guard hex.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else {
                throw invalid("resource_shared_state_hash_invalid")
            }
            value.sharedStateHash = Data(stride(from: 0, to: 64, by: 2).map { offset in
                let start = hex.index(hex.startIndex, offsetBy: offset)
                return UInt8(hex[start..<hex.index(start, offsetBy: 2)], radix: 16)!
            })
            return value
        }
    }

    private static func invalid(_ code: String) -> FolioleFramedSyncValidationError {
        FolioleFramedSyncValidationError(code)
    }
}
