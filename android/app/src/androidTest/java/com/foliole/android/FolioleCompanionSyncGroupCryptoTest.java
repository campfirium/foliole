package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.fail;

import android.util.Base64;

import org.json.JSONObject;
import org.junit.Test;

import java.nio.charset.StandardCharsets;

public final class FolioleCompanionSyncGroupCryptoTest {
    @Test
    public void matchesSharedWorkgroupAeadVector() throws Exception {
        String key = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
        String tag = "630dcd2966c4336691125448bbb25b4f";
        byte[] nonce = new byte[12];
        for (int index = 0; index < nonce.length; index++) nonce[index] = (byte) (index + 1);

        JSONObject envelope = FolioleCompanionSyncGroupCrypto.encryptAt(
            key, tag, "POST", "/companion/sync-push", "request", "application/json",
            "{\"value\":1}".getBytes(StandardCharsets.UTF_8), 1_786_781_200_000L, nonce
        );

        assertEquals(tag, FolioleCompanionSyncGroupCrypto.groupTag(key));
        assertEquals("AQIDBAUGBwgJCgsM", envelope.getString("nonce"));
        assertEquals("X6wLBwtVPIRfflAcV4td2Jm0DTCJJkYMYJMy", envelope.getString("ciphertext"));
    }

    @Test
    public void decryptsLargeResponseAndRejectsTamperedAuthenticationTag() throws Exception {
        String key = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
        String tag = FolioleCompanionSyncGroupCrypto.groupTag(key);
        String path = "/sync-group/member-state";
        String contentType = "application/json";
        byte[] original = new byte[2 * 1024 * 1024 + 7];
        for (int index = 0; index < original.length; index++) original[index] = (byte) index;
        JSONObject envelope = FolioleCompanionSyncGroupCrypto.encrypt(
            key, tag, "POST", path, "response", contentType, original);
        assertArrayEquals(original, FolioleCompanionSyncGroupCrypto.decrypt(
            key, tag, "POST", path, "response", contentType, envelope));

        int flags = Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING;
        byte[] tampered = Base64.decode(envelope.getString("ciphertext"), flags);
        tampered[tampered.length - 1] ^= 1;
        envelope.put("ciphertext", Base64.encodeToString(tampered, flags));
        SecurityException error = assertThrows(SecurityException.class, () ->
            FolioleCompanionSyncGroupCrypto.decrypt(
                key, tag, "POST", path, "response", contentType, envelope));
        assertEquals("workgroup_aead_authentication_failed", error.getMessage());
    }

    @Test
    public void rejectsNonStandardNonceLength() throws Exception {
        try {
            FolioleCompanionSyncGroupCrypto.encryptAt(
                "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8",
                "630dcd2966c4336691125448bbb25b4f", "POST", "/companion/sync-push",
                "request", "application/json", new byte[0], 1L, new byte[8]
            );
            fail("Expected non-standard nonce rejection.");
        } catch (SecurityException expected) {
            assertEquals("workgroup_aead_nonce_invalid", expected.getMessage());
        }
    }

    @Test
    public void keepsAuthenticatedGetBodylessWhileEncryptingPostBodies() throws Exception {
        String key = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
        JSONObject headers = new JSONObject().put("X-Sync-Group-Id", "group-1")
            .put("X-Device-Id", "Android");
        FolioleCompanionWorkgroupHttp.PreparedRequest get =
            FolioleCompanionWorkgroupHttp.prepareWithKey(
                null, "http://127.0.0.1:38641/companion/sync-pack?after_state_seq=0",
                "GET", headers, null, key
            );
        assertNull(get.body);
        assertNotNull(get.headers.optString("X-Signature", null));
        FolioleCompanionWorkgroupHttp.PreparedRequest post =
            FolioleCompanionWorkgroupHttp.prepareWithKey(
                null, "http://127.0.0.1:38641/companion/sync-push",
                "POST", headers, "{}", key
            );
        assertNotNull(post.body);
        assertEquals(FolioleCompanionWorkgroupHttp.ENVELOPE_CONTENT_TYPE,
            post.headers.getString("Content-Type"));
    }
}
