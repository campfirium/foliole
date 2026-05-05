package com.foliole.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;

import com.getcapacitor.JSObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.Mac;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

final class FolioleCompanionPairingStore {
    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "foliole_companion_pairing_secret";
    private static final String PREFS_NAME = "foliole_companion_pairing";
    private static final String DEVICE_ID_KEY = "device_id";
    private static final String DEVICE_KIND_KEY = "device_kind";
    private static final String DEVICE_NAME_KEY = "device_name";
    private static final String DEVICE_SECRET_KEY = "device_secret";
    private static final String IV_KEY = "device_secret_iv";
    private static final String PAIRED_AT_KEY = "paired_at";

    private FolioleCompanionPairingStore() {}

    static JSObject loadPairingState(Context context) {
        SharedPreferences prefs = prefs(context);
        JSObject result = new JSObject();
        String deviceId = prefs.getString(DEVICE_ID_KEY, null);
        result.put("device_id", trimToNull(deviceId));
        result.put("device_kind", trimToNull(prefs.getString(DEVICE_KIND_KEY, null)));
        result.put("device_name", trimToNull(prefs.getString(DEVICE_NAME_KEY, null)));
        result.put("is_paired", canReadPairingSecret(context, deviceId));
        result.put("paired_at", trimToNull(prefs.getString(PAIRED_AT_KEY, null)));
        return result;
    }

    static JSObject savePairingCredentials(
        Context context,
        String deviceId,
        String deviceKind,
        String deviceName,
        String deviceSecret,
        String pairedAt
    ) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, loadOrCreateSecretKey());
        byte[] iv = cipher.getIV();
        if (iv == null || iv.length == 0) {
            throw new IllegalStateException("Android Keystore did not provide an encryption IV.");
        }
        byte[] encrypted = cipher.doFinal(deviceSecret.getBytes(StandardCharsets.UTF_8));
        boolean saved = prefs(context).edit()
            .putString(DEVICE_ID_KEY, deviceId.trim())
            .putString(DEVICE_KIND_KEY, deviceKind.trim())
            .putString(DEVICE_NAME_KEY, deviceName.trim())
            .putString(DEVICE_SECRET_KEY, Base64.encodeToString(encrypted, Base64.NO_WRAP))
            .putString(IV_KEY, Base64.encodeToString(iv, Base64.NO_WRAP))
            .putString(PAIRED_AT_KEY, pairedAt.trim())
            .commit();
        if (!saved) {
            throw new IllegalStateException("Failed to persist companion pairing credentials.");
        }
        return loadPairingState(context);
    }

    static JSObject signRequest(
        Context context,
        String method,
        String pathWithQuery,
        String timestamp,
        String nonce,
        String bodyHash
    ) throws Exception {
        String deviceId = requireMeta(context, DEVICE_ID_KEY);
        String secret = decryptSecret(context);
        String canonical = method.toUpperCase() + "\n" + pathWithQuery + "\n" + timestamp + "\n" + nonce + "\n" + bodyHash;
        JSObject headers = new JSObject();
        headers.put("X-Device-Id", deviceId);
        headers.put("X-Timestamp", timestamp);
        headers.put("X-Nonce", nonce);
        headers.put("X-Signature", signCanonicalRequest(secret, canonical));
        JSObject result = new JSObject();
        result.put("headers", headers);
        return result;
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private static boolean canReadPairingSecret(Context context, String deviceId) {
        if (trimToNull(deviceId) == null || trimToNull(prefs(context).getString(DEVICE_SECRET_KEY, null)) == null) {
            return false;
        }
        try {
            String secret = decryptSecret(context);
            signCanonicalRequest(secret, "pairing-state-check");
            return trimToNull(secret) != null;
        } catch (Exception exception) {
            clearPairingCredentials(context);
            return false;
        }
    }

    private static void clearPairingCredentials(Context context) {
        prefs(context).edit()
            .remove(DEVICE_ID_KEY)
            .remove(DEVICE_KIND_KEY)
            .remove(DEVICE_NAME_KEY)
            .remove(DEVICE_SECRET_KEY)
            .remove(IV_KEY)
            .remove(PAIRED_AT_KEY)
            .apply();
    }

    private static SecretKey loadOrCreateSecretKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            return (SecretKey) keyStore.getKey(KEY_ALIAS, null);
        }
        KeyGenerator generator = KeyGenerator.getInstance("AES", ANDROID_KEYSTORE);
        generator.init(new android.security.keystore.KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            android.security.keystore.KeyProperties.PURPOSE_DECRYPT | android.security.keystore.KeyProperties.PURPOSE_ENCRYPT
        )
            .setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .build());
        return generator.generateKey();
    }

    private static String decryptSecret(Context context) throws Exception {
        String encryptedSecret = requireMeta(context, DEVICE_SECRET_KEY);
        String iv = requireMeta(context, IV_KEY);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(
            Cipher.DECRYPT_MODE,
            loadOrCreateSecretKey(),
            new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP))
        );
        return new String(
            cipher.doFinal(Base64.decode(encryptedSecret, Base64.NO_WRAP)),
            StandardCharsets.UTF_8
        );
    }

    private static String requireMeta(Context context, String key) {
        String value = trimToNull(prefs(context).getString(key, null));
        if (value == null) {
            throw new IllegalStateException("Companion is not paired.");
        }
        return value;
    }

    private static String trimToNull(String value) {
        return value == null || value.trim().isEmpty() ? null : value.trim();
    }

    private static String toHex(byte[] bytes) {
        StringBuilder builder = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) {
            builder.append(String.format("%02x", value));
        }
        return builder.toString();
    }

    private static String signCanonicalRequest(String secret, String canonical) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return toHex(mac.doFinal(canonical.getBytes(StandardCharsets.UTF_8)));
    }
}
