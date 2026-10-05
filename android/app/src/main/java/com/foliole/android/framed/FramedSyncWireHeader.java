package com.foliole.android.framed;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;

public final class FramedSyncWireHeader {
    public static final int BYTES = 16;
    public static final int MAX_CIPHERTEXT_BYTES = 1024 * 1024;

    private final int ciphertextBytes;
    private final int frameType;
    private final long sequence;

    private FramedSyncWireHeader(int ciphertextBytes, long sequence, int frameType) {
        this.ciphertextBytes = ciphertextBytes;
        this.sequence = sequence;
        this.frameType = frameType;
    }

    public static FramedSyncWireHeader decode(byte[] encoded) {
        if (encoded.length != BYTES) throw invalid("frame_header_length_invalid");
        ByteBuffer input = ByteBuffer.wrap(encoded).order(ByteOrder.BIG_ENDIAN);
        long bodyBytes = Integer.toUnsignedLong(input.getInt());
        long sequence = input.getLong();
        int frameType = Short.toUnsignedInt(input.getShort());
        int flags = Short.toUnsignedInt(input.getShort());
        if (bodyBytes > MAX_CIPHERTEXT_BYTES) throw invalid("wire_frame_limit_exceeded");
        try {
            FramedSyncFrameType.fromWireValue(frameType);
        } catch (FramedSyncValidationException error) {
            throw invalid(error.getMessage());
        }
        if (flags != 0) throw invalid("frame_flags_invalid");
        return new FramedSyncWireHeader((int) bodyBytes, sequence, frameType);
    }

    public static byte[] encode(int ciphertextBytes, long sequence, int frameType) {
        if (ciphertextBytes < 0 || ciphertextBytes > MAX_CIPHERTEXT_BYTES) {
            throw invalid("wire_frame_limit_exceeded");
        }
        try {
            FramedSyncFrameType.fromWireValue(frameType);
        } catch (FramedSyncValidationException error) {
            throw invalid(error.getMessage());
        }
        return ByteBuffer.allocate(BYTES).order(ByteOrder.BIG_ENDIAN)
            .putInt(ciphertextBytes).putLong(sequence).putShort((short) frameType)
            .putShort((short) 0).array();
    }

    public int ciphertextBytes() { return ciphertextBytes; }
    public int frameType() { return frameType; }
    public long sequence() { return sequence; }

    private static IllegalArgumentException invalid(String message) {
        return new IllegalArgumentException(message);
    }
}
