package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.util.Base64;

import org.json.JSONObject;
import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.spec.ECGenParameterSpec;

import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

public final class FolioleCompanionJoinRequestProviderTest {
    private static final long NOW = 1_788_000_000_000L;
    private static final String GROUP_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

    @Test public void requestAcceptanceIsEphemeralAndEncrypted() throws Exception {
        FolioleCompanionJoinRequestProvider provider = provider();
        KeyPair requester = keyPair();
        JSRequest request = request(provider, requester, NOW);

        assertEquals(1, provider.pending(NOW).length());
        assertNull(provider.collect(request.id, NOW));
        JSONObject acceptance = provider.accept(request.id, NOW + 1);
        assertFalse(acceptance.toString().contains(GROUP_KEY));
        JSONObject collected = provider.collect(request.id, NOW + 2);
        assertEquals(acceptance.toString(), collected.toString());
        assertEquals(groupInfo().toString(), decrypt(
            requester, collected.getJSONObject("encrypted_group_info")
        ));
        assertNull(provider.collect(request.id, NOW + 3));

        JSRequest rejected = request(provider, keyPair(), NOW);
        assertTrue(provider.reject(rejected.id, NOW));
        assertEquals(0, provider.pending(NOW).length());
        request(provider, keyPair(), NOW);
        assertEquals(0, provider.pending(NOW + FolioleCompanionJoinRequest.TTL_MS + 1).length());
        provider.clear();
        assertEquals(0, provider.pending(NOW).length());
    }

    @Test public void malformedRequestsMatchTheSharedContract() throws Exception {
        assertRejected(requestInput(keyPair()).put("contract_version", "1"));
        JSONObject paddedKey = requestInput(keyPair());
        paddedKey.put("ephemeral_public_key", paddedKey.getString("ephemeral_public_key") + "=");
        assertRejected(paddedKey);
        JSONObject noncanonicalPath = requestInput(keyPair());
        noncanonicalPath.getJSONObject("device").put("canonical_library_path", "/data/..");
        assertRejected(noncanonicalPath);
    }

    private static FolioleCompanionJoinRequestProvider provider() throws Exception {
        return new FolioleCompanionJoinRequestProvider(groupInfo());
    }

    private static JSONObject groupInfo() throws Exception {
        return new JSONObject().put("display_name", "My Sync Group")
            .put("group_id", "group-a").put("workgroup_key", GROUP_KEY);
    }

    private static JSRequest request(
        FolioleCompanionJoinRequestProvider provider, KeyPair requester, long nowMs
    ) throws Exception {
        return new JSRequest(provider.receive(requestInput(requester), nowMs).getString("request_id"));
    }

    private static JSONObject requestInput(KeyPair requester) throws Exception {
        JSONObject device = new JSONObject()
            .put("canonical_library_path", "/data/user/0/com.foliole.android/files/Foliole/Data/foliole.db")
            .put("device_anchor", "a1111111-1111-4111-8111-111111111111")
            .put("device_name", "A5").put("path_flavor", "posix").put("platform", "android");
        return new JSONObject().put("contract_version", 1).put("device", device)
            .put("ephemeral_public_key", encodePublic((java.security.interfaces.ECPublicKey) requester.getPublic()))
            .put("group_id", "group-a");
    }

    private static void assertRejected(JSONObject input) throws Exception {
        try {
            provider().receive(input, NOW);
            fail("Malformed request was accepted.");
        } catch (IllegalArgumentException expected) { /* Expected contract rejection. */ }
    }

    private static String decrypt(KeyPair client, JSONObject envelope) throws Exception {
        byte[] raw = decode(envelope.getString("server_public_key"));
        KeyPair template = keyPair();
        java.security.interfaces.ECPublicKey sample = (java.security.interfaces.ECPublicKey) template.getPublic();
        java.security.spec.ECPoint point = new java.security.spec.ECPoint(
            new java.math.BigInteger(1, java.util.Arrays.copyOfRange(raw, 1, 33)),
            new java.math.BigInteger(1, java.util.Arrays.copyOfRange(raw, 33, 65))
        );
        java.security.PublicKey server = java.security.KeyFactory.getInstance("EC").generatePublic(
            new java.security.spec.ECPublicKeySpec(point, sample.getParams())
        );
        KeyAgreement agreement = KeyAgreement.getInstance("ECDH");
        agreement.init(client.getPrivate()); agreement.doPhase(server, true);
        byte[] key = hkdf(agreement.generateSecret(), decode(envelope.getString("salt")),
            "Foliole companion pairing v1".getBytes(StandardCharsets.UTF_8));
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"),
            new GCMParameterSpec(128, decode(envelope.getString("iv"))));
        return new String(cipher.doFinal(decode(envelope.getString("ciphertext"))), StandardCharsets.UTF_8);
    }

    private static byte[] hkdf(byte[] input, byte[] salt, byte[] info) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(salt, "HmacSHA256")); byte[] key = mac.doFinal(input);
        mac.init(new SecretKeySpec(key, "HmacSHA256")); mac.update(info); mac.update((byte) 1);
        return mac.doFinal();
    }

    private static KeyPair keyPair() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec("secp256r1")); return generator.generateKeyPair();
    }

    private static String encodePublic(java.security.interfaces.ECPublicKey key) {
        byte[] raw = new byte[65]; raw[0] = 4;
        byte[] x = fixed(key.getW().getAffineX()); byte[] y = fixed(key.getW().getAffineY());
        System.arraycopy(x, 0, raw, 1, 32); System.arraycopy(y, 0, raw, 33, 32);
        return Base64.encodeToString(raw, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
    }

    private static byte[] fixed(java.math.BigInteger value) {
        byte[] input = value.toByteArray(); byte[] output = new byte[32];
        System.arraycopy(input, Math.max(0, input.length - 32), output,
            Math.max(0, 32 - input.length), Math.min(32, input.length));
        return output;
    }

    private static byte[] decode(String value) {
        return Base64.decode(value, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
    }

    private static final class JSRequest {
        final String id;
        JSRequest(String id) { this.id = id; }
    }
}
