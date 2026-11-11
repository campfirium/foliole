package com.foliole.android;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.security.KeyFactory;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.X509EncodedKeySpec;

final class FolioleWebDavDeviceIdentity {
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final int BASE64 = Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING;
    private final KeyStore.PrivateKeyEntry entry;

    private FolioleWebDavDeviceIdentity(KeyStore.PrivateKeyEntry entry) {
        this.entry = entry;
    }

    static synchronized FolioleWebDavDeviceIdentity loadOrCreate(Context context) throws Exception {
        String alias = context.getPackageName() + ".webdav-device-identity.v1";
        KeyStore store = KeyStore.getInstance(KEYSTORE);
        store.load(null);
        if (!store.containsAlias(alias)) {
            var generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, KEYSTORE);
            generator.initialize(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
                .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
                .setDigests(KeyProperties.DIGEST_SHA256)
                .build());
            generator.generateKeyPair();
        }
        var entry = store.getEntry(alias, null);
        if (!(entry instanceof KeyStore.PrivateKeyEntry)) {
            throw new IllegalStateException("webdav_relay_secure_storage_unavailable");
        }
        return new FolioleWebDavDeviceIdentity((KeyStore.PrivateKeyEntry) entry);
    }

    static boolean verifies(String key, byte[] transcript, String encodedSignature) throws Exception {
        var publicKey = KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(Base64.decode(key, BASE64)));
        Signature verifier = Signature.getInstance("SHA256withECDSA");
        verifier.initVerify(publicKey);
        verifier.update(transcript);
        return verifier.verify(Base64.decode(encodedSignature, BASE64));
    }

    String publicKey() {
        return Base64.encodeToString(entry.getCertificate().getPublicKey().getEncoded(), BASE64);
    }

    String sign(byte[] transcript) throws Exception {
        Signature signature = Signature.getInstance("SHA256withECDSA");
        PrivateKey key = entry.getPrivateKey();
        signature.initSign(key);
        signature.update(transcript);
        return Base64.encodeToString(signature.sign(), BASE64);
    }
}
