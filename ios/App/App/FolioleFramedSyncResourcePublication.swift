import Foundation
import FolioleFramedSyncRuntime

final class FolioleFramedSyncResourcePublication {
    private(set) var storageKeys = [String]()
    private var committed = false
    private var created = [URL]()
    private var partials = [URL]()

    init(
        database: FolioleFramedSyncTransferDatabase, root: URL, transferID: Data
    ) throws {
        let attempt = try database.rows("""
            SELECT active_attempt_id FROM framed_sync_ios_transfers WHERE transfer_id = ?
            """, [transferID]).first?[0] as? Data
        guard let attempt else { throw Self.invalid("framed_sync_transfer_not_ready") }
        let rows = try database.rows("""
            SELECT sha256, byte_length, role, storage_key FROM framed_sync_ios_resource_pins
            WHERE transfer_id = ? ORDER BY storage_key
            """, [transferID])
        var keys = [String]()
        do {
            for row in rows {
                guard let hash = row[0] as? Data, let length = row[1] as? Int,
                      let role = row[2] as? Int, let key = row[3] as? String else {
                    throw Self.invalid("resource_pin_invalid")
                }
                let target = root.appendingPathComponent(key)
                let partial = FolioleFramedSyncResourceFiles.partial(
                    root: root, transferID: transferID, attemptID: attempt, hash: hash
                )
                if FileManager.default.fileExists(atPath: target.path) {
                    try Self.requireValid(target, hash: hash, length: UInt64(length), role: role, key: key)
                } else {
                    try Self.requireValid(partial, hash: hash, length: UInt64(length), role: role, key: key)
                    try FileManager.default.linkItem(at: partial, to: target)
                    created.append(target)
                }
                keys.append(key)
                if FileManager.default.fileExists(atPath: partial.path) { partials.append(partial) }
            }
            storageKeys = keys
        } catch {
            rollback()
            throw error
        }
    }

    func commit() {
        committed = true
        for partial in partials { try? FileManager.default.removeItem(at: partial) }
    }

    deinit { if !committed { rollback() } }

    private func rollback() {
        for target in created { try? FileManager.default.removeItem(at: target) }
        created.removeAll()
    }

    private static func requireValid(
        _ url: URL, hash: Data, length: UInt64, role: Int, key: String
    ) throws {
        guard try FolioleFramedSyncResourceFiles.verify(
            url, expectedHash: hash, expectedLength: length, role: role
        ) == key else { throw invalid("resource_file_identity_conflict") }
    }

    private static func invalid(_ code: String) -> FolioleFramedSyncValidationError { .init(code) }
}
