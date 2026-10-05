package com.foliole.android.framed;

import com.foliole.sync.v22.ProtocolMessage;
import com.google.protobuf.InvalidProtocolBufferException;

public final class FramedSyncCodec {
    private FramedSyncCodec() {}

    public static FramedSyncValidatedMessage decode(
        byte[] encoded,
        int authenticatedFrameType
    ) throws FramedSyncValidationException {
        FramedSyncFrameType frameType = FramedSyncFrameType.fromWireValue(authenticatedFrameType);
        requirePayloadBudget(encoded.length, frameType);
        try {
            return validateOutbound(ProtocolMessage.parseFrom(encoded), authenticatedFrameType);
        } catch (InvalidProtocolBufferException error) {
            throw new FramedSyncValidationException("protocol_decode_invalid");
        }
    }

    public static FramedSyncValidatedMessage validateOutbound(
        ProtocolMessage message,
        int authenticatedFrameType
    ) throws FramedSyncValidationException {
        FramedSyncFrameType frameType = FramedSyncFrameType.fromWireValue(authenticatedFrameType);
        FramedSyncPayload payload = FramedSyncPayloadValidator.validate(message);
        if (FramedSyncPayloadValidator.frameType(payload.payloadCase()) != frameType) {
            throw new FramedSyncValidationException("frame_payload_type_mismatch");
        }
        return new FramedSyncValidatedMessage(payload, message);
    }

    public static byte[] encode(FramedSyncValidatedMessage message) {
        return message.wireMessage().toByteArray();
    }

    private static void requirePayloadBudget(int size, FramedSyncFrameType frameType)
        throws FramedSyncValidationException {
        int limit = FramedSyncContract.MAX_FRAME_MESSAGE_BYTES;
        if (frameType == FramedSyncFrameType.SESSION_CONTROL) {
            limit = FramedSyncContract.MAX_CONTROL_MESSAGE_BYTES;
        } else if (frameType == FramedSyncFrameType.TRANSFER_HEADER) {
            limit = FramedSyncContract.MAX_MANIFEST_BYTES;
        }
        if (size > limit) throw new FramedSyncValidationException("frame_payload_limit_exceeded");
    }
}
