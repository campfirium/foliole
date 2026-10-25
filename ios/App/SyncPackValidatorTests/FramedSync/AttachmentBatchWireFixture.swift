import Foundation
import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

enum AttachmentBatchWireFixture {
    static let groupKey = Data(repeating: 0, count: 32)
    static func key(_ index: Int) -> String { String(format: "%064x.png", index + 1) }
    static func context(_ peer: String = "b") throws -> FolioleFramedSyncSessionContext {
        try .init(groupID: "group", initiatorDeviceID: "a", initiatorLibraryEpoch: "a-epoch",
                  responderDeviceID: peer, responderLibraryEpoch: "b-epoch")
    }
    static func value(_ key: String, _ state: String, _ length: UInt64 = 0, _ offset: UInt64 = 0,
                      _ data: Data = Data()) -> Foliole_Sync_V22_RequestAttachment {
        var value = Foliole_Sync_V22_RequestAttachment()
        value.requestID = Data(repeating: 0, count: 16); value.operation = "batch_pull"
        value.storageKey = key; value.state = state; value.byteLength = length; value.offset = offset
        value.data = data; value.maxBlocks = 1
        return value
    }
    static func messages(_ count: Int) -> [Foliole_Sync_V22_RequestAttachment] {
        let bytes = Data(repeating: 7, count: 128 * 1024)
        return (0..<count).flatMap { index in
            [value(key(index), "description", UInt64(bytes.count)), value(key(index), "block", UInt64(bytes.count), 0, bytes),
             value(key(index), "file_end", UInt64(bytes.count), UInt64(bytes.count))]
        } + [value("", "batch_end", 0, UInt64(bytes.count * count))]
    }
    static func permission(_ count: Int) throws -> FolioleAttachmentBatchAuthorization {
        try .init(requestID: Data(repeating: 0, count: 16), entries: (0..<count).map {
            try .init(key: key($0), start: 0, knownLength: 0, partialLength: 0)
        })
    }
    static func wire(_ messages: [Foliole_Sync_V22_RequestAttachment]) throws -> Data {
        let session = Data(repeating: 1, count: 16)
        var encoded = Data("FOLSYNC2".utf8) + Data([0, 96, 0, 26, 1, 0, 0, 0])
        encoded.append(try context().deriveContextID(sessionID: session))
        encoded.append(session); encoded.append(Data(repeating: 0, count: 32))
        let preamble = try FolioleFramedSyncPreamble(decoding: encoded)
        for (index, value) in messages.enumerated() {
            var message = Foliole_Sync_V22_ProtocolMessage(); message.requestAttachment = value
            let plaintext = try FolioleFramedSyncCodec.encode(FolioleFramedSyncCodec.validateOutbound(message, authenticatedFrameType: 1))
            let header = try FolioleFramedSyncWireHeader(ciphertextBytes: plaintext.count + 16, sequence: UInt64(index), frameType: .sessionControl).encode()
            encoded.append(header)
            encoded.append(try FolioleFramedSyncFrameCrypto.encrypt(groupKey: groupKey, preamble: preamble, header: header,
                plaintext: plaintext, sequence: UInt64(index)))
        }
        return encoded
    }
}
