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
        "464f4c53594e43320060001801000000f554ef43cd78aa425c355712432d4e8b5145bf1549832b9f5fc06672a2160933" +
        "00112233445566778899aabbccddeeff0506070800000000000000000000000000000000000000000000000000000000");
    private static final byte[] HEADER = hex("0000001e000000000000000000010000");
    private static final byte[] CIPHERTEXT = hex(
        "9e3510772b473c139ecde9dfc3476881fbc7cfb9ac11e0d15cce1fd1e4c5");

    @Test public void decryptsTheFrozenSessionVector() throws Exception {
        FramedSyncPreamble preamble = FramedSyncPreamble.decode(PREAMBLE);
        FramedSyncWireFrame frame = frame(CIPHERTEXT);

        assertArrayEquals(hex("31a6b4f56d45cff41955f52b850dfb1aca4e590194c6a41640e5edc7db0f44e9"),
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
