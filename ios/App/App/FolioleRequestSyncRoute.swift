import Foundation
import FolioleFramedSyncRuntime
import Network

extension FolioleCompanionSyncGroupJoinServer {
    func respondRequestSync(_ connection: NWConnection, _ request: FolioleCompanionHttpMessage,
        mode: String, context: [String: String], bridge: FolioleCompanionSyncGroupDataRequesting,
        owner: FolioleFramedSyncPayloadBudget) throws {
        guard ["inventory", "pull", "object", "pulls", "objects"].contains(mode) else { throw Self.invalid("request_sync_mode_invalid") }
        let files = try FolioleFramedSyncFiles(libraryKey: owner.libraryKey)
        let directory = "requests/\(UUID().uuidString.lowercased())"
        defer { try? files.remove(directory) }
        let temporary = FileManager.default.temporaryDirectory.appendingPathComponent("foliole-request-sync-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: temporary, withIntermediateDirectories: true)
        var handedOff = false
        defer { if !handedOff { try? FileManager.default.removeItem(at: temporary) } }
        let source: URL
        if let body = request.bodyFile { source = body.url }
        else {
            source = temporary.appendingPathComponent("request.body")
            try request.bodyData.write(to: source)
        }
        let chunks = try FolioleRequestSyncHTTPChunks.split(files: files, directory: directory, input: source)
        var payload: [String: Any] = context
        payload["library_key"] = owner.libraryKey
        payload["generation_id"] = owner.generationID
        payload["directory"] = directory
        payload["mode"] = mode
        payload["request_chunk_count"] = chunks["response_chunk_count"]
        payload["request_byte_length"] = chunks["response_byte_length"]
        for key in ["object_type", "global_id"] { payload[key] = Self.query(request.path, key) }
        let result = try bridge.request("respond_request_sync", payload, documentOwner: owner)
        guard let count = result["response_chunk_count"] as? Int else { throw Self.invalid("request_sync_http_response_invalid") }
        try owner.requireActive()
        let response = temporary.appendingPathComponent("response.body")
        try FolioleRequestSyncHTTPChunks.assemble(files: files, directory: directory, count: count, output: response)
        guard let deviceID = context["responder_device_id"], let epoch = context["responder_library_epoch"] else {
            throw Self.invalid("request_sync_peer_context_mismatch")
        }
        try FolioleFramedSyncFileResponse.sendFile(connection, url: response, directory: temporary,
            deviceID: deviceID, epoch: epoch, owner: owner)
        handedOff = true
    }
}
