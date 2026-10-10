import CryptoKit
import Foundation
import FolioleFramedSyncRuntime
import SwiftProtobuf

enum FolioleFramedSyncInventoryWire {
    static let maximumSessionFrames = FolioleFramedSyncLimits.maxSessionFrames
    private static let chunkSize = 128

    final class Reader {
        private var begin: Foliole_Sync_V22_InventoryBegin?
        private var count: UInt64 = 0
        private var index: UInt32 = 0
        private var frames = 0
        private var bytes = 0
        private var hash = SHA256()
        private var ended = false
        private let retainEntries: Bool
        private var entries = [Foliole_Sync_V22_InventoryEntry]()

        init(retainEntries: Bool) { self.retainEntries = retainEntries }

        func accept(_ message: FolioleFramedSyncValidatedMessage) throws {
            guard !ended else { throw invalid("inventory_exchange_incomplete") }
            let encoded = try FolioleFramedSyncCodec.encode(message)
            frames += 1
            bytes += encoded.count + 32
            guard frames <= maximumSessionFrames, bytes <= FolioleFramedSyncLimits.maxSessionBytes else {
                throw invalid("inventory_session_limit_exceeded")
            }
            guard let begin else {
                guard case .inventoryBegin(let value) = message.payload else {
                    throw invalid("inventory_exchange_incomplete")
                }
                self.begin = value
                return
            }
            if case .inventoryChunk(let chunk) = message.payload {
                guard chunk.roundID == begin.roundID, chunk.chunkIndex == index else {
                    throw invalid("inventory_chunk_sequence_invalid")
                }
                index += 1
                count += UInt64(chunk.entries.count)
                guard count <= begin.entryCount, count <= FolioleFramedSyncLimits.maxInventoryEntries else {
                    throw invalid("inventory_entry_limit_exceeded")
                }
                hash.update(data: encoded)
                if retainEntries { entries.append(contentsOf: chunk.entries) }
                return
            }
            guard case .inventoryEnd(let end) = message.payload,
                  end.roundID == begin.roundID, count == begin.entryCount,
                  end.inventoryHash == Data(hash.finalize()) else {
                throw invalid("inventory_exchange_incomplete")
            }
            ended = true
        }

        func roundID() throws -> Data {
            guard ended, let begin else { throw invalid("inventory_exchange_incomplete") }
            return begin.roundID
        }

        func requestBegin() throws -> Foliole_Sync_V22_InventoryBegin {
            _ = try roundID()
            return begin!
        }

        func result(expectedRoundID: Data) throws -> [Foliole_Sync_V22_InventoryEntry] {
            guard retainEntries, try roundID() == expectedRoundID else {
                throw invalid("inventory_round_identity_mismatch")
            }
            return entries
        }
    }

    static func decodeRoundID(_ messages: [FolioleFramedSyncValidatedMessage]) throws -> Data {
        let reader = Reader(retainEntries: false)
        for message in messages { try reader.accept(message) }
        return try reader.roundID()
    }

    static func decodeEntries(
        _ messages: [FolioleFramedSyncValidatedMessage]
    ) throws -> [Foliole_Sync_V22_InventoryEntry] {
        let reader = Reader(retainEntries: true)
        for message in messages { try reader.accept(message) }
        return try reader.result(expectedRoundID: reader.roundID())
    }

    static func encode(
        entries: [Foliole_Sync_V22_InventoryEntry], roundID: Data
    ) throws -> [FolioleFramedSyncValidatedMessage] {
        var messages = [FolioleFramedSyncValidatedMessage]()
        try emit(entries: entries, roundID: roundID) { messages.append($0) }
        return messages
    }

    static func emit(entries: [Foliole_Sync_V22_InventoryEntry], roundID: Data,
        detailGlobalIDs: [String] = [], summaryOnly: Bool = false,
        consume: (FolioleFramedSyncValidatedMessage) throws -> Void) throws {
        guard entries.count <= FolioleFramedSyncLimits.maxInventoryEntries, roundID.count == 16 else {
            throw FolioleFramedSyncValidationError("inventory_input_invalid")
        }
        let entries = summaryOnly ? entries.map { value in
            var entry = value
            if entry.objectType == "node" {
                entry.frontierFactIds = []; entry.requiredRelationIds = []; entry.reviewFactIds = []
                entry.resourceHashes = []; entry.stateFactIds = []; entry.versionStates = []; entry.currentVersionID = ""
            }
            return entry
        } : entries
        var begin = Foliole_Sync_V22_InventoryBegin()
        begin.roundID = roundID; begin.entryCount = UInt64(entries.count)
        begin.detailGlobalIds = detailGlobalIDs; begin.summaryOnly = summaryOnly
        try consume(validated { $0.inventoryBegin = begin })
        var index = 0
        var chunkHash = SHA256()
        var sessionBytes = 0
        var offset = 0
        while offset < entries.count {
            let count = try pageCount(entries, roundID: roundID, offset: offset, index: index)
            let wire = try chunk(entries, roundID: roundID, offset: offset, count: count, index: index)
            let message = try FolioleFramedSyncCodec.validateOutbound(
                wire, authenticatedFrameType: FolioleFramedSyncFrameType.sessionControl.rawValue)
            let encoded = try FolioleFramedSyncCodec.encode(message)
            sessionBytes += encoded.count + 32
            guard sessionBytes <= FolioleFramedSyncLimits.maxSessionBytes,
                  index + 3 <= maximumSessionFrames else {
                throw invalid("inventory_session_limit_exceeded")
            }
            chunkHash.update(data: encoded)
            try consume(message)
            index += 1
            offset += count
        }
        var end = Foliole_Sync_V22_InventoryEnd()
        end.roundID = roundID; end.inventoryHash = Data(chunkHash.finalize())
        try consume(validated { $0.inventoryEnd = end })
    }

    private static func pageCount(
        _ entries: [Foliole_Sync_V22_InventoryEntry], roundID: Data, offset: Int, index: Int
    ) throws -> Int {
        let maximum = min(chunkSize, entries.count - offset)
        var accepted = 0
        // SwiftProtobuf's size visitor is internal; measure exact, progressively grown messages.
        for count in 1...maximum {
            let wire = try chunk(entries, roundID: roundID, offset: offset, count: count, index: index)
            if try wire.serializedData().count > FolioleFramedSyncLimits.maxControlMessageBytes { break }
            accepted = count
        }
        guard accepted > 0 else { throw invalid("inventory_frame_limit_exceeded") }
        return accepted
    }

    private static func chunk(
        _ entries: [Foliole_Sync_V22_InventoryEntry], roundID: Data, offset: Int, count: Int, index: Int
    ) throws -> Foliole_Sync_V22_ProtocolMessage {
        var chunk = Foliole_Sync_V22_InventoryChunk()
        chunk.roundID = roundID; chunk.chunkIndex = UInt32(index)
        chunk.entries = Array(entries[offset..<offset + count])
        var wire = Foliole_Sync_V22_ProtocolMessage()
        wire.inventoryChunk = chunk
        return wire
    }

    private static func validated(
        _ update: (inout Foliole_Sync_V22_ProtocolMessage) -> Void
    ) throws -> FolioleFramedSyncValidatedMessage {
        var message = Foliole_Sync_V22_ProtocolMessage(); update(&message)
        return try FolioleFramedSyncCodec.validateOutbound(
            message, authenticatedFrameType: FolioleFramedSyncFrameType.sessionControl.rawValue
        )
    }

    private static func invalid(_ code: String) -> FolioleFramedSyncValidationError {
        FolioleFramedSyncValidationError(code)
    }
}
