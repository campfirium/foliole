package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.fail;

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
            .put("X-Authorization-Id", "Android");
        FolioleCompanionWorkgroupSession.open(key);
        try {
            FolioleCompanionWorkgroupHttp.PreparedRequest get = FolioleCompanionWorkgroupHttp.prepare(
                null, "http://127.0.0.1:38641/companion/sync-pack?after_state_seq=0", "GET", headers, null
            );
            assertNull(get.body);
            assertNotNull(get.headers.optString("X-Signature", null));
            FolioleCompanionWorkgroupHttp.PreparedRequest post = FolioleCompanionWorkgroupHttp.prepare(
                null, "http://127.0.0.1:38641/companion/sync-push", "POST", headers, "{}"
            );
            assertNotNull(post.body);
            assertEquals(FolioleCompanionWorkgroupHttp.ENVELOPE_CONTENT_TYPE,
                post.headers.getString("Content-Type"));
        } finally {
            FolioleCompanionWorkgroupSession.close();
        }
    }
}
