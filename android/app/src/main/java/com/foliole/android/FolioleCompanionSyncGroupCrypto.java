package com.foliole.android;

import android.util.Base64;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

final class FolioleCompanionSyncGroupCrypto {
    private static final String VERSION = "foliole-workgroup-aead-v1";
    private static final long MAX_CLOCK_DRIFT_MS = 60_000;

    private FolioleCompanionSyncGroupCrypto() {}

    static String groupTag(String groupKey) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(decode(groupKey));
        StringBuilder value = new StringBuilder();
        for (int index = 0; index < 16; index++) value.append(String.format("%02x", digest[index]));
        return value.toString();
    }

    static JSONObject encrypt(
        String groupKey, String groupTag, String method, String path, String direction,
        String contentType, byte[] plaintext
    ) throws Exception {
        byte[] nonce = new byte[12];
        new java.security.SecureRandom().nextBytes(nonce);
        return encryptAt(groupKey, groupTag, method, path, direction, contentType, plaintext,
            System.currentTimeMillis(), nonce);
    }

    static JSONObject encryptAt(
        String groupKey, String groupTag, String method, String path, String direction,
        String contentType, byte[] plaintext, long timestamp, byte[] nonce
    ) throws Exception {
        if (nonce.length != 12) throw new SecurityException("workgroup_aead_nonce_invalid");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key(groupKey, groupTag, direction), new GCMParameterSpec(128, nonce));
        cipher.updateAAD(aad(groupTag, method, path, direction, contentType, timestamp));
        return new JSONObject().put("version", VERSION).put("timestamp_ms", timestamp)
            .put("nonce", encode(nonce)).put("content_type", contentType)
            .put("ciphertext", encode(cipher.doFinal(plaintext)));
    }

    static byte[] decrypt(
        String groupKey, String groupTag, String method, String path, String direction,
        String contentType, JSONObject envelope
    ) throws Exception {
        if (!VERSION.equals(envelope.optString("version")) ||
            !contentType.equals(envelope.optString("content_type"))) {
            throw new SecurityException("workgroup_aead_envelope_invalid");
        }
        long timestamp = envelope.getLong("timestamp_ms");
        if (Math.abs(System.currentTimeMillis() - timestamp) > MAX_CLOCK_DRIFT_MS) {
            throw new SecurityException("workgroup_aead_expired");
        }
        try {
            byte[] nonce = decode(envelope.getString("nonce"));
            if (nonce.length != 12) throw new SecurityException("workgroup_aead_nonce_invalid");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(groupKey, groupTag, direction),
                new GCMParameterSpec(128, nonce));
            cipher.updateAAD(aad(groupTag, method, path, direction, contentType, timestamp));
            return cipher.doFinal(decode(envelope.getString("ciphertext")));
        } catch (SecurityException error) {
            throw error;
        } catch (Exception error) {
            throw new SecurityException("workgroup_aead_authentication_failed", error);
        }
    }

    private static SecretKeySpec key(String groupKey, String groupTag, String direction) throws Exception {
        byte[] info = ("Foliole Workgroup AEAD v1\n" + direction).getBytes(StandardCharsets.UTF_8);
        return new SecretKeySpec(hkdf(decode(groupKey), groupTag.getBytes(StandardCharsets.UTF_8), info, 32), "AES");
    }

    private static byte[] aad(
        String groupTag, String method, String path, String direction, String contentType, long timestamp
    ) {
        return String.join("\n", VERSION, groupTag, method.toUpperCase(), path, direction,
            contentType, String.valueOf(timestamp)).getBytes(StandardCharsets.UTF_8);
    }

    private static byte[] hkdf(byte[] input, byte[] salt, byte[] info, int length) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(salt, "HmacSHA256"));
        byte[] key = mac.doFinal(input); byte[] result = new byte[length]; byte[] previous = new byte[0];
        for (int offset = 0, counter = 1; offset < length; counter++) {
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            mac.update(previous); mac.update(info); mac.update((byte) counter); previous = mac.doFinal();
            int count = Math.min(previous.length, length - offset);
            System.arraycopy(previous, 0, result, offset, count); offset += count;
        }
        return result;
    }

    private static byte[] decode(String value) {
        return Base64.decode(value, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
    }

    private static String encode(byte[] value) {
        return Base64.encodeToString(value, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
    }
}
