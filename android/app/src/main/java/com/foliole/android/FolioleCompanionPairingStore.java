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

    private FolioleCompanionPairingStore() {}

    static JSObject loadPairingState(Context context) throws Exception {
        SharedPreferences prefs = prefs(context);
        JSObject result = new JSObject();
        String deviceId = prefs.getString(preferenceKey(context, "deviceId"), null);
        result.put(stateKey(context, "deviceId"), trimToNull(deviceId));
        result.put(stateKey(context, "deviceKind"), trimToNull(prefs.getString(preferenceKey(context, "deviceKind"), null)));
        result.put(stateKey(context, "deviceName"), trimToNull(prefs.getString(preferenceKey(context, "deviceName"), null)));
        result.put(stateKey(context, "isPaired"), canReadPairingSecret(context, deviceId));
        result.put(stateKey(context, "pairedAt"), trimToNull(prefs.getString(preferenceKey(context, "pairedAt"), null)));
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
            .putString(preferenceKey(context, "deviceId"), deviceId.trim())
            .putString(preferenceKey(context, "deviceKind"), deviceKind.trim())
            .putString(preferenceKey(context, "deviceName"), deviceName.trim())
            .putString(preferenceKey(context, "deviceSecret"), Base64.encodeToString(encrypted, Base64.NO_WRAP))
            .putString(preferenceKey(context, "deviceSecretIv"), Base64.encodeToString(iv, Base64.NO_WRAP))
            .putString(preferenceKey(context, "pairedAt"), pairedAt.trim())
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
        String deviceId = requireMeta(context, preferenceKey(context, "deviceId"));
        String secret = decryptSecret(context);
        String canonical = method.toUpperCase() + "\n" + pathWithQuery + "\n" + timestamp + "\n" + nonce + "\n" + bodyHash;
        JSObject headers = new JSObject();
        headers.put(signatureHeaderKey(context, "deviceId"), deviceId);
        headers.put(signatureHeaderKey(context, "timestamp"), timestamp);
        headers.put(signatureHeaderKey(context, "nonce"), nonce);
        headers.put(signatureHeaderKey(context, "signature"), signCanonicalRequest(secret, canonical));
        JSObject result = new JSObject();
        result.put(signatureResponseKey(context, "headers"), headers);
        return result;
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private static boolean canReadPairingSecret(Context context, String deviceId) {
        if (trimToNull(deviceId) == null || trimToNull(readPreference(context, "deviceSecret")) == null) {
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

    static void clearPairingCredentials(Context context) {
        prefs(context).edit()
            .remove(preferenceKey(context, "deviceId"))
            .remove(preferenceKey(context, "deviceKind"))
            .remove(preferenceKey(context, "deviceName"))
            .remove(preferenceKey(context, "deviceSecret"))
            .remove(preferenceKey(context, "deviceSecretIv"))
            .remove(preferenceKey(context, "pairedAt"))
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
        String encryptedSecret = requireMeta(context, preferenceKey(context, "deviceSecret"));
        String iv = requireMeta(context, preferenceKey(context, "deviceSecretIv"));
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

    private static String readPreference(Context context, String key) {
        return prefs(context).getString(preferenceKey(context, key), null);
    }

    private static String preferenceKey(Context context, String key) {
        try {
            return FolioleCompanionBridgeContractDefinitions.pairingPreferenceKey(context, key);
        } catch (Exception exception) {
            throw new IllegalStateException("Companion bridge contract asset is missing pairing preference key.", exception);
        }
    }

    private static String signatureHeaderKey(Context context, String key) throws Exception {
        return FolioleCompanionBridgeContractDefinitions.pairingSignatureHeaderKey(context, key);
    }

    private static String signatureResponseKey(Context context, String key) throws Exception {
        return FolioleCompanionBridgeContractDefinitions.pairingSignatureResponseKey(context, key);
    }

    private static String stateKey(Context context, String key) throws Exception {
        return FolioleCompanionBridgeContractDefinitions.pairingStateKey(context, key);
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
