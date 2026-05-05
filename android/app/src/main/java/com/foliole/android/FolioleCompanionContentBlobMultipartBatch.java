package com.foliole.android;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

final class FolioleCompanionContentBlobMultipartBatch {
    private static final byte[] CRLF = new byte[] { '\r', '\n' };
    private static final byte[] HEADER_SEPARATOR = new byte[] { '\r', '\n', '\r', '\n' };

    private FolioleCompanionContentBlobMultipartBatch() {}

    static List<Blob> parse(byte[] response, String contentType, String blobHashHeader, String hashField) {
        String boundary = requireBoundary(contentType);
        byte[] boundaryBytes = ("--" + boundary).getBytes(StandardCharsets.UTF_8);
        byte[] closingBoundaryBytes = ("--" + boundary + "--").getBytes(StandardCharsets.UTF_8);
        List<Blob> blobs = new ArrayList<>();
        int cursor = 0;
        while (cursor < response.length) {
            if (startsWith(response, cursor, closingBoundaryBytes)) {
                return blobs;
            }
            if (!startsWith(response, cursor, boundaryBytes)) {
                throw new IllegalStateException("Desktop content body batch response is invalid.");
            }
            cursor += boundaryBytes.length;
            cursor = requireCrLf(response, cursor);
            int headerEnd = indexOf(response, HEADER_SEPARATOR, cursor);
            if (headerEnd < 0) {
                throw new IllegalStateException("Desktop content body batch response is truncated.");
            }
            Map<String, String> headers = parseHeaders(response, cursor, headerEnd);
            cursor = headerEnd + HEADER_SEPARATOR.length;
            int contentLength = requireContentLength(headers);
            requireAvailable(response, cursor, contentLength);
            byte[] data = new byte[contentLength];
            System.arraycopy(response, cursor, data, 0, contentLength);
            cursor += contentLength;
            cursor = requireCrLf(response, cursor);
            blobs.add(new Blob(requireHash(headers.get(blobHashHeader), hashField), data));
        }
        throw new IllegalStateException("Desktop content body batch response is truncated.");
    }

    private static String requireBoundary(String contentType) {
        if (contentType == null || !contentType.toLowerCase().startsWith("multipart/mixed")) {
            throw new IllegalStateException("Desktop content body batch response has invalid content type.");
        }
        for (String part : contentType.split(";")) {
            String trimmed = part.trim();
            if (trimmed.toLowerCase().startsWith("boundary=")) {
                return normalizeBoundary(trimmed.substring("boundary=".length()).trim());
            }
        }
        throw new IllegalStateException("Desktop content body batch response is missing boundary.");
    }

    private static String normalizeBoundary(String boundary) {
        String normalized = boundary;
        if (boundary.startsWith("\"") && boundary.endsWith("\"") && boundary.length() >= 2) {
            normalized = boundary.substring(1, boundary.length() - 1);
        }
        return requireText(normalized, "boundary");
    }

    private static Map<String, String> parseHeaders(byte[] response, int start, int end) {
        String headerText = new String(response, start, end - start, StandardCharsets.UTF_8);
        Map<String, String> headers = new HashMap<>();
        for (String line : headerText.split("\r\n")) {
            int separator = line.indexOf(':');
            if (separator > 0) {
                headers.put(
                    line.substring(0, separator).trim().toLowerCase(),
                    line.substring(separator + 1).trim()
                );
            }
        }
        return headers;
    }

    private static int requireContentLength(Map<String, String> headers) {
        try {
            int length = Integer.parseInt(requireText(headers.get("content-length"), "content-length"));
            if (length < 0) {
                throw new IllegalStateException("Desktop content body batch response is invalid.");
            }
            return length;
        } catch (NumberFormatException error) {
            throw new IllegalStateException("Desktop content body batch response has invalid content length.", error);
        }
    }

    private static int requireCrLf(byte[] response, int cursor) {
        if (!startsWith(response, cursor, CRLF)) {
            throw new IllegalStateException("Desktop content body batch response is truncated.");
        }
        return cursor + CRLF.length;
    }

    private static void requireAvailable(byte[] response, int cursor, int length) {
        if (length < 0 || cursor < 0 || cursor + length > response.length) {
            throw new IllegalStateException("Desktop content body batch response is truncated.");
        }
    }

    private static boolean startsWith(byte[] source, int offset, byte[] expected) {
        if (offset < 0 || offset + expected.length > source.length) {
            return false;
        }
        for (int index = 0; index < expected.length; index += 1) {
            if (source[offset + index] != expected[index]) {
                return false;
            }
        }
        return true;
    }

    private static int indexOf(byte[] source, byte[] target, int start) {
        for (int index = start; index <= source.length - target.length; index += 1) {
            if (startsWith(source, index, target)) {
                return index;
            }
        }
        return -1;
    }

    private static String requireHash(String value, String field) {
        String hash = requireText(value, field).toLowerCase();
        if (!hash.matches("[a-f0-9]{64}")) {
            throw new IllegalArgumentException(field + " is invalid.");
        }
        return hash;
    }

    private static String requireText(String value, String field) {
        if (value == null || value.trim().isEmpty()) {
            throw new IllegalArgumentException(field + " is required.");
        }
        return value.trim();
    }

    static final class Blob {
        final byte[] bytes;
        final String hash;

        Blob(String hash, byte[] bytes) {
            this.bytes = bytes;
            this.hash = hash;
        }
    }
}
