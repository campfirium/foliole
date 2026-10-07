package com.foliole.android.framed;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertThrows;

import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import org.junit.Test;

public final class FramedSyncBodyRangeResponseTest {
    private static final int CHUNK_BYTES = 512 * 1024;
    private static final byte[] HASH = new byte[32];

    @Test public void decodesRawMaximumPartialAndEmptyRanges() throws Exception {
        byte[] bytes = new byte[CHUNK_BYTES];
        for (int index = 0; index < bytes.length; index++) bytes[index] = (byte) index;
        assertArrayEquals(bytes, FramedSyncBodyRangeResponse.decode(response(bytes, "524288"), HASH,
            CHUNK_BYTES, CHUNK_BYTES));
        byte[] tail = { 0, (byte) 0xff, (byte) 0xef, (byte) 0xbb, (byte) 0xbf };
        assertArrayEquals(tail, FramedSyncBodyRangeResponse.decode(response(tail, "1048576"), HASH,
            CHUNK_BYTES * 2L, CHUNK_BYTES));
        assertArrayEquals(new byte[0], FramedSyncBodyRangeResponse.decode(response(new byte[0], "0"), HASH, 0, 1));
    }

    @Test public void rejectsHashAndOffsetIdentityAndNonCanonicalDecimals() throws Exception {
        rejectField("sha256", "ab".repeat(32));
        rejectField("sha256", "00".repeat(31));
        byte[] hash = new byte[32];
        hash[0] = (byte) 0xab;
        Map<String, Object> uppercase = response(new byte[0], "0");
        uppercase.put("sha256", "AB" + "00".repeat(31));
        assertThrows(FramedSyncValidationException.class, () ->
            FramedSyncBodyRangeResponse.decode(uppercase, hash, 0, 1));
        for (String offset : new String[] { "00", "+0", "-0", " 0", "0 ", "1", "9223372036854775808" }) {
            rejectField("offset", offset);
        }
        for (String length : new String[] { "00", "+0", "-0", " 0", "1.0", "999999", "99999999999999999999" }) {
            rejectField("byte_length", length);
        }
    }

    @Test public void rejectsWrongTypesAndMissingFieldsWithoutCoercion() throws Exception {
        for (String key : new String[] { "sha256", "offset", "byte_length", "data_base64" }) {
            rejectField(key, 0);
            rejectField(key, null);
            Map<String, Object> value = response(new byte[0], "0");
            value.remove(key);
            assertThrows(FramedSyncValidationException.class, () ->
                FramedSyncBodyRangeResponse.decode(value, HASH, 0, 1));
        }
    }

    @Test public void boundsEncodedBytesAndRejectsNonCanonicalOrWrongLengthBase64() throws Exception {
        for (String encoded : new String[] { "AA", "AB==", "AA=", "AA==\n", "_w==", "!!!!", "AAAA" }) {
            Map<String, Object> value = response(new byte[] { 0 }, "0");
            value.put("data_base64", encoded);
            assertThrows(FramedSyncValidationException.class, () ->
                FramedSyncBodyRangeResponse.decode(value, HASH, 0, 1));
        }
        rejectField("data_base64", "A".repeat(4 * ((CHUNK_BYTES + 2) / 3) + 1));
        Map<String, Object> wrongLength = response(new byte[] { 1, 2 }, "0");
        wrongLength.put("byte_length", "1");
        assertThrows(FramedSyncValidationException.class, () ->
            FramedSyncBodyRangeResponse.decode(wrongLength, HASH, 0, 2));
    }

    @Test public void rejectsInvalidRequestBoundsAndResponseBeyondRequestedLength() throws Exception {
        Map<String, Object> value = response(new byte[0], "0");
        for (int size : new int[] { -1, 0, CHUNK_BYTES + 1 }) {
            assertThrows(FramedSyncValidationException.class, () ->
                FramedSyncBodyRangeResponse.decode(value, HASH, 0, size));
        }
        assertThrows(FramedSyncValidationException.class, () ->
            FramedSyncBodyRangeResponse.decode(value, HASH, -1, 1));
        assertThrows(FramedSyncValidationException.class, () ->
            FramedSyncBodyRangeResponse.decode(value, new byte[31], 0, 1));
        assertThrows(FramedSyncValidationException.class, () ->
            FramedSyncBodyRangeResponse.decode(response(new byte[2], "0"), HASH, 0, 1));
    }

    private static void rejectField(String key, Object field) throws Exception {
        Map<String, Object> value = response(new byte[0], "0");
        value.put(key, field);
        assertThrows(FramedSyncValidationException.class, () ->
            FramedSyncBodyRangeResponse.decode(value, HASH, 0, CHUNK_BYTES));
    }

    private static Map<String, Object> response(byte[] bytes, String offset) {
        Map<String, Object> value = new HashMap<>();
        value.put("sha256", "00".repeat(32));
        value.put("offset", offset);
        value.put("byte_length", Integer.toString(bytes.length));
        value.put("data_base64", Base64.getEncoder().encodeToString(bytes));
        return value;
    }
}
