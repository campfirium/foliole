package com.foliole.android.framed;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public final class FramedSyncSessionReader {
    private FramedSyncSessionReader() {}

    public static Result read(
        InputStream input,
        byte[] groupKey,
        FramedSyncSessionContext context,
        int maxFrames
    ) throws Exception {
        return read(new FramedSyncStreamReader(input), groupKey, context, maxFrames);
    }

    public static Result read(
        FramedSyncStreamReader stream,
        byte[] groupKey,
        FramedSyncSessionContext context,
        int maxFrames
    ) throws Exception {
        List<FramedSyncValidatedMessage> messages = new ArrayList<>();
        Result session = readEach(stream, groupKey, context, maxFrames, messages::add);
        return new Result(session.preamble(), session.sessionId(), messages);
    }

    public static Result readEach(
        FramedSyncStreamReader stream, byte[] groupKey, FramedSyncSessionContext context,
        int maxFrames, FramedSyncSessionWriter.MessageConsumer consume
    ) throws Exception {
        return readEachEncoded(stream, groupKey, context, maxFrames, (message, bytes) -> consume.accept(message));
    }

    public interface EncodedMessageConsumer { void accept(FramedSyncValidatedMessage message, int encodedBytes) throws Exception; }
    public static Result readEachEncoded(FramedSyncStreamReader stream, byte[] groupKey, FramedSyncSessionContext context,
        int maxFrames, EncodedMessageConsumer consume) throws Exception {
        if (maxFrames < 1 || maxFrames > FramedSyncContract.MAX_SESSION_FRAMES) {
            throw new IllegalArgumentException("session_frame_limit_invalid");
        }
        FramedSyncPreamble preamble = stream.readPreamble();
        byte[] sessionId = context.validate(preamble);
        long expectedSequence = 0;
        long bytes = 96;
        for (FramedSyncWireFrame frame = stream.readFrame(); frame != null; frame = stream.readFrame()) {
            try (var consumed = frame) {
                if (expectedSequence >= maxFrames) {
                    throw new FramedSyncValidationException("session_frame_limit_exceeded");
                }
                byte[] plaintext = FramedSyncFrameCrypto.decrypt(
                    groupKey, preamble, frame, expectedSequence);
                bytes += plaintext.length + 32;
                if (bytes > FramedSyncContract.MAX_SESSION_BYTES) {
                    throw new FramedSyncValidationException("session_byte_limit_exceeded");
                }
                consume.accept(FramedSyncCodec.decode(plaintext, frame.header().frameType()), plaintext.length);
                expectedSequence += 1;
            }
        }
        return new Result(preamble, sessionId, Collections.emptyList());
    }

    public static final class Result {
        private final List<FramedSyncValidatedMessage> messages;
        private final FramedSyncPreamble preamble;
        private final byte[] sessionId;

        Result(
            FramedSyncPreamble preamble,
            byte[] sessionId,
            List<FramedSyncValidatedMessage> messages
        ) {
            this.preamble = preamble;
            this.sessionId = sessionId.clone();
            this.messages = Collections.unmodifiableList(new ArrayList<>(messages));
        }

        public List<FramedSyncValidatedMessage> messages() { return messages; }
        public FramedSyncPreamble preamble() { return preamble; }
        public byte[] sessionId() { return sessionId.clone(); }
    }
}
