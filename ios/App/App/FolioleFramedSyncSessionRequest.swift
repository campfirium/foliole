import Foundation
import FolioleFramedSyncRuntime

enum FolioleFramedSyncSessionRequest {
    case inventory(begin: Foliole_Sync_V22_InventoryBegin)
    case difference(encoded: Data)
    case differences(encoded: [Data])

    static func read(_ input: InputStream, groupKey: Data,
        context: FolioleFramedSyncSessionContext, owner: FolioleFramedSyncPayloadBudget? = nil) throws -> Self {
        let inventory = FolioleFramedSyncInventoryWire.Reader(retainEntries: false)
        var differences = [Data]()
        var round: Data?, identities = Set<String>(), bytes = 0
        var resource = false
        var count = 0
        _ = try FolioleFramedSyncSessionReader.readEach(input, groupKey: groupKey, context: context,
            maximumFrames: FolioleFramedSyncInventoryWire.maximumSessionFrames, owner: owner,
            onPlaintextBytes: { bytes += $0 }) { message in
            if case .differenceRequest(let value) = message.payload {
                guard count == differences.count, differences.count < 128,
                      round == nil || round == value.roundID else { throw invalid() }
                let encoded = try FolioleFramedSyncCodec.encode(message)
                guard bytes <= 768 * 1024 else { throw invalid() }
                if !value.resources.isEmpty {
                    guard count == 0 else { throw invalid() }
                    resource = true
                } else {
                    guard !resource, let first = value.facts.first,
                          value.facts.allSatisfy({ $0.objectType == first.objectType && $0.globalID == first.globalID }),
                          identities.insert(first.objectType + "\u{0}" + first.globalID).inserted else { throw invalid() }
                }
                round = value.roundID
                differences.append(encoded)
            } else {
                guard differences.isEmpty else { throw invalid() }
                try inventory.accept(message)
            }
            count += 1
        }
        if differences.count == 1 { return .difference(encoded: differences[0]) }
        if !differences.isEmpty { return .differences(encoded: differences) }
        return .inventory(begin: try inventory.requestBegin())
    }

    private static func invalid() -> FolioleFramedSyncValidationError {
        .init("framed_sync_session_request_invalid")
    }
}
