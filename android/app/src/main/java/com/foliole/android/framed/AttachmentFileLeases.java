package com.foliole.android.framed;

import java.io.File;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;

/** Process-local exclusion complements the library's cross-process receiver lock. */
public final class AttachmentFileLeases {
    private static final Set<String> ACTIVE = new HashSet<>();
    private AttachmentFileLeases() {}

    public static AutoCloseable acquire(File root, String key) throws Exception {
        if (key == null || !key.matches("[a-f0-9]{64}(\\.(png|jpg|gif|webp|pdf|epub|pdftext))?")) {
            throw new IllegalArgumentException("attachment_key_invalid");
        }
        String identity = root.getCanonicalPath() + "/" + key.substring(0, 64);
        synchronized (ACTIVE) {
            if (!ACTIVE.add(identity)) throw new IllegalStateException("attachment_file_busy");
        }
        var closed = new AtomicBoolean();
        return () -> {
            if (closed.compareAndSet(false, true)) synchronized (ACTIVE) { ACTIVE.remove(identity); }
        };
    }
}
