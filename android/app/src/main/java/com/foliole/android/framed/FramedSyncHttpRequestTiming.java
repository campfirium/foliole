package com.foliole.android.framed;

import java.io.OutputStream;
import java.net.HttpURLConnection;

/** Observes existing blocking calls without changing request ordering or stream ownership. */
public final class FramedSyncHttpRequestTiming {
    public interface Observer { void record(String phase, long nanos); }
    public static final Observer NONE = (phase, nanos) -> {};
    private FramedSyncHttpRequestTiming() {}

    static void send(HttpURLConnection connection, FramedSyncHttpTransport.RawRequestBody body,
        Observer observer) throws Exception {
        long opening = System.nanoTime();
        OutputStream raw;
        try { raw = connection.getOutputStream(); }
        finally { observer.record("open_output", System.nanoTime() - opening); }
        try (OutputStream output = new TimedClose(raw, observer)) {
            body.write(output);
            long flushing = System.nanoTime();
            try { output.flush(); }
            finally { observer.record("flush", System.nanoTime() - flushing); }
        }
        body.sent();
    }

    static int responseCode(HttpURLConnection connection, Observer observer) throws Exception {
        long started = System.nanoTime();
        try { return connection.getResponseCode(); }
        finally { observer.record("response_code", System.nanoTime() - started); }
    }

    private static final class TimedClose extends OutputStream {
        private final OutputStream output;
        private final Observer observer;
        TimedClose(OutputStream output, Observer observer) { this.output = output; this.observer = observer; }
        @Override public void write(int value) throws java.io.IOException { output.write(value); }
        @Override public void write(byte[] value, int offset, int length) throws java.io.IOException {
            output.write(value, offset, length);
        }
        @Override public void flush() throws java.io.IOException { output.flush(); }
        @Override public void close() throws java.io.IOException {
            long started = System.nanoTime();
            try { output.close(); }
            finally { observer.record("close_output", System.nanoTime() - started); }
        }
    }
}
