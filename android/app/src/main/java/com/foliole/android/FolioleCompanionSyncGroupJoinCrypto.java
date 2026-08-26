package com.foliole.android;

import android.util.Base64;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPublicKeySpec;

import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

final class FolioleCompanionSyncGroupJoinCrypto {
    private static final byte[] INFO = "Foliole companion pairing v1".getBytes(StandardCharsets.UTF_8);

    private FolioleCompanionSyncGroupJoinCrypto() {}

    static JSONObject encrypt(String publicKey, String secret) throws Exception {
        byte[] raw = decode(publicKey);
        if (raw.length != 65 || raw[0] != 4) throw new IllegalArgumentException("sync_group_join_public_key_invalid");
        KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec("secp256r1"));
        KeyPair server = generator.generateKeyPair();
        java.security.interfaces.ECPublicKey template = (java.security.interfaces.ECPublicKey) server.getPublic();
        ECPoint point = new ECPoint(new java.math.BigInteger(1, slice(raw, 1, 33)), new java.math.BigInteger(1, slice(raw, 33, 65)));
        java.security.PublicKey client = KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(point, template.getParams()));
        KeyAgreement agreement = KeyAgreement.getInstance("ECDH");
        agreement.init(server.getPrivate());
        agreement.doPhase(client, true);
        byte[] salt = random(32);
        byte[] iv = random(12);
        byte[] key = hkdf(agreement.generateSecret(), salt, INFO, 32);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, iv));
        return new JSONObject()
            .put("algorithm", "ECDH-P256-HKDF-SHA256-AES-GCM")
            .put("ciphertext", encode(cipher.doFinal(secret.getBytes(StandardCharsets.UTF_8))))
            .put("iv", encode(iv)).put("salt", encode(salt))
            .put("server_public_key", encodePublic((java.security.interfaces.ECPublicKey) server.getPublic()));
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

    private static String encodePublic(java.security.interfaces.ECPublicKey key) {
        byte[] x = fixed(key.getW().getAffineX());
        byte[] y = fixed(key.getW().getAffineY());
        byte[] raw = new byte[65]; raw[0] = 4;
        System.arraycopy(x, 0, raw, 1, 32); System.arraycopy(y, 0, raw, 33, 32);
        return encode(raw);
    }

    private static byte[] fixed(java.math.BigInteger value) {
        byte[] raw = value.toByteArray();
        byte[] result = new byte[32];
        System.arraycopy(raw, Math.max(0, raw.length - 32), result, Math.max(0, 32 - raw.length), Math.min(32, raw.length));
        return result;
    }

    private static byte[] random(int size) { byte[] value = new byte[size]; new java.security.SecureRandom().nextBytes(value); return value; }
    private static byte[] slice(byte[] value, int from, int to) { return java.util.Arrays.copyOfRange(value, from, to); }
    private static byte[] decode(String value) { return Base64.decode(value, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP); }
    private static String encode(byte[] value) { return Base64.encodeToString(value, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP); }
}
