package com.foliole.android;

import android.util.Base64;
import android.util.Base64InputStream;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;

import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;

final class FolioleCompanionWorkgroupFileDecrypt {
    private static final int BUFFER_BYTES = 64 * 1024;
    private static final int TAG_BYTES = 16;
    private static final int BASE64_FLAGS = Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING;

    private FolioleCompanionWorkgroupFileDecrypt() {}

    static void decrypt(
        File encoded, File decoded, File plaintext, String groupKey, String method, String path,
        String contentType, FolioleCompanionWorkgroupEnvelopeStream.Header header
    ) throws Exception {
        if (!"foliole-workgroup-aead-v1".equals(header.version) ||
            !contentType.equals(header.contentType)) {
            throw new SecurityException("workgroup_aead_envelope_invalid");
        }
        if (Math.abs(System.currentTimeMillis() - header.timestamp) > 60_000) {
            throw new SecurityException("workgroup_aead_expired");
        }
        try {
            decode(encoded, decoded);
            decryptAuthenticated(decoded, plaintext, groupKey, method, path, contentType, header);
        } catch (SecurityException error) {
            throw error;
        } catch (Exception error) {
            throw new SecurityException("workgroup_aead_authentication_failed", error);
        }
    }

    private static void decode(File encoded, File decoded) throws Exception {
        try (InputStream input = new Base64InputStream(new FileInputStream(encoded), BASE64_FLAGS);
             OutputStream output = new FileOutputStream(decoded)) {
            byte[] buffer = new byte[BUFFER_BYTES];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
        }
    }

    private static void decryptAuthenticated(
        File encoded, File plaintext, String groupKey, String method, String path,
        String contentType, FolioleCompanionWorkgroupEnvelopeStream.Header header
    ) throws Exception {
        long cipherLength = encoded.length() - TAG_BYTES;
        if (cipherLength < 0) throw new SecurityException("workgroup_aead_authentication_failed");
        byte[] nonce = Base64.decode(header.nonce, BASE64_FLAGS);
        if (nonce.length != 12) throw new SecurityException("workgroup_aead_nonce_invalid");
        String groupTag = FolioleCompanionSyncGroupCrypto.groupTag(groupKey);
        SecretKeySpec key = FolioleCompanionSyncGroupCrypto.key(groupKey, groupTag, "response");
        byte[] aad = FolioleCompanionSyncGroupCrypto.aad(
            groupTag, method, path, "response", contentType, header.timestamp);
        Cipher block = Cipher.getInstance("AES/ECB/NoPadding");
        block.init(Cipher.ENCRYPT_MODE, key);
        byte[] hashSubkey = block.doFinal(new byte[16]);
        byte[] counter = new byte[16];
        System.arraycopy(nonce, 0, counter, 0, nonce.length);
        counter[15] = 1;
        byte[] tagMask = block.doFinal(counter);
        counter[15] = 2;
        FolioleCompanionWorkgroupGHash hash = new FolioleCompanionWorkgroupGHash(hashSubkey, aad);
        Cipher ctr = Cipher.getInstance("AES/CTR/NoPadding");
        ctr.init(Cipher.DECRYPT_MODE, key, new javax.crypto.spec.IvParameterSpec(counter));

        try (InputStream input = new FileInputStream(encoded);
             OutputStream output = new FileOutputStream(plaintext)) {
            byte[] buffer = new byte[BUFFER_BYTES];
            long remaining = cipherLength;
            while (remaining > 0) {
                int count = input.read(buffer, 0, (int) Math.min(buffer.length, remaining));
                if (count < 0) throw new SecurityException("workgroup_aead_authentication_failed");
                byte[] plain = ctr.update(buffer, 0, count);
                if (plain == null || plain.length != count) {
                    throw new SecurityException("workgroup_aead_authentication_failed");
                }
                hash.updateCiphertext(buffer, count);
                output.write(plain);
                remaining -= count;
            }
            byte[] tag = new byte[TAG_BYTES];
            int read = 0;
            while (read < TAG_BYTES) {
                int count = input.read(tag, read, TAG_BYTES - read);
                if (count < 0) throw new SecurityException("workgroup_aead_authentication_failed");
                read += count;
            }
            byte[] calculatedTag = hash.finish();
            for (int index = 0; index < TAG_BYTES; index++) calculatedTag[index] ^= tagMask[index];
            if (input.read() != -1 || !MessageDigest.isEqual(calculatedTag, tag) ||
                ctr.doFinal().length != 0) {
                throw new SecurityException("workgroup_aead_authentication_failed");
            }
        }
    }

}
