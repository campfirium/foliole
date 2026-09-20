package com.foliole.android;

import java.util.HashMap;
import java.util.Map;

final class FolioleCompanionCanonicalAttachmentKey {
    private static final Map<String, String> EXTENSIONS = new HashMap<>();
    static {
        EXTENSIONS.put("application/pdf", ".pdf");
        EXTENSIONS.put("application/epub+zip", ".epub");
        EXTENSIONS.put("image/gif", ".gif");
        EXTENSIONS.put("image/jpeg", ".jpg");
        EXTENSIONS.put("image/png", ".png");
        EXTENSIONS.put("image/webp", ".webp");
    }

    private FolioleCompanionCanonicalAttachmentKey() {}

    static String storageKey(String contentHash, String mimeType) {
        String extension = EXTENSIONS.get(mimeType == null ? null : mimeType.trim().toLowerCase());
        return extension != null && contentHash != null && contentHash.matches("[a-f0-9]{64}")
            ? contentHash + extension : null;
    }

    static boolean valid(String key) {
        return key != null && key.length() > 64 && key.substring(0, 64).matches("[a-f0-9]{64}")
            && EXTENSIONS.containsValue(key.substring(64));
    }

    static boolean matches(String contentHash, String mimeType, String storageKey) {
        return storageKey != null && storageKey.equals(storageKey(contentHash, mimeType));
    }
}
