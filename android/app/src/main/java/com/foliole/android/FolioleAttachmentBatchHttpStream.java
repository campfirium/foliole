package com.foliole.android;

import android.util.Base64;
import com.foliole.android.framed.FramedSyncStreamReader;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/** One read in flight. Waiting for the consumer before reading again applies backpressure to HTTP. */
final class FolioleAttachmentBatchHttpStream {
    private static final int MAX_CIPHERTEXT_BYTES = 512 * 1024 + 24_584 + 16;
    private static final int MAX_WIRE_BYTES = 10 * 1024 * 1024;
    private PluginCall demand;
    private boolean cancelled;

    FolioleAttachmentBatchHttpStream(PluginCall first) { demand = first; }

    synchronized void next(PluginCall call) {
        if (cancelled) {
            call.reject("request_sync_http_cancelled", "E_ABORT");
            return;
        }
        if (demand != null) {
            call.reject("attachment_batch_read_unavailable");
            return;
        }
        demand = call;
        notifyAll();
    }

    synchronized void cancel() {
        cancelled = true;
        notifyAll();
    }

    JSObject read(InputStream input, FolioleRequestSyncHttpChunks.Check check,
        FolioleRequestSyncHttpChunks.Check progress) throws Exception {
        var stream = new FramedSyncStreamReader(input);
        awaitDemand();
        check.run();
        byte[] preamble = stream.readPreamble().encoded();
        int total = preamble.length;
        long lastProgress = 0;
        while (true) {
            awaitDemand();
            check.run();
            try (var frame = stream.readFrame(MAX_CIPHERTEXT_BYTES)) {
                if (frame == null) return result().put("done", true);
                byte[] header = frame.headerBytes();
                byte[] ciphertext = frame.ciphertext();
                total += header.length + ciphertext.length;
                if (total > MAX_WIRE_BYTES) throw new IllegalArgumentException("attachment_batch_wire_limit");
                var bytes = new ByteArrayOutputStream(preamble.length + header.length + ciphertext.length);
                bytes.write(preamble);
                bytes.write(header);
                bytes.write(ciphertext);
                preamble = new byte[0];
                long now = System.nanoTime();
                if (lastProgress == 0 || now - lastProgress >= 250_000_000L) {
                    progress.run();
                    lastProgress = now;
                }
                deliver(result().put("base64", Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP)));
            }
        }
    }

    private static JSObject result() {
        return new JSObject().put("response_chunk_count", 0).put("response_byte_length", 0);
    }

    private synchronized void awaitDemand() throws InterruptedException {
        while (demand == null && !cancelled) wait();
        if (cancelled) throw new InterruptedException("request_sync_http_cancelled");
    }

    synchronized void deliver(JSObject value) {
        if (demand != null) {
            PluginCall call = demand;
            demand = null;
            call.resolve(value);
        }
    }

    synchronized void reject(String message, String code, Exception error) {
        if (demand != null) {
            PluginCall call = demand;
            demand = null;
            call.reject(message, code, error);
        }
    }
}
