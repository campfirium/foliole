package com.foliole.android.framed;

import java.security.MessageDigest;
import java.util.Arrays;

final class FramedSyncBodyChunkStream {
    enum Result { MISSING, INVALID, VERIFIED }

    static final int CHUNK_BYTES = 512 * 1024;

    static final class Chunk {
        final long offset;
        final byte[] data;

        Chunk(long offset, byte[] data) {
            this.offset = offset;
            this.data = data;
        }
    }

    interface Source { Chunk next(long lastStart) throws Exception; }
    interface Sink { void write(long offset, byte[] data) throws Exception; }

    private FramedSyncBodyChunkStream() {}

    static Result verify(Source source, long length, byte[] hash, boolean canonical)
        throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        long expected = 0;
        long lastStart = -1;
        Chunk chunk;
        while ((chunk = source.next(lastStart)) != null) {
            if (chunk.offset <= lastStart || chunk.offset != expected || chunk.data == null ||
                chunk.data.length == 0 || chunk.data.length > CHUNK_BYTES ||
                chunk.data.length > length - expected) return Result.MISSING;
            if (canonical && (chunk.offset % CHUNK_BYTES != 0 ||
                chunk.data.length != Math.min(CHUNK_BYTES, length - expected))) return Result.MISSING;
            digest.update(chunk.data);
            expected += chunk.data.length;
            lastStart = chunk.offset;
        }
        if (length < 0 || expected != length) return Result.MISSING;
        return Arrays.equals(hash, digest.digest()) ? Result.VERIFIED : Result.INVALID;
    }

    static void reblock(Source source, long length, Sink sink) throws Exception {
        byte[] buffer = new byte[CHUNK_BYTES];
        int used = 0;
        long outputOffset = 0;
        long expected = 0;
        long lastStart = -1;
        Chunk chunk;
        while ((chunk = source.next(lastStart)) != null) {
            if (chunk.offset <= lastStart || chunk.offset != expected || chunk.data == null ||
                chunk.data.length == 0 || chunk.data.length > CHUNK_BYTES ||
                chunk.data.length > length - expected) throw changed();
            int consumed = 0;
            while (consumed < chunk.data.length) {
                int count = Math.min(buffer.length - used, chunk.data.length - consumed);
                System.arraycopy(chunk.data, consumed, buffer, used, count);
                used += count;
                consumed += count;
                if (used == buffer.length) {
                    sink.write(outputOffset, buffer);
                    outputOffset += used;
                    used = 0;
                }
            }
            expected += chunk.data.length;
            lastStart = chunk.offset;
        }
        if (expected != length) throw changed();
        if (used > 0) sink.write(outputOffset, Arrays.copyOf(buffer, used));
    }

    private static FramedSyncValidationException changed() {
        return new FramedSyncValidationException("blob_receiving_chunks_changed");
    }
}
