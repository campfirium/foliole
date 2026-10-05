package com.foliole.android;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import org.junit.Test;

public final class FolioleCompanionHttpRequestTest {
    private static final String BODY_HASH = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    @Test public void exposesChunkedFramedBodyAsAStream() throws Exception {
        byte[] input = ("POST /companion/framed-sync?peer=a HTTP/1.1\r\n" +
            "Transfer-Encoding: chunked\r\nContent-Type: application/vnd.foliole.framed-sync\r\n\r\n" +
            "3\r\nabc\r\n4\r\n\u0000xyz\r\n0\r\n\r\n").getBytes(StandardCharsets.ISO_8859_1);

        FolioleCompanionHttpRequest request = FolioleCompanionHttpRequest.read(
            new ByteArrayInputStream(input));
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        byte[] buffer = new byte[2];
        for (int count; (count = request.bodyStream().read(buffer)) >= 0;) {
            body.write(buffer, 0, count);
        }

        assertEquals(0, request.body.length);
        assertArrayEquals(new byte[] { 'a', 'b', 'c', 0, 'x', 'y', 'z' }, body.toByteArray());
    }

    @Test public void usesTheDeclaredBinaryBodyHashForFramedAuthentication() throws Exception {
        byte[] input = ("POST /companion/framed-sync HTTP/1.1\r\n" +
            "Content-Length: 3\r\nX-Foliole-Body-Sha256: " + BODY_HASH + "\r\n\r\nabc")
            .getBytes(StandardCharsets.US_ASCII);
        FolioleCompanionHttpRequest request = FolioleCompanionHttpRequest.read(
            new ByteArrayInputStream(input));

        assertEquals(BODY_HASH, request.signatureBodySha256());
    }

    @Test public void keepsLegacyBodyAuthenticationBoundToActualBytes() throws Exception {
        byte[] input = ("POST /companion/member-state HTTP/1.1\r\n" +
            "Content-Length: 3\r\nX-Foliole-Body-Sha256: " + BODY_HASH + "\r\n\r\nabc")
            .getBytes(StandardCharsets.US_ASCII);
        FolioleCompanionHttpRequest request = FolioleCompanionHttpRequest.read(
            new ByteArrayInputStream(input));

        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            request.signatureBodySha256());
    }

    @Test public void rejectsATruncatedFramedBodyWhileStreaming() throws Exception {
        byte[] input = ("POST /companion/framed-sync HTTP/1.1\r\n" +
            "Content-Length: 4\r\n\r\nabc").getBytes(StandardCharsets.US_ASCII);
        FolioleCompanionHttpRequest request = FolioleCompanionHttpRequest.read(
            new ByteArrayInputStream(input));
        try {
            while (request.bodyStream().read() >= 0) {}
            fail("expected truncated body");
        } catch (java.io.IOException expected) {
            assertEquals("truncated_http_body", expected.getMessage());
        }
    }
}
