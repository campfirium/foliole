import Foundation
import FolioleFramedSyncRuntime

enum FolioleFramedSyncBridgeFactSource {
    static func metadata<T>(_ operation: String, payload: [String: Any], bridge: FolioleCompanionSyncGroupDataRequesting,
        owner: FolioleFramedSyncPayloadBudget, consume: ([String: Any]) throws -> T) throws -> T {
        try FolioleFramedSyncPayloadWorker.withLoan(owner, direction: .outbound) { loan in
            try autoreleasepool {
                var request = payload
                request["payload_loan"] = loan!.payload
                return try consume(bridge.request(operation, request))
            }
        }
    }

    static func preparedMetadata(bridge: FolioleCompanionSyncGroupDataRequesting, selection: [String: Any],
        owner: FolioleFramedSyncPayloadBudget) throws -> ([String: Any], Foliole_Sync_V22_TransferHeader) {
        try metadata("prepare_framed_outbound", payload: selection, bridge: bridge, owner: owner) { raw in
            try autoreleasepool {
                var value = raw
                let header = try FolioleCompanionFramedSyncPreparedOutbound.decodeHeader(value)
                value.removeValue(forKey: "header_message_bytes")
                return (value, header)
            }
        }
    }

    static func make(prepared: FolioleCompanionFramedSyncPreparedOutbound, selection: [String: Any],
                     bridge: FolioleCompanionSyncGroupDataRequesting, directory: URL,
                     owner: FolioleFramedSyncPayloadBudget? = nil) -> FolioleFramedSyncOutboundFactSource {
        .init(header: prepared.header, directory: directory, owner: owner) { factIndex, fragmentIndex, consume in
            try FolioleFramedSyncPayloadWorker.withLoan(owner, direction: .outbound) { loan in
              try autoreleasepool {
                var payload = selection
                if let loan { payload["payload_loan"] = loan.payload }
                payload["transfer_id"] = prepared.transferID.hex
                payload["fact_index"] = factIndex
                payload["fragment_index"] = fragmentIndex
                let value = try bridge.request("read_framed_outbound_fact", payload)
                guard let last = value["last_fragment"] as? Bool else {
                    throw FolioleFramedSyncValidationError("framed_sync_outbound_fact_response_invalid")
                }
                try consume(FolioleCompanionFramedSyncPreparedOutbound.messageBytes(value, "message_bytes"), last)
              }
            }
        }
    }
}
