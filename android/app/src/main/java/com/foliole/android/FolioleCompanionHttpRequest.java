package com.foliole.android;

import java.io.BufferedInputStream;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

final class FolioleCompanionHttpRequest {
    final byte[] body;
    final Map<String, String> headers;
    final String method;
    final String path;
    private final InputStream bodyStream;

    private FolioleCompanionHttpRequest(
        String method, String path, Map<String, String> headers, byte[] body, InputStream bodyStream
    ) {
        this.method = method; this.path = path; this.headers = headers; this.body = body;
        this.bodyStream = bodyStream;
    }

    static FolioleCompanionHttpRequest read(java.io.InputStream raw) throws Exception {
        BufferedInputStream input = new BufferedInputStream(raw);
        String requestLine = line(input);
        String[] parts = requestLine.split(" ");
        if (parts.length < 2) throw new IllegalArgumentException("invalid_http_request");
        int headerBytes = requestLine.length() + 2;
        Map<String, String> headers = new LinkedHashMap<>();
        for (String value = line(input); !value.isEmpty(); value = line(input)) {
            headerBytes += value.length() + 2;
            if (headerBytes > 16 * 1024) throw new IllegalArgumentException("http_header_too_large");
            int separator = value.indexOf(':');
            if (separator > 0 && value.substring(0, separator).trim().equalsIgnoreCase("content-length") &&
                headers.containsKey("content-length")) throw new IllegalArgumentException("invalid_http_headers");
            if (separator > 0) headers.put(value.substring(0, separator).trim().toLowerCase(Locale.ROOT), value.substring(separator + 1).trim());
        }
        if (parts[0].equalsIgnoreCase("POST") && framedPath(parts[1])) {
            InputStream bodyStream = FolioleCompanionHttpBodyStream.open(input, headers);
            return new FolioleCompanionHttpRequest(
                parts[0].toUpperCase(Locale.ROOT), parts[1], headers, new byte[0], bodyStream);
        }
        int length = Integer.parseInt(headers.getOrDefault("content-length", "0"));
        int limit = parts[0].equalsIgnoreCase("POST") &&
            (parts[1].equals("/companion/sync-identity-push") ||
                parts[1].startsWith("/companion/sync-identity-push?"))
            ? 2 * 1024 * 1024 : 1024 * 1024;
        if (length < 0 || length > limit) throw new IllegalArgumentException("request_too_large");
        byte[] body = new byte[length];
        int offset = 0;
        while (offset < length) {
            int count = input.read(body, offset, length - offset);
            if (count < 0) throw new IllegalArgumentException("truncated_http_body");
            offset += count;
        }
        return new FolioleCompanionHttpRequest(parts[0].toUpperCase(Locale.ROOT), parts[1], headers,
            body, new ByteArrayInputStream(body));
    }

    String bodyText() { return new String(body, StandardCharsets.UTF_8); }
    InputStream bodyStream() { return bodyStream; }
    String header(String name) { return headers.get(name.toLowerCase(Locale.ROOT)); }

    String signatureBodySha256() throws Exception {
        if (!framedPath(path)) return sha256(body);
        String value = header("x-foliole-body-sha256");
        if (value == null) throw new SecurityException("missing_headers");
        if (!value.matches("^[0-9a-f]{64}$")) throw new SecurityException("invalid_signature");
        return value;
    }

    private static boolean framedPath(String path) {
        return path.equals("/companion/framed-sync") || path.startsWith("/companion/framed-sync?");
    }

    private static String sha256(byte[] value) throws Exception {
        StringBuilder result = new StringBuilder();
        for (byte item : MessageDigest.getInstance("SHA-256").digest(value)) {
            result.append(String.format("%02x", item));
        }
        return result.toString();
    }

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
