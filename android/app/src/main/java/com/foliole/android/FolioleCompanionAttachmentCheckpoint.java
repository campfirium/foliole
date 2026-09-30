package com.foliole.android;

import android.content.Context;
import java.io.File;
import org.json.JSONObject;

// File durability precedes this callback; SQLite remains owned by the shared writer.
final class FolioleCompanionAttachmentCheckpoint implements FolioleCompanionAttachmentRangeDownload.Checkpoint {
    private final String databasePath;
    private final String partialPath;
    private final String hash;
    private final String operation;

    FolioleCompanionAttachmentCheckpoint(Context context, String path, File partial, String hash) throws Exception {
        if (path == null || path.isEmpty()) throw new IllegalArgumentException("attachment_checkpoint_database_missing");
        databasePath = path;
        partialPath = partial.getAbsolutePath();
        this.hash = hash;
        operation = "attachment_checkpoint";
    }

    public long load(long total) throws Exception { return request("load", total, 0).getLong("confirmed_bytes"); }
    public void save(long total, long confirmed) throws Exception { request("save", total, confirmed); }
    public void clear() throws Exception { request("clear", 0, 0); }

    private JSONObject request(String action, long total, long confirmed) throws Exception {
        return FolioleCompanionSyncGroupDataBridge.current().request(operation, new JSONObject()
            .put("action", action).put("database_path", databasePath).put("temporary_path", partialPath)
            .put("content_hash", hash).put("total_bytes", total).put("confirmed_bytes", confirmed));
    }
}
