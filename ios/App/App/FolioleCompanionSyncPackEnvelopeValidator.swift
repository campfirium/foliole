import CryptoKit
import Foundation
import ZIPFoundation

struct FoliolePreparedSyncPack {
    let databaseBytes: Data
    let manifest: [String: Any]
    let rowCounts: [String: Int]
}

enum FolioleCompanionSyncPackEnvelopeValidator {
    private static let sqliteHeader = Data("SQLite format 3\0".utf8)

    static func validate(
        archiveURL: URL,
        contract: FolioleCompanionSyncPackContract,
        expectedPeerId: String,
        expectedSourcePeerId: String
    ) throws -> FoliolePreparedSyncPack {
        do {
            let entries = try readEntries(archiveURL, contract: contract)
            let manifest = try parseManifest(entries["manifest.json"])
            let rowCounts = try validateManifest(
                manifest,
                contract: contract,
                expectedPeerId: expectedPeerId,
                expectedSourcePeerId: expectedSourcePeerId
            )
            guard let compressed = entries[contract.databaseEntry] else { throw invalid("missing_sync_pack_entry") }
            try verifySha256(compressed, expected: try string(manifest, "database_compressed_sha256"), layer: "compressed")
            let database = try FolioleCompanionZlib.inflate(compressed)
            try verifySha256(database, expected: try string(manifest, "database_uncompressed_sha256"), layer: "uncompressed")
            guard database.starts(with: sqliteHeader) else { throw invalid("invalid_sync_pack_sqlite_header") }
            return FoliolePreparedSyncPack(databaseBytes: database, manifest: manifest, rowCounts: rowCounts)
        } catch let error as NSError where error.domain == "FolioleSyncPack" {
            throw error
        } catch {
            throw invalid("invalid_sync_pack_container", cause: error)
        }
    }

    private static func readEntries(
        _ url: URL,
        contract: FolioleCompanionSyncPackContract
    ) throws -> [String: Data] {
        let archive = try Archive(url: url, accessMode: .read)
        let allowed = Set(["manifest.json", contract.databaseEntry])
        var result: [String: Data] = [:]
        for entry in archive {
            guard entry.type == .file, allowed.contains(entry.path) else { throw invalid("invalid_sync_pack_entry") }
            guard result[entry.path] == nil else { throw invalid("duplicate_sync_pack_entry") }
            var data = Data()
            _ = try archive.extract(entry) { data.append($0) }
            result[entry.path] = data
        }
        guard Set(result.keys) == allowed else { throw invalid("missing_sync_pack_entry") }
        return result
    }

    private static func parseManifest(_ data: Data?) throws -> [String: Any] {
        guard let data else { throw invalid("missing_sync_pack_entry") }
        let value = try JSONSerialization.jsonObject(with: data)
        guard let manifest = value as? [String: Any] else { throw invalid("invalid_sync_pack_manifest") }
        return manifest
    }

    private static func validateManifest(
        _ manifest: [String: Any],
        contract: FolioleCompanionSyncPackContract,
        expectedPeerId: String,
        expectedSourcePeerId: String
    ) throws -> [String: Int] {
        guard try string(manifest, "format") == contract.format else { throw invalid("unsupported_sync_pack_format") }
        guard try integer(manifest, "format_version") == contract.formatVersion else {
            throw invalid("unsupported_sync_pack_format_version")
        }
        guard try string(manifest, "compression") == contract.compression else {
            throw invalid("unsupported_sync_pack_compression")
        }
        guard try string(manifest, "database_file") == contract.databaseEntry else {
            throw invalid("invalid_sync_pack_database_entry")
        }
        let schema = try integer(manifest, "schema_version")
        guard (contract.minimumSchemaVersion...contract.maximumSchemaVersion).contains(schema) else {
            throw invalid("unsupported_sync_pack_schema_version")
        }
        guard try string(manifest, "to_peer_id") == expectedPeerId else { throw invalid("sync_pack_target_mismatch") }
        _ = try string(manifest, "pack_id")
        guard try string(manifest, "from_device_id") == expectedSourcePeerId else {
            throw invalid("sync_pack_source_mismatch")
        }
        _ = try string(manifest, "created_at")
        let from = try integer(manifest, "from_state_seq")
        let to = try integer(manifest, "to_state_seq")
        guard from >= 0, to >= from else { throw invalid("invalid_sync_pack_state_range") }
        return try tableCounts(manifest, required: contract.manifestTableNames)
    }

    static func tableCounts(_ manifest: [String: Any], required: Set<String>? = nil) throws -> [String: Int] {
        guard let tables = manifest["tables"] as? [[String: Any]] else {
            throw invalid("invalid_sync_pack_table_manifest")
        }
        var result: [String: Int] = [:]
        for table in tables {
            let name = try string(table, "name")
            let count = try integer(table, "row_count")
            guard count >= 0, result[name] == nil, required?.contains(name) != false else {
                throw invalid("invalid_sync_pack_table_manifest")
            }
            result[name] = count
        }
        if let required, Set(result.keys) != required { throw invalid("invalid_sync_pack_table_manifest") }
        return result
    }

    static func string(_ object: [String: Any], _ key: String) throws -> String {
        guard let value = object[key] as? String, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw invalid("invalid_sync_pack_manifest_field")
        }
        return value.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func integer(_ object: [String: Any], _ key: String) throws -> Int {
        guard let value = object[key] as? NSNumber,
              CFGetTypeID(value) != CFBooleanGetTypeID(), value.doubleValue == Double(value.intValue) else {
            throw invalid("invalid_sync_pack_manifest_field")
        }
        return value.intValue
    }

    private static func verifySha256(_ data: Data, expected: String, layer: String) throws {
        let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        guard "sha256:\(digest)" == expected else { throw invalid("invalid_sync_pack_\(layer)_checksum") }
    }

    static func invalid(_ code: String, cause: Error? = nil) -> NSError {
        var info: [String: Any] = [NSLocalizedDescriptionKey: code]
        if let cause { info[NSUnderlyingErrorKey] = cause }
        return NSError(domain: "FolioleSyncPack", code: 1, userInfo: info)
    }
}
