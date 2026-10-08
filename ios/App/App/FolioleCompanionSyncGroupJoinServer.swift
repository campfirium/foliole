import Foundation
import FolioleFramedSyncRuntime
import Network

final class FolioleCompanionSyncGroupJoinServer {
    var discovery: [String: Any]
    let dataBridge: FolioleCompanionSyncGroupDataRequesting?
    private let listener: NWListener
    let provider: FolioleCompanionSyncGroupJoinProvider
    var memberStateReady = [String: String]()
    private let queue = DispatchQueue(label: "com.campfirium.foliole.ios.sync-group-provider")
    let stateChanged: () -> Void
    private(set) var port: UInt16?
    let runtimeInstanceId: String
    let framedTransfers: FolioleFramedSyncTransferReceiver?

    init(
        discovery: [String: Any], provider: FolioleCompanionSyncGroupJoinProvider,
        dataBridge: FolioleCompanionSyncGroupDataRequesting? = nil,
        stateChanged: @escaping () -> Void
    ) throws {
        self.discovery = discovery
        self.provider = provider
        self.dataBridge = dataBridge
        if dataBridge != nil {
            let support = try FileManager.default.url(
                for: .applicationSupportDirectory, in: .userDomainMask,
                appropriateFor: nil, create: true
            )
            let url = support.appendingPathComponent("Foliole/framed-sync/ios-transfer.db")
            framedTransfers = try .init(database: FolioleFramedSyncTransferDatabase(url: url))
        } else { framedTransfers = nil }
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
        listener.newConnectionHandler = { [weak self] connection in self?.receive(connection) }
        listener.start(queue: queue)
        guard ready.wait(timeout: .now() + 5) == .success,
              let outcome = result.value else { throw Self.invalid("sync_group_provider_start_timed_out") }
        return try outcome.get()
    }

    func stop() { listener.cancel() }

    func updateDiscovery(_ value: [String: Any]) {
        queue.sync {
            discovery = value
            listener.service = FolioleCompanionSyncGroupAdvertisement.service(value)
        }
    }

    private func receive(_ connection: NWConnection) {
        connection.start(queue: queue)
        do {
            let owner = try dataBridge.map { _ in try FolioleFramedSyncPayloadBudgetRegistry.shared.requireCurrent() }
            let reader = FolioleCompanionHttpRequestReader(payloadBudget: owner)
            connection.stateUpdateHandler = { state in
                if case .cancelled = state { reader.payloadCancellation.cancel() }
                if case .failed = state { reader.payloadCancellation.cancel() }
            }
            read(connection, reader)
        } catch { respondError(connection, error) }
    }

    private func read(_ connection: NWConnection, _ reader: FolioleCompanionHttpRequestReader) {
        guard let owner = reader.payloadBudget, let lane = reader.networkLane else { return readGranted(connection, reader, loan: nil) }
        let id = owner.acquire(.inbound, lane: lane) { result in
            self.queue.async {
                do {
                    let loan = try result.get()
                    reader.payloadCancellation.remove(loan.requestID)
                    guard !reader.payloadCancellation.isCancelled else { loan.release(); return }
                    self.readGranted(connection, reader, loan: loan)
                } catch { self.respondError(connection, error) }
            }
        }
        reader.payloadCancellation.register(id) { owner.cancel(id) }
    }

    private func readGranted(_ connection: NWConnection, _ reader: FolioleCompanionHttpRequestReader,
                             loan: FolioleFramedSyncPayloadBudget.Loan?) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: reader.networkReadBytes) {
            [weak self] data, _, complete, error in
            defer { loan?.release() }
            guard let self else { connection.cancel(); return }
            do {
                if let data, let request = try reader.append(data) {
                    try self.respond(connection, request); return
                }
                if complete || error != nil { throw Self.invalid("incomplete_http_request") }
                self.read(connection, reader)
            } catch { self.respondError(connection, error) }
        }
    }

    func sendWorkgroup(
        _ connection: NWConnection, _ request: FolioleCompanionHttpMessage,
        _ contentType: String, _ body: Data, status: Int = 200, totalBytes: Int? = nil
    ) throws {
        let response = try FolioleCompanionSyncGroupWorkgroup.response(
            request, status: status, contentType: contentType, body: body,
            groupTag: try Self.requiredDiscovery(discovery, "group_tag"),
            workgroupKey: provider.workgroupKey, totalBytes: totalBytes
        )
        connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
    }

    func respondFramedSync(
        _ connection: NWConnection, _ request: FolioleCompanionHttpMessage
    ) throws {
        guard let owner = request.payloadBudget else { throw Self.invalid("framed_sync_payload_budget_not_configured") }
        let cancellation = request.payloadCancellation
        FolioleFramedSyncPayloadWorker.queue.async {
            do {
                try FolioleFramedSyncPayloadWorker.withCancellation(cancellation) {
                    try self.processFramedSync(connection, request, owner: owner)
                }
            }
            catch { self.respondError(connection, error) }
        }
    }

    private func processFramedSync(_ connection: NWConnection, _ request: FolioleCompanionHttpMessage,
                                   owner: FolioleFramedSyncPayloadBudget) throws {
        try owner.requireActive()
        let contentType = request.header("content-type")?.split(separator: ";", maxSplits: 1).first?
            .trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard contentType == FolioleFramedSyncHTTPTransport.contentType else {
            return try send(connection, 415, ["error": "framed_sync_content_type_required"])
        }
        guard let rawBridge = dataBridge else { throw Self.invalid("sync_group_data_owner_unavailable") }
        let dataBridge = FolioleFramedSyncOwnedBridge(bridge: rawBridge, owner: owner)
        let peer = try authenticate(request, bridge: dataBridge)
        let initiator = try framedIdentity(request, "initiator_device_id")
        guard initiator == peer else { throw Self.invalid("framed_sync_initiator_identity_mismatch") }
        let initiatorEpoch = try framedIdentity(request, "initiator_library_epoch")
        let responder = try framedIdentity(request, "responder_device_id")
        let responderEpoch = try framedIdentity(request, "responder_library_epoch")
        let localDevice = try Self.requiredDiscovery(discovery, "provider_device_id")
        let memberState = try dataBridge.request("load_member_state", [:])
        guard let localEpoch = memberState["library_epoch"] as? String, !localEpoch.isEmpty,
              responder == localDevice, responderEpoch == localEpoch else {
            return try send(connection, 409, ["error": "framed_sync_responder_identity_mismatch"])
        }
        let preamble = try FolioleFramedSyncPreamble(
            decoding: request.bodyPrefix(FolioleFramedSyncPreamble.byteCount)
        )
        if preamble.contextKind == 2 {
            return try respondFramedTransfer(
                connection, request, peer: peer, localDevice: localDevice, localEpoch: localEpoch,
                initiator: initiator, initiatorEpoch: initiatorEpoch,
                groupKey: Base64URL.decode(provider.workgroupKey), owner: owner
            )
        }
        let context = try FolioleFramedSyncSessionContext(
            groupID: provider.groupId, initiatorDeviceID: initiator,
            initiatorLibraryEpoch: initiatorEpoch, responderDeviceID: responder,
            responderLibraryEpoch: responderEpoch
        )
        let groupKey = try Base64URL.decode(provider.workgroupKey)
        try respondFramedSession(connection, request, groupKey: groupKey, context: context,
            peer: initiator, peerEpoch: initiatorEpoch, localDevice: localDevice, localEpoch: localEpoch, owner: owner)

    }

    private func framedIdentity(_ request: FolioleCompanionHttpMessage, _ name: String) throws -> String {
        guard let value = Self.query(request.path, name)?.trimmingCharacters(in: .whitespacesAndNewlines),
              !value.isEmpty else { throw Self.invalid("framed_sync_identity_context_required") }
        return value
    }

    private func respondError(_ connection: NWConnection, _ error: Error) {
        let message = error.localizedDescription
        let status = (error as NSError).domain == "FolioleCompanionSyncGroupWorkgroup" ? 401 :
            message == "request_too_large" ? 413 :
            message == "sync_group_join_capacity_exceeded" ? 429 :
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
