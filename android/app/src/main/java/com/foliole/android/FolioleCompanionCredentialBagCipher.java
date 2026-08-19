package com.foliole.android;

import android.util.Base64;

import java.nio.charset.StandardCharsets;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

final class FolioleCompanionCredentialBagCipher {
    private FolioleCompanionCredentialBagCipher() {}

    static String decrypt(String secret, String service, String salt,
                          String iv, String ciphertext) throws Exception {
        byte[] key = FolioleCompanionPairingCrypto.deriveCredentialBagKey(
            secret, service, decode(salt));
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"),
            new GCMParameterSpec(128, decode(iv)));
        return new String(cipher.doFinal(decode(ciphertext)), StandardCharsets.UTF_8);
    }

    private static byte[] decode(String value) {
        return Base64.decode(value, Base64.URL_SAFE | Base64.NO_WRAP);
    }
}
