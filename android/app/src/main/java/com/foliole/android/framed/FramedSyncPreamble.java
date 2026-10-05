package com.foliole.android.framed;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

public final class FramedSyncPreamble {
    public static final int BYTES = 96;
    private static final byte[] MAGIC = "FOLSYNC2".getBytes(StandardCharsets.US_ASCII);
    private final byte[] encoded;

    private FramedSyncPreamble(byte[] encoded) {
        this.encoded = encoded;
    }

    public static FramedSyncPreamble session(
        byte[] contextId, byte[] sessionId, byte[] noncePrefix
    ) {
        if (contextId == null || contextId.length != FramedSyncContract.DIGEST_BYTES ||
            sessionId == null || sessionId.length != FramedSyncContract.IDENTIFIER_BYTES ||
            noncePrefix == null || noncePrefix.length != 4) throw invalid();
        ByteBuffer output = ByteBuffer.allocate(BYTES).order(ByteOrder.BIG_ENDIAN);
        output.put(MAGIC).putShort((short) BYTES)
            .putShort((short) FramedSyncContract.PROTOCOL_VERSION)
            .put((byte) 1).put((byte) 0).putShort((short) 0)
            .put(contextId).put(sessionId).put(noncePrefix).putLong(0);
        return decode(output.array());
    }

    public static FramedSyncPreamble decode(byte[] encoded) {
        if (encoded.length != BYTES) throw invalid();
        ByteBuffer input = ByteBuffer.wrap(encoded).order(ByteOrder.BIG_ENDIAN);
        byte[] magic = new byte[MAGIC.length];
        input.get(magic);
        int length = Short.toUnsignedInt(input.getShort());
        int version = Short.toUnsignedInt(input.getShort());
        int contextKind = Byte.toUnsignedInt(input.get());
        int compression = Byte.toUnsignedInt(input.get());
        int reserved = Short.toUnsignedInt(input.getShort());
        if (!Arrays.equals(magic, MAGIC) || length != BYTES ||
            version != FramedSyncContract.PROTOCOL_VERSION ||
            (contextKind != 1 && contextKind != 2) ||
            (compression != 0 && compression != 1) || reserved != 0) throw invalid();
        for (int index = 76; index < encoded.length; index++) {
            if (encoded[index] != 0) throw invalid();
        }
        return new FramedSyncPreamble(encoded.clone());
    }

    public byte[] encoded() {
        return encoded.clone();
    }

    public int compression() { return Byte.toUnsignedInt(encoded[13]); }
    public int contextKind() { return Byte.toUnsignedInt(encoded[12]); }
    public byte[] contextId() { return Arrays.copyOfRange(encoded, 16, 48); }
    public byte[] identifier() { return Arrays.copyOfRange(encoded, 48, 64); }
    public byte[] noncePrefix() { return Arrays.copyOfRange(encoded, 64, 68); }
    public long startingSequence() {
        return ByteBuffer.wrap(encoded, 68, 8).order(ByteOrder.BIG_ENDIAN).getLong();
    }

    private static IllegalArgumentException invalid() {
        return new IllegalArgumentException("framed_sync_preamble_invalid");
    }
}
