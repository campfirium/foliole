package com.foliole.android.framed;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

import org.junit.Test;

public final class FramedSyncSessionContextTest {
    private static final byte[] SESSION_ID = hex("00112233445566778899aabbccddeeff");
    private static final byte[] PREAMBLE = hex(
        "464f4c53594e43320060001601000000b91385f313c79240f0d205a2c74a2e23c18773b07a39c6e016c57aef8d000baf" +
        "00112233445566778899aabbccddeeff0506070800000000000000000000000000000000000000000000000000000000");

    @Test public void derivesAndValidatesTheFrozenSessionContext() throws Exception {
        FramedSyncSessionContext context = context();
        assertArrayEquals(
            hex("b91385f313c79240f0d205a2c74a2e23c18773b07a39c6e016c57aef8d000baf"),
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
