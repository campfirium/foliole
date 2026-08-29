import Foundation
import XCTest
import ZIPFoundation
@testable import FolioleSyncPackValidator

final class FolioleSyncPackValidatorTests: XCTestCase {
    private let expectedSourcePeerId = "authorization-desktop-fixture"

    func testAcceptsDesktopProducedRFC1950PackAndValidatesSQLite() throws {
        let contract = try FolioleCompanionContractStore(bundle: .module).syncPackContract()
        let prepared = try FolioleCompanionSyncPackEnvelopeValidator.validate(
            archiveURL: fixtureURL(),
            contract: contract,
            expectedPeerId: "android-fixture",
            expectedSourcePeerId: expectedSourcePeerId
        )
        XCTAssertTrue(prepared.databaseBytes.starts(with: Data("SQLite format 3\0".utf8)))

        let databaseURL = temporaryDatabaseURL()
        defer { try? FileManager.default.removeItem(at: databaseURL) }
        try prepared.databaseBytes.write(to: databaseURL)
        XCTAssertNoThrow(try FolioleCompanionSyncPackDatabaseValidator.validate(
            databaseURL: databaseURL,
            prepared: prepared,
            contract: contract
        ))
    }

    func testRejectsPackForAnotherDeviceBeforeSQLiteWrite() throws {
        let contract = try FolioleCompanionContractStore(bundle: .module).syncPackContract()

        XCTAssertThrowsError(try FolioleCompanionSyncPackEnvelopeValidator.validate(
            archiveURL: fixtureURL(),
            contract: contract,
            expectedPeerId: "ios-other-device",
            expectedSourcePeerId: expectedSourcePeerId
        )) { error in
            XCTAssertEqual(error.localizedDescription, "sync_pack_target_mismatch")
        }
    }

    func testRejectsPackFromAnotherPeerBeforeSQLiteWrite() throws {
        let contract = try FolioleCompanionContractStore(bundle: .module).syncPackContract()

        XCTAssertThrowsError(try FolioleCompanionSyncPackEnvelopeValidator.validate(
            archiveURL: fixtureURL(),
            contract: contract,
            expectedPeerId: "android-fixture",
            expectedSourcePeerId: "other-desktop"
        )) { error in
            XCTAssertEqual(error.localizedDescription, "sync_pack_source_mismatch")
        }
    }

    func testRejectsMissingOrUnexpectedArchiveEntries() throws {
        let entries = try fixtureEntries()
        let missing = try temporaryArchiveURL(entries: ["manifest.json": try XCTUnwrap(entries["manifest.json"])])
        let unexpected = try temporaryArchiveURL(entries: entries.merging(["unexpected.txt": Data("nope".utf8)]) { _, new in new })
        defer {
            try? FileManager.default.removeItem(at: missing)
            try? FileManager.default.removeItem(at: unexpected)
        }

        try assertEnvelopeError(missing, code: "missing_sync_pack_entry")
        try assertEnvelopeError(unexpected, code: "invalid_sync_pack_entry")
    }

    func testRejectsCompressedDatabaseChecksumMismatch() throws {
        var entries = try fixtureEntries()
        let contract = try FolioleCompanionContractStore(bundle: .module).syncPackContract()
        entries[contract.databaseEntry]?.append(0)
        let archiveURL = try temporaryArchiveURL(entries: entries)
        defer { try? FileManager.default.removeItem(at: archiveURL) }

        try assertEnvelopeError(archiveURL, code: "invalid_sync_pack_compressed_checksum")
    }

    func testRejectsLegacyAndUnknownFormatGenerationsBeforeSQLiteWrite() throws {
        for formatVersion in [11, 13] {
            var entries = try fixtureEntries()
            var manifest = try XCTUnwrap(JSONSerialization.jsonObject(
                with: try XCTUnwrap(entries["manifest.json"])
            ) as? [String: Any])
            manifest["format_version"] = formatVersion
            entries["manifest.json"] = try JSONSerialization.data(withJSONObject: manifest)
            let archiveURL = try temporaryArchiveURL(entries: entries)
            defer { try? FileManager.default.removeItem(at: archiveURL) }

            try assertEnvelopeError(archiveURL, code: "unsupported_sync_pack_format_version")
        }
    }

    func testRejectsSchema77BeforeSQLiteWrite() throws {
        var entries = try fixtureEntries()
        var manifest = try XCTUnwrap(JSONSerialization.jsonObject(
            with: try XCTUnwrap(entries["manifest.json"])
        ) as? [String: Any])
        manifest["schema_version"] = 77
        entries["manifest.json"] = try JSONSerialization.data(withJSONObject: manifest)
        let archiveURL = try temporaryArchiveURL(entries: entries)
        defer { try? FileManager.default.removeItem(at: archiveURL) }

        try assertEnvelopeError(archiveURL, code: "unsupported_sync_pack_schema_version")
    }

    private func assertEnvelopeError(_ archiveURL: URL, code: String) throws {
        let contract = try FolioleCompanionContractStore(bundle: .module).syncPackContract()
        XCTAssertThrowsError(try FolioleCompanionSyncPackEnvelopeValidator.validate(
            archiveURL: archiveURL,
            contract: contract,
            expectedPeerId: "android-fixture",
            expectedSourcePeerId: expectedSourcePeerId
        )) { error in
            XCTAssertEqual(error.localizedDescription, code)
        }
    }

    private func fixtureEntries() throws -> [String: Data] {
        let archive = try Archive(url: fixtureURL(), accessMode: .read)
        var entries: [String: Data] = [:]
        for entry in archive {
            var data = Data()
            _ = try archive.extract(entry) { data.append($0) }
            entries[entry.path] = data
        }
        return entries
    }

    private func temporaryArchiveURL(entries: [String: Data]) throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("foliole-ios-sync-pack-\(UUID().uuidString).syncpack")
        let archive = try Archive(url: url, accessMode: .create)
        for (path, data) in entries.sorted(by: { $0.key < $1.key }) {
            try archive.addEntry(
                with: path,
                type: .file,
                uncompressedSize: Int64(data.count),
                compressionMethod: .deflate
            ) { position, size in
                let start = Int(position)
                return data.subdata(in: start..<(start + size))
            }
        }
        return url
    }

    private func fixtureURL() -> URL {
        repositoryRoot()
            .appendingPathComponent("android/app/src/androidTest/assets/sync-pack-contract.syncpack")
    }

    private func temporaryDatabaseURL() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("foliole-ios-sync-pack-\(UUID().uuidString).db")
    }

    private func repositoryRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }
}
