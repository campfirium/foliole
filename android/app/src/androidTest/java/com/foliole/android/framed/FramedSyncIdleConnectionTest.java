package com.foliole.android.framed;

import static org.junit.Assert.assertEquals;

import android.util.Log;
import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.EOFException;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;

/** Uses the device HTTP implementation and synthetic bytes, without opening a library. */
public final class FramedSyncIdleConnectionTest {
    @Test public void completesSuccessiveRequestsWhileConnectionRemainsOpen() throws Exception {
        exercise(false, false);
    }

    @Test public void completesAfterPreviousConnectionHasAlreadyClosed() throws Exception {
        exercise(true, false);
    }

    @Test public void completesWhenIdlePeerRetiresPreviousConnectionDuringNextOpen() throws Exception {
        exercise(false, true);
    }

    private static void exercise(boolean closeBefore, boolean closeDuring) throws Exception {
        try (Peer peer = new Peer()) {
            assertEquals("reply", request(peer, FramedSyncHttpRequestTiming.NONE));
            if (closeBefore) peer.retireFirst();
            FramedSyncHttpRequestTiming.Observer observer = (phase, nanos) -> {
                if (closeDuring && "open_output".equals(phase)) peer.retireFirst();
            };
            try {
                assertEquals("reply", request(peer, observer));
            } finally {
                Log.i("FolioleIdleConnectionTest", "before=" + closeBefore + " during=" +
                    closeDuring + " accepted=" + peer.accepted.get() +
                    " completed=" + peer.completed.get());
            }
        }
    }

    private static String request(Peer peer, FramedSyncHttpRequestTiming.Observer observer) throws Exception {
        Map<String, String> auth = new LinkedHashMap<>();
        auth.put("x-device-id", "fixture-device");
        auth.put("x-nonce", "fixture-nonce");
        auth.put("x-signature", "fixture-signature");
        auth.put("x-timestamp", "2026-10-21T00:00:00Z");
        return FramedSyncHttpTransport.postRawStream(peer.url(), "fixture-group",
            "fixture-peer", "fixture-epoch", auth, out -> out.write(new byte[] {1, 2, 3}),
            input -> {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                for (int value; (value = input.read()) != -1;) out.write(value);
                return new String(out.toByteArray(), StandardCharsets.US_ASCII);
            }, connection -> {}, observer);
    }

    private static final class Peer implements AutoCloseable {
        private final ServerSocket server;
        private final List<Socket> sockets = new ArrayList<>();
        private final List<Thread> workers = new ArrayList<>();
        private final Thread acceptor;
        final AtomicInteger accepted = new AtomicInteger();
        final AtomicInteger completed = new AtomicInteger();

        Peer() throws Exception {
            server = new ServerSocket(0, 10, InetAddress.getByName("127.0.0.1"));
            acceptor = new Thread(this::accept, "idle-http-peer");
            acceptor.start();
        }

        URL url() throws Exception {
            return new URL("http://127.0.0.1:" + server.getLocalPort() + "/companion/framed-sync");
        }

        private void accept() {
            try {
                while (!server.isClosed()) {
                    Socket socket = server.accept();
                    socket.setSoTimeout(5000);
                    Thread worker = new Thread(() -> serve(socket), "idle-http-response");
                    synchronized (sockets) {
                        sockets.add(socket);
                        workers.add(worker);
                        accepted.incrementAndGet();
                    }
                    worker.start();
                }
            } catch (java.io.IOException error) {
                if (!server.isClosed()) throw new AssertionError(error);
            }
        }

        void retireFirst() {
            synchronized (sockets) {
                try { sockets.get(0).close(); }
                catch (java.io.IOException error) { throw new AssertionError(error); }
            }
        }

        private void serve(Socket socket) {
            try (Socket owned = socket) {
                BufferedInputStream input = new BufferedInputStream(owned.getInputStream());
                while (!owned.isClosed()) {
                    line(input);
                    boolean close = false;
                    for (String header; !(header = line(input)).isEmpty();) {
                        close |= header.equalsIgnoreCase("Connection: close");
                    }
                    drainChunks(input);
                    String headers = "HTTP/1.1 200 OK\r\nContent-Length: 5\r\nContent-Type: " +
                        FramedSyncHttpTransport.CONTENT_TYPE + "\r\nX-Foliole-Device-Id: fixture-peer" +
                        "\r\nX-Foliole-Library-Epoch: fixture-epoch\r\nConnection: " +
                        (close ? "close" : "keep-alive") + "\r\n\r\nreply";
                    owned.getOutputStream().write(headers.getBytes(StandardCharsets.US_ASCII));
                    owned.getOutputStream().flush();
                    completed.incrementAndGet();
                    if (close) return;
                }
            } catch (java.io.IOException expectedDisconnect) {
                // The test deliberately retires the idle socket at a controlled boundary.
            }
        }

        private static void drainChunks(BufferedInputStream input) throws java.io.IOException {
            for (;;) {
                int size = Integer.parseInt(line(input).split(";", 2)[0], 16);
                if (size == 0) { line(input); return; }
                for (int i = 0; i < size; i++) if (input.read() < 0) throw new EOFException();
                if (!line(input).isEmpty()) throw new java.io.IOException("Invalid chunk ending");
            }
        }

        private static String line(BufferedInputStream input) throws java.io.IOException {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            for (int value; (value = input.read()) != -1;) {
                if (value == '\n') return new String(bytes.toByteArray(), StandardCharsets.US_ASCII).trim();
                bytes.write(value);
            }
            throw new EOFException();
        }

        @Override public void close() throws Exception {
            server.close();
            acceptor.join(2000);
            synchronized (sockets) {
                for (Socket socket : sockets) socket.close();
            }
            for (Thread worker : workers) worker.join(2000);
        }
    }
}
