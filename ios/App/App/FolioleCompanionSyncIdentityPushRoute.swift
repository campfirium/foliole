import Foundation
import Network

extension FolioleCompanionSyncGroupJoinServer {
    func respondIdentityPush(_ connection: NWConnection, _ request: FolioleCompanionHttpMessage) throws {
        guard let dataBridge else { throw Self.invalid("sync_group_data_owner_unavailable") }
        let peer = try authenticate(request)
        let plaintext = try FolioleCompanionSyncGroupWorkgroup.decryptRequest(request,
            groupTag: try Self.requiredDiscovery(discovery, "group_tag"), workgroupKey: provider.workgroupKey)
        do {
            guard let input = try JSONSerialization.jsonObject(with: plaintext) as? [String: Any] else {
                throw Self.invalid("sync_identity_push_invalid")
            }
            let archive = try Self.decodeIdentityArchive(input)
            let localId = try Self.requiredDiscovery(discovery, "provider_device_id")
            let pack = try FolioleCompanionSyncPackReceivedArchive.store(archive,
                expectedPeerId: localId, expectedSourcePeerId: peer)
            defer { try? FileManager.default.removeItem(at: pack.databaseURL) }
            let result = try dataBridge.request("apply_identity_pack", [
                "authenticated_device_id": peer, "local_device_id": localId,
                "host_name": try Self.requiredDiscovery(discovery, "provider_device_name"),
                "manifest": pack.manifest, "pack_path": pack.databaseURL.path
            ])
            let body = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
            try sendWorkgroup(connection, request, "application/json; charset=utf-8", body)
        } catch {
            let body = try JSONSerialization.data(withJSONObject: ["error": error.localizedDescription])
            try sendWorkgroup(connection, request, "application/json; charset=utf-8", body, status: 409)
        }
    }

    private static func decodeIdentityArchive(_ input: [String: Any]) throws -> Data {
        guard let value = input["archive_base64url"] as? String, !value.isEmpty,
              value.count <= 1_398_104,
              value.utf8.allSatisfy({ byte in
                  (65...90).contains(byte) || (97...122).contains(byte) ||
                      (48...57).contains(byte) || byte == 45 || byte == 95
              }) else { throw invalid("sync_identity_push_invalid") }
        let encoded = value.replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let padded = encoded + String(repeating: "=", count: (4 - encoded.count % 4) % 4)
        guard let archive = Data(base64Encoded: padded),
              archive.count <= FolioleCompanionSyncPackEnvelopeValidator.maximumTransferBytes,
              archive.base64EncodedString().replacingOccurrences(of: "+", with: "-")
                .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "") == value
        else { throw invalid("sync_identity_push_invalid") }
        return archive
    }
}
