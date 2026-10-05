package com.foliole.android.framed;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;

final class FramedSyncFrameHeader {
    static final int MAX_FRAME_BYTES = 1024 * 1024;

    private FramedSyncFrameHeader() {}

    static void validate(byte[] encoded) {
        if (encoded.length != 16) throw invalid("frame_header_length_invalid");
        ByteBuffer input = ByteBuffer.wrap(encoded).order(ByteOrder.BIG_ENDIAN);
        long bodyBytes = Integer.toUnsignedLong(input.getInt());
        input.getLong();
        int type = Short.toUnsignedInt(input.getShort());
        int flags = Short.toUnsignedInt(input.getShort());
        if (bodyBytes > MAX_FRAME_BYTES) throw invalid("wire_frame_limit_exceeded");
        if (type < 1 || type > 6) throw invalid("frame_type_invalid");
        if (flags != 0) throw invalid("frame_flags_invalid");
    }

    private static IllegalArgumentException invalid(String message) {
        return new IllegalArgumentException(message);
    }
}
