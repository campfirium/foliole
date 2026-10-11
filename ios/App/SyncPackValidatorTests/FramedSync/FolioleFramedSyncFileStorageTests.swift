import Foundation
import XCTest
@testable import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncFileStorageTests: XCTestCase {
    private typealias Fixture = FramedSyncWholeBodyReceiverFixture

    func testSharedReaderFixtureContainsOnlyFiles() throws {
        try Fixture.withRoot { root in
            let publication = try Fixture.publication(root, body: Data("File-owned native body".utf8), role: .nodeBody)
            let directory = root.appendingPathComponent("transport")
            let files = FolioleFramedSyncFiles(root: directory)
            try receive(publication, files: files, root: root)
            let names = try XCTUnwrap(FileManager.default.enumerator(atPath: directory.path))
            var entries = [String: String]()
            for case let key as String in names {
                let url = directory.appendingPathComponent(key)
                if try url.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile == true {
                    entries[key] = try Data(contentsOf: url).base64EncodedString()
                }
            }
            XCTAssertFalse(entries.keys.contains { $0.hasSuffix(".db") || $0.hasSuffix(".sqlite") })
            if let path = ProcessInfo.processInfo.environment["FOLIOLE_FRAMED_FILE_FIXTURE"] {
                try JSONSerialization.data(withJSONObject: entries, options: [.sortedKeys, .prettyPrinted])
                    .write(to: URL(fileURLWithPath: path))
            }
        }
    }

    func testFileReceiveReopenAndNewAttemptPreserveReadyBody() throws {
        try Fixture.withRoot { root in
            let body = Fixture.largeBody()
            let first = try Fixture.publication(root, body: body, role: .nodeBody)
            let storage = root.appendingPathComponent("transport")
            let files = FolioleFramedSyncFiles(root: storage)
            try receive(first, files: files, root: root)
            let key = try FolioleFramedSyncFileRecords.directory(first.attempt.transferID) + "/transfer.json"
            let original = try XCTUnwrap(files.read(key))
            let retry = try Fixture.publication(root, body: body, role: .nodeBody)
            let reopened = FolioleFramedSyncFiles(root: storage)
            try receive(retry, files: reopened, root: root)
            XCTAssertEqual(try reopened.read(key), original)
            let attempt = try FolioleFramedSyncFileRecords.attempt(first.attempt.transferID, first.attempt.attemptID)
            XCTAssertEqual(try reopened.read(attempt + "/bodies/\(first.reference.sha256.hex).body"), body)
            let fresh = try FolioleFramedSyncFileRecords.attempt(retry.attempt.transferID, retry.attempt.attemptID)
            XCTAssertEqual(try reopened.list(fresh), [])
            XCTAssertThrowsError(try receive(first, files: reopened, root: root, truncated: true))
            XCTAssertEqual(try reopened.read(key), original)
            XCTAssertFalse(FileManager.default.fileExists(atPath: storage.appendingPathComponent("receiver.db").path))
        }
    }

    func testOutboundFileReplayReopensExactEncryptedBytes() throws {
        try Fixture.withRoot { root in
            let publication = try Fixture.publication(root, body: Data("frozen".utf8), role: .nodeBody)
            let files = FolioleFramedSyncFiles(root: root.appendingPathComponent("transport"))
            let staging = FolioleFramedSyncOutboundFiles(files: files, purpose: "transfer")
            let reader = FolioleFramedSyncStreamReader(input: InputStream(data: publication.wire))
            let preamble = try reader.nextPreamble()
            _ = try staging.prepare(transferID: preamble.contextID, attemptID: preamble.identifier, preamble: preamble.encoded)
            while let frame = try reader.nextFrame() {
                _ = try staging.commit(.init(transferID: preamble.contextID, attemptID: preamble.identifier,
                    preamble: preamble.encoded, header: frame.headerBytes, ciphertext: frame.ciphertext, plaintext: Data()))
            }
            _ = try staging.finalize(transferID: preamble.contextID, attemptID: preamble.identifier)
            let reopened = FolioleFramedSyncOutboundFiles(files: files, purpose: "transfer")
            let attempt = try XCTUnwrap(reopened.loadLatestReplayableAttempt(transferID: preamble.contextID))
            XCTAssertEqual(try FolioleFramedSyncTransferWriter.replay(attempt, staging: reopened), publication.wire)
            try reopened.discard(transferID: preamble.contextID)
            XCTAssertNil(try reopened.loadLatestReplayableAttempt(transferID: preamble.contextID))
        }
    }

    func testInterruptedReceiveCanBeReplacedAfterReopening() throws {
        try Fixture.withRoot { root in
            let body = Fixture.largeBody()
            let first = try Fixture.publication(root, body: body, role: .nodeBody)
            let storage = root.appendingPathComponent("transport")
            let files = FolioleFramedSyncFiles(root: storage)
            XCTAssertThrowsError(try receive(first, files: files, root: root, truncated: true))
            let retry = try Fixture.publication(root, body: body, role: .nodeBody)
            let reopened = FolioleFramedSyncFiles(root: storage)
            try receive(retry, files: reopened, root: root)
            let old = try FolioleFramedSyncFileRecords.attempt(first.attempt.transferID, first.attempt.attemptID)
            XCTAssertEqual(try reopened.list(old), [])
            let current = try FolioleFramedSyncFileRecords.attempt(retry.attempt.transferID, retry.attempt.attemptID)
            XCTAssertEqual(try reopened.read(current + "/bodies/\(retry.reference.sha256.hex).body"), body)
        }
    }

    private func receive(_ publication: Fixture.Publication, files: FolioleFramedSyncFiles,
                         root: URL, truncated: Bool = false) throws {
        let wire = root.appendingPathComponent("incoming.body")
        try (truncated ? Data(publication.wire.dropLast()) : publication.wire).write(to: wire)
        let receiver = FolioleFramedSyncFileReceiver(files: files, resourceRoot: root.appendingPathComponent("assets"))
        let received = try receiver.receive(wire, groupKey: Fixture.key, context: publication.context)
        XCTAssertEqual(received.transferID, publication.attempt.transferID)
    }
}
