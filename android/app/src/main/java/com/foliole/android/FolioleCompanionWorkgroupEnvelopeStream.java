package com.foliole.android;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashSet;
import java.util.Set;

final class FolioleCompanionWorkgroupEnvelopeStream {
    static final class Header {
        String version;
        String contentType;
        String nonce;
        long timestamp;
    }

    private final InputStream input;

    private FolioleCompanionWorkgroupEnvelopeStream(InputStream input) {
        this.input = new BufferedInputStream(input, 64 * 1024);
    }

    static Header extract(InputStream input, File encodedCiphertext) throws Exception {
        return extract(input, encodedCiphertext, Long.MAX_VALUE);
    }

    static Header extract(InputStream input, File encodedCiphertext, long maximumBytes) throws Exception {
        return new FolioleCompanionWorkgroupEnvelopeStream(input).read(encodedCiphertext, maximumBytes);
    }

    private Header read(File encodedCiphertext, long maximumBytes) throws Exception {
        Header header = new Header();
        Set<String> seen = new HashSet<>();
        expect('{');
        do {
            String key = readString(null, 128);
            if (!seen.add(key)) throw invalid();
            expect(':');
            switch (key) {
                case "version": header.version = readString(null, 128); break;
                case "content_type": header.contentType = readString(null, 512); break;
                case "nonce": header.nonce = readString(null, 128); break;
                case "timestamp_ms": header.timestamp = readTimestamp(); break;
                case "ciphertext":
                    try (OutputStream output = new BufferedOutputStream(
                        new FileOutputStream(encodedCiphertext), 64 * 1024)) {
                        readString(output, maximumBytes);
                    }
                    break;
                default: throw invalid();
            }
            int delimiter = next();
            if (delimiter == '}') break;
            if (delimiter != ',') throw invalid();
        } while (true);
        if (next() != -1 || seen.size() != 5 || !seen.contains("ciphertext") ||
            header.version == null || header.contentType == null || header.nonce == null) throw invalid();
        return header;
    }

    private String readString(OutputStream output, long maximum) throws Exception {
        expect('"');
        StringBuilder value = output == null ? new StringBuilder() : null;
        long length = 0;
        for (int item; (item = input.read()) != -1;) {
            if (item == '"') return value == null ? null : value.toString();
            if (item == '\\') {
                int escaped = input.read();
                if (escaped == 'u') {
                    int decoded = 0;
                    for (int index = 0; index < 4; index++) {
                        int digit = Character.digit(input.read(), 16);
                        if (digit < 0) throw invalid();
                        decoded = (decoded << 4) | digit;
                    }
                    item = decoded;
                } else if (escaped == '"' || escaped == '\\' || escaped == '/') {
                    item = escaped;
                } else throw invalid();
            }
            if (item < 0x20 || item > 0x7f || ++length > maximum) throw invalid();
            if (output == null) value.append((char) item);
            else {
                if (!isBase64Url(item)) throw invalid();
                output.write(item);
            }
        }
        throw invalid();
    }

    private long readTimestamp() throws Exception {
        long timestamp = 0;
        int count = 0;
        while (true) {
            input.mark(1);
            int item = input.read();
            if (item < '0' || item > '9') {
                input.reset();
                if (count == 0) throw invalid();
                return timestamp;
            }
            if (++count > 19 || timestamp > (Long.MAX_VALUE - (item - '0')) / 10) throw invalid();
            timestamp = timestamp * 10 + item - '0';
        }
    }

    private void expect(int expected) throws Exception {
        if (next() != expected) throw invalid();
    }

    private int next() throws Exception {
        int item;
        do { item = input.read(); } while (item == ' ' || item == '\n' || item == '\r' || item == '\t');
        return item;
    }

    private static boolean isBase64Url(int item) {
        return item >= 'A' && item <= 'Z' || item >= 'a' && item <= 'z' ||
            item >= '0' && item <= '9' || item == '-' || item == '_';
    }

    private static SecurityException invalid() {
        return new SecurityException("workgroup_aead_envelope_invalid");
    }
}
