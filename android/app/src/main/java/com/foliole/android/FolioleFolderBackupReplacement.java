package com.foliole.android;

import android.net.Uri;

/** A confirmed SAF replacement writes an independent snapshot before moving any existing document. */
final class FolioleFolderBackupReplacement {
    private static final String[] SIDECARS = { "-journal", "-wal", "-shm" };
    private final FolioleFolderBackupDocuments documents;
    private final String target, stage, previous;

    FolioleFolderBackupReplacement(FolioleFolderBackupDocuments documents, String target, String profileId) {
        this.documents = documents;
        this.target = target;
        stage = target + ".partial-" + profileId + ".sqlite";
        previous = target + ".previous-" + profileId + ".sqlite";
    }

    void requireEmptySlots() throws Exception {
        requireEmpty(stage);
        requireEmpty(previous);
    }

    void begin() throws Exception {
        documents.create(stage);
        documents.useSnapshotName(stage);
    }

    @FunctionalInterface
    interface Commit { void record() throws Exception; }

    void publish(Uri original, Commit commit) throws Exception {
        Uri staged = documents.find(stage);
        if (staged == null || documents.isEmpty(staged)) {
            throw new IllegalStateException("The replacement backup did not finish.");
        }
        for (String suffix : SIDECARS) if (documents.find(stage + suffix) != null) {
            throw new IllegalStateException("The replacement backup journal did not close.");
        }
        if (!original.equals(documents.find(target))) {
            throw new IllegalStateException("Backup destination changed during replacement.");
        }
        // A provider may lack rename support. In that case the previous file is never deleted.
        documents.rename(original, target, previous);
        for (String suffix : SIDECARS) moveIfPresent(target + suffix, previous + suffix);
        documents.rename(staged, stage, target);
        commit.record();
    }

    /**
     * Rejoins the old database and its sidecars after a failed publication. If both databases are
     * present, leave the old copy in place until the caller verifies the new target's fingerprint.
     */
    boolean recover() throws Exception {
        Uri retained = documents.find(previous);
        Uri current = documents.find(target);
        if (retained != null && current != null) {
            if (documents.find(stage) != null) {
                throw new IllegalStateException("The backup folder changed during replacement. Previous backup: " + previous);
            }
            return true;
        }
        if (retained == null && current == null) {
            throw new IllegalStateException("The previous backup cannot be located. The staged database is retained: " + stage);
        }
        if (retained != null) {
            for (String suffix : SIDECARS) moveIfPresent(previous + suffix, target + suffix);
            documents.rename(retained, previous, target);
        }
        discard(stage);
        return false;
    }

    void discardPrevious() throws Exception { discard(previous); }

    String recoveryName() { return previous; }

    private void requireEmpty(String name) throws Exception {
        if (documents.find(name) != null) throw new IllegalStateException("Backup replacement file already exists: " + name);
        for (String suffix : SIDECARS) if (documents.find(name + suffix) != null) {
            throw new IllegalStateException("Backup replacement file already exists: " + name + suffix);
        }
    }

    private void moveIfPresent(String from, String to) throws Exception {
        Uri document = documents.find(from);
        if (document != null) documents.rename(document, from, to);
    }

    private void discard(String name) throws Exception {
        for (String suffix : SIDECARS) documents.delete(name + suffix);
        documents.delete(name);
    }
}
