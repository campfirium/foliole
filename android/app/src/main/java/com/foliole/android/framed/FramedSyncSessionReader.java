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
        if (maxFrames < 1 || maxFrames > FramedSyncContract.MAX_DECODED_REPEATED_ITEMS + 2) {
            throw new IllegalArgumentException("session_frame_limit_invalid");
        }
        FramedSyncStreamReader stream = new FramedSyncStreamReader(input);
        FramedSyncPreamble preamble = stream.readPreamble();
        byte[] sessionId = context.validate(preamble);
        List<FramedSyncValidatedMessage> messages = new ArrayList<>();
        long expectedSequence = 0;
        for (FramedSyncWireFrame frame = stream.readFrame(); frame != null; frame = stream.readFrame()) {
            if (messages.size() >= maxFrames) {
                throw new FramedSyncValidationException("session_frame_limit_exceeded");
            }
            byte[] plaintext = FramedSyncFrameCrypto.decrypt(
                groupKey, preamble, frame, expectedSequence);
            messages.add(FramedSyncCodec.decode(plaintext, frame.header().frameType()));
            expectedSequence += 1;
        }
        return new Result(preamble, sessionId, messages);
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
