import Foundation
import FolioleFramedSyncRuntime

final class FolioleFramedSyncOutboundBatchSender {
    typealias Prepare = ([String: Any], Int) async throws -> FolioleFramedSyncOutboundUnit
    typealias Upload = (URL, URL, Bool) async throws -> Void
    private let request: FolioleFramedSyncOutboundRequest
    private let owner: FolioleFramedSyncPayloadBudget
    private let bridge: FolioleCompanionSyncGroupDataRequesting
    private let staging: FolioleFramedSyncOutboundSQLite
    private let directory: URL
    private let upload: Upload
    private var outcomes = [Int: [String: Any]]()

    init(request: FolioleFramedSyncOutboundRequest, owner: FolioleFramedSyncPayloadBudget,
        bridge: FolioleCompanionSyncGroupDataRequesting, staging: FolioleFramedSyncOutboundSQLite,
        directory: URL, upload: @escaping Upload) {
        self.request = request; self.owner = owner; self.bridge = bridge
        self.staging = staging; self.directory = directory; self.upload = upload
    }

    func send(_ selections: [[String: Any]], prepare: Prepare) async throws -> [[String: Any]] {
        guard (1...128).contains(selections.count) else { throw invalid("framed_sync_transfer_batch_invalid") }
        outcomes.removeAll()
        var pending = [FolioleFramedSyncOutboundUnit](), bytes: UInt64 = 0
        var owned = [FolioleFramedSyncOutboundUnit]()
        defer { for unit in owned { try? staging.discard(transferID: unit.transferID); try? FileManager.default.removeItem(at: unit.directory) } }
        for (index, selection) in selections.enumerated() {
            let unit: FolioleFramedSyncOutboundUnit
            do { unit = try await prepare(selection, index) }
            catch {
                guard let detail = Self.dependency(error) else { throw error }
                try await sendGroup(pending); pending.removeAll(); bytes = 0
                outcomes[index] = try deferred(selection, error: detail)
                continue
            }
            owned.append(unit)
            if !unit.batchReady || unit.messageBytes > 2_097_152 {
                try await sendGroup(pending); pending.removeAll(); bytes = 0
                try await sendGroup([unit])
                continue
            }
            if bytes + unit.messageBytes > 2_097_152 || pending.count == 128 {
                try await sendGroup(pending); pending.removeAll(); bytes = 0
            }
            pending.append(unit); bytes += unit.messageBytes
            if bytes >= 1_048_576 { try await sendGroup(pending); pending.removeAll(); bytes = 0 }
        }
        try await sendGroup(pending)
        return try selections.indices.map { index in
            guard let result = outcomes[index] else { throw invalid("framed_sync_batch_result_missing") }
            return result
        }
    }

    private func sendGroup(_ units: [FolioleFramedSyncOutboundUnit]) async throws {
        guard !units.isEmpty else { return }
        let requestURL = directory.appendingPathComponent("batch-\(UUID().uuidString).request")
        let responseURL = directory.appendingPathComponent("batch-\(UUID().uuidString).response")
        defer { try? FileManager.default.removeItem(at: requestURL); try? FileManager.default.removeItem(at: responseURL) }
        do {
            try await FolioleFramedSyncPayloadWorker.run { try self.concatenate(units, to: requestURL) }
            try await upload(requestURL, responseURL, units.count > 1)
            try await FolioleFramedSyncPayloadWorker.run {
                try FolioleFramedSyncOutboundReceipts.readEach(responseURL, expected: units, request: self.request, owner: self.owner) { unit, receipt in
                    _ = try self.bridge.request("complete_framed_outbound", receipt)
                    try self.staging.discard(transferID: unit.transferID)
                    self.outcomes[unit.index] = ["kind": "committed", "object_id": unit.objectID,
                        "object_type": unit.objectType, "receipt": receipt]
                }
            }
        } catch {
            guard let detail = Self.dependency(error) else { throw error }
            if units.count > 1 {
                for unit in units where outcomes[unit.index]?["kind"] as? String != "committed" { try await sendGroup([unit]) }
            } else if let unit = units.first {
                outcomes[unit.index] = ["kind": "deferred", "object_id": unit.objectID, "object_type": unit.objectType, "error": detail]
            }
        }
    }

    private func concatenate(_ units: [FolioleFramedSyncOutboundUnit], to url: URL) throws {
        guard FileManager.default.createFile(atPath: url.path, contents: nil) else { throw invalid("framed_sync_stream_write_failed") }
        let output = try FileHandle(forWritingTo: url); defer { try? output.close() }
        for unit in units {
            let input = try FileHandle(forReadingFrom: unit.url); defer { try? input.close() }
            while try FolioleFramedSyncPayloadWorker.withLoan(owner, direction: .outbound, { _ in
                guard let bytes = try input.read(upToCount: 64 * 1024), !bytes.isEmpty else { return false }
                try output.write(contentsOf: bytes); return true
            }) {}
        }
        try output.synchronize()
    }

    private func deferred(_ selection: [String: Any], error: String) throws -> [String: Any] {
        ["kind": "deferred", "object_id": try FolioleFramedSyncOutboundRequest.text(selection, "object_id"),
         "object_type": try FolioleFramedSyncOutboundRequest.text(selection, "object_type"), "error": error]
    }
    static func dependency(_ error: Error) -> String? {
        let detail = error.localizedDescription
        let prefix = "framed_sync_http_400:"
        let code = detail.hasPrefix(prefix) ? String(detail.dropFirst(prefix.count)) : detail
        let dependencies = ["framed_sync_node_parent_missing:", "node_position_lineage_unproven:",
                            "parent_order_position_lineage_unproven:", "sync_parent_order_body_unavailable:",
            "framed_sync_review_node_missing:", "framed_sync_parent_relation_version_missing:"]
        guard let dependency = dependencies.first(where: code.hasPrefix) else { return nil }
        let identity = String(code.dropFirst(dependency.count))
        guard (1...128).contains(identity.count),
              identity.range(of: "[^A-Za-z0-9_-]", options: .regularExpression) == nil else { return nil }
        return detail
    }
    private func invalid(_ code: String) -> Error { FolioleFramedSyncValidationError(code) }
}
