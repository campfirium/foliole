package com.foliole.android.framed;

import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONObject;

public final class FramedSyncBodyResponse {
    private static final int MAX_BYTES = 1024 * 1024;

    private FramedSyncBodyResponse() {}

    public static byte[] decode(JSONObject value, byte[] hash, long byteLength)
        throws FramedSyncValidationException {
        if (value == null) throw invalid();
        Map<String, Object> fields = new HashMap<>();
        for (String key : new String[] { "sha256", "byte_length", "data_base64" }) {
            fields.put(key, value.opt(key));
        }
        return decode(fields, hash, byteLength);
    }

    public static byte[] decode(Map<String, Object> value, byte[] hash, long byteLength)
        throws FramedSyncValidationException {
        if (value == null || hash == null || hash.length != 32 || byteLength < 0 || byteLength > MAX_BYTES) throw invalid();
        String responseHash = text(value, "sha256");
        if (!responseHash.equals(hex(hash))) {
            throw invalid();
        }
        String lengthText = text(value, "byte_length");
        if (lengthText.length() > 7 || !lengthText.matches("0|[1-9][0-9]*")) throw invalid();
        int length = Integer.parseInt(lengthText);
        if (length != byteLength) throw invalid();
        String encoded = text(value, "data_base64");
        int maximumEncodedLength = 4 * (((int) byteLength + 2) / 3);
        if (encoded.length() > maximumEncodedLength || encoded.length() != 4 * ((length + 2) / 3)) {
            throw invalid();
        }
        byte[] bytes;
        try { bytes = Base64.getDecoder().decode(encoded); }
        catch (IllegalArgumentException error) { throw invalid(); }
        if (bytes.length != length || !Base64.getEncoder().encodeToString(bytes).equals(encoded)) {
            throw invalid();
        }
        return bytes;
    }

    private static String text(Map<String, Object> value, String key) throws FramedSyncValidationException {
        Object field = value.get(key);
        if (!(field instanceof String)) throw invalid();
        return (String) field;
    }

    private static String hex(byte[] bytes) {
        StringBuilder value = new StringBuilder(64);
        for (byte item : bytes) value.append(String.format("%02x", item & 0xff));
        return value.toString();
    }

    private static FramedSyncValidationException invalid() {
        return new FramedSyncValidationException("framed_sync_body_response_invalid");
    }
}
