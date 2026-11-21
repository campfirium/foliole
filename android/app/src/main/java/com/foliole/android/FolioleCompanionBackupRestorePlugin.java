package com.foliole.android;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

/** Copies a chosen backup zip or folder into app-private staging; the active library is untouched. */
@CapacitorPlugin(name = "FolioleCompanionBackupRestore")
public final class FolioleCompanionBackupRestorePlugin extends Plugin {
    private static final String STAGING_DATABASE = "foliole-restore-staging";
    private volatile boolean cancelled;
    private boolean running;
    private long lastProgress;

    /** Finish an interrupted library swap before the web layer opens any database. */
    @Override public void load() {
        try {
            FolioleBackupRestoreSwap swap = swap();
            if (swap.interrupted()) swap.commit(java.time.Instant.now().toString());
        } catch (Exception error) { android.util.Log.e("FolioleBackupRestore", "Cannot finish interrupted restore", error); }
    }

    @PluginMethod public void commit(PluginCall call) { replace(call, false); }
    @PluginMethod public void revert(PluginCall call) { replace(call, true); }

    private synchronized void replace(PluginCall call, boolean revert) {
        if (running) { call.reject("restore_already_running"); return; }
        running = true;
        new Thread(() -> {
            try {
                FolioleBackupRestoreSwap swap = swap();
                String now = java.time.Instant.now().toString();
                if (revert) swap.revert(now); else swap.commit(now);
                call.resolve();
            } catch (Exception error) { call.reject(error.getMessage(), error); }
            finally { finished(); }
        }, "FolioleBackupRestoreSwap").start();
    }

    @PluginMethod public void previous(PluginCall call) {
        try {
            FolioleBackupRestoreSwap swap = swap();
            String savedAt = swap.previousSavedAt();
            call.resolve(new JSObject().put("exists", savedAt != null).put("savedAt", savedAt == null ? org.json.JSONObject.NULL : savedAt));
        } catch (Exception error) { call.reject(error.getMessage(), error); }
    }

    @PluginMethod public synchronized void stage(PluginCall call) {
        if (running) { call.reject("restore_already_running"); return; }
        boolean zip = "zip".equals(call.getString("source"));
        Intent intent;
        if (zip) {
            intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
        } else {
            intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        }
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        running = true;
        cancelled = false;
        try { startActivityForResult(call, intent, zip ? "zipSelected" : "folderSelected"); }
        catch (Exception error) { running = false; call.reject("restore_picker_unavailable", error); }
    }

    @ActivityCallback private void zipSelected(PluginCall call, ActivityResult result) { selected(call, result, false); }
    @ActivityCallback private void folderSelected(PluginCall call, ActivityResult result) { selected(call, result, true); }

    private void selected(PluginCall call, ActivityResult result, boolean tree) {
        if (call == null) { finished(); return; }
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            finished();
            call.resolve(new JSObject().put("cancelled", true));
            return;
        }
        Uri uri = data.getData();
        new Thread(() -> {
            try {
                android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_BACKGROUND);
                call.resolve(run(uri, tree));
            } catch (InterruptedException error) {
                discardQuietly();
                call.resolve(new JSObject().put("cancelled", true));
            } catch (Exception error) {
                discardQuietly();
                call.reject(error.getMessage(), error);
            } finally { finished(); }
        }, "FolioleBackupRestore").start();
    }

    private JSObject run(Uri uri, boolean tree) throws Exception {
        String databaseName = FolioleCompanionBridgeContractDefinitions.hostApiString(getContext(), "folderBackup", "databaseFileName");
        FolioleBackupRestoreStaging staging = new FolioleBackupRestoreStaging(stagingDatabase(), stagingAttachments(),
            () -> cancelled, this::progress);
        staging.reset();
        if (tree) FolioleBackupRestoreSources.readFolder(getContext(), uri, databaseName, staging);
        else FolioleBackupRestoreSources.readZip(getContext(), uri, databaseName, staging);
        JSArray keys = new JSArray();
        for (String key : staging.stagedKeys()) keys.put(key);
        return new JSObject().put("cancelled", false).put("database", STAGING_DATABASE)
            .put("sourceLabel", FolioleBackupRestoreSources.label(getContext(), uri, tree))
            .put("storageKeys", keys).put("skippedFiles", staging.skippedFiles()).put("damagedFiles", staging.damagedFiles());
    }

    private void progress(long bytes, int files) {
        long now = System.currentTimeMillis();
        if (now - lastProgress < 300) return;
        lastProgress = now;
        notifyListeners("restoreProgress", new JSObject().put("bytes", bytes).put("files", files));
    }

    @PluginMethod public void cancel(PluginCall call) { cancelled = true; call.resolve(); }

    @PluginMethod public synchronized void discard(PluginCall call) {
        if (running) { call.reject("restore_already_running"); return; }
        try {
            new FolioleBackupRestoreStaging(stagingDatabase(), stagingAttachments(), () -> false, null).reset();
            FolioleBackupRestoreStaging.deleteTree(stagingAttachments().getParentFile());
            call.resolve();
        } catch (Exception error) { call.reject(error.getMessage(), error); }
    }

    private void discardQuietly() {
        try {
            new FolioleBackupRestoreStaging(stagingDatabase(), stagingAttachments(), () -> false, null).reset();
            FolioleBackupRestoreStaging.deleteTree(stagingAttachments().getParentFile());
        } catch (Exception error) { android.util.Log.w("FolioleBackupRestore", "Cannot discard restore staging", error); }
    }

    private synchronized void finished() { running = false; }
    private FolioleBackupRestoreSwap swap() throws Exception {
        String name = FolioleCompanionBridgeContractDefinitions.hostApiString(getContext(), "folderBackup", "databaseName");
        return new FolioleBackupRestoreSwap(getContext().getDatabasePath(name + "SQLite.db"), stagingDatabase(),
            getContext().getFilesDir(), stagingAttachments());
    }
    private File stagingDatabase() { return getContext().getDatabasePath(STAGING_DATABASE + "SQLite.db"); }
    private File stagingAttachments() { return new File(new File(getContext().getFilesDir(), "restore-staging"), "attachments"); }
}
