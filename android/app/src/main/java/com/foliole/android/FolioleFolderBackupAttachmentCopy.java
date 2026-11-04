package com.foliole.android;

import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.util.function.BooleanSupplier;

/** Streaming, verified publication of one immutable attachment; never overwrites a final file. */
final class FolioleFolderBackupAttachmentCopy {
    interface Target {
        InputStream existing() throws Exception;
        OutputStream temporary() throws Exception;
        void sync() throws Exception;
        InputStream readTemporary() throws Exception;
        void publish() throws Exception;
        void discard() throws Exception;
    }
    interface DeletionTarget {
        InputStream existing() throws Exception;
        void remove() throws Exception;
    }
    static void delete(String expectedHash, DeletionTarget target, BooleanSupplier cancelled) throws Exception {
        check(cancelled);
        try (InputStream existing = target.existing()) {
            if (existing == null) return;
            if (!expectedHash.equals(hash(existing, null, cancelled))) {
                throw new IllegalStateException("Backup attachment has changed outside Foliole.");
            }
        }
        check(cancelled);
        target.remove();
    }
    static boolean copy(String expectedHash, InputStream source, Target target, BooleanSupplier cancelled) throws Exception {
        check(cancelled);
        try (InputStream existing = target.existing()) {
            if (existing != null) {
                if (!expectedHash.equals(hash(existing, null, cancelled))) throw new IllegalStateException("Backup attachment has changed outside Foliole.");
                return false;
            }
        }
        boolean created = false;
        try {
            OutputStream stream = target.temporary();
            created = true;
            try (OutputStream output = stream) {
                if (!expectedHash.equals(hash(source, output, cancelled))) throw new IllegalStateException("Source attachment changed or is damaged.");
                target.sync();
            }
            try (InputStream copied = target.readTemporary()) {
                if (!expectedHash.equals(hash(copied, null, cancelled))) throw new IllegalStateException("Cannot verify the copied attachment.");
            }
            check(cancelled);
            target.publish();
            created = false;
            return true;
        } catch (Exception error) {
            if (created) try { target.discard(); } catch (Exception cleanup) { error.addSuppressed(cleanup); }
            throw error;
        }
    }
    private static String hash(InputStream input, OutputStream output, BooleanSupplier cancelled) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[64 * 1024];
        int count;
        while ((count = input.read(buffer)) != -1) {
            check(cancelled);
            digest.update(buffer, 0, count);
            if (output != null) output.write(buffer, 0, count);
        }
        check(cancelled);
        StringBuilder hex = new StringBuilder();
        for (byte value : digest.digest()) hex.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
        return hex.toString();
    }
    private static void check(BooleanSupplier cancelled) throws InterruptedException {
        if (cancelled.getAsBoolean()) throw new InterruptedException("Backup cancelled.");
    }
}
