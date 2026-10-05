import Foundation
import SwiftProtobuf

public struct FolioleFramedSyncValidatedMessage: Sendable {
    public let payload: FolioleFramedSyncPayload
    fileprivate let wireMessage: Foliole_Sync_V22_ProtocolMessage

    fileprivate init(
        payload: FolioleFramedSyncPayload,
        wireMessage: Foliole_Sync_V22_ProtocolMessage
    ) {
        self.payload = payload
        self.wireMessage = wireMessage
    }
}

public enum FolioleFramedSyncCodec {
    public static func decode(
        _ data: Data,
        authenticatedFrameType: UInt16
    ) throws -> FolioleFramedSyncValidatedMessage {
        try requirePayloadBudget(data.count, frameType: authenticatedFrameType)
        var options = BinaryDecodingOptions()
        options.messageDepthLimit = 128
        let message: Foliole_Sync_V22_ProtocolMessage
        do {
            message = try .init(serializedBytes: data, options: options)
        } catch {
            throw FolioleFramedSyncValidationError("protocol_decode_invalid")
        }
        return try validateOutbound(message, authenticatedFrameType: authenticatedFrameType)
    }

    public static func validateOutbound(
        _ message: Foliole_Sync_V22_ProtocolMessage,
        authenticatedFrameType: UInt16
    ) throws -> FolioleFramedSyncValidatedMessage {
        let payload = try FolioleFramedSyncPayloadValidator.validate(message)
        guard payload.frameType.rawValue == authenticatedFrameType else {
            throw FolioleFramedSyncValidationError("frame_payload_type_mismatch")
        }
        return FolioleFramedSyncValidatedMessage(payload: payload, wireMessage: message)
    }

    public static func encode(_ message: FolioleFramedSyncValidatedMessage) throws -> Data {
        do {
            return try message.wireMessage.serializedData()
        } catch {
            throw FolioleFramedSyncValidationError("protocol_encode_invalid")
        }
    }

    private static func requirePayloadBudget(_ count: Int, frameType: UInt16) throws {
        let limit: Int
        if frameType == FolioleFramedSyncFrameType.sessionControl.rawValue {
            limit = FolioleFramedSyncLimits.maxControlMessageBytes
        } else if frameType == FolioleFramedSyncFrameType.transferHeader.rawValue {
            limit = FolioleFramedSyncLimits.maxManifestBytes
        } else {
            limit = FolioleFramedSyncLimits.maxFrameMessageBytes
        }
        guard count <= limit else {
            throw FolioleFramedSyncValidationError("frame_payload_limit_exceeded")
        }
    }
}

private extension FolioleFramedSyncPayload {
    var frameType: FolioleFramedSyncFrameType {
        switch self {
        case .handshake, .handshakeAcceptance, .inventoryBegin, .inventoryChunk,
             .inventoryEnd, .differenceRequest, .transferProposal, .blobOffer,
             .missingBlobSet, .roundReceipt, .transferTermination, .protocolError:
            .sessionControl
        case .transferHeader: .transferHeader
        case .fact: .fact
        case .blobChunk: .blobChunk
        case .transferTrailer: .transferTrailer
        case .transferReceipt: .transferReceipt
        }
    }
}
