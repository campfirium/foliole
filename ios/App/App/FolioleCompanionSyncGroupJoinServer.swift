import Foundation
import Network

final class FolioleCompanionSyncGroupJoinServer {
    private let discovery: [String: Any]
    private let dataBridge: FolioleCompanionSyncGroupDataRequesting?
    private let listener: NWListener
    private let provider: FolioleCompanionSyncGroupJoinProvider
    private let snapshots: FolioleCompanionSyncGroupSnapshot?
    private let queue = DispatchQueue(label: "com.foliole.ios.sync-group-provider")
    private let stateChanged: () -> Void
    private(set) var port: UInt16?

    init(
        discovery: [String: Any], provider: FolioleCompanionSyncGroupJoinProvider,
        dataBridge: FolioleCompanionSyncGroupDataRequesting? = nil,
        stateChanged: @escaping () -> Void
    ) throws {
        self.discovery = discovery
        self.provider = provider
        self.dataBridge = dataBridge
        snapshots = dataBridge.map(FolioleCompanionSyncGroupSnapshot.init)
        self.stateChanged = stateChanged
        listener = try NWListener(using: .tcp, on: .any)
        let txt = discovery.reduce(into: [String: String]()) { result, entry in
            if let value = entry.value as? String { result[entry.key] = value }
            else if let value = entry.value as? Int { result[entry.key] = String(value) }
        }
        listener.service = NWListener.Service(
            name: Self.serviceName(discovery), type: "_foliole-sync._tcp", domain: "local.",
            txtRecord: NWTXTRecord(txt)
        )
    }

    func start() throws -> UInt16 {
        let ready = DispatchSemaphore(value: 0)
        let result = LockedStartResult()
        listener.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready:
                guard let raw = self?.listener.port?.rawValue else {
                    result.finish(.failure(Self.invalid("sync_group_provider_port_missing"))); ready.signal(); return
                }
                self?.port = raw
                result.finish(.success(raw)); ready.signal()
            case .failed(let error), .waiting(let error):
                result.finish(.failure(error)); ready.signal()
            default: break
            }
        }
        listener.newConnectionHandler = { [weak self] connection in self?.receive(connection, Data()) }
        listener.start(queue: queue)
        guard ready.wait(timeout: .now() + 5) == .success,
              let outcome = result.value else { throw Self.invalid("sync_group_provider_start_timed_out") }
        return try outcome.get()
    }

    func stop() { listener.cancel(); snapshots?.close() }

    private func receive(_ connection: NWConnection, _ accumulated: Data) {
        connection.start(queue: queue)
        read(connection, accumulated)
    }

    private func read(_ connection: NWConnection, _ accumulated: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) {
            [weak self] data, _, complete, error in
            guard let self else { connection.cancel(); return }
            var next = accumulated
            if let data { next.append(data) }
            do {
                if let expected = try FolioleCompanionHttpMessage.expectedLength(next), next.count >= expected {
                    try self.respond(connection, FolioleCompanionHttpMessage.parse(next)); return
                }
                if complete || error != nil { throw Self.invalid("incomplete_http_request") }
                self.read(connection, next)
            } catch { self.respondError(connection, error) }
        }
    }

    private func respond(_ connection: NWConnection, _ request: FolioleCompanionHttpMessage) throws {
        let route = request.path.split(separator: "?", maxSplits: 1).first.map(String.init) ?? request.path
        if request.method == "GET" && route == "/health" { return try send(connection, 200, ["ok": true]) }
        if request.method == "GET" && route == "/companion/discovery" {
            return try send(connection, 200, discoveryPayload())
        }
        if request.method == "POST" && route == "/sync-group/join-requests" {
            let created = try provider.receive(request.body)
            stateChanged()
            return try send(connection, 202, created)
        }
        if request.method == "POST" && route == "/sync-group/join-acceptance" {
            let requestId = try FolioleCompanionSyncGroupJoinRequest.required(request.body, "request_id")
            guard let accepted = try provider.collect(requestId) else {
                return try send(connection, 409, ["error": "sync_group_join_request_pending"])
            }
            stateChanged()
            return try send(connection, 200, accepted)
        }
        if request.method == "GET" && route == "/companion/sync-pack" {
            guard let snapshots, let dataBridge else { throw Self.invalid("sync_group_data_owner_unavailable") }
            let peer = try authenticate(request)
            let after = Int(Self.query(request.path, "after_state_seq") ?? "0") ?? 0
            let result = try snapshots.refresh(peer) { snapshot in
                try FolioleCompanionSyncPackProvider.build(
                    snapshot: snapshot,
                    fromDevice: try Self.requiredDiscovery(discovery, "provider_device_id"),
                    toDevice: peer, fromSequence: after
                )
            }
            _ = try dataBridge.request("record_supply_cursor", [
                "from_cursor": after, "peer_id": peer, "to_cursor": result.toSequence
            ])
            return try sendWorkgroup(connection, request, "application/zip", result.body)
        }
        if request.method == "POST" && route == "/companion/content-blobs" {
            guard let snapshots else { throw Self.invalid("sync_group_data_owner_unavailable") }
            let peer = try authenticate(request)
            let plaintext = try FolioleCompanionSyncGroupWorkgroup.decryptRequest(
                request, groupTag: try Self.requiredDiscovery(discovery, "group_tag"),
                workgroupKey: provider.workgroupKey
            )
            let resource = try snapshots.read(peer) {
                try FolioleCompanionSyncGroupResources.contentBlobBatch(snapshot: $0, requestData: plaintext)
            }
            return try sendWorkgroup(connection, request, resource.contentType, resource.body)
        }
        if request.method == "GET" && route == "/companion/content-blob" {
            return try sendResource(connection, request, kind: "blob")
        }
        if request.method == "GET" && route == "/companion/attachment-resource" {
            return try sendResource(connection, request, kind: "attachment")
        }
        try send(connection, 404, ["error": "not_found"])
    }

    private func authenticate(_ request: FolioleCompanionHttpMessage) throws -> String {
        guard let dataBridge else { throw Self.invalid("sync_group_data_owner_unavailable") }
        return try FolioleCompanionSyncGroupWorkgroup.authenticate(
            request, groupId: provider.groupId, workgroupKey: provider.workgroupKey, dataBridge: dataBridge
        )
    }

    private func sendResource(
        _ connection: NWConnection, _ request: FolioleCompanionHttpMessage, kind: String
    ) throws {
        let peer = try authenticate(request)
        guard let snapshots else { throw Self.invalid("sync_group_data_owner_unavailable") }
        let resource = try snapshots.read(peer) { snapshot in
            if kind == "blob" {
                return try FolioleCompanionSyncGroupResources.contentBlob(
                    snapshot: snapshot, hash: Self.query(request.path, "hash")
                )
            }
            return try FolioleCompanionSyncGroupResources.attachment(
                snapshot: snapshot, attachmentId: Self.query(request.path, "attachment_id"),
                contentHash: Self.query(request.path, "content_hash")
            )
        }
        guard let resource else {
            let body = try JSONSerialization.data(withJSONObject: ["error": kind == "blob" ? "blob_not_found" : "missing_file"])
            return try sendWorkgroup(connection, request, "application/json; charset=utf-8", body, status: 404)
        }
        try sendWorkgroup(connection, request, resource.contentType, resource.body)
    }

    private func sendWorkgroup(
        _ connection: NWConnection, _ request: FolioleCompanionHttpMessage,
        _ contentType: String, _ body: Data, status: Int = 200
    ) throws {
        let response = try FolioleCompanionSyncGroupWorkgroup.response(
            request, status: status, contentType: contentType, body: body,
            groupTag: try Self.requiredDiscovery(discovery, "group_tag"), workgroupKey: provider.workgroupKey
        )
        connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
    }

    private func discoveryPayload() -> [String: Any] {
        var result = discovery
        result["protocol"] = ["version": discovery["protocol_version"] as Any,
            "min_supported_version": discovery["protocol_min_version"] as Any,
            "max_supported_version": discovery["protocol_max_version"] as Any,
            "capabilities": discovery["protocol_capabilities"] as Any]
        for key in ["facts_revision", "protocol_version", "protocol_min_version",
                    "protocol_max_version", "protocol_capabilities"] { result.removeValue(forKey: key) }
        return result
    }

    private func respondError(_ connection: NWConnection, _ error: Error) {
        let message = error.localizedDescription
        let status = (error as NSError).domain == "FolioleCompanionSyncGroupWorkgroup" ? 401 :
            message == "request_too_large" ? 413 :
            message.contains("identity_mismatch") ? 409 : 400
        try? send(connection, status, ["error": message])
    }

    private func send(_ connection: NWConnection, _ status: Int, _ value: [String: Any]) throws {
        let response = try FolioleCompanionHttpMessage.response(status: status, value: value)
        connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
    }

    private static func serviceName(_ discovery: [String: Any]) -> String {
        let name = discovery["group_display_name"] as? String ?? "Foliole"
        let runtime = (discovery["runtime_instance_id"] as? String ?? "runtime").prefix(8)
        return String("\(name)-\(runtime)".prefix(63))
    }

    private static func requiredDiscovery(_ value: [String: Any], _ key: String) throws -> String {
        guard let result = value[key] as? String, !result.isEmpty else { throw invalid("\(key)_missing") }
        return result
    }

    private static func query(_ path: String, _ name: String) -> String? {
        guard let query = path.split(separator: "?", maxSplits: 1).dropFirst().first else { return nil }
        for item in query.split(separator: "&") {
            let pair = item.split(separator: "=", maxSplits: 1).map(String.init)
            if pair.first == name { return (pair.count == 2 ? pair[1] : "").removingPercentEncoding }
        }
        return nil
    }

    private static func invalid(_ message: String) -> Error {
        NSError(domain: "FolioleCompanionSyncGroupProvider", code: 1,
                userInfo: [NSLocalizedDescriptionKey: message])
    }
}

private final class LockedStartResult: @unchecked Sendable {
    private let lock = NSLock()
    private var stored: Result<UInt16, Error>?
    var value: Result<UInt16, Error>? { lock.withLock { stored } }
    func finish(_ value: Result<UInt16, Error>) { lock.withLock { if stored == nil { stored = value } } }
}
