package com.foliole.android.framed;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

public final class FramedSyncSessionContext {
    private static final byte[] DOMAIN =
        "foliole-framed-sync-session-context-v1".getBytes(StandardCharsets.UTF_8);
    private final String groupId;
    private final String initiatorDeviceId;
    private final String initiatorLibraryEpoch;
    private final String responderDeviceId;
    private final String responderLibraryEpoch;

    public FramedSyncSessionContext(
        String groupId,
        String initiatorDeviceId,
        String initiatorLibraryEpoch,
        String responderDeviceId,
        String responderLibraryEpoch
    ) {
        this.groupId = requireText(groupId);
        this.initiatorDeviceId = requireText(initiatorDeviceId);
        this.initiatorLibraryEpoch = requireText(initiatorLibraryEpoch);
        this.responderDeviceId = requireText(responderDeviceId);
        this.responderLibraryEpoch = requireText(responderLibraryEpoch);
    }

    public byte[] validate(FramedSyncPreamble preamble) throws FramedSyncValidationException {
        if (preamble.contextKind() != 1) throw invalid("session_preamble_required");
        if (preamble.startingSequence() != 0) throw invalid("session_starting_sequence_invalid");
        byte[] sessionId = preamble.identifier();
        if (!MessageDigest.isEqual(deriveContextId(sessionId), preamble.contextId())) {
            throw invalid("session_context_mismatch");
        }
        return sessionId;
    }

    public byte[] deriveContextId(byte[] sessionId) throws FramedSyncValidationException {
        if (sessionId == null || sessionId.length != FramedSyncContract.IDENTIFIER_BYTES) {
            throw invalid("session_id_invalid");
        }
        try {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            bytes.write(DOMAIN); bytes.write(0);
            bytes.write(ByteBuffer.allocate(2).order(ByteOrder.BIG_ENDIAN)
                .putShort((short) FramedSyncContract.PROTOCOL_VERSION).array());
            writeText(bytes, groupId);
            writeText(bytes, initiatorDeviceId);
            writeText(bytes, initiatorLibraryEpoch);
            writeText(bytes, responderDeviceId);
            writeText(bytes, responderLibraryEpoch);
            bytes.write(sessionId);
            return MessageDigest.getInstance("SHA-256").digest(bytes.toByteArray());
        } catch (FramedSyncValidationException error) {
            throw error;
        } catch (Exception error) {
            throw invalid("session_context_derivation_failed");
        }
    }

    private static void writeText(ByteArrayOutputStream output, String value) throws Exception {
        byte[] encoded = value.getBytes(StandardCharsets.UTF_8);
        output.write(ByteBuffer.allocate(4).order(ByteOrder.BIG_ENDIAN).putInt(encoded.length).array());
        output.write(encoded);
    }

    private static String requireText(String value) {
        if (value == null || value.isEmpty()) throw new IllegalArgumentException("session_context_text_invalid");
        for (int index = 0; index < value.length(); index++) {
            char unit = value.charAt(index);
            if (Character.isHighSurrogate(unit)) {
                if (index + 1 >= value.length() || !Character.isLowSurrogate(value.charAt(++index))) {
                    throw new IllegalArgumentException("session_context_unicode_invalid");
                }
            } else if (Character.isLowSurrogate(unit)) {
                throw new IllegalArgumentException("session_context_unicode_invalid");
            }
        }
        return value;
    }

    private static FramedSyncValidationException invalid(String code) {
        return new FramedSyncValidationException(code);
    }
}
