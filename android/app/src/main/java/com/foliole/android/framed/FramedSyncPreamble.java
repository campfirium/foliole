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

    private static IllegalArgumentException invalid() {
        return new IllegalArgumentException("framed_sync_preamble_invalid");
    }
}
