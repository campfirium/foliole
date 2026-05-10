package com.foliole.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;

import com.getcapacitor.JSObject;

import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.time.Instant;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class FolioleReadwiseTokenStore {
    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final String AUTH_URL = "https://readwise.io/api/v2/auth/";
    private static final String KEY_ALIAS = "foliole_readwise_token";
    private static final String PREFS_NAME = "foliole_readwise_token";
    private static final String TOKEN_KEY = "token";
    private static final String TOKEN_IV_KEY = "token_iv";

    private FolioleReadwiseTokenStore() {}

    static JSObject loadConnection(Context context) throws Exception {
        String token = readToken(context);
        if (token == null) {
            return connection(null, false, "Readwise is not connected.", "not_connected");
        }
        return connection(Instant.now().toString(), true, "Readwise token is saved on this device.", "connected");
    }

    static JSObject connect(Context context, String token) throws Exception {
        String normalizedToken = trimToNull(token);
        if (normalizedToken == null) {
            return connection(Instant.now().toString(), false, "Readwise token is required.", "invalid_token");
        }
        JSObject validated = validateToken(normalizedToken);
        if (!validated.getBoolean("connected")) {
            return validated;
        }
        saveToken(context, normalizedToken);
        return validated;
    }

    static JSObject disconnect(Context context) {
        prefs(context).edit().remove(TOKEN_KEY).remove(TOKEN_IV_KEY).apply();
        return connection(null, false, "Readwise token was removed from this device.", "not_connected");
    }

    static JSObject saveImportedToken(Context context, String token) throws Exception {
        String normalizedToken = trimToNull(token);
        if (normalizedToken == null) {
            return connection(Instant.now().toString(), false, "Readwise credential package was empty.", "invalid_token");
        }
        saveToken(context, normalizedToken);
        return connection(Instant.now().toString(), true, "Readwise credentials are ready on this device.", "connected");
    }

    private static JSObject validateToken(String token) {
        try {
            HttpURLConnection connection = (HttpURLConnection) new URL(AUTH_URL).openConnection();
            connection.setRequestMethod("GET");
            connection.setRequestProperty("Authorization", "Token " + token);
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(15000);
            int status = connection.getResponseCode();
            connection.disconnect();
            if (status == 204) {
                return connection(Instant.now().toString(), true, "Connected to Readwise.", "connected");
            }
            if (status == 401 || status == 403) {
                return connection(Instant.now().toString(), false, "Readwise rejected this token. Reconnect with a current token.", "invalid_token");
            }
            if (status == 429) {
                return connection(Instant.now().toString(), false, "Readwise is rate limiting requests. Try again later.", "rate_limited");
            }
            return connection(Instant.now().toString(), false, "Readwise auth check failed with HTTP " + status + ".", "network_error");
        } catch (IOException exception) {
            return connection(Instant.now().toString(), false, "Could not reach Readwise. Check the connection and try again.", "network_error");
        }
    }

    private static void saveToken(Context context, String token) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, loadOrCreateSecretKey());
        byte[] iv = cipher.getIV();
        if (iv == null || iv.length == 0) {
            throw new IllegalStateException("Android Keystore did not provide an encryption IV.");
        }
        byte[] encrypted = cipher.doFinal(token.getBytes(StandardCharsets.UTF_8));
        boolean saved = prefs(context).edit()
            .putString(TOKEN_KEY, Base64.encodeToString(encrypted, Base64.NO_WRAP))
            .putString(TOKEN_IV_KEY, Base64.encodeToString(iv, Base64.NO_WRAP))
            .commit();
        if (!saved) {
            throw new IllegalStateException("Failed to persist Readwise token.");
        }
    }

    private static String readToken(Context context) throws Exception {
        String encryptedToken = trimToNull(prefs(context).getString(TOKEN_KEY, null));
        String iv = trimToNull(prefs(context).getString(TOKEN_IV_KEY, null));
        if (encryptedToken == null || iv == null) {
            return null;
        }
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, loadOrCreateSecretKey(), new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
        return trimToNull(new String(cipher.doFinal(Base64.decode(encryptedToken, Base64.NO_WRAP)), StandardCharsets.UTF_8));
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

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private static JSObject connection(String checkedAt, boolean connected, String message, String status) {
        JSObject result = new JSObject();
        result.put("checked_at", checkedAt);
        result.put("connected", connected);
        result.put("message", message);
        result.put("status", status);
        return result;
    }

    private static String trimToNull(String value) {
        return value == null || value.trim().isEmpty() ? null : value.trim();
    }
}
