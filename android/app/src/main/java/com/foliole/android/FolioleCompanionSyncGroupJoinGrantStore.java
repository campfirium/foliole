package com.foliole.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.LinkedHashMap;
import java.util.Map;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class FolioleCompanionSyncGroupJoinGrantStore {
    private static final String KEY_ALIAS = "foliole_sync_group_join_grants";
    private static final String PREFS = "foliole_sync_group_join_grants";

    private FolioleCompanionSyncGroupJoinGrantStore() {}

    static void save(Context context, JSONObject config, FolioleCompanionSyncGroupJoinRequest request) throws Exception {
        JSONObject group = config.getJSONObject("sync_group");
        JSONObject record = new JSONObject().put("group_id", group.getString("group_id"))
            .put("timeline_id", group.getString("timeline_id"))
            .put("approved_by_device_id", config.getString("device_id"))
            .put("request", request.grantJson());
        if (!prefs(context).edit().putString(request.pairRequestId, encrypt(record.toString())).commit()) {
            throw new IllegalStateException("Failed to persist approved Sync Group join.");
        }
    }

    static Map<String, FolioleCompanionSyncGroupJoinRequest> load(
        Context context, String groupId, String timelineId
    ) throws Exception {
        Map<String, FolioleCompanionSyncGroupJoinRequest> result = new LinkedHashMap<>();
        for (Map.Entry<String, ?> entry : prefs(context).getAll().entrySet()) {
            if (!(entry.getValue() instanceof String)) continue;
            JSONObject record = new JSONObject(decrypt((String) entry.getValue()));
            if (!groupId.equals(record.optString("group_id")) || !timelineId.equals(record.optString("timeline_id"))) continue;
            FolioleCompanionSyncGroupJoinRequest request = FolioleCompanionSyncGroupJoinRequest
                .fromGrantJson(record.getJSONObject("request"));
            if (!request.expired() && "approved".equals(request.status)) result.put(request.pairRequestId, request);
            else {
                remove(context, request.pairRequestId);
                FolioleCompanionSyncGroupPeerStore.remove(context, request.deviceId);
            }
        }
        return result;
    }

    static String approvedByDeviceId(Context context, String pairRequestId) throws Exception {
        String encoded = prefs(context).getString(pairRequestId, null);
        if (encoded == null) throw new SecurityException("sync_group_join_grant_not_found");
        return new JSONObject(decrypt(encoded)).getString("approved_by_device_id");
    }

    static void remove(Context context, String pairRequestId) {
        if (!prefs(context).edit().remove(pairRequestId).commit()) {
            throw new IllegalStateException("Failed to remove approved Sync Group join.");
        }
    }

    static void clear(Context context) {
        if (!prefs(context).edit().clear().commit()) {
            throw new IllegalStateException("Failed to clear approved Sync Group joins.");
        }
    }

    private static String encrypt(String value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        byte[] payload = new byte[cipher.getIV().length + encrypted.length];
        System.arraycopy(cipher.getIV(), 0, payload, 0, cipher.getIV().length);
        System.arraycopy(encrypted, 0, payload, cipher.getIV().length, encrypted.length);
        return Base64.encodeToString(payload, Base64.NO_WRAP);
    }

    private static String decrypt(String encoded) throws Exception {
        byte[] payload = Base64.decode(encoded, Base64.NO_WRAP);
        if (payload.length <= 12) throw new SecurityException("sync_group_join_grant_invalid");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, java.util.Arrays.copyOfRange(payload, 0, 12)));
        return new String(cipher.doFinal(java.util.Arrays.copyOfRange(payload, 12, payload.length)), StandardCharsets.UTF_8);
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
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
