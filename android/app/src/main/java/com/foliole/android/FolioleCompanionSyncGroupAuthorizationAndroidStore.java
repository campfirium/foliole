package com.foliole.android;

import android.content.Context;
import android.content.SharedPreferences;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Base64;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class FolioleCompanionSyncGroupAuthorizationAndroidStore {
    private FolioleCompanionSyncGroupAuthorizationAndroidStore() {}

    static FolioleCompanionSyncGroupAuthorizationStore member(Context context) throws Exception {
        return create(context, "member", "memberPreferencesName", "memberKeyAlias");
    }

    static FolioleCompanionSyncGroupAuthorizationStore verification(Context context) throws Exception {
        return create(context, "verification", "verificationPreferencesName", "verificationKeyAlias");
    }

    private static FolioleCompanionSyncGroupAuthorizationStore create(
        Context context, String kind, String preferencesKey, String aliasKey
    ) throws Exception {
        FolioleCompanionSyncGroupAuthorizationContract contract =
            new FolioleCompanionSyncGroupAuthorizationContract(context);
        SharedPreferences preferences = context.getSharedPreferences(
            contract.storage(preferencesKey), Context.MODE_PRIVATE);
        return new FolioleCompanionSyncGroupAuthorizationStore(
            kind, contract.canonicalVersion(), new PreferencesStorage(preferences),
            new KeystoreProtector(contract.storage(aliasKey)));
    }

    private static final class PreferencesStorage implements FolioleCompanionSyncGroupAuthorizationStore.Storage {
        private final SharedPreferences preferences;
        PreferencesStorage(SharedPreferences preferences) { this.preferences = preferences; }
        public String read(String key) { return preferences.getString(key, null); }
        public void remove(String key) {
            if (!preferences.edit().remove(key).commit()) throw new IllegalStateException("route_store_remove_failed");
        }
        public void write(String key, String value) {
            if (!preferences.edit().putString(key, value).commit()) throw new IllegalStateException("route_store_write_failed");
        }
    }

    private static final class KeystoreProtector implements FolioleCompanionSyncGroupAuthorizationStore.Protector {
        private final String alias;
        KeystoreProtector(String alias) { this.alias = alias; }

        public String protect(String value) throws Exception {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key());
            byte[] ciphertext = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            byte[] payload = new byte[cipher.getIV().length + ciphertext.length];
            System.arraycopy(cipher.getIV(), 0, payload, 0, cipher.getIV().length);
            System.arraycopy(ciphertext, 0, payload, cipher.getIV().length, ciphertext.length);
            return Base64.getEncoder().encodeToString(payload);
        }

        public String unprotect(String value) throws Exception {
            byte[] payload = Base64.getDecoder().decode(value);
            if (payload.length <= 12) throw new SecurityException("sync_group_route_ciphertext_invalid");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128,
                java.util.Arrays.copyOfRange(payload, 0, 12)));
            return new String(cipher.doFinal(java.util.Arrays.copyOfRange(payload, 12, payload.length)),
                StandardCharsets.UTF_8);
        }

        private SecretKey key() throws Exception {
            KeyStore store = KeyStore.getInstance("AndroidKeyStore");
            store.load(null);
            if (!store.containsAlias(alias)) {
                KeyGenerator generator = KeyGenerator.getInstance("AES", "AndroidKeyStore");
                generator.init(new android.security.keystore.KeyGenParameterSpec.Builder(alias,
                    android.security.keystore.KeyProperties.PURPOSE_ENCRYPT |
                        android.security.keystore.KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setRandomizedEncryptionRequired(true).build());
                generator.generateKey();
            }
            return (SecretKey) store.getKey(alias, null);
        }
    }
}
