import Foundation
import FolioleFramedSyncRuntime

enum FolioleFramedSyncAvailableBodyMigration {
    private static let chunkBytes = 512 * 1024

    static func migrateChunkedAvailableBodies(database: FolioleFramedSyncTransferDatabase) throws {
        guard let version = try database.rows("PRAGMA user_version").first?[0] as? Int, version >= 1 else {
            throw FolioleFramedSyncValidationError("framed_sync_digest_migration_required")
        }
        if version >= 2 { return }
        try database.transaction {
            for statement in rebuildStatements { try database.execute(statement) }
            try copyAndVerify(database)
            try database.execute("DROP TABLE framed_sync_ios_blob_pins_continuous_upgrade")
            try database.execute("DROP TABLE framed_sync_ios_available_blobs_continuous_upgrade")
            try database.execute("PRAGMA user_version = 2")
        }
    }

    private static func copyAndVerify(_ database: FolioleFramedSyncTransferDatabase) throws {
        var after: Int?
        let verifier = FolioleFramedSyncChunkedBodies(database: database, transferID: Data(), attemptID: Data())
        while let row = try next(database, after: after) {
            guard let rowID = row[0] as? Int, let hash = row[1] as? Data, hash.count == 32,
                  let length = row[2] as? Int, length >= 0, row[3] as? Int == length,
                  row[4] as? String == "blob" else {
                throw FolioleFramedSyncValidationError("blob_available_identity_conflict")
            }
            var offset = 0
            while offset < length {
                try database.execute("""
                    INSERT INTO framed_sync_ios_available_blob_chunks (sha256, byte_offset, data)
                    SELECT sha256, ?, substr(data, ?, ?)
                    FROM framed_sync_ios_available_blobs_continuous_upgrade WHERE rowid = ?
                    """, [offset, offset + 1, min(chunkBytes, length - offset), rowID])
                offset += min(chunkBytes, length - offset)
            }
            var reference = Foliole_Sync_V22_BlobReference()
            reference.sha256 = hash
            reference.byteLength = UInt64(length)
            reference.required = true
            guard try verifier.verifyAndPromote(reference) else {
                throw FolioleFramedSyncValidationError("inbound_attempt_manifest_mismatch")
            }
            after = rowID
        }
    }

    private static func next(_ database: FolioleFramedSyncTransferDatabase, after: Int?) throws -> [Any?]? {
        let cursor = after.map { $0 as Any } ?? NSNull()
        return try database.rows("""
            SELECT rowid, sha256, byte_length, length(data), typeof(data)
            FROM framed_sync_ios_available_blobs_continuous_upgrade
            WHERE (? IS NULL OR rowid > ?) ORDER BY rowid LIMIT 1
            """, [cursor, cursor]).first
    }

    private static let rebuildStatements = [
        "ALTER TABLE framed_sync_ios_blob_pins RENAME TO framed_sync_ios_blob_pins_continuous_upgrade",
        "ALTER TABLE framed_sync_ios_available_blobs RENAME TO framed_sync_ios_available_blobs_continuous_upgrade",
        "CREATE TABLE framed_sync_ios_available_blobs (sha256 BLOB PRIMARY KEY, byte_length INTEGER NOT NULL)",
        """
        INSERT INTO framed_sync_ios_available_blobs (sha256, byte_length)
        SELECT sha256, byte_length FROM framed_sync_ios_available_blobs_continuous_upgrade
        """,
        """
        CREATE TABLE framed_sync_ios_blob_pins (transfer_id BLOB NOT NULL, sha256 BLOB NOT NULL,
        byte_length INTEGER NOT NULL, role INTEGER NOT NULL, required INTEGER NOT NULL,
        PRIMARY KEY (transfer_id, sha256))
        """,
        """
        INSERT INTO framed_sync_ios_blob_pins (transfer_id, sha256, byte_length, role, required)
        SELECT transfer_id, sha256, byte_length, role, required FROM framed_sync_ios_blob_pins_continuous_upgrade
        """,
        """
        CREATE TABLE framed_sync_ios_available_blob_chunks (
        sha256 BLOB NOT NULL REFERENCES framed_sync_ios_available_blobs(sha256) ON DELETE CASCADE,
        byte_offset INTEGER NOT NULL CHECK (byte_offset >= 0 AND byte_offset % \(chunkBytes) = 0),
        data BLOB NOT NULL CHECK (typeof(data) = 'blob' AND length(data) BETWEEN 1 AND \(chunkBytes)),
        PRIMARY KEY (sha256, byte_offset))
        """
    ]
}
