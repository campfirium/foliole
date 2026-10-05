package com.foliole.android;

import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;
import java.util.Map;

final class FolioleCompanionHttpBodyStream {
    private static final long MAX_FRAMED_BYTES = 32L * 1024 * 1024 * 1024;

    private FolioleCompanionHttpBodyStream() {}

    static InputStream open(InputStream input, Map<String, String> headers) {
        String transferEncoding = headers.get("transfer-encoding");
        if (transferEncoding != null) {
            if (!"chunked".equals(transferEncoding.trim().toLowerCase(Locale.ROOT))) {
                throw new IllegalArgumentException("framed_sync_transfer_encoding_invalid");
            }
            return new Chunked(input);
        }
        long length;
        try { length = Long.parseLong(headers.getOrDefault("content-length", "0")); }
        catch (NumberFormatException error) {
            throw new IllegalArgumentException("framed_sync_content_length_invalid");
        }
        if (length < 0 || length > MAX_FRAMED_BYTES) {
            throw new IllegalArgumentException("request_too_large");
        }
        return new Bounded(input, length);
    }

    private static final class Bounded extends InputStream {
        private final InputStream input;
        private long remaining;

        private Bounded(InputStream input, long remaining) {
            this.input = input;
            this.remaining = remaining;
        }

        @Override public int read() throws IOException {
            if (remaining == 0) return -1;
            int value = input.read();
            if (value < 0) throw invalid("truncated_http_body");
            remaining -= 1;
            return value;
        }

        @Override public int read(byte[] target, int offset, int length) throws IOException {
            if (remaining == 0) return -1;
            int count = input.read(target, offset, (int) Math.min(length, remaining));
            if (count < 0) throw invalid("truncated_http_body");
            remaining -= count;
            return count;
        }
    }

    private static final class Chunked extends InputStream {
        private final InputStream input;
        private long chunkRemaining;
        private long total;
        private boolean ended;

        private Chunked(InputStream input) { this.input = input; }

        @Override public int read() throws IOException {
            byte[] single = new byte[1];
            return read(single, 0, 1) < 0 ? -1 : Byte.toUnsignedInt(single[0]);
        }

        @Override public int read(byte[] target, int offset, int length) throws IOException {
            if (ended) return -1;
            if (length == 0) return 0;
            if (chunkRemaining == 0) beginChunk();
            if (ended) return -1;
            int count = input.read(target, offset, (int) Math.min(length, chunkRemaining));
            if (count < 0) throw invalid("truncated_http_body");
            chunkRemaining -= count;
            total += count;
            if (total > MAX_FRAMED_BYTES) throw invalid("request_too_large");
            if (chunkRemaining == 0) requireCrlf();
            return count;
        }

        private void beginChunk() throws IOException {
            String line = readLine();
            int extension = line.indexOf(';');
            String size = (extension < 0 ? line : line.substring(0, extension)).trim();
            try { chunkRemaining = Long.parseLong(size, 16); }
            catch (NumberFormatException error) { throw invalid("chunked_body_invalid"); }
            if (chunkRemaining < 0 || total + chunkRemaining > MAX_FRAMED_BYTES) {
                throw invalid("request_too_large");
            }
            if (chunkRemaining == 0) {
                for (String trailer = readLine(); !trailer.isEmpty(); trailer = readLine()) {}
                ended = true;
            }
        }

        private void requireCrlf() throws IOException {
            if (input.read() != '\r' || input.read() != '\n') throw invalid("chunked_body_invalid");
        }

        private String readLine() throws IOException {
            StringBuilder value = new StringBuilder();
            int previous = -1;
            for (int next; (next = input.read()) >= 0;) {
                if (previous == '\r' && next == '\n') {
                    value.setLength(Math.max(0, value.length() - 1));
                    return value.toString();
                }
                value.append((char) next);
                previous = next;
                if (value.length() > 16 * 1024) throw invalid("chunked_body_invalid");
            }
            throw invalid("truncated_http_body");
        }
    }

    private static IOException invalid(String message) { return new IOException(message); }
}
