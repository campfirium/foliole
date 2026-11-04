package com.foliole.android;

import android.content.Context;
import android.util.AtomicFile;
import com.getcapacitor.JSObject;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

final class FolioleFolderBackupProfile {
    private final AtomicFile file;
    FolioleFolderBackupProfile(Context context) {
        file = new AtomicFile(new File(context.getFilesDir(), "folder-database-backup.json"));
    }
    synchronized JSONObject load() throws Exception {
        if (!file.getBaseFile().exists()) return null;
        return new JSONObject(new String(file.readFully(), StandardCharsets.UTF_8));
    }
    synchronized void save(JSONObject profile) throws Exception {
        FileOutputStream output = file.startWrite();
        try {
            output.write(profile.toString().getBytes(StandardCharsets.UTF_8));
            output.getFD().sync();
            file.finishWrite(output);
        } catch (Exception error) { file.failWrite(output); throw error; }
    }
    synchronized String resumePhase() throws Exception {
        JSONObject profile = load();
        String phase = profile == null ? "idle" : profile.optString("phase", "idle");
        if (phase.equals("working")) {
            phase = "pending";
            status(phase, "Backup interrupted. Use Back up now to retry.");
        }
        return phase;
    }
    synchronized void clear() throws Exception {
        file.delete();
        if (load() != null) throw new IllegalStateException("Cannot forget backup folder.");
    }
    synchronized void status(String phase, String error) throws Exception {
        JSONObject profile = load();
        if (profile == null) return;
        profile.put("phase", phase).put("attachmentError", error == null ? "" : error);
        save(profile);
    }
    synchronized JSObject state(String phase, String errorMessage) throws Exception {
        JSONObject profile = load();
        return new JSObject().put("configured", profile != null)
            .put("directoryId", profile == null ? JSONObject.NULL : profile.opt("id"))
            .put("directoryLabel", profile == null ? JSONObject.NULL : profile.opt("label"))
            .put("databaseSavedAt", profile == null || !profile.has("savedAt") ? JSONObject.NULL : profile.opt("savedAt"))
            .put("attachmentFilesCopied", profile == null ? 0 : profile.optInt("attachmentFilesCopied", 0))
            .put("attachmentFilesPending", profile == null || !profile.has("attachmentFilesPending") ? JSONObject.NULL : profile.opt("attachmentFilesPending"))
            .put("phase", phase).put("errorMessage", errorMessage == null
                ? profile == null ? JSONObject.NULL : profile.has("attachmentError") ? profile.opt("attachmentError") : JSONObject.NULL : errorMessage);
    }
    interface Change { void apply(JSONObject profile) throws Exception; }
    synchronized void update(String id, Change change) throws Exception {
        JSONObject profile = load();
        if (profile == null || !id.equals(profile.getString("id"))) throw new IllegalStateException("Backup folder changed.");
        change.apply(profile);
        save(profile);
    }
}
