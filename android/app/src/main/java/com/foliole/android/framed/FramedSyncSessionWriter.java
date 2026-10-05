package com.foliole.android.framed;

import java.io.ByteArrayOutputStream;
import java.security.SecureRandom;
import java.util.List;

public final class FramedSyncSessionWriter {
    private static final SecureRandom RANDOM = new SecureRandom();

    private FramedSyncSessionWriter() {}

    public static byte[] encode(
        byte[] groupKey,
        FramedSyncSessionContext context,
        List<FramedSyncValidatedMessage> messages,
        FramedSyncSessionNonceStore nonceStore
    ) throws Exception {
        if (messages == null || messages.size() > FramedSyncContract.MAX_DECODED_REPEATED_ITEMS + 2) {
            throw new IllegalArgumentException("session_frame_limit_invalid");
        }
        byte[] sessionId = random(FramedSyncContract.IDENTIFIER_BYTES);
        byte[] noncePrefix = random(4);
        byte[] contextId = context.deriveContextId(sessionId);
        FramedSyncPreamble preamble = FramedSyncPreamble.session(
            contextId, sessionId, noncePrefix);
        nonceStore.persistBeforeEncryption(sessionId, contextId, noncePrefix, 0);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        output.write(preamble.encoded());
        for (int index = 0; index < messages.size(); index++) {
            if (FramedSyncPayloadValidator.frameType(messages.get(index).payload().payloadCase()) !=
                FramedSyncFrameType.SESSION_CONTROL) {
                throw new FramedSyncValidationException("session_control_payload_required");
            }
            byte[] plaintext = FramedSyncCodec.encode(messages.get(index));
            byte[] header = FramedSyncWireHeader.encode(
                plaintext.length + 16, index, FramedSyncFrameType.SESSION_CONTROL.wireValue());
            output.write(header);
            output.write(FramedSyncFrameCrypto.encrypt(
                groupKey, preamble, header, plaintext, index));
        }
        return output.toByteArray();
    }

    private static byte[] random(int length) {
        byte[] result = new byte[length];
        RANDOM.nextBytes(result);
        return result;
    }
}
