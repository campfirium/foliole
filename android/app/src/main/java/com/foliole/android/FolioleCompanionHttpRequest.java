package com.foliole.android;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

final class FolioleCompanionHttpRequest {
    final byte[] body;
    final Map<String, String> headers;
    final String method;
    final String path;

    private FolioleCompanionHttpRequest(String method, String path, Map<String, String> headers, byte[] body) {
        this.method = method; this.path = path; this.headers = headers; this.body = body;
    }

    static FolioleCompanionHttpRequest read(java.io.InputStream raw) throws Exception {
        BufferedInputStream input = new BufferedInputStream(raw);
        String requestLine = line(input);
        String[] parts = requestLine.split(" ");
        if (parts.length < 2) throw new IllegalArgumentException("invalid_http_request");
        Map<String, String> headers = new LinkedHashMap<>();
        for (String value = line(input); !value.isEmpty(); value = line(input)) {
            int separator = value.indexOf(':');
            if (separator > 0) headers.put(value.substring(0, separator).trim().toLowerCase(), value.substring(separator + 1).trim());
        }
        int length = Integer.parseInt(headers.getOrDefault("content-length", "0"));
        if (length < 0 || length > 1024 * 1024) throw new IllegalArgumentException("request_too_large");
        byte[] body = new byte[length];
        int offset = 0;
        while (offset < length) {
            int count = input.read(body, offset, length - offset);
            if (count < 0) throw new IllegalArgumentException("truncated_http_body");
            offset += count;
        }
        return new FolioleCompanionHttpRequest(parts[0].toUpperCase(), parts[1], headers, body);
    }

    String bodyText() { return new String(body, StandardCharsets.UTF_8); }
    String header(String name) { return headers.get(name.toLowerCase()); }

    private static String line(BufferedInputStream input) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        int previous = -1;
        for (int value; (value = input.read()) >= 0;) {
            if (previous == '\r' && value == '\n') {
                byte[] bytes = output.toByteArray();
                return new String(bytes, 0, Math.max(0, bytes.length - 1), StandardCharsets.US_ASCII);
            }
            output.write(value); previous = value;
            if (output.size() > 16 * 1024) throw new IllegalArgumentException("http_header_too_large");
        }
        throw new IllegalArgumentException("truncated_http_headers");
    }
}
