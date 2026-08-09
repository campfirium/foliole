package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

import java.io.File;

final class FolioleCompanionSyncGroupSnapshot {
    private FolioleCompanionSyncGroupSnapshot() {}

    static <T> T read(Context context, FolioleCompanionSyncGroupDataBridge bridge, Work<T> work) throws Exception {
        File snapshot = File.createTempFile("foliole-provider-source-", ".db", context.getCacheDir());
        if (!snapshot.delete()) throw new IllegalStateException("sync_group_snapshot_prepare_failed");
        try {
            JSONObject result = bridge.request("create_snapshot", new JSONObject().put("target_path", snapshot.getAbsolutePath()));
            if (!snapshot.getAbsolutePath().equals(result.optString("snapshot_path")) || !snapshot.isFile()) {
                throw new IllegalStateException("sync_group_snapshot_missing");
            }
            return work.run(snapshot.getAbsolutePath());
        } finally {
            if (snapshot.exists() && !snapshot.delete()) snapshot.deleteOnExit();
        }
    }

    interface Work<T> { T run(String snapshotPath) throws Exception; }
}
