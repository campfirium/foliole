import Foundation
import Network

final class FolioleCompanionSyncGroupJoinServer {
    var discovery: [String: Any]
    let dataBridge: FolioleCompanionSyncGroupDataRequesting?
    private let listener: NWListener
    let provider: FolioleCompanionSyncGroupJoinProvider
    let snapshots: FolioleCompanionSyncGroupSnapshot?
    var memberStateReady = Set<String>()
    private let queue = DispatchQueue(label: "com.foliole.ios.sync-group-provider")
    let stateChanged: () -> Void
    private(set) var port: UInt16?
    let runtimeInstanceId: String

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
        runtimeInstanceId = discovery["runtime_instance_id"] as? String ?? ""
        listener = try NWListener(using: .tcp, on: .any)
        listener.service = FolioleCompanionSyncGroupAdvertisement.service(discovery)
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

    func updateDiscovery(_ value: [String: Any]) {
        queue.sync {
            discovery = value
            listener.service = FolioleCompanionSyncGroupAdvertisement.service(value)
        }
    }

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

    func sendWorkgroup(
        _ connection: NWConnection, _ request: FolioleCompanionHttpMessage,
        _ contentType: String, _ body: Data, status: Int = 200
    ) throws {
        let response = try FolioleCompanionSyncGroupWorkgroup.response(
            request, status: status, contentType: contentType, body: body,
            groupTag: try Self.requiredDiscovery(discovery, "group_tag"), workgroupKey: provider.workgroupKey
        )
        connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
    }

    private func respondError(_ connection: NWConnection, _ error: Error) {
        let message = error.localizedDescription
        let status = (error as NSError).domain == "FolioleCompanionSyncGroupWorkgroup" ? 401 :
            message == "request_too_large" ? 413 :
            message.contains("identity_mismatch") || message == "sync_group_member_state_required" ? 409 : 400
        try? send(connection, status, ["error": message])
    }

    func send(_ connection: NWConnection, _ status: Int, _ value: [String: Any]) throws {
        let response = try FolioleCompanionHttpMessage.response(status: status, value: value)
        connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
    }

    static func requiredDiscovery(_ value: [String: Any], _ key: String) throws -> String {
        guard let result = value[key] as? String, !result.isEmpty else { throw invalid("\(key)_missing") }
        return result
    }

    static func query(_ path: String, _ name: String) -> String? {
        guard let query = path.split(separator: "?", maxSplits: 1).dropFirst().first else { return nil }
        for item in query.split(separator: "&") {
            let pair = item.split(separator: "=", maxSplits: 1).map(String.init)
            if pair.first == name { return (pair.count == 2 ? pair[1] : "").removingPercentEncoding }
        }
        return nil
    }

    static func invalid(_ message: String) -> Error {
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
