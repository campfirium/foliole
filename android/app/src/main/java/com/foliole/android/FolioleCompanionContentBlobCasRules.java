package com.foliole.android;

import android.content.Context;

import java.security.MessageDigest;

final class FolioleCompanionContentBlobCasRules {
    private FolioleCompanionContentBlobCasRules() {}

    static String requireHash(Context context, String value, String field) throws Exception {
        String hash = requireText(value, field);
        if (booleanRule(context, "normalizeHashToLowercase")) {
            hash = hash.toLowerCase();
        }
        if (!hash.matches(stringRule(context, "hashPattern"))) {
            throw new IllegalArgumentException(field + " is invalid.");
        }
        return hash;
    }

    static String digestHex(Context context, byte[] bytes) throws Exception {
        MessageDigest digest = MessageDigest.getInstance(stringRule(context, "hashAlgorithm"));
        return hex(digest.digest(bytes));
    }

    static void requireSupportedCompression(Context context, String compression) throws Exception {
        if (!stringRule(context, "supportedCompression").equals(compression)) {
            throw new IllegalStateException("Unsupported content blob compression.");
        }
    }

    static boolean manifestMatches(
        Context context,
        long byteLength,
        String hash,
        long originalSizeBytes,
        long storedSizeBytes,
        String originalSha256,
        String storedSha256
    ) throws Exception {
        return (!manifestRule(context, "byteLengthEqualsOriginalSize") || originalSizeBytes == byteLength) &&
            (!manifestRule(context, "byteLengthEqualsStoredSize") || storedSizeBytes == byteLength) &&
            (!manifestRule(context, "hashEqualsOriginalSha256") || hash.equals(originalSha256)) &&
            (!manifestRule(context, "hashEqualsStoredSha256") || hash.equals(storedSha256));
    }

    private static boolean manifestRule(Context context, String key) throws Exception {
        return FolioleCompanionResourceReadQueryRules.contentBlobCasBoolean(context, "manifestRules", key);
    }

    private static boolean booleanRule(Context context, String key) throws Exception {
        return FolioleCompanionResourceReadQueryRules.contentBlobCasBoolean(context, key);
    }

    private static String stringRule(Context context, String key) throws Exception {
        return FolioleCompanionResourceReadQueryRules.contentBlobCasString(context, key);
    }

    private static String requireText(String value, String field) {
        if (value == null || value.trim().isEmpty()) {
            throw new IllegalArgumentException(field + " is required.");
        }
        return value.trim();
    }

    private static String hex(byte[] bytes) {
        StringBuilder builder = new StringBuilder();
        for (byte value : bytes) {
            builder.append(String.format("%02x", value));
        }
        return builder.toString();
    }
}
