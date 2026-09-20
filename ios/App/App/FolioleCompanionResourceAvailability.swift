import CryptoKit
import Foundation

// sql-surface: ios-isolated-snapshot-owner
enum FolioleCompanionResourceAvailability {
    static func reply(snapshot: URL, request: Data, deviceId: String) throws -> Data {
        let payload = try JSONSerialization.jsonObject(with: request) as? [String: Any]
        guard let resources = payload?["resources"] as? [[String: Any]], resources.count <= 32 else {
            throw invalid("resource_availability_invalid_request")
        }
        var seen = Set<String>()
        var claims: [[String: Any]] = []
        for resource in resources {
            guard let kind = resource["kind"] as? String, ["attachment", "content_blob"].contains(kind),
                  let id = resource["id"] as? String,
                  id.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
                  seen.insert("\(kind):\(id)").inserted else { throw invalid("resource_availability_invalid_request") }
            claims.append(try inspect(snapshot: snapshot, kind: kind, id: id))
        }
        return try JSONSerialization.data(withJSONObject: ["provider_device_id": deviceId, "resources": claims])
    }

    private static func inspect(snapshot: URL, kind: String, id: String) throws -> [String: Any] {
        var result: [String: Any] = ["kind": kind, "id": id, "status": "missing"]
        let resource: FolioleCompanionSyncGroupResources.Resource?
        do {
            resource = kind == "attachment"
                ? try FolioleCompanionSyncGroupResources.attachment(snapshot: snapshot, attachmentId: id, contentHash: id)
                : try FolioleCompanionSyncGroupResources.contentBlob(snapshot: snapshot, hash: id)
        } catch let error as NSError where error.domain == NSCocoaErrorDomain && error.code == NSFileReadNoSuchFileError {
            return result
        }
        guard let resource else { return result }
        let sha256 = SHA256.hash(data: resource.body).map { String(format: "%02x", $0) }.joined()
        var expectedHash = id
        var expectedSize = resource.body.count
        if kind == "content_blob" {
            let database = try FolioleReadOnlySQLite(url: snapshot)
            guard let row = try database.rows("SELECT stored_sha256, stored_size_bytes FROM content_blobs WHERE hash = ?",
              arguments: [id]).first, let hash = row[0], let sizeText = row[1], let size = Int(sizeText) else { return result }
            expectedHash = hash
            expectedSize = size
        }
        result["status"] = sha256 == expectedHash && resource.body.count == expectedSize ? "available" : "checksum_mismatch"
        if result["status"] as? String == "available" {
            result["sha256"] = sha256
            result["size_bytes"] = resource.body.count
        }
        return result
    }

    private static func invalid(_ message: String) -> NSError {
        NSError(domain: "FolioleCompanionResourceAvailability", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}
