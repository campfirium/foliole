package com.foliole.android.framed;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public final class FramedSyncFrozenBodySpoolTest {
    @Rule public TemporaryFolder temporary = new TemporaryFolder();

    @Test public void spoolsExactRawBodyThroughOneCompleteRead() throws Exception {
        byte[] body = new byte[1024 * 1024];
        for (int index = 0; index < body.length; index++) body[index] = (byte) index;
        byte[] unicode = "\uFEFF正文🌿\0".getBytes(StandardCharsets.UTF_8);
        System.arraycopy(unicode, 0, body, 524285, unicode.length);
        byte[] hash = hash(body);
        File directory = temporary.newFolder();
        int[] calls = { 0 };
        File file = FramedSyncFrozenBodySpool.write(hash, body.length, directory, () -> {
            calls[0]++;
            return body;
        });
        assertEquals(1, calls[0]);
        assertEquals(hex(hash), file.getName());
        assertArrayEquals(body, Files.readAllBytes(file.toPath()));
        assertEquals(1, directory.list().length);
    }

    @Test public void verifiesEmptyBodyThroughItsFrozenOwner() throws Exception {
        File directory = temporary.newFolder();
        int[] calls = { 0 };
        File file = FramedSyncFrozenBodySpool.write(hash(new byte[0]), 0, directory,
            () -> { calls[0]++; return new byte[0]; });
        assertEquals(1, calls[0]);
        assertTrue(file.isFile());
        assertEquals(0, file.length());
    }

    @Test public void rejectsWrongLengthNullAndWrongHashAndDeletesOnlyOwnPartial() throws Exception {
        byte[] body = new byte[524291];
        for (int size : new int[] { -1, body.length - 1, body.length + 1 }) {
            File directory = temporary.newFolder();
            File sentinel = new File(directory, "keep.bin");
            Files.write(sentinel.toPath(), new byte[] { 7 });
            assertThrows(FramedSyncValidationException.class, () -> FramedSyncFrozenBodySpool.write(
                hash(body), body.length, directory, () -> size < 0 ? null : new byte[size]));
            assertArrayEquals(new byte[] { 7 }, Files.readAllBytes(sentinel.toPath()));
            assertEquals(1, directory.list().length);
        }
        File directory = temporary.newFolder();
        assertThrows(FramedSyncValidationException.class, () -> FramedSyncFrozenBodySpool.write(
            new byte[32], body.length, directory, () -> body));
        assertEquals(0, directory.list().length);
        assertThrows(FramedSyncValidationException.class, () -> FramedSyncFrozenBodySpool.write(
            hash(body), 1048577, directory, () -> { throw new AssertionError("Oversized body must not read"); }));
    }

    @Test public void cleansPartialOnReadFailureAndDoesNotOverwriteExistingHashFile() throws Exception {
        File directory = temporary.newFolder();
        byte[] body = new byte[1];
        Exception failure = new Exception("body_unavailable");
        assertEquals(failure, assertThrows(Exception.class, () -> FramedSyncFrozenBodySpool.write(
            hash(body), body.length, directory, () -> { throw failure; })));
        assertEquals(0, directory.list().length);
        byte[] emptyHash = hash(new byte[0]);
        File existing = new File(directory, hex(emptyHash));
        Files.write(existing.toPath(), new byte[] { 5 });
        assertThrows(Exception.class, () -> FramedSyncFrozenBodySpool.write(
            emptyHash, 0, directory, () -> new byte[0]));
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
