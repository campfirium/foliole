package com.foliole.android.framed;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.Arrays;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public final class FramedSyncVerifiedBodySpoolTest {
    private static final int CHUNK_BYTES = 512 * 1024;
    @Rule public TemporaryFolder temporary = new TemporaryFolder();

    @Test public void spoolsRawBytesInExactBoundedRanges() throws Exception {
        byte[] body = new byte[3 * 1024 * 1024 + 17];
        for (int index = 0; index < body.length; index++) body[index] = (byte) index;
        byte[] unicode = "\uFEFF正文🌿\0".getBytes(StandardCharsets.UTF_8);
        System.arraycopy(unicode, 0, body, CHUNK_BYTES - 3, unicode.length);
        byte[] hash = hash(body);
        File directory = temporary.newFolder();
        long[] expectedOffset = { 0 };
        int[] calls = { 0 };
        File file = FramedSyncVerifiedBodySpool.write(hash, body.length, directory, (offset, size) -> {
            assertEquals(expectedOffset[0], offset);
            assertTrue(size > 0 && size <= CHUNK_BYTES);
            assertEquals(Math.min(CHUNK_BYTES, body.length - offset), size);
            expectedOffset[0] += size;
            calls[0]++;
            return Arrays.copyOfRange(body, (int) offset, (int) offset + size);
        });
        assertEquals(body.length, expectedOffset[0]);
        assertEquals(7, calls[0]);
        assertEquals(hex(hash), file.getName());
        assertArrayEquals(body, Files.readAllBytes(file.toPath()));
        assertArrayEquals(hash, hash(Files.readAllBytes(file.toPath())));
        assertEquals(1, directory.list().length);
    }

    @Test public void verifiesEmptyWithoutReadingARange() throws Exception {
        File directory = temporary.newFolder();
        File file = FramedSyncVerifiedBodySpool.write(hash(new byte[0]), 0, directory,
            (offset, size) -> { throw new AssertionError("Empty bodies must not read a range"); });
        assertTrue(file.isFile());
        assertEquals(0, file.length());
        assertEquals(hex(hash(new byte[0])), file.getName());
    }

    @Test public void rejectsShortLongNullAndWrongHashAndDeletesOnlyOwnPartial() throws Exception {
        byte[] body = new byte[CHUNK_BYTES + 3];
        byte[] hash = hash(body);
        for (int invalidSize : new int[] { -1, 0, 4 }) {
            File directory = temporary.newFolder();
            File sentinel = new File(directory, "keep.bin");
            Files.write(sentinel.toPath(), new byte[] { 7 });
            assertThrows(FramedSyncValidationException.class, () -> FramedSyncVerifiedBodySpool.write(
                hash, body.length, directory, (offset, size) -> offset == 0 ? new byte[size] :
                    invalidSize < 0 ? null : new byte[invalidSize]));
            assertArrayEquals(new byte[] { 7 }, Files.readAllBytes(sentinel.toPath()));
            assertEquals(1, directory.list().length);
            assertFalse(new File(directory, hex(hash)).exists());
        }
        File directory = temporary.newFolder();
        assertThrows(FramedSyncValidationException.class, () -> FramedSyncVerifiedBodySpool.write(
            new byte[32], body.length, directory, (offset, size) -> new byte[size]));
        assertEquals(0, directory.list().length);
        assertThrows(FramedSyncValidationException.class, () -> FramedSyncVerifiedBodySpool.write(
            new byte[32], 0, directory, (offset, size) -> new byte[size]));
        assertEquals(0, directory.list().length);
    }

    @Test public void cleansPartialOnRangeFailureAndDoesNotOverwriteExistingHashFile() throws Exception {
        File directory = temporary.newFolder();
        byte[] body = new byte[CHUNK_BYTES + 1];
        Exception failure = new Exception("range_unavailable");
        Exception actual = assertThrows(Exception.class, () -> FramedSyncVerifiedBodySpool.write(
            hash(body), body.length, directory, (offset, size) -> {
                if (offset > 0) throw failure;
                return new byte[size];
            }));
        assertEquals(failure, actual);
        assertEquals(0, directory.list().length);
        byte[] emptyHash = hash(new byte[0]);
        File existing = new File(directory, hex(emptyHash));
        Files.write(existing.toPath(), new byte[] { 5 });
        assertThrows(Exception.class, () -> FramedSyncVerifiedBodySpool.write(
            emptyHash, 0, directory, (offset, size) -> new byte[size]));
        assertArrayEquals(new byte[] { 5 }, Files.readAllBytes(existing.toPath()));
        assertEquals(1, directory.list().length);
    }

    private static byte[] hash(byte[] data) throws Exception {
        return MessageDigest.getInstance("SHA-256").digest(data);
    }

    private static String hex(byte[] data) {
        StringBuilder result = new StringBuilder();
        for (byte item : data) result.append(String.format("%02x", item & 0xff));
        return result.toString();
    }
}
