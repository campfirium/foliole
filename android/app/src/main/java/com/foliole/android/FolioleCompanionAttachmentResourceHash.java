package com.foliole.android;

import android.content.Context;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.security.MessageDigest;

final class FolioleCompanionAttachmentResourceHash {
    private static final int BUFFER_BYTES = 256 * 1024;

    private FolioleCompanionAttachmentResourceHash() {}

    static String digestHex(Context context, File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance(FolioleCompanionResourceReadQueryRules.contentBlobCasString(
            context,
            "hashAlgorithm"
        ));
        byte[] buffer = new byte[BUFFER_BYTES];
        try (BufferedInputStream input = new BufferedInputStream(new FileInputStream(file), BUFFER_BYTES)) {
            int read;
            while ((read = input.read(buffer)) >= 0) {
                digest.update(buffer, 0, read);
            }
        }
        return toHex(digest.digest());
    }

    private static String toHex(byte[] bytes) {
        StringBuilder builder = new StringBuilder(bytes.length * 2);
        for (byte item : bytes) builder.append(String.format("%02x", item));
        return builder.toString();
    }
}
