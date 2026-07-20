import Foundation

final class FolioleCompanionSyncDiagnosticsStore {
    typealias PairingState = () throws -> [String: Any]

    private let databaseURL: URL
    private let queries: FolioleCompanionSyncDiagnosticQueryStore
    private let pairingState: PairingState

    init(databaseURL: URL, bundle: Bundle = .main, pairingState: @escaping PairingState) throws {
        self.databaseURL = databaseURL
        self.queries = try FolioleCompanionSyncDiagnosticQueryStore(databaseURL: databaseURL, bundle: bundle)
        self.pairingState = pairingState
    }

    func diagnose() throws -> [String: Any] {
        let pairing = try pairingState()
        let endpoint = try queries.meta("workspace_sync_endpoint_url")
        let storage = try queries.metrics("diagnosticStorageMetrics")
        let state = try syncState()
        let content = try contentMetrics()
        let appVersion: Any = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? NSNull()
        let deviceId: Any = pairing["device_id"] ?? NSNull()
        let deviceName: Any = pairing["device_name"] ?? NSNull()
        let endpointValue: Any = endpoint ?? NSNull()
        return [
            "collected_at": ISO8601DateFormatter().string(from: Date()),
            "connection": [
                "endpoint_url": endpointValue,
                "last_error": NSNull(),
                "state": (pairing["is_paired"] as? Bool == true && endpoint != nil) ? "ready" : "missing"
            ],
            "content": content,
            "events": try events(),
            "host": "ios",
            "identity": [
                "app_version": appVersion,
                "database_path": databaseURL.path,
                "device_id": deviceId,
                "device_name": deviceName
            ],
            "storage": storage,
            "sync_state": state,
            "verdicts": []
        ]
    }

    private func syncState() throws -> [String: Any] {
        var state = try queries.metrics("diagnosticSyncStateMetrics").reduce(into: [String: Any]()) {
            $0[$1.key] = $1.value
        }
        let maximum = state["max_state_seq"] as? Int ?? 0
        let cursor = Int(try queries.meta("sync_pack_cursor") ?? "") ?? 0
        state["max_state_seq"] = maximum > 0 ? maximum : NSNull() as Any
        state["pack_cursor"] = cursor > 0 ? cursor : NSNull() as Any
        state["dirty_objects"] = try queries.rows("diagnosticDirtyObjects")
        state["pending_acks"] = try queries.rows("diagnosticPendingAcks")
        state["push_issues"] = try queries.rows("diagnosticPushIssues")
        state["state_counts"] = try queries.rows("diagnosticSyncStateCounts")
        return state
    }

    private func contentMetrics() throws -> [String: Any] {
        var content = try queries.metrics("diagnosticContentBodyMetrics").reduce(into: [String: Any]()) {
            $0[$1.key] = $1.value
        }
        addBodySummary(try queries.rows("contentBlobMissingSummaryRows"), to: &content)
        addAttachmentSummary(try queries.rows("attachmentResourceMissingSummaryRows"), to: &content)
        content["active_topic"] = try queries.rows("diagnosticActiveTopic").first ?? NSNull()
        content["recent_topics"] = try queries.rows("diagnosticRecentTopics")
        return content
    }

    private func addBodySummary(_ rows: [[String: Any]], to content: inout [String: Any]) {
        let failed = rows.filter { $0["availability"] as? String == "failed" }
        content["missing_content_blob_count"] = rows.count
        content["missing_content_blob_bytes"] = sum(rows)
        content["failed_content_blob_count"] = failed.count
        content["failed_content_blob_bytes"] = sum(failed)
    }

    private func addAttachmentSummary(_ rows: [[String: Any]], to content: inout [String: Any]) {
        let missing = rows.filter {
            ($0["availability"] as? String) != "cached" || !hasText($0["storage_key"])
        }
        let failed = missing.filter { $0["availability"] as? String == "failed" }
        let images = missing.filter { ($0["mime_type"] as? String)?.hasPrefix("image/") == true }
        let pdfs = missing.filter { $0["mime_type"] as? String == "application/pdf" }
        let other = missing.filter { row in
            let mime = row["mime_type"] as? String ?? ""
            return !mime.hasPrefix("image/") && mime != "application/pdf"
        }
        content["missing_attachment_resource_count"] = missing.count
        content["missing_attachment_resource_bytes"] = sum(missing)
        content["failed_attachment_resource_count"] = failed.count
        content["failed_attachment_resource_bytes"] = sum(failed)
        content["missing_active_topic_attachment_resource_count"] = missing.filter { $0["active_topic"] as? Int == 1 }.count
        content["missing_due_review_attachment_resource_count"] = missing.filter { $0["due_review"] as? Int == 1 }.count
        addCategory("image", images, to: &content)
        addCategory("pdf", pdfs, to: &content)
        addCategory("other", other, to: &content)
    }

    private func addCategory(_ name: String, _ rows: [[String: Any]], to content: inout [String: Any]) {
        content["missing_\(name)_attachment_resource_count"] = rows.count
        content["missing_\(name)_attachment_resource_bytes"] = sum(rows)
    }

    private func events() throws -> [Any] {
        guard let value = try queries.meta("workspace_sync_events"), let data = value.data(using: .utf8),
              let events = try JSONSerialization.jsonObject(with: data) as? [Any] else { return [] }
        return events
    }

    private func sum(_ rows: [[String: Any]]) -> Int { rows.reduce(0) { $0 + ($1["size_bytes"] as? Int ?? 0) } }
    private func hasText(_ value: Any?) -> Bool { (value as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false }
}
