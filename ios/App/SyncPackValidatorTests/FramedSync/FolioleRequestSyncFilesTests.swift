import Foundation
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleRequestSyncFilesTests: XCTestCase {
    func testRequestChunksRoundTripExactBytesInOrder() throws {
        let fixture = try Fixture()
        defer { fixture.close() }
        let chunks = [Data(repeating: 0x11, count: 524288),
                      Data(repeating: 0x88, count: 524288), Data([0, 255, 1, 254])]
        for (index, chunk) in chunks.enumerated() {
            try fixture.files.write("requests/first/http-out-\(index)", data: chunk)
        }
        let output = fixture.directory.appendingPathComponent("assembled.body")
        try FolioleRequestSyncHTTPChunks.assemble(files: fixture.files,
            directory: "requests/first", count: chunks.count, output: output)
        XCTAssertEqual(try Data(contentsOf: output), chunks.reduce(Data(), +))
        let result = try FolioleRequestSyncHTTPChunks.split(files: fixture.files,
            directory: "requests/second", input: output)
        XCTAssertEqual(result, ["response_chunk_count": 3, "response_byte_length": 1048580])
        for (index, chunk) in chunks.enumerated() {
            XCTAssertEqual(try fixture.files.read("requests/second/http-in-\(index)"), chunk)
        }
        XCTAssertEqual(try fixture.files.list("requests/second"), ["http-in-0", "http-in-1", "http-in-2"])
    }

    func testAssemblyRejectsMissingEmptyAndOversizedChunks() throws {
        let fixture = try Fixture()
        defer { fixture.close() }
        let prefix = Data([7, 0, 255])
        let malformed: [Data?] = [nil, Data(), Data(count: 524289)]
        for (index, bad) in malformed.enumerated() {
            let directory = "requests/fault-\(index)"
            try fixture.files.write("\(directory)/http-out-0", data: prefix)
            if let bad { try fixture.files.write("\(directory)/http-out-1", data: bad) }
            let output = fixture.directory.appendingPathComponent("fault-\(index).body")
            XCTAssertThrowsError(try FolioleRequestSyncHTTPChunks.assemble(
                files: fixture.files, directory: directory, count: 2, output: output)) { error in
                XCTAssertEqual(error.localizedDescription, "request_sync_http_request_truncated")
            }
            XCTAssertEqual(try fixture.files.read("\(directory)/http-out-0"), prefix)
            XCTAssertEqual(try Data(contentsOf: output), prefix)
        }
        XCTAssertThrowsError(try FolioleRequestSyncHTTPChunks.assemble(files: fixture.files,
            directory: "requests/none", count: 0, output: fixture.directory.appendingPathComponent("zero")))
    }

    func testRejectsPathTraversalAndSymlinksWithoutChangingOutsideBytes() throws {
        let fixture = try Fixture()
        defer { fixture.close() }
        let outside = fixture.directory.appendingPathComponent("outside")
        try FileManager.default.createDirectory(at: outside, withIntermediateDirectories: true)
        let original = outside.appendingPathComponent("original")
        let bytes = Data("outside original".utf8)
        try bytes.write(to: original)
        try fixture.files.write("requests/safe/body", data: Data([1]))
        try FileManager.default.createSymbolicLink(at: fixture.root.appendingPathComponent("requests/link"),
                                                  withDestinationURL: outside)
        for key in ["../outside/original", "requests/../outside", "/outside", "requests/link/original"] {
            XCTAssertThrowsError(try fixture.files.read(key))
            XCTAssertThrowsError(try fixture.files.write(key, data: Data([2])))
            XCTAssertThrowsError(try fixture.files.remove(key))
            XCTAssertThrowsError(try fixture.files.list(key))
        }
        XCTAssertEqual(try Data(contentsOf: original), bytes)
        XCTAssertEqual(try fixture.files.read("requests/safe/body"), Data([1]))
    }

    func testRemovingOneRequestPreservesOtherRequestsAndAdjacentFiles() throws {
        let fixture = try Fixture()
        defer { fixture.close() }
        try fixture.files.write("requests/first/body", data: Data([1, 2]))
        try fixture.files.write("requests/second/body", data: Data([3, 4]))
        let sentinel = fixture.root.appendingPathComponent("sentinel")
        try Data("preserve".utf8).write(to: sentinel)
        try fixture.files.remove("requests/first")
        XCTAssertNil(try fixture.files.read("requests/first/body"))
        XCTAssertEqual(try fixture.files.list("requests"), ["second"])
        XCTAssertEqual(try fixture.files.read("requests/second/body"), Data([3, 4]))
        XCTAssertEqual(try Data(contentsOf: sentinel), Data("preserve".utf8))
        XCTAssertNoThrow(try fixture.files.remove("requests/first"))
    }

    private struct Fixture {
        let directory: URL
        let root: URL
        let files: FolioleFramedSyncFiles

        init() throws {
            directory = FileManager.default.temporaryDirectory
                .appendingPathComponent(UUID().uuidString).resolvingSymlinksInPath()
            root = directory.appendingPathComponent("SyncRequests")
            try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
            files = FolioleFramedSyncFiles(root: root)
        }

        func close() { try? FileManager.default.removeItem(at: directory) }
    }
}
