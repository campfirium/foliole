import Capacitor
import Foundation
import FolioleFramedSyncRuntime

final class RequestHTTPTasks: @unchecked Sendable {
    private let lock = NSLock()
    private var tasks = [String: Task<Void, Never>]()

    func start(_ id: String, execute: @escaping () async -> Void) throws {
        lock.lock(); defer { lock.unlock() }
        guard tasks[id] == nil else { throw FolioleFramedSyncValidationError("request_sync_http_duplicate") }
        tasks[id] = Task { await execute(); self.remove(id) }
    }

    func cancel(_ id: String) {
        lock.lock(); let task = tasks[id]; lock.unlock()
        task?.cancel()
    }

    private func remove(_ id: String) {
        lock.lock(); defer { lock.unlock() }
        tasks.removeValue(forKey: id)
    }
}
let requestHTTPTasks = RequestHTTPTasks()

extension FolioleCompanionSyncPlugin {
    @objc func postRequestSyncHttp(_ call: CAPPluginCall) {
        do {
            let owner = try Self.requestHTTPOwner(call)
            let id = try Self.requestHTTPID(call)
            try requestHTTPTasks.start(id) {
                do {
                    let lifetime = try owner.beginOperation { requestHTTPTasks.cancel(id) }
                    defer { owner.finishOperation(lifetime) }
                    try Task.checkCancellation()
                    call.resolve(try await Self.postRequestHTTP(call, owner: owner, bridge: self.groupData))
                }
                catch {
                    if error is CancellationError || (error as? URLError)?.code == .cancelled {
                        call.reject("request_sync_http_cancelled", "E_ABORT")
                    } else if let network = error as? URLError, network.code == .timedOut {
                        call.reject("\(error.localizedDescription)", "ETIMEDOUT")
                    } else { call.reject("\(error.localizedDescription)") }
                }
            }
        } catch { call.reject("\(error.localizedDescription)") }
    }

    @objc func cancelRequestSyncHttp(_ call: CAPPluginCall) {
        do {
            _ = try Self.requestHTTPOwner(call)
            requestHTTPTasks.cancel(try Self.requestHTTPID(call))
            call.resolve()
        } catch { call.reject("\(error.localizedDescription)") }
    }

    private static func postRequestHTTP(_ call: CAPPluginCall, owner: FolioleFramedSyncPayloadBudget,
        bridge: FolioleCompanionSyncGroupDataRequesting) async throws -> JSObject {
        guard let directory = call.getString("directory"),
              directory.range(of: "^requests/[a-f0-9-]{36}$", options: .regularExpression) != nil,
              let count = call.getInt("request_chunk_count"), let urlText = call.getString("url"), let url = URL(string: urlText),
              let headers = call.getObject("headers") as? [String: String],
              let group = call.getString("sync_group_id"), let peer = call.getString("receiver_device_id"),
              let epoch = call.getString("receiver_library_epoch") else {
            throw FolioleFramedSyncValidationError("request_sync_http_request_invalid")
        }
        if call.getObject("attachment_batch") != nil {
            return try await FolioleRequestSyncAttachmentBatchResponse.post(call, owner: owner, bridge: bridge,
                files: FolioleFramedSyncFiles(libraryKey: owner.libraryKey), directory: directory, count: count, url: url,
                peer: .init(groupID: group, deviceID: peer, libraryEpoch: epoch, memberAuthHeaders: headers))
        }
        let temporary = FileManager.default.temporaryDirectory.appendingPathComponent("foliole-request-http-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: temporary, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: temporary) }
        let files = try FolioleFramedSyncFiles(libraryKey: owner.libraryKey)
        let body = temporary.appendingPathComponent("request.body")
        let response = temporary.appendingPathComponent("response.body")
        try FolioleRequestSyncHTTPChunks.assemble(files: files, directory: directory, count: count, output: body)
        let permission = try FolioleRequestSyncAttachmentResponse.permission(call)
        let receiver = try await FolioleFramedSyncPayloadWorker.run {
            try permission.map { try FolioleRequestSyncAttachmentResponse.prepare(call, permission: $0, owner: owner, bridge: bridge) }
        }
        defer { receiver?.close() }
        var lastProgress = -Double.infinity
        _ = try await FolioleFramedSyncHTTPTransport.post(endpoint: url,
            peer: .init(groupID: group, deviceID: peer, libraryEpoch: epoch, memberAuthHeaders: headers),
            requestBodyURL: body, responseBodyURL: response, owner: owner, maximumResponseBytes: permission?.maximumWireBytes, onProgress: {
                if permission != nil && ProcessInfo.processInfo.systemUptime - lastProgress < 0.25 { return }
                lastProgress = ProcessInfo.processInfo.systemUptime
                if let roundID = call.getString("peer_round_id") {
                    try FolioleRequestSyncHTTPChunks.touchRound(bridge: bridge, owner: owner,
                        peer: peer, roundID: roundID, direction: "outbound")
                }
            }, bodyConsumer: receiver?.body)
        if let receiver { return receiver.result() }
        return try FolioleRequestSyncHTTPChunks.split(files: files, directory: directory, input: response)
    }

    static func requestHTTPOwner(_ call: CAPPluginCall) throws -> FolioleFramedSyncPayloadBudget {
        let owner = try FolioleFramedSyncPayloadBudgetRegistry.shared.requireCurrent()
        guard owner.libraryKey == call.getString("library_key"), owner.generationID == call.getString("generation_id") else {
            throw FolioleFramedSyncValidationError("framed_sync_file_owner_mismatch")
        }
        return owner
    }

    static func requestHTTPID(_ call: CAPPluginCall) throws -> String {
        guard let id = call.getString("request_id"), UUID(uuidString: id) != nil else {
            throw FolioleFramedSyncValidationError("request_sync_http_id_invalid")
        }
        return id
    }
}
