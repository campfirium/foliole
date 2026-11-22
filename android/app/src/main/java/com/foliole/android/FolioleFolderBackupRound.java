package com.foliole.android;

/**
 * The folder backup round state machine, free of Android and Capacitor types so a plain JVM can test it.
 * A round is open from {@link #begin} until {@link #finished}, {@link #cancel}, {@link #fail} or a reclaim ends it,
 * and every end leaves the phase saved, pending or failed. Callers synchronize on the owning plugin.
 */
final class FolioleFolderBackupRound {
    static final String INTERRUPTED = "Backup interrupted. Use Back up now to retry.";
    static final String RELOADED = "Backup interrupted because the app reloaded. Use Back up now to retry.";

    interface Status { void save(String phase, String error); }

    private final Status status;
    private String phase, error, epoch, request, reclaimed;
    private boolean running;

    FolioleFolderBackupRound(String phase, String error, Status status) {
        this.phase = phase; this.error = error; this.status = status;
    }

    String phase() { return phase; }
    String error() { return error; }
    String epoch() { return epoch; }
    String request() { return request; }
    /** The native database operation of the open round is still running. */
    boolean running() { return running; }
    boolean isOpen() { return request != null || running; }
    boolean owns(String requestId) { return requestId != null && requestId.equals(request); }

    /**
     * Registers a database owner. {@code reclaim} comes from the first owner of a newly loaded page: anything still
     * registered belongs to a page that is gone, so its round ends as interrupted instead of blocking this page.
     * Returns false while that page's database operation is still running; open again once it ended.
     */
    boolean open(String nextEpoch, boolean reclaim) {
        if (nextEpoch == null) throw new IllegalArgumentException("Invalid active database path.");
        boolean foreign = epoch == null || !epoch.equals(nextEpoch);
        if (epoch != null && foreign && !reclaim) throw new IllegalStateException("Previous database owner is still open.");
        if (reclaim && foreign) {
            epoch = null;
            if (running) { reclaimed = request; return false; }
            if (request != null) interrupt(RELOADED);
        }
        epoch = nextEpoch;
        return true;
    }

    /** Returns true when the given owner was registered and is now closed. */
    boolean close(String sourceEpoch) {
        if (epoch == null || !epoch.equals(sourceEpoch)) return false;
        epoch = null;
        return true;
    }

    void destroy() { epoch = null; }

    /** Rejects a second request without touching the round that is still open. */
    void begin(String sourceEpoch, String requestId) {
        if (isOpen()) throw new IllegalStateException("A database backup is already running.");
        if (epoch == null || !epoch.equals(sourceEpoch)) throw new IllegalStateException("Database owner is closed.");
        if (requestId == null) throw new IllegalArgumentException("Missing backup request.");
        request = requestId;
    }

    /** A folder choice for this request returned. Returns false when the request no longer owns the round. */
    boolean folderChosen(String requestId, boolean cancelled) {
        if (!owns(requestId) || running) return false;
        if (cancelled) request = null;
        return true;
    }

    void started(String sourceEpoch) {
        if (epoch == null || !epoch.equals(sourceEpoch)) throw new IllegalStateException("Database owner is closed.");
        running = true; phase = "working"; error = null;
        status.save(phase, null);
    }

    /** The database operation returned. Returns true when the round stays open for attachments. */
    boolean databaseEnded(String requestId, boolean committed, boolean cleanupPending) {
        running = false;
        if (requestId != null && requestId.equals(reclaimed)) { reclaimed = null; interrupt(RELOADED); return false; }
        phase = cleanupPending ? "pending" : "working";
        if (!committed) {
            // No attachment phase follows an uncommitted round, so it must not stay persisted as running.
            request = null; phase = "pending"; status.save(phase, null);
            return false;
        }
        return true;
    }

    void databaseFailed(String requestId, String message) {
        running = false;
        if (requestId != null && requestId.equals(reclaimed)) { reclaimed = null; interrupt(RELOADED); return; }
        fail(message);
    }

    /**
     * Releases the round for its caller. With a failure the round ends as failed with that error; without one a
     * running round becomes pending. A round whose native work is still busy is left to that work.
     * Returns true when the round was released.
     */
    boolean cancel(String requestId, String failure, boolean busy) {
        if (!owns(requestId) || running || busy) return false;
        request = null;
        if (failure != null && !failure.isEmpty()) { phase = "failed"; error = failure; status.save(phase, error); }
        else if ("working".equals(phase)) { phase = "pending"; status.save(phase, error); }
        return true;
    }

    void requireFinish(String requestId, boolean busy) {
        if (!owns(requestId) || running || busy) throw new IllegalStateException("Attachment backup is not ready to finish.");
    }

    /** {@code pending} is the number of unfinished attachments, or a negative value when unknown. */
    void finished(String failure, int pending) {
        error = failure;
        phase = failure != null && !failure.isEmpty() ? "failed" : pending == 0 ? "saved" : "pending";
        status.save(phase, error);
        request = null;
    }

    void fail(String message) {
        request = null; phase = "failed"; error = message;
        status.save(phase, error);
    }

    void clear() {
        if (isOpen()) throw new IllegalStateException("A backup is still running.");
        phase = "idle"; error = null;
    }

    private void interrupt(String message) {
        request = null; phase = "pending"; error = message;
        status.save(phase, error);
    }
}
