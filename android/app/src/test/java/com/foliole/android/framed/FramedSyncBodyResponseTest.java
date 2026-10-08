package com.foliole.android.framed;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertThrows;

import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import org.junit.Test;

public final class FramedSyncBodyResponseTest {
    private static final int MAX_BYTES = 1024 * 1024;
    private static final byte[] HASH = new byte[32];

    @Test public void decodesExactMaximumAndEmptyBodies() throws Exception {
        byte[] bytes = new byte[MAX_BYTES];
        for (int index = 0; index < bytes.length; index++) bytes[index] = (byte) index;
        assertArrayEquals(bytes, FramedSyncBodyResponse.decode(response(bytes), HASH, MAX_BYTES));
        byte[] unicode = { 0, (byte) 0xef, (byte) 0xbb, (byte) 0xbf };
        assertArrayEquals(unicode, FramedSyncBodyResponse.decode(response(unicode), HASH, unicode.length));
        assertArrayEquals(new byte[0], FramedSyncBodyResponse.decode(response(new byte[0]), HASH, 0));
    }

    @Test public void rejectsHashAndOffsetIdentityAndNonCanonicalDecimals() throws Exception {
        rejectField("sha256", "ab".repeat(32));
        rejectField("sha256", "00".repeat(31));
        byte[] hash = new byte[32];
        hash[0] = (byte) 0xab;
        Map<String, Object> uppercase = response(new byte[0]);
        uppercase.put("sha256", "AB" + "00".repeat(31));
        assertThrows(FramedSyncValidationException.class, () ->
            FramedSyncBodyResponse.decode(uppercase, hash, 0));
        for (String length : new String[] { "00", "+0", "-0", " 0", "1.0", "999999", "99999999999999999999" }) {
            rejectField("byte_length", length);
        }
    }

    @Test public void rejectsWrongTypesAndMissingFieldsWithoutCoercion() throws Exception {
        for (String key : new String[] { "sha256", "byte_length", "data_base64" }) {
            rejectField(key, 0);
            rejectField(key, null);
            Map<String, Object> value = response(new byte[0]);
            value.remove(key);
            assertThrows(FramedSyncValidationException.class, () ->
                FramedSyncBodyResponse.decode(value, HASH, 0));
        }
    }

    @Test public void boundsEncodedBytesAndRejectsNonCanonicalOrWrongLengthBase64() throws Exception {
        for (String encoded : new String[] { "AA", "AB==", "AA=", "AA==\n", "_w==", "!!!!", "AAAA" }) {
            Map<String, Object> value = response(new byte[] { 0 });
            value.put("data_base64", encoded);
            assertThrows(FramedSyncValidationException.class, () ->
                FramedSyncBodyResponse.decode(value, HASH, 1));
        }
        rejectField("data_base64", "A".repeat(4 * ((MAX_BYTES + 2) / 3) + 1));
        Map<String, Object> wrongLength = response(new byte[] { 1, 2 });
        wrongLength.put("byte_length", "1");
        assertThrows(FramedSyncValidationException.class, () ->
            FramedSyncBodyResponse.decode(wrongLength, HASH, 2));
    }

    @Test public void rejectsInvalidRequestBoundsAndResponseBeyondRequestedLength() throws Exception {
        Map<String, Object> value = response(new byte[0]);
        for (int size : new int[] { -1, MAX_BYTES + 1 }) {
            assertThrows(FramedSyncValidationException.class, () ->
                FramedSyncBodyResponse.decode(value, HASH, size));
        }
        assertThrows(FramedSyncValidationException.class, () ->
            FramedSyncBodyResponse.decode(value, HASH, -1));
        assertThrows(FramedSyncValidationException.class, () ->
            FramedSyncBodyResponse.decode(value, new byte[31], 0));
        assertThrows(FramedSyncValidationException.class, () ->
            FramedSyncBodyResponse.decode(response(new byte[2]), HASH, 1));
    }

    private static void rejectField(String key, Object field) throws Exception {
        Map<String, Object> value = response(new byte[0]);
        value.put(key, field);
        assertThrows(FramedSyncValidationException.class, () ->
            FramedSyncBodyResponse.decode(value, HASH, 0));
    }

    private static Map<String, Object> response(byte[] bytes) {
        Map<String, Object> value = new HashMap<>();
        value.put("sha256", "00".repeat(32));
        value.put("byte_length", Integer.toString(bytes.length));
        value.put("data_base64", Base64.getEncoder().encodeToString(bytes));
        return value;
    }
}
