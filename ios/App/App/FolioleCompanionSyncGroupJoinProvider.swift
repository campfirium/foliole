import Foundation

final class FolioleCompanionSyncGroupJoinProvider {
    private let groupInfo: [String: Any]
    private let lock = NSLock()
    private var requests: [String: FolioleCompanionSyncGroupJoinRequest] = [:]

    init(groupInfo value: [String: Any]) throws {
        try FolioleCompanionSyncGroupJoinRequest.exactKeys(
            value, ["display_name", "group_id", "workgroup_key"]
        )
        _ = try FolioleCompanionSyncGroupJoinRequest.required(value, "display_name")
        _ = try FolioleCompanionSyncGroupJoinRequest.required(value, "group_id")
        let workgroupKey = try FolioleCompanionSyncGroupJoinRequest.required(value, "workgroup_key")
        guard try Base64URL.decode(workgroupKey).count == 32 else {
            throw FolioleCompanionSyncGroupJoinRequest.invalid("workgroup_key_invalid")
        }
        groupInfo = value
    }

    func receive(_ input: [String: Any], now: Date = Date()) throws -> [String: Any] {
        try lock.withLock {
            prune(now: now)
            let request = try FolioleCompanionSyncGroupJoinRequest(value: input, now: now)
            guard request.groupId == groupInfo["group_id"] as? String else {
                throw FolioleCompanionSyncGroupJoinRequest.invalid("sync_group_identity_mismatch")
            }
            requests[request.requestId] = request
            return request.publicValue()
        }
    }

    func pending(now: Date = Date()) -> [[String: Any]] {
        lock.withLock {
            prune(now: now)
            return requests.values.filter(\.isPending)
                .sorted { $0.requestedAt < $1.requestedAt }.map { $0.publicValue() }
        }
    }

    func accept(_ requestId: String, now: Date = Date()) throws -> [String: Any] {
        try lock.withLock {
            let request = try requirePending(requestId, now: now)
            let plaintext = try JSONSerialization.data(withJSONObject: groupInfo, options: [.sortedKeys])
            let acceptance: [String: Any] = [
                "encrypted_group_info": try FolioleCompanionSyncGroupJoinCrypto.encrypt(
                    publicKey: request.publicKey, plaintext: plaintext
                ),
                "expires_at": FolioleCompanionSyncGroupJoinRequest.timestamp(request.expiresAt),
                "request_id": request.requestId
            ]
            request.acceptance = acceptance
            return acceptance
        }
    }

    func request(_ requestId: String, now: Date = Date()) throws -> FolioleCompanionSyncGroupJoinRequest {
        try lock.withLock { try requirePending(requestId, now: now) }
    }

    var groupId: String { groupInfo["group_id"] as? String ?? "" }
    var workgroupKey: String { groupInfo["workgroup_key"] as? String ?? "" }

    func collect(_ requestId: String, now: Date = Date()) throws -> [String: Any]? {
        try lock.withLock {
            prune(now: now)
            let id = try validRequestId(requestId)
            guard let acceptance = requests[id]?.acceptance else { return nil }
            requests.removeValue(forKey: id)
            return acceptance
        }
    }

    func reject(_ requestId: String, now: Date = Date()) throws -> Bool {
        try lock.withLock {
            prune(now: now)
            return requests.removeValue(forKey: try validRequestId(requestId)) != nil
        }
    }

    func clear() { lock.withLock { requests.removeAll() } }

    private func requirePending(_ requestId: String, now: Date) throws -> FolioleCompanionSyncGroupJoinRequest {
        prune(now: now)
        guard let request = requests[try validRequestId(requestId)] else {
            throw FolioleCompanionSyncGroupJoinRequest.invalid("sync_group_join_request_not_found")
        }
        guard request.isPending else {
            throw FolioleCompanionSyncGroupJoinRequest.invalid("sync_group_join_request_already_accepted")
        }
        return request
    }

    private func prune(now: Date) {
        requests = requests.filter { !$0.value.isExpired(at: now) }
    }

    private func validRequestId(_ value: String) throws -> String {
        let pattern = "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
        guard value.range(of: pattern, options: .regularExpression) != nil else {
            throw FolioleCompanionSyncGroupJoinRequest.invalid("sync_group_join_request_id_invalid")
        }
        return value
    }
}

final class FolioleCompanionSyncGroupJoinService {
    static let shared = FolioleCompanionSyncGroupJoinService()
    private let lock = NSLock()
    private var provider: FolioleCompanionSyncGroupJoinProvider?
    private var server: FolioleCompanionSyncGroupJoinServer?

    func install(
        groupInfo: [String: Any], discovery: [String: Any],
        dataBridge: FolioleCompanionSyncGroupDataRequesting? = nil, stateChanged: @escaping () -> Void
    ) throws {
        let next = try FolioleCompanionSyncGroupJoinProvider(groupInfo: groupInfo)
        let nextServer = try FolioleCompanionSyncGroupJoinServer(
            discovery: discovery, provider: next, dataBridge: dataBridge, stateChanged: stateChanged
        )
        _ = try nextServer.start()
        lock.withLock {
            server?.stop()
            provider?.clear()
            provider = next
            server = nextServer
        }
    }

    func clearForRestart() {
        lock.withLock {
            server?.stop()
            provider?.clear()
            server = nil
            provider = nil
        }
    }

    func state() throws -> [String: Any] {
        try lock.withLock {
            guard let provider, let port = server?.port else {
                throw FolioleCompanionSyncGroupJoinRequest.invalid("sync_group_join_provider_unavailable")
            }
            return ["pending_requests": provider.pending(), "port": Int(port), "state": "running"]
        }
    }

    func withProvider<T>(_ operation: (FolioleCompanionSyncGroupJoinProvider) throws -> T) throws -> T {
        try lock.withLock {
            guard let provider else {
                throw FolioleCompanionSyncGroupJoinRequest.invalid("sync_group_join_provider_unavailable")
            }
            return try operation(provider)
        }
    }
}
