package com.foliole.android;

import java.util.HashMap;
import java.util.Map;

final class FolioleCompanionCanonicalAttachmentKey {
    private static final Map<String, String> EXTENSIONS = new HashMap<>();
    static {
        EXTENSIONS.put("application/pdf", ".pdf");
        EXTENSIONS.put("image/gif", ".gif");
        EXTENSIONS.put("image/jpeg", ".jpg");
        EXTENSIONS.put("image/png", ".png");
        EXTENSIONS.put("image/webp", ".webp");
    }

    private FolioleCompanionCanonicalAttachmentKey() {}

    static boolean matches(String contentHash, String mimeType, String storageKey) {
        String extension = EXTENSIONS.get(mimeType == null ? null : mimeType.trim().toLowerCase());
        return extension != null && contentHash != null && contentHash.matches("[a-f0-9]{64}") &&
            storageKey != null && storageKey.equals(contentHash + extension);
    }
}
