package com.foliole.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPublicKeySpec;
import java.security.spec.PKCS8EncodedKeySpec;

import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.KeyGenerator;
import javax.crypto.Mac;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

final class FolioleCompanionSyncGroupLifecycleKeyStore {
    private static final byte[] INFO = "Foliole companion pairing v1".getBytes(StandardCharsets.UTF_8);
    private static final String KEY_ALIAS = "foliole_sync_group_join_intent_v1";
    private static final String PREFS = "foliole_sync_group_join_intents_v1";

    private FolioleCompanionSyncGroupLifecycleKeyStore() {}

    static String create(Context context, String requestId) throws Exception {
        String normalized = required(requestId);
        String existing = prefs(context).getString(normalized, null);
        if (existing != null) return new JSONObject(unprotect(existing)).getString("public_key");
        KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec("secp256r1"));
        KeyPair pair = generator.generateKeyPair();
        JSONObject record = new JSONObject()
            .put("private_key", encode(pair.getPrivate().getEncoded()))
            .put("public_key", encodePublic((java.security.interfaces.ECPublicKey) pair.getPublic()));
        if (!prefs(context).edit().putString(normalized, protect(record.toString())).commit()) {
            throw new IllegalStateException("join_intent_key_write_failed");
        }
        return record.getString("public_key");
    }

    static String decrypt(Context context, String requestId, JSONObject payload) throws Exception {
        String stored = prefs(context).getString(required(requestId), null);
        if (stored == null) throw new SecurityException("join_intent_key_not_found");
        JSONObject record = new JSONObject(unprotect(stored));
        java.security.PrivateKey privateKey = KeyFactory.getInstance("EC").generatePrivate(
            new PKCS8EncodedKeySpec(decode(record.getString("private_key"))));
        java.security.PublicKey serverPublicKey = decodePublic(payload.getString("server_public_key"));
        KeyAgreement agreement = KeyAgreement.getInstance("ECDH");
        agreement.init(privateKey); agreement.doPhase(serverPublicKey, true);
        byte[] key = hkdf(agreement.generateSecret(), decode(payload.getString("salt")), INFO, 32);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"),
            new GCMParameterSpec(128, decode(payload.getString("iv"))));
        return new String(cipher.doFinal(decode(payload.getString("ciphertext"))), StandardCharsets.UTF_8);
    }

    static boolean remove(Context context, String requestId) {
        String normalized = required(requestId);
        boolean present = prefs(context).contains(normalized);
        if (!prefs(context).edit().remove(normalized).commit()) {
            throw new IllegalStateException("join_intent_key_remove_failed");
        }
        return present;
    }

    private static java.security.PublicKey decodePublic(String value) throws Exception {
        byte[] raw = decode(value);
        if (raw.length != 65 || raw[0] != 4) throw new SecurityException("route_grant_public_key_invalid");
        KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec("secp256r1"));
        java.security.interfaces.ECPublicKey template =
            (java.security.interfaces.ECPublicKey) generator.generateKeyPair().getPublic();
        ECPoint point = new ECPoint(new java.math.BigInteger(1, slice(raw, 1, 33)),
            new java.math.BigInteger(1, slice(raw, 33, 65)));
        return KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(point, template.getParams()));
    }

    private static byte[] hkdf(byte[] ikm, byte[] salt, byte[] info, int length) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(salt, "HmacSHA256"));
        byte[] prk = mac.doFinal(ikm);
        byte[] result = new byte[length];
        byte[] previous = new byte[0];
        int offset = 0;
        for (byte counter = 1; offset < length; counter++) {
            mac.init(new SecretKeySpec(prk, "HmacSHA256"));
            mac.update(previous); mac.update(info); mac.update(counter);
            previous = mac.doFinal();
            int count = Math.min(previous.length, length - offset);
            System.arraycopy(previous, 0, result, offset, count); offset += count;
        }
        return result;
    }

    private static String protect(String value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] ciphertext = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        byte[] payload = new byte[cipher.getIV().length + ciphertext.length];
        System.arraycopy(cipher.getIV(), 0, payload, 0, cipher.getIV().length);
        System.arraycopy(ciphertext, 0, payload, cipher.getIV().length, ciphertext.length);
        return encode(payload);
    }

    private static String unprotect(String value) throws Exception {
        byte[] payload = decode(value);
        if (payload.length <= 12) throw new SecurityException("join_intent_key_invalid");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, slice(payload, 0, 12)));
        return new String(cipher.doFinal(slice(payload, 12, payload.length)), StandardCharsets.UTF_8);
    }

    private static SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias(KEY_ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance("AES", "AndroidKeyStore");
            generator.init(new android.security.keystore.KeyGenParameterSpec.Builder(KEY_ALIAS,
                android.security.keystore.KeyProperties.PURPOSE_ENCRYPT |
                    android.security.keystore.KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(KEY_ALIAS, null);
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static String encodePublic(java.security.interfaces.ECPublicKey key) {
        byte[] raw = new byte[65]; raw[0] = 4;
        System.arraycopy(fixed(key.getW().getAffineX()), 0, raw, 1, 32);
        System.arraycopy(fixed(key.getW().getAffineY()), 0, raw, 33, 32);
        return encode(raw);
    }

    private static byte[] fixed(java.math.BigInteger value) {
        byte[] raw = value.toByteArray(); byte[] result = new byte[32];
        System.arraycopy(raw, Math.max(0, raw.length - 32), result,
            Math.max(0, 32 - raw.length), Math.min(32, raw.length));
        return result;
    }

    private static byte[] slice(byte[] value, int from, int to) {
        return java.util.Arrays.copyOfRange(value, from, to);
    }

    private static byte[] decode(String value) {
        return Base64.decode(value, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
    }

    private static String encode(byte[] value) {
        return Base64.encodeToString(value, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
    }

    private static String required(String value) {
        if (value == null || value.trim().isEmpty()) throw new IllegalArgumentException("request_id is required");
        return value.trim();
    }
}
