package com.foliole.android;

import android.content.Context;
import android.net.Uri;
import android.os.Process;
import org.json.JSONObject;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

final class FolioleFolderBackupOperation extends FolioleFolderBackupDocuments {
    static { System.loadLibrary("sqlcipher"); }
    final String requestId, epoch, source;
    private final FolioleFolderBackupProfile store;
    private final String profileId;
    private long handle;
    private boolean cancelled, released;
    private String preparedFingerprint;
    private Exception callbackError;
    private final List<Runnable> releaseCallbacks = new ArrayList<>();

    FolioleFolderBackupOperation(Context context, JSONObject profile, String requestId,
        String epoch, String source, FolioleFolderBackupProfile store) throws Exception {
        super(context, Uri.parse(profile.getString("tree")));
        this.profileId = profile.getString("id");
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
        store.update(profileId, profile -> profile.put("pendingFingerprint", fingerprint));
        preparedFingerprint = fingerprint;
    }
    public void transactionCommitted() {
        try {
            store.update(profileId, profile -> {
                profile.put("fingerprint", preparedFingerprint);
                profile.remove("pendingFingerprint");
                profile.put("savedAt", Instant.now().toString());
            });
        } catch (Exception error) { callbackError = error; }
    }
    String[] run() throws Exception {
        Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND);
        JSONObject profile = store.load();
        synchronized (this) { if (cancelled) throw new IllegalStateException("Backup cancelled."); }
        prepare(profile.optBoolean("ownsTarget"), () -> {
            try { store.update(profileId, value -> value.put("ownsTarget", true)); }
            catch (Exception error) { throw new IllegalStateException(error); }
        });
        long active;
        synchronized (this) {
            if (cancelled) throw new IllegalStateException("Backup cancelled.");
            handle = createNative(source, optional(profile, "fingerprint"), optional(profile, "pendingFingerprint"));
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
}
