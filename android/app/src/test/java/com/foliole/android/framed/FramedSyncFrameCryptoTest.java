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
        "464f4c53594e43320060001d010000008b926880b18711d13081d20fb27bfdfde806371be0115bf0891ab7a98f1030d2" +
        "00112233445566778899aabbccddeeff0506070800000000000000000000000000000000000000000000000000000000");
    private static final byte[] HEADER = hex("0000001e000000000000000000010000");
    private static final byte[] CIPHERTEXT = hex(
        "0eab8a8acb9612cad746e3909df4ae0aa5b410db0422ca13f1c4b54b1e25");

    @Test public void decryptsTheFrozenSessionVector() throws Exception {
        FramedSyncPreamble preamble = FramedSyncPreamble.decode(PREAMBLE);
        FramedSyncWireFrame frame = frame(CIPHERTEXT);

        assertArrayEquals(hex("dd0f7a8d3c9d43b0488de5d947a0e3539618b5d86c6bdeecebbe81484773c6d9"),
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

    @Test public void rejectsRetiredPreambleVersions() throws Exception {
        for (int version : new int[] {28, 30}) {
            byte[] encoded = PREAMBLE.clone();
            encoded[11] = (byte) version;
            try {
                FramedSyncPreamble.decode(encoded);
                fail("accepted retired or unknown protocol version");
            } catch (IllegalArgumentException expected) {
                assertEquals("framed_sync_protocol_version_unsupported", expected.getMessage());
            }
        }
    }

    @Test public void decryptsTheFrozenTransferVector() throws Exception {
        byte[] encoded = hex("464f4c53594e43320060001d02000000202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f101112131415161718191a1b1c1d1e1f0102030400000000000000000000000000000000000000000000000000000000");
        byte[] header = hex("0000001c000000000000000000020000");
        byte[] ciphertext = hex("d472ab32ec48331d4665fa4f883727df470e197af2d252d21833dfef");
        FramedSyncPreamble preamble = FramedSyncPreamble.decode(encoded);
        FramedSyncStreamReader reader = new FramedSyncStreamReader(
            new ByteArrayInputStream(concat(encoded, header, ciphertext)));
        reader.readPreamble();
        assertArrayEquals(hex("f8a3e211c4d18a6726472218ac240fb65ca49c3c444edb54b7e4ce3f08ff36fb"),
            FramedSyncFrameCrypto.frameKey(GROUP_KEY, preamble));
        assertArrayEquals(hex("6672616d652d766563746f72"),
            FramedSyncFrameCrypto.decrypt(GROUP_KEY, preamble, reader.readFrame(), 0));
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
