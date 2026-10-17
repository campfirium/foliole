package com.foliole.android.framed;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

import java.io.ByteArrayInputStream;
import org.junit.Test;

public final class FramedSyncFrameCryptoTest {
    private static final byte[] GROUP_KEY = hex(
        "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f");
    private static final byte[] PREAMBLE = hex(
        "464f4c53594e43320060001a010000009cd98dcbdf193c29fa6e2b9016bf3703ddeae6479ca9e510c79031392209a7ee" +
        "00112233445566778899aabbccddeeff0506070800000000000000000000000000000000000000000000000000000000");
    private static final byte[] HEADER = hex("0000001e000000000000000000010000");
    private static final byte[] CIPHERTEXT = hex(
        "d5006e492afee70649d4e7b1db4486f55d612ab7c3fcf40a193b9a8f4b5e");

    @Test public void decryptsTheFrozenSessionVector() throws Exception {
        FramedSyncPreamble preamble = FramedSyncPreamble.decode(PREAMBLE);
        FramedSyncWireFrame frame = frame(CIPHERTEXT);

        assertArrayEquals(hex("b4a121bf896f96585e6860e7766e30b8a70782868f6a92d354591a61355988d0"),
            FramedSyncFrameCrypto.frameKey(GROUP_KEY, preamble));
        assertArrayEquals("session-vector".getBytes(java.nio.charset.StandardCharsets.UTF_8),
            FramedSyncFrameCrypto.decrypt(GROUP_KEY, preamble, frame, 0));
    }

    @Test public void rejectsTamperingAndSequenceGaps() throws Exception {
        FramedSyncPreamble preamble = FramedSyncPreamble.decode(PREAMBLE);
        byte[] tampered = CIPHERTEXT.clone();
        tampered[0] ^= 1;
        reject(() -> FramedSyncFrameCrypto.decrypt(GROUP_KEY, preamble, frame(tampered), 0),
            "frame_authentication_failed");
        reject(() -> FramedSyncFrameCrypto.decrypt(GROUP_KEY, preamble, frame(CIPHERTEXT), 1),
            "frame_sequence_not_contiguous");
    }

    private static FramedSyncWireFrame frame(byte[] ciphertext) throws Exception {
        byte[] stream = concat(PREAMBLE, HEADER, ciphertext);
        FramedSyncStreamReader reader = new FramedSyncStreamReader(new ByteArrayInputStream(stream));
        reader.readPreamble();
        return reader.readFrame();
    }

    private static void reject(Throwing action, String code) throws Exception {
        try { action.run(); fail("expected " + code); }
        catch (FramedSyncValidationException expected) { assertEquals(code, expected.code()); }
    }

    private static byte[] concat(byte[]... values) {
        int size = 0;
        for (byte[] value : values) size += value.length;
        byte[] result = new byte[size];
        int offset = 0;
        for (byte[] value : values) {
            System.arraycopy(value, 0, result, offset, value.length); offset += value.length;
        }
        return result;
    }

    private static byte[] hex(String value) {
        byte[] result = new byte[value.length() / 2];
        for (int index = 0; index < result.length; index++) {
            result[index] = (byte) Integer.parseInt(value.substring(index * 2, index * 2 + 2), 16);
        }
        return result;
    }

    private interface Throwing { void run() throws Exception; }
}
