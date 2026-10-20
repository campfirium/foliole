package com.foliole.android;

import com.foliole.android.framed.FramedSyncFiles;
import com.getcapacitor.JSObject;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Arrays;

final class FolioleRequestSyncHttpChunks {
    private static final int CHUNK_BYTES = 512 * 1024;
    interface Check { void run() throws Exception; }
    interface Timing { void record(String phase, int index, int bytes, long nanos); }
    private FolioleRequestSyncHttpChunks() {}

    static void write(FramedSyncFiles files, String directory, int count, OutputStream output, Check check, Check progress) throws Exception {
        write(files, directory, count, output, check, progress, (phase, index, bytes, nanos) -> {});
    }

    static void write(FramedSyncFiles files, String directory, int count, OutputStream output,
        Check check, Check progress, Timing timing) throws Exception {
        if (count < 1) throw new IllegalArgumentException("request_sync_http_request_invalid");
        for (int index = 0; index < count; index++) {
            check.run();
            byte[] chunk = files.read(directory + "/http-out-" + index);
            if (chunk == null || chunk.length == 0 || chunk.length > CHUNK_BYTES) {
                throw new IllegalArgumentException("request_sync_http_request_truncated");
            }
            long started = System.nanoTime();
            try { output.write(chunk); }
            finally { timing.record("write", index, chunk.length, System.nanoTime() - started); }
            started = System.nanoTime();
            try { progress.run(); }
            finally { timing.record("touch_round", index, chunk.length, System.nanoTime() - started); }
        }
    }

    static JSObject read(FramedSyncFiles files, String directory, InputStream input, Check check, Check progress) throws Exception {
        byte[] buffer = new byte[CHUNK_BYTES];
        int count = 0;
        long length = 0;
        for (;;) {
            check.run();
            int size = 0;
            while (size < buffer.length) {
                check.run();
                int read = input.read(buffer, size, buffer.length - size);
                if (read < 0) break;
                size += read;
            }
            if (size == 0) break;
            files.write(directory + "/http-in-" + count++, size == buffer.length ? buffer : Arrays.copyOf(buffer, size));
            length += size;
            progress.run();
        }
        JSObject result = new JSObject();
        result.put("response_chunk_count", count);
        result.put("response_byte_length", length);
        return result;
    }
}
