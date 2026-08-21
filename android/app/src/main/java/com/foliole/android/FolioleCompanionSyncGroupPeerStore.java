package com.foliole.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;

import java.security.KeyStore;
import java.util.UUID;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class FolioleCompanionSyncGroupPeerStore {
    private static final String PREFS = "foliole_sync_group_peers";
    private static final String KEY_ALIAS = "foliole_sync_group_peer_secrets";

    private FolioleCompanionSyncGroupPeerStore() {}

    static String createSecret(Context context, String authorizationId) throws Exception {
        byte[] secret = randomSecretBytes();
        save(context, authorizationId, secret);
        return Base64.encodeToString(secret, Base64.NO_WRAP | Base64.URL_SAFE | Base64.NO_PADDING);
    }

    static String randomSecret() {
        return Base64.encodeToString(randomSecretBytes(), Base64.NO_WRAP | Base64.URL_SAFE | Base64.NO_PADDING);
    }

    static void saveSecret(Context context, String authorizationId, String encodedSecret) throws Exception {
        save(context, authorizationId, Base64.decode(encodedSecret, Base64.NO_WRAP | Base64.URL_SAFE));
    }

    private static byte[] randomSecretBytes() {
        byte[] secret = new byte[32];
        new java.security.SecureRandom().nextBytes(secret);
        return secret;
    }

    static byte[] load(Context context, String authorizationId) throws Exception {
        String encoded = prefs(context).getString(authorizationId, null);
        if (encoded == null) return null;
        byte[] payload = Base64.decode(encoded, Base64.NO_WRAP);
        byte[] iv = java.util.Arrays.copyOfRange(payload, 0, 12);
        byte[] ciphertext = java.util.Arrays.copyOfRange(payload, 12, payload.length);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, iv));
        return cipher.doFinal(ciphertext);
    }

    static void clear(Context context) {
        if (!prefs(context).edit().clear().commit()) {
            throw new IllegalStateException("Failed to clear Sync Group peer secrets.");
        }
    }

    static void remove(Context context, String authorizationId) {
        if (!prefs(context).edit().remove(authorizationId).commit()) {
            throw new IllegalStateException("Failed to remove Sync Group peer secret.");
        }
    }

    private static void save(Context context, String authorizationId, byte[] secret) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] iv = cipher.getIV();
        if (iv == null || iv.length == 0) {
            throw new IllegalStateException("Android Keystore did not provide an encryption IV.");
        }
        byte[] encrypted = cipher.doFinal(secret);
        byte[] payload = new byte[iv.length + encrypted.length];
        System.arraycopy(iv, 0, payload, 0, iv.length);
        System.arraycopy(encrypted, 0, payload, iv.length, encrypted.length);
        if (!prefs(context).edit().putString(authorizationId, Base64.encodeToString(payload, Base64.NO_WRAP)).commit()) {
            throw new IllegalStateException("Failed to persist Sync Group peer secret.");
        }
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
                KEY_ALIAS,
                android.security.keystore.KeyProperties.PURPOSE_ENCRYPT |
                    android.security.keystore.KeyProperties.PURPOSE_DECRYPT
            ).setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM)
             .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(KEY_ALIAS, null);
    }
}
