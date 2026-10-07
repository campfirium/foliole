package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.io.SequenceInputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public final class FolioleCompanionFramedHttpBodyTest {
    @Rule public TemporaryFolder temporary = new TemporaryFolder();

    @Test public void spoolsFiftyMiBWithBoundedReadsAndExactDigest() throws Exception {
        long size = 50L * 1024 * 1024;
        String expected = digest(new Bytes(size));
        byte[] headers = ("POST /companion/framed-sync HTTP/1.1\r\nContent-Length: " + size +
            "\r\nX-Foliole-Body-Sha256: " + expected + "\r\n\r\n").getBytes(StandardCharsets.US_ASCII);
        Bytes source = new Bytes(size);
        FolioleCompanionHttpRequest request = FolioleCompanionHttpRequest.read(
            new SequenceInputStream(new ByteArrayInputStream(headers), source));
        File directory = temporary.newFolder();
        File path;
        try (FolioleCompanionFramedHttpBody body = FolioleCompanionFramedHttpBody.spool(
                request.bodyStream(), directory, request.signatureBodySha256())) {
            path = body.file;
            assertEquals(size, body.byteLength);
            assertEquals(size, path.length());
            assertEquals(expected, body.sha256);
            assertTrue(source.maximumRead <= 64 * 1024);
            assertEquals(0, request.body.length);
            try (InputStream read = body.open()) { assertEquals(expected, digest(read)); }
            try (RandomAccessFile read = new RandomAccessFile(path, "r")) {
                read.seek(size - 1);
                assertEquals(source.last, read.read());
            }
        }
        assertFalse(path.exists());
    }

    @Test public void verifiesChunkedPayloadBytesBeforeMakingTheFileAvailable() throws Exception {
        byte[] bytes = ("POST /companion/framed-sync HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\n" +
            "3\r\nabc\r\n2\r\n\u0000x\r\n0\r\n\r\n").getBytes(StandardCharsets.ISO_8859_1);
        FolioleCompanionHttpRequest request = FolioleCompanionHttpRequest.read(new ByteArrayInputStream(bytes));
        String expected = digest(new ByteArrayInputStream(new byte[] { 'a', 'b', 'c', 0, 'x' }));
        try (FolioleCompanionFramedHttpBody body = FolioleCompanionFramedHttpBody.spool(
                request.bodyStream(), temporary.newFolder(), expected);
             InputStream read = body.open()) {
            assertEquals(5, body.byteLength);
            assertEquals(expected, digest(read));
        }
    }

    @Test public void rejectsHashMismatchAndTruncationWithoutLeavingAFile() throws Exception {
        File directory = temporary.newFolder();
        try {
            FolioleCompanionFramedHttpBody.spool(new ByteArrayInputStream(new byte[] { 1 }),
                directory, "0".repeat(64));
            fail("expected invalid signature");
        } catch (SecurityException error) { assertEquals("invalid_signature", error.getMessage()); }
        assertEquals(0, directory.list().length);
        byte[] wire = "POST /companion/framed-sync HTTP/1.1\r\nContent-Length: 4\r\n\r\nabc"
            .getBytes(StandardCharsets.US_ASCII);
        FolioleCompanionHttpRequest request = FolioleCompanionHttpRequest.read(new ByteArrayInputStream(wire));
        try {
            FolioleCompanionFramedHttpBody.spool(request.bodyStream(), directory, "0".repeat(64));
            fail("expected truncation");
        } catch (java.io.IOException error) { assertEquals("truncated_http_body", error.getMessage()); }
        assertEquals(0, directory.list().length);
    }

    @Test public void boundsTotalHeadersAndRejectsDuplicateLengths() throws Exception {
        String duplicate = "POST /companion/framed-sync HTTP/1.1\r\nContent-Length: 1\r\nContent-Length: 2\r\n\r\n";
        try { FolioleCompanionHttpRequest.read(new ByteArrayInputStream(duplicate.getBytes(StandardCharsets.US_ASCII)));
            fail("expected duplicate length rejection");
        } catch (IllegalArgumentException error) { assertEquals("invalid_http_headers", error.getMessage()); }
        String headers = "POST /companion/framed-sync HTTP/1.1\r\n" +
            ("X-Field: " + "x".repeat(8192) + "\r\n").repeat(2) + "\r\n";
        try { FolioleCompanionHttpRequest.read(new ByteArrayInputStream(headers.getBytes(StandardCharsets.US_ASCII)));
            fail("expected bounded headers");
        } catch (IllegalArgumentException error) { assertEquals("http_header_too_large", error.getMessage()); }
    }

    @Test public void readsSignedHeadersIndependentlyOfTheDeviceLocale() throws Exception {
        Locale original = Locale.getDefault();
        try {
            Locale.setDefault(new Locale("tr", "TR"));
            String hash = digest(new ByteArrayInputStream(new byte[0]));
            String wire = "POST /companion/framed-sync HTTP/1.1\r\nCONTENT-LENGTH: 0\r\n" +
                "X-FOLIOLE-BODY-SHA256: " + hash + "\r\n\r\n";
            FolioleCompanionHttpRequest request = FolioleCompanionHttpRequest.read(
                new ByteArrayInputStream(wire.getBytes(StandardCharsets.US_ASCII)));
            assertEquals(hash, request.signatureBodySha256());
        } finally { Locale.setDefault(original); }
    }

    private static String digest(InputStream input) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] data = new byte[64 * 1024];
        for (int count; (count = input.read(data)) >= 0;) digest.update(data, 0, count);
        StringBuilder result = new StringBuilder();
        for (byte value : digest.digest()) result.append(String.format("%02x", Byte.toUnsignedInt(value)));
        return result.toString();
    }

    private static final class Bytes extends InputStream {
        private long remaining;
        private int state = 0x13579bdf;
        int maximumRead;
        int last;
        Bytes(long size) { remaining = size; }
        @Override public int read() {
            if (remaining == 0) return -1;
            remaining -= 1;
            state ^= state << 13;
            state ^= state >>> 17;
            state ^= state << 5;
            last = state >>> 24;
            return last;
        }
        @Override public int read(byte[] bytes, int offset, int length) {
            maximumRead = Math.max(maximumRead, length);
            int count = (int) Math.min(length, remaining);
            if (count == 0) return -1;
            for (int index = 0; index < count; index += 1) bytes[offset + index] = (byte) read();
            return count;
        }
    }
}
