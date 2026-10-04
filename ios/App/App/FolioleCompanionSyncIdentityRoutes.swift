import Foundation
import Network

enum FolioleCompanionSyncIdentityRoutes {
    static func supports(_ path: String) -> Bool {
        [
            "/companion/sync-identity-summary", "/companion/sync-identity-page",
            "/companion/sync-identity-global-summary", "/companion/sync-identity-global-page",
            "/companion/sync-identity-fact-summary", "/companion/sync-identity-fact-page",
            "/companion/sync-identity-fact-global-page",
            "/companion/sync-identity-node-facts",
            "/companion/sync-identity-changed-page"
        ].contains(path)
    }

    static func read(
        request: FolioleCompanionHttpMessage, peer: String,
        snapshots: FolioleCompanionSyncGroupSnapshot,
        bridge: FolioleCompanionSyncGroupDataRequesting
    ) throws -> [String: Any] {
        let route = request.path.split(separator: "?", maxSplits: 1).first.map(String.init) ?? request.path
        let kind = readKind(route)
        let work: (URL) throws -> [String: Any] = { snapshot in
            let viewId = try viewId(snapshot)
            let requested = FolioleCompanionSyncGroupJoinServer.query(request.path, "source_view_id")
            guard kind == "summary" || kind == "global_summary"
                ? requested == nil : requested == viewId else {
                throw invalid("sync_identity_source_view_changed")
            }
            var payload: [String: Any] = ["snapshot_path": snapshot.path, "read_kind": kind]
            for key in ["partition", "after_type", "after_id", "after_updated_at", "since",
                        "node_id", "section", "after"] {
                guard let value = FolioleCompanionSyncGroupJoinServer.query(request.path, key) else { continue }
                if key == "partition" {
                    guard let number = Int(value) else { throw invalid("sync_identity_request_invalid") }
                    payload[key] = number
                } else { payload[key] = value }
            }
            var result = try bridge.request("read_identity_source", payload)
            result["contract"] = (kind.hasPrefix("global_") || kind.hasPrefix("fact_global_")) ? "global-id-v2" : "global-id-v1"
            result["source_view_id"] = viewId
            if let partition = payload["partition"] { result["partition"] = partition }
            return result
        }
        return try kind == "summary" || kind == "global_summary"
            ? snapshots.refreshIdentity(peer, work: work)
            : snapshots.read(peer, work: work)
    }

    static func viewId(_ snapshot: URL) throws -> String {
        let filename = snapshot.deletingPathExtension().lastPathComponent
        guard filename.hasPrefix("foliole-provider-source-"),
              let view = UUID(uuidString: String(filename.dropFirst("foliole-provider-source-".count)))
        else { throw invalid("sync_identity_source_view_invalid") }
        return view.uuidString.lowercased()
    }

    private static func readKind(_ route: String) -> String {
        switch route {
        case "/companion/sync-identity-global-summary": return "global_summary"
        case "/companion/sync-identity-global-page": return "global_page"
        case "/companion/sync-identity-summary": return "summary"
        case "/companion/sync-identity-page": return "page"
        case "/companion/sync-identity-fact-summary": return "fact_global_summary"
        case "/companion/sync-identity-fact-global-page": return "fact_global_page"
        case "/companion/sync-identity-fact-page": return "fact_page"
        case "/companion/sync-identity-node-facts": return "node_facts"
        default: return "changed_page"
        }
    }

    private static func invalid(_ message: String) -> Error {
        NSError(domain: "FolioleCompanionSyncIdentityRoutes", code: 1,
                userInfo: [NSLocalizedDescriptionKey: message])
    }
}

extension FolioleCompanionSyncGroupJoinServer {
    func respondIdentityPack(_ connection: NWConnection, _ request: FolioleCompanionHttpMessage) throws {
        guard let snapshots, let dataBridge else { throw Self.invalid("sync_group_data_owner_unavailable") }
        let peer = try authenticate(request)
        let plaintext = try FolioleCompanionSyncGroupWorkgroup.decryptRequest(request,
            groupTag: try Self.requiredDiscovery(discovery, "group_tag"), workgroupKey: provider.workgroupKey)
        guard let page = try JSONSerialization.jsonObject(with: plaintext) as? [String: Any] else {
            throw Self.invalid("sync_identity_pack_page_invalid")
        }
        do {
            let archive = try snapshots.read(peer) { snapshot in
                let viewId = try FolioleCompanionSyncIdentityRoutes.viewId(snapshot)
                _ = try dataBridge.request("prepare_identity_pack", [
                    "snapshot_path": snapshot.path, "source_view_id": viewId,
                    "authenticated_device_id": peer, "page": page
                ])
                return try FolioleCompanionSyncIdentityPackBuilder.build(snapshot: snapshot, page: page)
            }
            try sendWorkgroup(connection, request, "application/zip", archive)
        } catch {
            let code = error.localizedDescription
            let status = code.contains("view") || code.contains("over_budget") ||
                code.contains("source_changed") ? 409 : 400
            let body = try JSONSerialization.data(withJSONObject: ["error": code])
            try sendWorkgroup(connection, request, "application/json; charset=utf-8", body, status: status)
        }
    }

    func respondIdentity(_ connection: NWConnection, _ request: FolioleCompanionHttpMessage) throws {
        guard let snapshots, let dataBridge else { throw Self.invalid("sync_group_data_owner_unavailable") }
        let peer = try authenticate(request)
        do {
            let response = try FolioleCompanionSyncIdentityRoutes.read(
                request: request, peer: peer, snapshots: snapshots, bridge: dataBridge)
            let body = try JSONSerialization.data(withJSONObject: response, options: [.sortedKeys])
            try sendWorkgroup(connection, request, "application/json; charset=utf-8", body)
        } catch {
            let code = error.localizedDescription
            let status = code.contains("view_unavailable") || code.contains("view_changed")
                || code.contains("item_too_large") ? 409 : 400
            let body = try JSONSerialization.data(withJSONObject: ["error": code])
            try sendWorkgroup(connection, request, "application/json; charset=utf-8", body, status: status)
        }
    }
}
