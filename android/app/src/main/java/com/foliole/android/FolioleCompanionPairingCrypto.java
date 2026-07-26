package com.foliole.android;

import java.nio.charset.StandardCharsets;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

final class FolioleCompanionPairingCrypto {
    private FolioleCompanionPairingCrypto() {}

    static byte[] deriveCredentialBagKey(String deviceSecret, String service, byte[] salt) throws Exception {
        byte[] pseudoRandomKey = hmacSha256(salt, deviceSecret.getBytes(StandardCharsets.UTF_8));
        return hmacSha256(pseudoRandomKey, ("Foliole credential bag v1/" + service + "\u0001").getBytes(StandardCharsets.UTF_8));
    }

    static String signCanonicalRequest(String secret, String canonical) throws Exception {
        return toHex(hmacSha256(secret.getBytes(StandardCharsets.UTF_8), canonical.getBytes(StandardCharsets.UTF_8)));
    }

    private static byte[] hmacSha256(byte[] key, byte[] value) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key, "HmacSHA256"));
        return mac.doFinal(value);
    }

    private static String toHex(byte[] bytes) {
        StringBuilder builder = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) {
            builder.append(String.format("%02x", value));
        }
        return builder.toString();
    }
}
