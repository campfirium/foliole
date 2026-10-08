import CoreFoundation
import Foundation
import FolioleFramedSyncRuntime

struct FolioleFramedSyncOutboundUnit {
    let index: Int
    let objectID: String
    let objectType: String
    let transferID: Data
    let contentID: Data
    let url: URL
    let directory: URL
    let messageBytes: UInt64
    let batchReady: Bool
}

enum FolioleFramedSyncOutboundPreparation {
    static func prepare(_ selection: [String: Any], index: Int, request: FolioleFramedSyncOutboundRequest,
        bridge: FolioleCompanionSyncGroupDataRequesting, staging: FolioleFramedSyncOutboundSQLite,
        root: URL, owner: FolioleFramedSyncPayloadBudget) throws -> FolioleFramedSyncOutboundUnit {
        try autoreleasepool {
            let directory = root.appendingPathComponent(UUID().uuidString, isDirectory: true)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            var complete = false, transfer: Data?
            defer {
                if !complete {
                    if let transfer { try? staging.discard(transferID: transfer) }
                    try? FileManager.default.removeItem(at: directory)
                }
            }
            let resources = try FolioleFramedSyncBridgeFactSource.metadata("inspect_framed_outbound", payload: selection,
                bridge: bridge, owner: owner, consume: FolioleCompanionFramedSyncResources.describe)
            var frozen = selection; frozen.merge(resources.0) { _, new in new }
            let metadata = try FolioleFramedSyncBridgeFactSource.preparedMetadata(bridge: bridge, selection: frozen, owner: owner)
            let prepared = try FolioleCompanionFramedSyncPreparedOutbound.decodeMetadata(metadata.0, header: metadata.1,
                resourceFiles: resources.1, frozenBodyFile: { reference in
                    try FolioleFramedSyncBodyResponse.writeFrozen(reference, selection: frozen,
                        transferID: FolioleFramedSyncOutboundRequest.text(metadata.0, "transfer_id"),
                        directory: directory, bridge: bridge, owner: owner)
                })
            transfer = prepared.transferID
            let url = directory.appendingPathComponent("request.body")
            try replay(prepared, selection: frozen, request: request, bridge: bridge,
                staging: staging, directory: directory, url: url, owner: owner)
            let size = try FolioleFramedSyncTransferSequence.transferSize(url)
            let unit = FolioleFramedSyncOutboundUnit(index: index, objectID: try FolioleFramedSyncOutboundRequest.text(selection, "object_id"),
                objectType: try FolioleFramedSyncOutboundRequest.text(selection, "object_type"),
                transferID: prepared.transferID, contentID: prepared.contentID, url: url, directory: directory,
                messageBytes: size.bytes, batchReady: batchReady(metadata.0["batch_ready"]) && !size.compressed)
            complete = true
            return unit
        }
    }

    static func batchReady(_ value: Any?) -> Bool {
        guard let flag = value as? NSNumber, CFGetTypeID(flag) == CFBooleanGetTypeID() else { return false }
        return flag.boolValue
    }

    private static func replay(_ prepared: FolioleCompanionFramedSyncPreparedOutbound, selection: [String: Any],
        request: FolioleFramedSyncOutboundRequest, bridge: FolioleCompanionSyncGroupDataRequesting,
        staging: FolioleFramedSyncOutboundSQLite, directory: URL, url: URL, owner: FolioleFramedSyncPayloadBudget) throws {
        try staging.discard(transferID: prepared.transferID)
        let source = FolioleFramedSyncBridgeFactSource.make(prepared: prepared, selection: selection,
            bridge: bridge, directory: directory, owner: owner)
        let attempt = try FolioleFramedSyncTransferWriter.prepare(groupKey: request.groupKey,
            context: request.context, prepared: prepared, source: source, staging: staging)
        guard attempt.transferID == prepared.transferID, let output = OutputStream(url: url, append: false) else {
            throw FolioleFramedSyncValidationError("framed_sync_transfer_identity_mismatch")
        }
        try FolioleFramedSyncTransferWriter.replay(attempt, staging: staging, output: output)
    }
}
