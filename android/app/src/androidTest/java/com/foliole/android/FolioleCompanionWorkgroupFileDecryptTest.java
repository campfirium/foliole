package com.foliole.android;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertThrows;

import android.content.Context;
import android.util.Base64;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionWorkgroupFileDecryptTest {
    private static final int BASE64_FLAGS = Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING;
    private static final String METHOD = "GET";
    private static final String PATH = "/companion/sync-pack?after_state_seq=0";
    private static final String CONTENT_TYPE = "application/zip";

    @Test
    public void computesStandardGcmAuthenticationHash() {
        byte[] subkey = hex("66e94bd4ef8a2c3b884cfa59ca342b2e");
        byte[] ciphertext = hex("0388dace60b6a392f328c2b971b2fe78");
        FolioleCompanionWorkgroupGHash hash = new FolioleCompanionWorkgroupGHash(subkey, new byte[0]);
        hash.updateCiphertext(ciphertext, ciphertext.length);
        assertArrayEquals(hex("f38cbb1ad69223dcc3457ae5b6b0f885"), hash.finish());
    }

    private static byte[] hex(String value) {
        byte[] bytes = new byte[value.length() / 2];
        for (int index = 0; index < bytes.length; index++) {
            bytes[index] = (byte) Integer.parseInt(value.substring(index * 2, index * 2 + 2), 16);
        }
        return bytes;
    }

    @Test
    public void decryptsLargeEnvelopeWithCiphertextBeforeMetadata() throws Exception {
        byte[] original = new byte[2 * 1024 * 1024 + 7];
        for (int index = 0; index < original.length; index++) original[index] = (byte) index;
        String key = Base64.encodeToString(new byte[32], BASE64_FLAGS);
        JSONObject envelope = FolioleCompanionSyncGroupCrypto.encrypt(
            key, FolioleCompanionSyncGroupCrypto.groupTag(key), METHOD, PATH,
            "response", CONTENT_TYPE, original);
        String reordered = "{\"ciphertext\":" + JSONObject.quote(envelope.getString("ciphertext")) +
            ",\"nonce\":" + JSONObject.quote(envelope.getString("nonce")) +
            ",\"timestamp_ms\":" + envelope.getLong("timestamp_ms") +
            ",\"content_type\":" + JSONObject.quote(CONTENT_TYPE) +
            ",\"version\":\"foliole-workgroup-aead-v1\"}";
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File encoded = File.createTempFile("stream-test-", ".b64", context.getCacheDir());
        File decoded = File.createTempFile("stream-test-", ".cipher", context.getCacheDir());
        File plaintext = File.createTempFile("stream-test-", ".plain", context.getCacheDir());
        try {
            FolioleCompanionWorkgroupEnvelopeStream.Header header =
                FolioleCompanionWorkgroupEnvelopeStream.extract(
                    new ByteArrayInputStream(reordered.getBytes(StandardCharsets.UTF_8)), encoded);
            FolioleCompanionWorkgroupFileDecrypt.decrypt(
                encoded, decoded, plaintext, key, METHOD, PATH, CONTENT_TYPE, header);
            byte[] restored = new byte[original.length];
            try (FileInputStream input = new FileInputStream(plaintext)) {
                int offset = 0;
                while (offset < restored.length) {
                    int count = input.read(restored, offset, restored.length - offset);
                    if (count < 0) throw new AssertionError("Unexpected end of decrypted file");
                    offset += count;
                }
            }
            assertArrayEquals(original, restored);

            byte[] tampered = Base64.decode(envelope.getString("ciphertext"), BASE64_FLAGS);
            tampered[tampered.length - 1] ^= 1;
            try (FileOutputStream output = new FileOutputStream(encoded)) {
                output.write(Base64.encode(tampered, BASE64_FLAGS));
            }
            assertThrows(SecurityException.class, () -> FolioleCompanionWorkgroupFileDecrypt.decrypt(
                encoded, decoded, plaintext, key, METHOD, PATH, CONTENT_TYPE, header));
        } finally {
            encoded.delete();
            decoded.delete();
            plaintext.delete();
        }
    }
}
