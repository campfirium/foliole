package com.foliole.android.framed;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
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
        if (messages == null) throw new IllegalArgumentException("session_frame_limit_invalid");
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        write(groupKey, context, consumer -> {
            for (FramedSyncValidatedMessage message : messages) consumer.accept(message);
        }, nonceStore, output);
        return output.toByteArray();
    }

    public interface MessageConsumer { void accept(FramedSyncValidatedMessage message) throws Exception; }
    public interface MessageSource { void produce(MessageConsumer consumer) throws Exception; }

    public static void write(byte[] groupKey, FramedSyncSessionContext context,
        MessageSource messages, FramedSyncSessionNonceStore nonceStore, OutputStream output) throws Exception {
        write(groupKey, context, messages, nonceStore, output, null);
    }

    public static void write(byte[] groupKey, FramedSyncSessionContext context,
        MessageSource messages, FramedSyncSessionNonceStore nonceStore, OutputStream output,
        FramedSyncPayloadBudget budget) throws Exception {
        byte[] sessionId = random(FramedSyncContract.IDENTIFIER_BYTES);
        byte[] noncePrefix = random(4);
        byte[] contextId = context.deriveContextId(sessionId);
        FramedSyncPreamble preamble = FramedSyncPreamble.session(
            contextId, sessionId, noncePrefix);
        nonceStore.persistBeforeEncryption(sessionId, contextId, noncePrefix, 0);
        output.write(preamble.encoded());
        long[] size = { preamble.encoded().length };
        int[] index = { 0 };
        messages.produce(message -> {
            try (var loan = FramedSyncPayloadBudget.borrow(budget,
                FramedSyncPayloadBudget.Direction.OUTBOUND, FramedSyncPayloadBudget.Lane.PAYLOAD)) {
                if (index[0] >= FramedSyncContract.MAX_SESSION_FRAMES) {
                    throw new FramedSyncValidationException("session_frame_limit_exceeded");
                }
                if (FramedSyncPayloadValidator.frameType(message.payload().payloadCase()) !=
                    FramedSyncFrameType.SESSION_CONTROL) {
                    throw new FramedSyncValidationException("session_control_payload_required");
                }
                byte[] plaintext = FramedSyncCodec.encode(message);
                if (size[0] + plaintext.length + 32 > FramedSyncContract.MAX_SESSION_BYTES) {
                    throw new FramedSyncValidationException("session_byte_limit_exceeded");
                }
                byte[] header = FramedSyncWireHeader.encode(
                    plaintext.length + 16, index[0], FramedSyncFrameType.SESSION_CONTROL.wireValue());
                output.write(header);
                output.write(FramedSyncFrameCrypto.encrypt(
                    groupKey, preamble, header, plaintext, index[0]));
                size[0] += plaintext.length + 32;
                index[0] += 1;
            }
        });
        output.flush();
    }

    public static void replay(byte[] encoded, FramedSyncStreamWriter output) throws Exception {
        FramedSyncStreamReader input = new FramedSyncStreamReader(new ByteArrayInputStream(encoded));
        output.writePreamble(input.readPreamble().encoded());
        for (FramedSyncWireFrame frame = input.readFrame(); frame != null; frame = input.readFrame()) {
            try (var consumed = frame) {
                output.writeFrame(frame.headerBytes(), frame.borrowedCiphertext());
            }
        }
        output.flush();
    }

    private static byte[] random(int length) {
        byte[] result = new byte[length];
        RANDOM.nextBytes(result);
        return result;
    }
}
