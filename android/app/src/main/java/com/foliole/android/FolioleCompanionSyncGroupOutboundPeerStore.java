package com.foliole.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;

import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class FolioleCompanionSyncGroupOutboundPeerStore {
    private static final String KEY_ALIAS = "foliole_sync_group_outbound_peer_secrets";
    private static final String PREFS = "foliole_sync_group_outbound_peers";

    private FolioleCompanionSyncGroupOutboundPeerStore() {}

    static void save(Context context, String groupId, String localDeviceId, String peerDeviceId,
                     String endpointUrl, String secret) throws Exception {
        JSONObject record = new JSONObject()
            .put("endpoint_url", normalizeEndpoint(endpointUrl))
            .put("group_id", groupId.trim())
            .put("local_device_id", localDeviceId.trim())
            .put("peer_device_id", peerDeviceId.trim())
            .put("secret", secret);
        if (!prefs(context).edit().putString(peerDeviceId.trim(), encrypt(record.toString())).commit()) {
            throw new IllegalStateException("Failed to persist Sync Group outbound peer.");
        }
    }

    static JSObject sign(Context context, String groupId, String endpointUrl, String method,
                         String pathWithQuery, String timestamp, String nonce, String bodyHash) throws Exception {
        JSONObject peer = find(context, groupId.trim(), normalizeEndpoint(endpointUrl));
        String canonical = method.toUpperCase() + "\n" + pathWithQuery + "\n" + timestamp + "\n" + nonce + "\n" + bodyHash;
        JSObject headers = new JSObject();
        headers.put("X-Device-Id", peer.getString("local_device_id"));
        headers.put("X-Timestamp", timestamp);
        headers.put("X-Nonce", nonce);
        headers.put("X-Signature", FolioleCompanionPairingCrypto.signCanonicalRequest(peer.getString("secret"), canonical));
        return new JSObject().put("headers", headers);
    }

    static void bindRoute(Context context, String groupId, String peerDeviceId, String endpointUrl) throws Exception {
        String normalizedPeerId = peerDeviceId.trim();
        String encoded = prefs(context).getString(normalizedPeerId, null);
        if (encoded == null) throw new SecurityException("sync_group_peer_not_found");
        JSONObject peer = new JSONObject(decrypt(encoded));
        if (!groupId.trim().equals(peer.optString("group_id")) ||
            !normalizedPeerId.equals(peer.optString("peer_device_id"))) {
            throw new SecurityException("sync_group_peer_mismatch");
        }
        peer.put("endpoint_url", normalizeEndpoint(endpointUrl));
        if (!prefs(context).edit().putString(normalizedPeerId, encrypt(peer.toString())).commit()) {
            throw new IllegalStateException("Failed to persist Sync Group peer route.");
        }
    }

    static void clear(Context context) {
        if (!prefs(context).edit().clear().commit()) {
            throw new IllegalStateException("Failed to clear Sync Group outbound peers.");
        }
    }

    static void remove(Context context, String peerDeviceId) {
        if (!prefs(context).edit().remove(peerDeviceId.trim()).commit()) {
            throw new IllegalStateException("Failed to remove Sync Group outbound peer.");
        }
    }

    private static JSONObject find(Context context, String groupId, String endpointUrl) throws Exception {
        JSONObject match = null;
        for (Object encoded : prefs(context).getAll().values()) {
            if (!(encoded instanceof String)) continue;
            JSONObject candidate = new JSONObject(decrypt((String) encoded));
            if (!groupId.equals(candidate.optString("group_id")) ||
                !endpointUrl.equals(candidate.optString("endpoint_url"))) continue;
            if (match != null) throw new SecurityException("sync_group_peer_ambiguous");
            match = candidate;
        }
        if (match == null) throw new SecurityException("sync_group_peer_not_found");
        return match;
    }

    private static String encrypt(String value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] iv = cipher.getIV();
        if (iv == null || iv.length == 0) throw new IllegalStateException("Android Keystore did not provide an encryption IV.");
        byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        byte[] payload = new byte[iv.length + encrypted.length];
        System.arraycopy(iv, 0, payload, 0, iv.length);
        System.arraycopy(encrypted, 0, payload, iv.length, encrypted.length);
        return Base64.encodeToString(payload, Base64.NO_WRAP);
    }

    private static String decrypt(String encoded) throws Exception {
        byte[] payload = Base64.decode(encoded, Base64.NO_WRAP);
        if (payload.length <= 12) throw new SecurityException("sync_group_peer_invalid");
        byte[] iv = java.util.Arrays.copyOfRange(payload, 0, 12);
        byte[] ciphertext = java.util.Arrays.copyOfRange(payload, 12, payload.length);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, iv));
        return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
    }

    private static String normalizeEndpoint(String value) {
        return value.trim().replaceAll("/+$", "");
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (!store.containsAlias(KEY_ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance("AES", "AndroidKeyStore");
            generator.init(new android.security.keystore.KeyGenParameterSpec.Builder(
                KEY_ALIAS, android.security.keystore.KeyProperties.PURPOSE_ENCRYPT |
                    android.security.keystore.KeyProperties.PURPOSE_DECRYPT
            ).setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM)
             .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(KEY_ALIAS, null);
    }
}
