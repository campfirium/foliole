package com.foliole.android.framed;

import static org.junit.Assert.assertEquals;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.junit.Test;

public final class FramedSyncSessionReaderTest {
    private static final byte[] GROUP_KEY = hex(
        "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f");

    @Test public void authenticatesAndDecodesACompleteSessionFrame() throws Exception {
        FramedSyncSessionContext context = new FramedSyncSessionContext(
            "group-a", "device-a", "epoch-a", "device-b", "epoch-b");
        byte[] sessionId = hex("00112233445566778899aabbccddeeff");
        byte[] preamble = preamble(context.deriveContextId(sessionId), sessionId);
        byte[] plaintext = Base64.getDecoder().decode("GhQKEAARIjNEVWZ3iJmqu8zd7v8QAQ==");
        byte[] header = FramedSyncWireHeader.encode(
            plaintext.length + 16, 0, FramedSyncFrameType.SESSION_CONTROL.wireValue());
        byte[] ciphertext = encrypt(FramedSyncPreamble.decode(preamble), header, plaintext);

        FramedSyncSessionReader.Result result = FramedSyncSessionReader.read(
            new ByteArrayInputStream(concat(preamble, header, ciphertext)), GROUP_KEY, context, 1);

        assertEquals(1, result.messages().size());
        assertEquals(FramedSyncPayload.Case.INVENTORY_BEGIN,
            result.messages().get(0).payload().payloadCase());
    }

    private static byte[] encrypt(
        FramedSyncPreamble preamble, byte[] header, byte[] plaintext
    ) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE,
            new SecretKeySpec(FramedSyncFrameCrypto.frameKey(GROUP_KEY, preamble), "AES"),
            new GCMParameterSpec(128, hex("050607080000000000000000")));
        cipher.updateAAD(concat(preamble.encoded(), header));
        return cipher.doFinal(plaintext);
    }

    private static byte[] preamble(byte[] contextId, byte[] sessionId) {
        return concat("FOLSYNC2".getBytes(StandardCharsets.US_ASCII), hex("0060001601000000"),
            contextId, sessionId, hex("0506070800000000000000000000000000000000000000000000000000000000"));
    }

    private static byte[] concat(byte[]... values) {
        int size = 0;
        for (byte[] value : values) size += value.length;
        byte[] result = new byte[size]; int offset = 0;
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
}
