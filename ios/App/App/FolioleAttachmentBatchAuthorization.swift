import Foundation
import FolioleFramedSyncRuntime

/** A description may narrow one ordered permission; it cannot introduce a key or a resume offset. */
final class FolioleAttachmentBatchAuthorization {
    static let payloadBytes = 16 * 1024 * 1024
    static let metadataBytes = 256 * 1024
    static let maxFrames = 1024
    static let maxEntries = 256
    struct Entry {
        let key: String
        let start: UInt64
        let knownLength: UInt64
        let partialLength: UInt64
        init(key: String, start: UInt64, knownLength: UInt64, partialLength: UInt64) throws {
            guard FolioleCompanionCanonicalAttachmentKey.valid(key), start % 524288 == 0,
                  start <= partialLength, partialLength <= 8589934592, knownLength <= 8589934592 else { throw invalid() }
            self.key = key; self.start = start; self.knownLength = knownLength; self.partialLength = partialLength
        }
    }
    enum Event: Equatable { case description, block, fileEnd, rangeEnd, restart, unavailable, batchEnd }
    private let requestID: Data
    private let entries: [Entry]
    private var index = 0
    private var frames = 0
    private var metadata = 0
    private(set) var payload = 0
    private var current: (length: UInt64, offset: UInt64)?
    private var rangeEnded = false
    private var ended = false
    var maximumWireBytes: Int { 96 + Self.payloadBytes + Self.metadataBytes + 32 * Self.maxFrames }
    var processedEntries: Int { index }
    var entry: Entry { get throws { guard index < entries.count else { throw invalid() }; return entries[index] } }

    init(requestID: Data, entries: [Entry]) throws {
        guard requestID.count == 16, !entries.isEmpty, entries.count <= Self.maxEntries,
              Set(entries.map { String($0.key.prefix(64)) }).count == entries.count else { throw invalid() }
        self.requestID = requestID; self.entries = entries
    }
    func accept(_ value: Foliole_Sync_V22_RequestAttachment, encodedBytes: Int) throws -> Event {
        guard !ended, value.operation == "batch_pull", value.requestID == requestID, value.storageKeys.isEmpty,
              value.derive.isEmpty, value.extractorVersion == 0, !value.parsingPending else { throw invalid() }
        let overhead = encodedBytes - value.data.count
        frames += 1; payload += value.data.count; metadata += overhead
        guard overhead >= 0, overhead <= 24584, frames <= Self.maxFrames,
              payload <= Self.payloadBytes, metadata <= Self.metadataBytes else { throw invalid() }
        if value.state == "batch_end" {
            guard current == nil, index > 0, value.storageKey.isEmpty, value.data.isEmpty,
                  value.byteLength == 0, !value.pending, value.offset == UInt64(payload) else { throw invalid() }
            ended = true; return .batchEnd
        }
        let entry = try self.entry
        guard !rangeEnded, value.storageKey == entry.key, value.byteLength <= 8589934592 else { throw invalid() }
        if current != nil { return try receive(value) }
        return try describe(value, entry: entry)
    }
    func finish() throws { guard ended else { throw FolioleFramedSyncValidationError("attachment_batch_incomplete") } }

    private func describe(_ value: Foliole_Sync_V22_RequestAttachment, entry: Entry) throws -> Event {
        guard value.data.isEmpty, value.offset == entry.start else { throw invalid() }
        if value.state == "unavailable" {
            guard value.byteLength == entry.knownLength else { throw invalid() }
            index += 1; return .unavailable
        }
        guard !value.pending, entry.knownLength == 0 || value.byteLength == entry.knownLength else { throw invalid() }
        if value.state == "restart" {
            guard value.byteLength < entry.start else { throw invalid() }
            index += 1; return .restart
        }
        guard value.state == "description", entry.start <= value.byteLength else { throw invalid() }
        current = (value.byteLength, entry.start)
        return .description
    }
    private func receive(_ value: Foliole_Sync_V22_RequestAttachment) throws -> Event {
        guard let current, !value.pending, value.byteLength == current.length, value.offset == current.offset else { throw invalid() }
        if value.state == "block" {
            let length = min(524288, current.length - current.offset)
            guard length > 0, UInt64(value.data.count) == length else { throw invalid() }
            self.current = (current.length, current.offset + length)
            return .block
        }
        guard value.data.isEmpty else { throw invalid() }
        let event: Event
        if value.state == "file_end", current.offset == current.length { event = .fileEnd }
        else if value.state == "range_end", current.offset < current.length { rangeEnded = true; event = .rangeEnd }
        else { throw invalid() }
        self.current = nil; index += 1
        return event
    }
}

private func invalid() -> Error { FolioleFramedSyncValidationError("attachment_batch_authorization_invalid") }
