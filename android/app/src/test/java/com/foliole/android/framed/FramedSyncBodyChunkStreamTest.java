package com.foliole.android.framed;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.Test;

public final class FramedSyncBodyChunkStreamTest {
    @Test
    public void emptyBodyVerifiesWithoutWritingAChunk() throws Exception {
        FramedSyncBodyChunkStream.Source source = lastStart -> null;
        assertEquals(FramedSyncBodyChunkStream.Result.VERIFIED,
            FramedSyncBodyChunkStream.verify(source, 0, hash(new byte[0]), false));
        List<byte[]> writes = new ArrayList<>();
        FramedSyncBodyChunkStream.reblock(source, 0, (offset, data) -> writes.add(data));
        assertTrue(writes.isEmpty());
    }

    @Test
    public void unalignedReceivingChunksReblockIntoCanonicalChunks() throws Exception {
        byte[] body = new byte[FramedSyncBodyChunkStream.CHUNK_BYTES + 7];
        for (int index = 0; index < body.length; index++) body[index] = (byte) index;
        FramedSyncBodyChunkStream.Source source = source(
            chunk(0, Arrays.copyOfRange(body, 0, 13)),
            chunk(13, Arrays.copyOfRange(body, 13, body.length - 7)),
            chunk(body.length - 7, Arrays.copyOfRange(body, body.length - 7, body.length)));
        assertEquals(FramedSyncBodyChunkStream.Result.VERIFIED,
            FramedSyncBodyChunkStream.verify(source, body.length, hash(body), false));
        assertEquals(FramedSyncBodyChunkStream.Result.MISSING,
            FramedSyncBodyChunkStream.verify(source, body.length, hash(body), true));
        List<byte[]> writes = new ArrayList<>();
        FramedSyncBodyChunkStream.reblock(source, body.length, (offset, data) -> {
            assertEquals((long) writes.size() * FramedSyncBodyChunkStream.CHUNK_BYTES, offset);
            writes.add(data.clone());
        });
        assertEquals(2, writes.size());
        assertArrayEquals(Arrays.copyOfRange(body, 0, body.length - 7), writes.get(0));
        assertArrayEquals(Arrays.copyOfRange(body, body.length - 7, body.length), writes.get(1));
    }

    @Test
    public void gapsOverlapTruncationAndExcessBytesAreMissingCoverage() throws Exception {
        byte[] bytes = new byte[] {1, 2, 3, 4};
        FramedSyncBodyChunkStream.Source[] sources = {
            source(chunk(0, new byte[] {1}), chunk(2, new byte[] {3, 4})),
            source(chunk(0, new byte[] {1, 2}), chunk(1, new byte[] {2, 3, 4})),
            source(chunk(0, new byte[] {1, 2})),
            source(chunk(0, new byte[] {1, 2, 3, 4, 5})),
            source(chunk(0, new byte[0]))
        };
        for (FramedSyncBodyChunkStream.Source source : sources) {
            assertEquals(FramedSyncBodyChunkStream.Result.MISSING,
                FramedSyncBodyChunkStream.verify(source, bytes.length, hash(bytes), false));
        }
    }

    @Test
    public void completeCoverageWithWrongHashIsInvalid() throws Exception {
        assertEquals(FramedSyncBodyChunkStream.Result.INVALID,
            FramedSyncBodyChunkStream.verify(source(chunk(0, new byte[] {1, 2})),
                2, hash(new byte[] {1, 3}), false));
    }

    @Test
    public void largeBodyStreamsThroughBoundedChunksAndReblockBuffer() throws Exception {
        long length = 17L * FramedSyncBodyChunkStream.CHUNK_BYTES + 29;
        MessageDigest expected = MessageDigest.getInstance("SHA-256");
        FramedSyncBodyChunkStream.Source source = generated(length, 123457);
        long lastStart = -1;
        FramedSyncBodyChunkStream.Chunk chunk;
        while ((chunk = source.next(lastStart)) != null) {
            expected.update(chunk.data);
            lastStart = chunk.offset;
        }
        byte[] digest = expected.digest();
        assertEquals(FramedSyncBodyChunkStream.Result.VERIFIED,
            FramedSyncBodyChunkStream.verify(source, length, digest, false));
        MessageDigest persisted = MessageDigest.getInstance("SHA-256");
        long[] next = {0};
        FramedSyncBodyChunkStream.reblock(source, length, (offset, data) -> {
            assertEquals(next[0], offset);
            assertEquals(Math.min(FramedSyncBodyChunkStream.CHUNK_BYTES, length - offset), data.length);
            persisted.update(data);
            next[0] += data.length;
        });
        assertEquals(length, next[0]);
        assertArrayEquals(digest, persisted.digest());
    }

    private static FramedSyncBodyChunkStream.Source generated(long length, int size) {
        return lastStart -> {
            long offset = lastStart < 0 ? 0 : lastStart + size;
            if (offset >= length) return null;
            byte[] data = new byte[(int) Math.min(size, length - offset)];
            for (int index = 0; index < data.length; index++) data[index] = (byte) (offset + index);
            return chunk(offset, data);
        };
    }

    private static FramedSyncBodyChunkStream.Source source(FramedSyncBodyChunkStream.Chunk... chunks) {
        return lastStart -> {
            for (FramedSyncBodyChunkStream.Chunk chunk : chunks) if (chunk.offset > lastStart) return chunk;
            return null;
        };
    }

    private static FramedSyncBodyChunkStream.Chunk chunk(long offset, byte[] data) {
        return new FramedSyncBodyChunkStream.Chunk(offset, data);
    }

    private static byte[] hash(byte[] data) throws Exception {
        return MessageDigest.getInstance("SHA-256").digest(data);
    }
}
