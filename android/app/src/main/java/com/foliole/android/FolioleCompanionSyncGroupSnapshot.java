package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

import java.io.File;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

final class FolioleCompanionSyncGroupSnapshot {
    private final FolioleCompanionSyncGroupDataBridge bridge;
    private final Context context;
    private final Map<String, Object> locks = new ConcurrentHashMap<>();
    private final Map<String, File> snapshots = new ConcurrentHashMap<>();
    private volatile boolean closed;

    FolioleCompanionSyncGroupSnapshot(Context context, FolioleCompanionSyncGroupDataBridge bridge) {
        this.context = context.getApplicationContext();
        this.bridge = bridge;
    }

    <T> T refresh(String peerDeviceId, Work<T> work) throws Exception {
        return refresh(peerDeviceId, false, work);
    }

    <T> T refreshIdentity(String peerDeviceId, Work<T> work) throws Exception {
        return refresh(peerDeviceId, true, work);
    }

    private <T> T refresh(String peerDeviceId, boolean identityIndex, Work<T> work) throws Exception {
        synchronized (lock(peerDeviceId)) {
            ensureOpen();
            File next = create(identityIndex);
            try {
                T result = work.run(next.getAbsolutePath());
                File previous = snapshots.put(peerDeviceId, next);
                delete(previous);
                return result;
            } catch (Exception error) {
                delete(next);
                throw error;
            }
        }
    }

    <T> T read(String peerDeviceId, Work<T> work) throws Exception {
        synchronized (lock(peerDeviceId)) {
            ensureOpen();
            File snapshot = snapshots.get(peerDeviceId);
            if (snapshot == null || !snapshot.isFile()) {
                throw new IllegalStateException("sync_group_snapshot_missing");
            }
            return work.run(snapshot.getAbsolutePath());
        }
    }

    <T> T continueOrRefresh(String peerDeviceId, Work<T> work) throws Exception {
        synchronized (lock(peerDeviceId)) {
            ensureOpen();
            File snapshot = snapshots.get(peerDeviceId);
            return snapshot != null && snapshot.isFile()
                ? work.run(snapshot.getAbsolutePath()) : refresh(peerDeviceId, work);
        }
    }

    void close() {
        closed = true;
        snapshots.values().forEach(FolioleCompanionSyncGroupSnapshot::delete);
        snapshots.clear();
        locks.clear();
    }

    private File create(boolean identityIndex) throws Exception {
        File snapshot = File.createTempFile("foliole-provider-source-", ".db", context.getCacheDir());
        if (!snapshot.delete()) throw new IllegalStateException("sync_group_snapshot_prepare_failed");
        try {
            JSONObject result = bridge.request(
                "create_snapshot", new JSONObject().put("target_path", snapshot.getAbsolutePath())
                    .put("identity_index", identityIndex)
            );
            if (!snapshot.getAbsolutePath().equals(result.optString("snapshot_path")) || !snapshot.isFile()) {
                throw new IllegalStateException("sync_group_snapshot_missing");
            }
            return snapshot;
        } catch (Exception failure) {
            delete(snapshot);
            throw failure;
        }
    }

    private Object lock(String peerDeviceId) {
        return locks.computeIfAbsent(peerDeviceId, ignored -> new Object());
    }

    private void ensureOpen() {
        if (closed) throw new IllegalStateException("sync_group_snapshot_store_closed");
    }

    private static void delete(File file) {
        if (file != null && file.exists() && !file.delete()) file.deleteOnExit();
    }

    interface Work<T> { T run(String snapshotPath) throws Exception; }
}
