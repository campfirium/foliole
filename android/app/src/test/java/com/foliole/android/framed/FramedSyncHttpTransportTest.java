package com.foliole.android.framed;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;

public final class FramedSyncHttpTransportTest {
    @Test
    public void sendsAndReceivesExactBinaryStreamsWithExistingMemberAuthHeaders() throws Exception {
        byte[] preamble = FramedSyncStreamTest.preamble();
        byte[] header = FramedSyncWireHeader.encode(3, 0, 1);
        byte[] body = new byte[] {0, (byte) 255, 7};
        AtomicReference<byte[]> received = new AtomicReference<>();
        AtomicReference<String> group = new AtomicReference<>();
        AtomicReference<String> signature = new AtomicReference<>();
        AtomicReference<Throwable> serverFailure = new AtomicReference<>();
        try (ServerSocket server = new ServerSocket(0)) {
            Thread serverThread = new Thread(() -> serveOne(
                server, received, group, signature, serverFailure));
            serverThread.start();
            URL url = new URL("http://127.0.0.1:" + server.getLocalPort() +
                "/companion/framed-sync");
            Map<String, String> auth = memberAuth();
            byte[] response = FramedSyncHttpTransport.post(
                url, "group-a", "desktop-b", "epoch-b", auth,
                writer -> {
                    writer.writePreamble(preamble);
                    writer.writeFrame(header, body);
                },
                reader -> {
                    ByteArrayOutputStream output = new ByteArrayOutputStream();
                    output.write(reader.readPreamble().encoded());
                    for (FramedSyncWireFrame frame; (frame = reader.readFrame()) != null;) {
                        output.write(frame.headerBytes());
                        output.write(frame.ciphertext());
                    }
                    return output.toByteArray();
                });
            assertArrayEquals(received.get(), response);
            assertEquals("group-a", group.get());
            assertEquals("signature", signature.get());
            serverThread.join(2_000);
            if (serverFailure.get() != null) throw new AssertionError(serverFailure.get());
        }
    }

    @Test(expected = SecurityException.class)
    public void rejectsIncompleteMemberAuthBeforeOpeningTheConnection() throws Exception {
        FramedSyncHttpTransport.post(
            new URL("http://127.0.0.1:1/companion/framed-sync"),
            "group-a", "desktop-b", "epoch-b", new LinkedHashMap<>(),
            writer -> {}, reader -> null);
    }

    private static Map<String, String> memberAuth() {
        Map<String, String> result = new LinkedHashMap<>();
        result.put("X-Sync-Group-Id", "group-a");
        result.put("X-Device-Id", "device-a");
        result.put("X-Nonce", "nonce");
        result.put("X-Signature", "signature");
        result.put("X-Timestamp", "2026-10-05T00:00:00Z");
        return result;
    }

    private static void serveOne(
        ServerSocket server,
        AtomicReference<byte[]> body,
        AtomicReference<String> group,
        AtomicReference<String> signature,
        AtomicReference<Throwable> failure
    ) {
        try (Socket socket = server.accept()) {
            BufferedInputStream input = new BufferedInputStream(socket.getInputStream());
            line(input);
            Map<String, String> headers = new LinkedHashMap<>();
            for (String value = line(input); !value.isEmpty(); value = line(input)) {
                int separator = value.indexOf(':');
                headers.put(value.substring(0, separator).trim().toLowerCase(),
                    value.substring(separator + 1).trim());
            }
            body.set(readChunked(input));
            group.set(headers.get("x-sync-group-id"));
            signature.set(headers.get("x-signature"));
            byte[] response = body.get();
            String responseHeaders = "HTTP/1.1 200 OK\r\nContent-Type: " +
                FramedSyncHttpTransport.CONTENT_TYPE +
                "\r\nX-Foliole-Device-Id: desktop-b" +
                "\r\nX-Foliole-Library-Epoch: epoch-b" +
                "\r\nContent-Length: " + response.length + "\r\nConnection: close\r\n\r\n";
            OutputStream output = socket.getOutputStream();
            output.write(responseHeaders.getBytes(StandardCharsets.US_ASCII));
            output.write(response);
            output.flush();
        } catch (Throwable error) {
            failure.set(error);
        }
    }

    private static byte[] readChunked(BufferedInputStream input) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        for (;;) {
            int length = Integer.parseInt(line(input).split(";", 2)[0], 16);
            if (length == 0) {
                line(input);
                return output.toByteArray();
            }
            byte[] chunk = new byte[length];
            readExact(input, chunk);
            output.write(chunk);
            if (!line(input).isEmpty()) throw new IllegalArgumentException("chunk_terminator_invalid");
        }
    }

    private static void readExact(InputStream input, byte[] output) throws Exception {
        int offset = 0;
        while (offset < output.length) {
            int count = input.read(output, offset, output.length - offset);
            if (count < 0) throw new IllegalArgumentException("http_body_truncated");
            offset += count;
        }
    }

    private static String line(InputStream input) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        int previous = -1;
        for (int value; (value = input.read()) >= 0;) {
            if (previous == '\r' && value == '\n') {
                byte[] bytes = output.toByteArray();
                return new String(bytes, 0, bytes.length - 1, StandardCharsets.US_ASCII);
            }
            output.write(value);
            previous = value;
        }
        throw new IllegalArgumentException("http_headers_truncated");
    }

}
