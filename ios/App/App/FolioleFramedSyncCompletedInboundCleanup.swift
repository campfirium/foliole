import CryptoKit
import Foundation
import FolioleFramedSyncRuntime

// sql-surface: ios-isolated-framed-staging-owner
enum FolioleFramedSyncCompletedInboundCleanup {
    static func migratePayloads(database: FolioleFramedSyncTransferDatabase) throws {
        guard let version = try database.rows("PRAGMA user_version").first?[0] as? Int, version < 1 else { return }
        try database.transaction {
            for row in try database.rows("SELECT rowid, frame_type, ciphertext, length(authenticated_plaintext) FROM framed_sync_ios_frames") {
                guard let id = row[0] as? Int, let type = row[1] as? Int,
                      let ciphertext = row[2] as? Data, let size = row[3] as? Int else {
                    throw FolioleFramedSyncValidationError("framed_sync_migration_frame_invalid")
                }
                if type == 4 && size == 32 { continue }
                try database.execute("UPDATE framed_sync_ios_frames SET ciphertext = ? WHERE rowid = ?",
                                     [Data(SHA256.hash(data: ciphertext)), id])
            }
            try database.execute("PRAGMA user_version = 1")
        }
    }

    static func recover(database: FolioleFramedSyncTransferDatabase) throws {
        for row in try database.rows("SELECT transfer_id FROM framed_sync_ios_transfers WHERE state = 'ready_to_apply'") {
            guard let id = row[0] as? Data else {
                throw FolioleFramedSyncValidationError("framed_sync_completion_identity_invalid")
            }
            try retireReadyCopies(database: database, transferID: id)
        }
        for row in try database.rows("SELECT transfer_id FROM framed_sync_ios_receipts") {
            guard let id = row[0] as? Data else {
                throw FolioleFramedSyncValidationError("framed_sync_completion_identity_invalid")
            }
            try retire(database: database, transferID: id)
        }
    }

    static func retireReadyCopies(database: FolioleFramedSyncTransferDatabase, transferID: Data) throws {
        for row in try database.rows("SELECT rowid, authenticated_plaintext FROM framed_sync_ios_frames WHERE transfer_id = ? AND frame_type = 4 AND length(authenticated_plaintext) != 32", [transferID]) {
            guard let id = row[0] as? Int, let plaintext = row[1] as? Data else {
                throw FolioleFramedSyncValidationError("framed_sync_migration_frame_invalid")
            }
            try database.execute("UPDATE framed_sync_ios_frames SET authenticated_plaintext = ? WHERE rowid = ?",
                                 [Data(SHA256.hash(data: plaintext)), id])
        }
    }

    static func retire(database: FolioleFramedSyncTransferDatabase, transferID: Data) throws {
        try database.transaction {
            guard !(try database.rows("SELECT 1 FROM framed_sync_ios_receipts WHERE transfer_id = ?", [transferID])).isEmpty else {
                throw FolioleFramedSyncValidationError("framed_sync_cleanup_receipt_missing")
            }
            try database.execute("DELETE FROM framed_sync_ios_blob_pins WHERE transfer_id = ?", [transferID])
            try database.execute("DELETE FROM framed_sync_ios_resource_pins WHERE transfer_id = ?", [transferID])
            try database.execute("""
                DELETE FROM framed_sync_ios_available_blobs WHERE sha256 IN
                  (SELECT sha256 FROM framed_sync_ios_blob_offers WHERE transfer_id = ?) AND NOT EXISTS
                  (SELECT 1 FROM framed_sync_ios_blob_pins p WHERE p.sha256 = framed_sync_ios_available_blobs.sha256)
                """, [transferID])
            try database.execute("""
                DELETE FROM framed_sync_ios_available_resources WHERE sha256 IN
                  (SELECT sha256 FROM framed_sync_ios_blob_offers WHERE transfer_id = ?) AND NOT EXISTS
                  (SELECT 1 FROM framed_sync_ios_resource_pins p WHERE p.sha256 = framed_sync_ios_available_resources.sha256)
                """, [transferID])
            for table in ["frames", "blob_offers", "resource_blob_chunks", "receipt_frames", "receipt_attempts"] {
                try database.execute("DELETE FROM framed_sync_ios_\(table) WHERE transfer_id = ?", [transferID])
            }
            try database.execute("DELETE FROM framed_sync_ios_transfers WHERE transfer_id = ?", [transferID])
            try database.execute("DELETE FROM framed_sync_ios_receipts WHERE transfer_id = ?", [transferID])
        }
    }
}
