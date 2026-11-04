package com.foliole.android;

import android.content.Context;
import android.util.AtomicFile;
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
    interface Change { void apply(JSONObject profile) throws Exception; }
    synchronized void update(String id, Change change) throws Exception {
        JSONObject profile = load();
        if (profile == null || !id.equals(profile.getString("id"))) throw new IllegalStateException("Backup folder changed.");
        change.apply(profile);
        save(profile);
    }
}
