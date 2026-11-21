package com.foliole.android;

import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.BooleanSupplier;

/** Streaming, verified publication of immutable attachments into one backup folder; never overwrites a final file. */
final class FolioleFolderBackupAttachmentCopy {
    /** The backup folder's documents; every call may be a provider round trip, so the folder is listed once. */
    interface Documents {
        /** Every child as {displayName, documentId}. */
        List<String[]> children() throws Exception;
        String create(String displayName) throws Exception;
        /** Opens the document for truncating write, runs the writer, then syncs before closing. */
        void write(String documentId, StreamWriter writer) throws Exception;
        InputStream read(String documentId) throws Exception;
        /** Returns the document id after renaming; a provider may keep a clashing name by choosing another. */
        String rename(String documentId, String displayName) throws Exception;
        String displayName(String documentId) throws Exception;
        void delete(String documentId) throws Exception;
    }
    interface StreamWriter { void write(OutputStream output) throws Exception; }

    /**
     * One listing per native call. Names are content hashes, so a file another writer adds under the
     * same name later either holds the same bytes or is rejected by the hash check of the next round.
     */
    static final class Folder {
        private final Documents documents;
        private final String profileId;
        private final Map<String, String> ids = new HashMap<>();
        private final Set<String> duplicates = new HashSet<>();

        Folder(Documents documents, String profileId) throws Exception {
            this.documents = documents;
            this.profileId = profileId;
            for (String[] child : documents.children()) if (ids.put(child[0], child[1]) != null) duplicates.add(child[0]);
        }

        private String lookup(String name) {
            if (duplicates.contains(name)) throw new IllegalStateException("Duplicate attachment filenames in backup folder.");
            return ids.get(name);
        }

        boolean copy(String key, InputStream source, BooleanSupplier cancelled) throws Exception {
            String expectedHash = key.substring(0, 64);
            check(cancelled);
            String existing = lookup(key);
            if (existing != null) {
                try (InputStream input = documents.read(existing)) {
                    if (!expectedHash.equals(hash(input, null, cancelled))) throw new IllegalStateException("Backup attachment has changed outside Foliole.");
                }
                return false;
            }
            String partialName = ".foliole-" + profileId + "-" + key + ".partial";
            String stale = lookup(partialName);
            if (stale != null) { documents.delete(stale); ids.remove(partialName); }
            String partial = documents.create(partialName);
            try {
                String[] written = new String[1];
                documents.write(partial, output -> written[0] = hash(source, output, cancelled));
                // The bytes were hashed as written and synced; reading them back would only re-read the provider cache.
                // Restore verifies each file against the hash in its name.
                if (!expectedHash.equals(written[0])) throw new IllegalStateException("Source attachment changed or is damaged.");
                check(cancelled);
                String published = documents.rename(partial, key);
                partial = null;
                if (!key.equals(documents.displayName(published))) {
                    // Another file took the name meanwhile and the provider renamed ours instead of replacing it.
                    documents.delete(published);
                    throw new IllegalStateException("Backup attachment appeared during copying.");
                }
                ids.put(key, published);
                return true;
            } catch (Exception error) {
                if (partial != null) try { documents.delete(partial); } catch (Exception cleanup) { error.addSuppressed(cleanup); }
                throw error;
            }
        }

        void delete(String key, BooleanSupplier cancelled) throws Exception {
            check(cancelled);
            String document = lookup(key);
            if (document == null) return;
            try (InputStream existing = documents.read(document)) {
                if (!key.substring(0, 64).equals(hash(existing, null, cancelled))) {
                    throw new IllegalStateException("Backup attachment has changed outside Foliole.");
                }
            }
            check(cancelled);
            documents.delete(document);
            ids.remove(key);
        }
    }

    private static String hash(InputStream input, OutputStream output, BooleanSupplier cancelled) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[256 * 1024];
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
