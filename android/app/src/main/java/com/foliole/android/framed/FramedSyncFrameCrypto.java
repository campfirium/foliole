package com.foliole.android.framed;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

public final class FramedSyncFrameCrypto {
    private static final byte[] SESSION_INFO =
        "Foliole framed sync v22 session".getBytes(StandardCharsets.UTF_8);
    private static final byte[] TRANSFER_INFO =
        "Foliole framed sync v22 transfer".getBytes(StandardCharsets.UTF_8);

    private FramedSyncFrameCrypto() {}

    static byte[] encrypt(
        byte[] groupKey,
        FramedSyncPreamble preamble,
        byte[] headerBytes,
        byte[] plaintext,
        long sequence
    ) throws FramedSyncValidationException {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(frameKey(groupKey, preamble), "AES"),
                new GCMParameterSpec(128, nonce(preamble.noncePrefix(), sequence)));
            cipher.updateAAD(concat(preamble.encoded(), headerBytes));
            return cipher.doFinal(plaintext);
        } catch (FramedSyncValidationException error) {
            throw error;
        } catch (GeneralSecurityException error) {
            throw invalid("frame_encryption_failed");
        }
    }

    public static byte[] decrypt(
        byte[] groupKey,
        FramedSyncPreamble preamble,
        FramedSyncWireFrame frame,
        long expectedSequence
    ) throws FramedSyncValidationException {
        if (frame.header().sequence() != expectedSequence) {
            throw invalid("frame_sequence_not_contiguous");
        }
        if (preamble.compression() != 0) throw invalid("gzip_decoder_required");
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(frameKey(groupKey, preamble), "AES"),
                new GCMParameterSpec(128, nonce(preamble.noncePrefix(), frame.header().sequence())));
            cipher.updateAAD(concat(preamble.encoded(), frame.headerBytes()));
            byte[] plaintext = cipher.doFinal(frame.ciphertext());
            if (plaintext.length > payloadLimit(frame.header().frameType())) {
                throw invalid("frame_payload_limit_exceeded");
            }
            return plaintext;
        } catch (FramedSyncValidationException error) {
            throw error;
        } catch (GeneralSecurityException error) {
            throw invalid("frame_authentication_failed");
        }
    }

    static byte[] frameKey(byte[] groupKey, FramedSyncPreamble preamble)
        throws FramedSyncValidationException {
        if (groupKey == null || groupKey.length != 32) throw invalid("group_key_must_be_32_bytes");
        byte[] domain = preamble.contextKind() == 1 ? SESSION_INFO : TRANSFER_INFO;
        byte[] info = concat(domain, new byte[] { 0 }, preamble.contextId());
        try {
            Mac extract = Mac.getInstance("HmacSHA256");
            extract.init(new SecretKeySpec(preamble.identifier(), "HmacSHA256"));
            byte[] pseudoRandomKey = extract.doFinal(groupKey);
            Mac expand = Mac.getInstance("HmacSHA256");
            expand.init(new SecretKeySpec(pseudoRandomKey, "HmacSHA256"));
            return Arrays.copyOf(expand.doFinal(concat(info, new byte[] { 1 })), 32);
        } catch (GeneralSecurityException error) {
            throw invalid("frame_key_derivation_failed");
        }
    }

    private static int payloadLimit(int frameType) {
        if (frameType == FramedSyncFrameType.SESSION_CONTROL.wireValue()) {
            return FramedSyncContract.MAX_CONTROL_MESSAGE_BYTES;
        }
        if (frameType == FramedSyncFrameType.TRANSFER_HEADER.wireValue()) {
            return FramedSyncContract.MAX_MANIFEST_BYTES;
        }
        return FramedSyncContract.MAX_FRAME_MESSAGE_BYTES;
    }

    private static byte[] nonce(byte[] prefix, long sequence) {
        return ByteBuffer.allocate(12).order(ByteOrder.BIG_ENDIAN)
            .put(prefix).putLong(sequence).array();
    }

    private static byte[] concat(byte[]... values) {
        int length = 0;
        for (byte[] value : values) length += value.length;
        byte[] result = new byte[length];
        int offset = 0;
        for (byte[] value : values) {
            System.arraycopy(value, 0, result, offset, value.length);
            offset += value.length;
        }
        return result;
    }

    private static FramedSyncValidationException invalid(String code) {
        return new FramedSyncValidationException(code);
    }
}
