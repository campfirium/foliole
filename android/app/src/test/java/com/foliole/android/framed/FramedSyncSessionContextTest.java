package com.foliole.android.framed;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

import org.junit.Test;

public final class FramedSyncSessionContextTest {
    private static final byte[] SESSION_ID = hex("00112233445566778899aabbccddeeff");
    private static final byte[] PREAMBLE = hex(
        "464f4c53594e43320060001801000000f554ef43cd78aa425c355712432d4e8b5145bf1549832b9f5fc06672a2160933" +
        "00112233445566778899aabbccddeeff0506070800000000000000000000000000000000000000000000000000000000");

    @Test public void derivesAndValidatesTheFrozenSessionContext() throws Exception {
        FramedSyncSessionContext context = context();
        assertArrayEquals(
            hex("f554ef43cd78aa425c355712432d4e8b5145bf1549832b9f5fc06672a2160933"),
            context.deriveContextId(SESSION_ID));
        assertArrayEquals(SESSION_ID, context.validate(FramedSyncPreamble.decode(PREAMBLE)));
    }

    @Test public void rejectsAnAuthenticatedIdentityMismatch() throws Exception {
        FramedSyncSessionContext wrong = new FramedSyncSessionContext(
            "group-a", "device-a", "epoch-a", "device-b", "other-epoch");
        try {
            wrong.validate(FramedSyncPreamble.decode(PREAMBLE));
            fail("expected context mismatch");
        } catch (FramedSyncValidationException expected) {
            assertEquals("session_context_mismatch", expected.code());
        }
    }

    private static FramedSyncSessionContext context() {
        return new FramedSyncSessionContext(
            "group-a", "device-a", "epoch-a", "device-b", "epoch-b");
    }

    private static byte[] hex(String value) {
        byte[] result = new byte[value.length() / 2];
        for (int index = 0; index < result.length; index++) {
            result[index] = (byte) Integer.parseInt(value.substring(index * 2, index * 2 + 2), 16);
        }
        return result;
    }
}
