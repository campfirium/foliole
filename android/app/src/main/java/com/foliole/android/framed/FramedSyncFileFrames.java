package com.foliole.android.framed;

import java.nio.ByteBuffer;
import java.security.MessageDigest;
import java.util.Arrays;

final class FramedSyncFileFrames {
    static final int PREFIX_BYTES = 145;
    private final FramedSyncFiles files;

    FramedSyncFileFrames(FramedSyncFiles files) { this.files = files; }

    String key(byte[] transferId, byte[] attemptId, long sequence) {
        return FramedSyncFileRecords.attempt(transferId, attemptId) + "/frames/" +
            Long.toUnsignedString(sequence) + ".frame";
    }

    FramedSyncStageOutcome commit(FramedSyncAuthenticatedFrame frame, boolean compact) throws Exception {
        var header = FramedSyncWireHeader.decode(frame.frameHeader());
        byte[] plaintext = frame.borrowedPlaintext();
        byte[] payload = compact ? hash(plaintext) : plaintext;
        byte[] value = ByteBuffer.allocate(PREFIX_BYTES + payload.length).put((byte) (compact ? 1 : 0))
            .put(frame.preamble()).put(frame.frameHeader()).put(hash(frame.borrowedCiphertext())).put(payload).array();
        String key = key(frame.transferId(), frame.attemptId(), header.sequence());
        byte[] prior = files.read(key);
        if (prior != null) {
            if (!Arrays.equals(prior, value)) throw new FramedSyncValidationException("inbound_frame_identity_conflict");
            return FramedSyncStageOutcome.IDENTICAL;
        }
        files.write(key, value);
        return FramedSyncStageOutcome.CREATED;
    }

    byte[] plaintext(byte[] transferId, byte[] attemptId, long sequence) throws Exception {
        byte[] value = files.read(key(transferId, attemptId, sequence));
        if (value == null || value.length < PREFIX_BYTES) throw new FramedSyncValidationException("inbound_frame_file_missing");
        var header = FramedSyncWireHeader.decode(Arrays.copyOfRange(value, 97, 113));
        if (header.sequence() != sequence) throw new FramedSyncValidationException("inbound_frame_identity_conflict");
        return value[0] == 0 ? Arrays.copyOfRange(value, PREFIX_BYTES, value.length) : null;
    }

    static byte[] hash(byte[] value) throws Exception {
        return MessageDigest.getInstance("SHA-256").digest(value);
    }
}
