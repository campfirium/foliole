import Foundation
import FolioleFramedSyncRuntime

struct FolioleFramedSyncPullBatchRequest {
    struct Object {
        let objectID: String
        let objectType: String
        let message: FolioleFramedSyncValidatedMessage
        let expectedFacts: Set<String>

        func accept(_ header: Foliole_Sync_V22_TransferHeader) throws {
            let identities = header.manifest.facts.map(\.identity)
            guard identities.allSatisfy({ $0.globalID == objectID && $0.objectType == objectType }),
                  identities.count == expectedFacts.count,
                  Set(identities.map { "\($0.kind.rawValue):\($0.factID)" }) == expectedFacts else {
                throw FolioleFramedSyncValidationError("framed_sync_requested_fact_set_mismatch")
            }
        }
    }

    static func decode(_ value: [String: Any]) throws -> [Object] {
        try FolioleFramedSyncOutboundRequest.validateMetadata(value)
        let round = try hex(FolioleFramedSyncOutboundRequest.text(value, "round_id"), count: 16)
        guard let values = value["requests"] as? [[String: Any]], (1...128).contains(values.count) else { throw invalid() }
        var identities = Set<String>(), bytes = 0
        return try values.map { row in
            guard row["resources"] == nil, row["stage_only"] == nil else { throw invalid() }
            let id = try FolioleFramedSyncOutboundRequest.text(row, "object_id")
            let type = try FolioleFramedSyncOutboundRequest.text(row, "object_type")
            guard identities.insert(type + "\u{0}" + id).inserted else { throw invalid() }
            let frontier = try array(row, "frontier_fact_ids"), relations = try array(row, "required_relation_ids")
            let message = try FolioleFramedSyncDifferenceRequest.make(roundID: round, objectID: id,
                frontierFactIDs: frontier, requiredRelationIDs: relations,
                resourceHashes: try array(row, "resource_hashes").map { try hex($0, count: 32) },
                reviewFactIDs: array(row, "review_fact_ids"), stateFactIDs: array(row, "state_fact_ids"), objectType: type)
            bytes += try FolioleFramedSyncCodec.encode(message).count
            guard bytes <= 768 * 1024, case .differenceRequest(let request) = message.payload else { throw invalid() }
            var facts = Set(request.facts.map { "\($0.kind.rawValue):\($0.factID)" })
            if type == "node" {
                for relation in relations { for version in try endpoints(relation) { facts.insert("2:" + version) } }
            }
            return Object(objectID: id, objectType: type, message: message, expectedFacts: facts)
        }
    }

    private static func endpoints(_ value: String) throws -> [String] {
        guard let values = try JSONSerialization.jsonObject(with: Data(value.utf8)) as? [Any], values.count == 3,
              let version = values[0] as? String, !version.isEmpty,
              let parent = values[1] as? String, !parent.isEmpty,
              let ordinal = values[2] as? NSNumber, CFGetTypeID(ordinal) != CFBooleanGetTypeID(), ordinal.doubleValue >= 0,
              ordinal.doubleValue <= 9_007_199_254_740_991, ordinal.doubleValue.rounded() == ordinal.doubleValue,
              String(data: try JSONSerialization.data(withJSONObject: values, options: [.withoutEscapingSlashes]), encoding: .utf8) == value else { throw invalid() }
        return [version, parent]
    }

    private static func array(_ row: [String: Any], _ key: String) throws -> [String] {
        guard let values = row[key] as? [String], values.allSatisfy({ !$0.isEmpty }), Set(values).count == values.count else { throw invalid() }
        return values
    }
    private static func hex(_ value: String, count: Int) throws -> Data {
        guard value.count == count * 2 else { throw invalid() }
        var bytes = Data()
        for offset in stride(from: 0, to: value.count, by: 2) {
            let start = value.index(value.startIndex, offsetBy: offset), end = value.index(start, offsetBy: 2)
            guard let byte = UInt8(value[start..<end], radix: 16) else { throw invalid() }
            bytes.append(byte)
        }
        guard bytes.hex == value else { throw invalid() }
        return bytes
    }
    private static func invalid() -> Error { FolioleFramedSyncValidationError("framed_sync_pull_batch_invalid") }
}
