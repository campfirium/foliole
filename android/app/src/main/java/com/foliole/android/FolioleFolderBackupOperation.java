package com.foliole.android;

import android.content.Context;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.os.Process;
import android.system.Os;
import org.json.JSONObject;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

final class FolioleFolderBackupOperation extends FolioleFolderBackupDocuments {
    static { System.loadLibrary("sqlcipher"); }
    final String requestId, epoch, source;
    private final Context context;
    private final FolioleFolderBackupProfile store;
    private final String profileId;
    private final boolean replaceExisting;
    private long handle;
    private boolean cancelled, released;
    private volatile boolean stagingReplacement;
    private String preparedFingerprint;
    private Exception callbackError;
    private final List<Runnable> releaseCallbacks = new ArrayList<>();

    FolioleFolderBackupOperation(Context context, JSONObject profile, String requestId,
        String epoch, String source, FolioleFolderBackupProfile store, boolean replaceExisting) throws Exception {
        super(context, Uri.parse(profile.getString("tree")));
        this.context = context;
        this.profileId = profile.getString("id");
        this.replaceExisting = replaceExisting;
        this.requestId = requestId; this.epoch = epoch; this.source = source; this.store = store;
    }
    private native long createNative(String source, String expected, String pending);
    private native String[] runNative(long handle);
    private native void cancelNative(long handle);
    private native void destroyNative(long handle);

    synchronized void cancel(Runnable afterSourceReleased) {
        cancelled = true;
        if (handle != 0) cancelNative(handle);
        if (afterSourceReleased != null) {
            if (released || handle == 0) afterSourceReleased.run();
            else releaseCallbacks.add(afterSourceReleased);
        }
    }
    public synchronized void sourceReleased() {
        released = true;
        for (Runnable callback : releaseCallbacks) callback.run();
        releaseCallbacks.clear();
    }
    public void snapshotPrepared(String fingerprint) throws Exception {
        String key = stagingReplacement ? "replacementFingerprint" : "pendingFingerprint";
        store.update(profileId, profile -> profile.put(key, fingerprint));
        preparedFingerprint = fingerprint;
    }
    public void transactionCommitted() {
        if (stagingReplacement) return;
        try { recordCommit(); }
        catch (Exception error) { callbackError = error; }
    }
    private void recordCommit() throws Exception {
        if (preparedFingerprint == null) throw new IllegalStateException("Cannot retain the backup identity.");
        store.update(profileId, profile -> {
            profile.put("ownsTarget", true);
            profile.remove("targetCreationPending");
            profile.put("fingerprint", preparedFingerprint);
            profile.remove("pendingFingerprint");
            profile.put("savedAt", Instant.now().toString());
            profile.remove("attachmentFilesPending");
            profile.remove("attachmentError");
        });
    }
    String[] run() throws Exception {
        Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND);
        checkActive();
        JSONObject profile = store.load();
        FolioleFolderBackupReplacement replacement = replacement(profileId);
        if (profile.optBoolean("replacementPending")) {
            if (replacement.recover()) return finishInterruptedPublication(replacement, profile);
            clearReplacement();
            profile = store.load();
        }
        Uri previous = replaceExisting ? foreignTarget(profile.optBoolean("ownsTarget"), profile.optBoolean("targetCreationPending")) : null;
        if (previous != null) return replace(previous, replacement);
        prepare(profile.optBoolean("ownsTarget"), profile.optBoolean("targetCreationPending"),
            () -> updateTargetCreation(true), () -> updateTargetCreation(false), this::forgetMissingTarget);
        profile = store.load(); // a recreated target no longer expects the removed backup's fingerprint
        return writeSnapshot(optional(profile, "fingerprint"), optional(profile, "pendingFingerprint"));
    }
    private String[] replace(Uri original, FolioleFolderBackupReplacement replacement) throws Exception {
        requireDistinctSource(original);
        replacement.requireEmptySlots();
        store.update(profileId, profile -> profile.put("replacementPending", true));
        stagingReplacement = true;
        try {
            replacement.begin();
            String[] result = writeSnapshot(null, null);
            requireComplete(result);
            checkActive();
            replacement.publish(original, this::recordCommit);
            replacement.discardPrevious();
            clearReplacement();
            return result;
        } catch (Exception error) {
            try { if (!replacement.recover()) clearReplacement(); }
            catch (Exception recovery) {
                error.addSuppressed(recovery);
                throw new IllegalStateException("Backup replacement was interrupted. Previous backup: " + replacement.recoveryName(), error);
            }
            throw error;
        } finally {
            useSnapshotName(null);
        }
    }
    private String[] finishInterruptedPublication(FolioleFolderBackupReplacement replacement, JSONObject profile) throws Exception {
        String expected = optional(profile, profile.optBoolean("ownsTarget") ? "fingerprint" : "replacementFingerprint");
        if (expected == null) throw new IllegalStateException("Cannot verify the interrupted backup replacement.");
        String[] result = writeSnapshot(expected, optional(profile, "pendingFingerprint"));
        requireComplete(result);
        replacement.discardPrevious();
        clearReplacement();
        return result;
    }
    private void clearReplacement() throws Exception {
        store.update(profileId, profile -> {
            profile.remove("replacementPending");
            profile.remove("replacementFingerprint");
            if (!profile.optBoolean("ownsTarget")) profile.remove("pendingFingerprint");
        });
    }
    private void requireDistinctSource(Uri target) throws Exception {
        try (ParcelFileDescriptor descriptor = context.getContentResolver().openFileDescriptor(target, "r")) {
            if (descriptor == null) throw new IllegalStateException("Cannot open the previous backup.");
            var previous = Os.fstat(descriptor.getFileDescriptor());
            var active = Os.stat(source);
            if (previous.st_dev == active.st_dev && previous.st_ino == active.st_ino) {
                throw new IllegalStateException("Backup destination is the active database.");
            }
        }
    }
    private static void requireComplete(String[] result) {
        if (!"1".equals(result[1]) || !"0".equals(result[2])) {
            throw new IllegalStateException("The replacement backup did not finish.");
        }
    }
    private synchronized void checkActive() {
        if (cancelled) throw new IllegalStateException("Backup cancelled.");
    }
    private String[] writeSnapshot(String expected, String pending) throws Exception {
        long active;
        synchronized (this) {
            if (cancelled) throw new IllegalStateException("Backup cancelled.");
            handle = createNative(source, expected, pending);
            if (handle == 0) throw new IllegalStateException("Cannot initialize database backup.");
            active = handle;
        }
        String[] result;
        try { result = runNative(active); }
        finally {
            synchronized (this) { destroyNative(active); handle = 0; sourceReleased(); }
        }
        if (callbackError != null) throw callbackError;
        if (!"0".equals(result[0])) throw new IllegalStateException(result[5]);
        return result;
    }
    private static String optional(JSONObject profile, String key) {
        return profile.has(key) && !profile.isNull(key) ? profile.optString(key) : null;
    }
    private void forgetMissingTarget() {
        try {
            store.update(profileId, value -> {
                value.put("ownsTarget", false);
                value.remove("fingerprint"); value.remove("pendingFingerprint"); value.remove("savedAt");
            });
        } catch (Exception error) { throw new IllegalStateException(error); }
    }
    private void updateTargetCreation(boolean pending) {
        try {
            store.update(profileId, value -> {
                if (pending) value.put("targetCreationPending", true);
                else { value.put("ownsTarget", true); value.remove("targetCreationPending"); }
            });
        } catch (Exception error) { throw new IllegalStateException(error); }
    }
}
