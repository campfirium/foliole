package com.foliole.android;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "FolioleCompanionFolderBackup")
public final class FolioleCompanionFolderBackupPlugin extends Plugin {
    private FolioleFolderBackupProfile store;
    private String epoch, source, activeRequest, stoppedRequest;
    /** One worker for every attachment call; the calls of one request are already serialized by JS. */
    private final ExecutorService attachmentWork = Executors.newSingleThreadExecutor(task -> new Thread(task, "FolioleBackupAttachment"));
    private FolioleFolderBackupOperation operation;
    private String phase = "idle", errorMessage;
    private boolean copyingAttachment, attachmentCancelled;

    @Override public void load() {
        store = new FolioleFolderBackupProfile(getContext());
        try { phase = store.resumePhase(); }
        catch (Exception error) { phase = "failed"; errorMessage = error.getMessage(); }
    }

    @PluginMethod public synchronized void openSource(PluginCall call) {
        try {
            String name = FolioleCompanionBridgeContractDefinitions.hostApiString(getContext(), "folderBackup", "databaseName");
            File expected = getContext().getDatabasePath(name + "SQLite.db").getCanonicalFile();
            String nextEpoch = call.getString("sourceEpoch");
            String path = call.getString("databasePath");
            if (nextEpoch == null || path == null || !expected.isFile() || !expected.equals(new File(path).getCanonicalFile())) {
                throw new IllegalArgumentException("Invalid active database path.");
            }
            if (epoch != null && !epoch.equals(nextEpoch)) throw new IllegalStateException("Previous database owner is still open.");
            epoch = nextEpoch; source = expected.getPath(); call.resolve();
        } catch (Exception error) { call.reject(error.getMessage(), error); }
    }
    @PluginMethod public synchronized void closeSource(PluginCall call) {
        if (epoch == null || !epoch.equals(call.getString("sourceEpoch"))) { call.resolve(); return; }
        epoch = null; source = null; attachmentCancelled = true;
        if (operation != null) operation.cancel(call::resolve); else call.resolve();
    }
    @PluginMethod public synchronized void cancelDatabase(PluginCall call) {
        if (call.getString("requestId") != null && call.getString("requestId").equals(activeRequest)) {
            attachmentCancelled = true;
            if (operation == null && !copyingAttachment) {
                activeRequest = null;
                // The database round already ended; never leave a released request shown or persisted as running.
                if ("working".equals(phase)) {
                    phase = "pending";
                    try { store.status(phase, errorMessage); }
                    catch (Exception error) { android.util.Log.e("FolioleFolderBackup", "Cannot persist cancelled backup", error); }
                    emitState(null);
                }
            }
        }
        if (operation != null && operation.requestId.equals(call.getString("requestId"))) operation.cancel(null);
        call.resolve();
    }
    @PluginMethod public synchronized void getState(PluginCall call) {
        try { call.resolve(state()); } catch (Exception error) { call.reject(error.getMessage(), error); }
    }
    @PluginMethod public synchronized void clearDirectory(PluginCall call) {
        try {
            if (activeRequest != null || operation != null || copyingAttachment) throw new IllegalStateException("A backup is still running.");
            store.clear(); phase = "idle"; errorMessage = null;
            emitState(null); call.resolve(state());
        } catch (Exception error) { call.reject(error.getMessage(), error); }
    }
    @PluginMethod public synchronized void backupDatabase(PluginCall call) {
        try {
            if (activeRequest != null) throw new IllegalStateException("A database backup is already running.");
            if (epoch == null || !epoch.equals(call.getString("sourceEpoch"))) throw new IllegalStateException("Database owner is closed.");
            activeRequest = call.getString("requestId");
            if (activeRequest == null) throw new IllegalArgumentException("Missing backup request.");
            if (call.getBoolean("chooseDirectory", false) || store.load() == null) {
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                    | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
                startActivityForResult(call, intent, "folderSelected");
            } else start(call);
        } catch (Exception error) { activeRequest = null; failed(error); emitState(null); call.reject(error.getMessage(), error); }
    }
    @ActivityCallback private synchronized void folderSelected(PluginCall call, ActivityResult result) {
        if (call == null) { activeRequest = null; return; }
        try {
            Intent data = result.getData();
            if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
                activeRequest = null; call.resolve(response(call, true, null)); return;
            }
            if (epoch == null || !epoch.equals(call.getString("sourceEpoch"))) throw new IllegalStateException("Database owner is closed.");
            Uri tree = data.getData();
            int readPermission = (data.getFlags() & Intent.FLAG_GRANT_READ_URI_PERMISSION) != 0
                    ? Intent.FLAG_GRANT_READ_URI_PERMISSION : 0;
            int writePermission = (data.getFlags() & Intent.FLAG_GRANT_WRITE_URI_PERMISSION) != 0
                    ? Intent.FLAG_GRANT_WRITE_URI_PERMISSION : 0;
            getContext().getContentResolver().takePersistableUriPermission(tree, readPermission | writePermission);
            JSONObject profile = store.load();
            if (profile == null || !tree.toString().equals(profile.optString("tree"))) {
                profile = new JSONObject().put("id", UUID.randomUUID().toString()).put("tree", tree.toString())
                    .put("label", android.provider.DocumentsContract.getTreeDocumentId(tree));
                store.save(profile);
            }
            start(call);
        } catch (Exception error) { activeRequest = null; failed(error); emitState(null); call.reject(error.getMessage(), error); }
    }
    private synchronized void start(PluginCall call) throws Exception {
        if (epoch == null || !epoch.equals(call.getString("sourceEpoch"))) throw new IllegalStateException("Database owner is closed.");
        FolioleFolderBackupOperation job = new FolioleFolderBackupOperation(getContext(), store.load(), activeRequest, epoch, source, store);
        operation = job; attachmentCancelled = false; phase = "working"; errorMessage = null;
        store.status(phase, null);
        emitState(null);
        new Thread(() -> {
            try {
                String[] result = job.run();
                synchronized (this) {
                    phase = "1".equals(result[2]) ? "pending" : "working";
                    if (!"1".equals(result[1])) {
                        // No attachment phase follows an uncommitted round, so it must not stay persisted as running.
                        activeRequest = null; phase = "pending"; store.status(phase, null);
                    }
                    JSObject response = response(call, false, result);
                    operation = null;
                    emitState(response);
                    call.resolve(response);
                }
            } catch (Exception error) {
                synchronized (this) {
                    failed(error);
                    operation = null; activeRequest = null; emitState(null);
                }
                call.reject(error.getMessage(), error);
            } finally {
                synchronized (this) { if (operation == job) { operation = null; activeRequest = null; } }
            }
        }, "FolioleFolderBackup").start();
    }
    @PluginMethod public synchronized void prepareAttachmentDirectory(PluginCall call) {
        try {
            requireAttachmentRequest(call);
            JSONObject profile = store.load();
            attachmentWork.execute(() -> {
                try {
                    FolioleFolderBackupAttachmentTarget.prepareDirectory(getContext(), profile);
                    call.resolve();
                } catch (Exception error) { call.reject(error.getMessage(), error); }
            });
        } catch (Exception error) { call.reject(error.getMessage(), error); }
    }
    /** Copies a batch with one folder listing; per-key outcomes, and keys after a stop are left unattempted. */
    @PluginMethod public synchronized void copyAttachments(PluginCall call) {
        try {
            com.getcapacitor.JSArray array = call.getArray("storageKeys");
            if (array == null || array.length() > 64) throw new IllegalArgumentException("Invalid attachment batch.");
            List<String> keys = new ArrayList<>();
            for (int index = 0; index < array.length(); index++) keys.add(array.getString(index));
            JSONObject profile = store.load();
            processAttachment(call, () -> new JSObject().put("results", FolioleFolderBackupAttachmentTarget.copy(getContext(),
                profile, keys, () -> attachmentStopRequested(call), () -> attachmentStopped(call))));
        } catch (Exception error) { call.reject(error.getMessage(), error); }
    }
    @PluginMethod public synchronized void stopAttachments(PluginCall call) {
        String requestId = call.getString("requestId");
        if (requestId != null && requestId.equals(activeRequest)) stoppedRequest = requestId;
        call.resolve();
    }
    @PluginMethod public synchronized void deleteAttachment(PluginCall call) {
        try {
            JSONObject profile = store.load();
            processAttachment(call, () -> {
                FolioleFolderBackupAttachmentTarget.delete(getContext(), profile, call.getString("storageKey"), () -> attachmentStopped(call));
                return new JSObject();
            });
        } catch (Exception error) { call.reject(error.getMessage(), error); }
    }
    private interface AttachmentTask { JSObject run() throws Exception; }
    private void processAttachment(PluginCall call, AttachmentTask task) {
        try {
            requireAttachmentRequest(call);
            if (copyingAttachment) throw new IllegalStateException("An attachment is already being copied.");
            copyingAttachment = true;
            attachmentWork.execute(() -> {
                try {
                    JSObject result = task.run();
                    synchronized (this) { copyingAttachment = false; }
                    call.resolve(result);
                } catch (Exception error) {
                    synchronized (this) { copyingAttachment = false; }
                    call.reject(error.getMessage(), error);
                }
            });
        } catch (Exception error) { call.reject(error.getMessage(), error); }
    }
    private synchronized boolean attachmentStopRequested(PluginCall call) {
        return call.getString("requestId") != null && call.getString("requestId").equals(stoppedRequest);
    }
    private synchronized boolean attachmentStopped(PluginCall call) {
        return attachmentCancelled || epoch == null || !epoch.equals(call.getString("sourceEpoch"));
    }
    private void requireAttachmentRequest(PluginCall call) {
        if (operation != null || activeRequest == null || !activeRequest.equals(call.getString("requestId"))) {
            throw new IllegalStateException("Database backup must finish before attachments.");
        }
        if (attachmentStopped(call)) throw new IllegalStateException("Database owner is closed or backup cancelled.");
    }
    @PluginMethod public synchronized void finishAttachments(PluginCall call) {
        try {
            if (activeRequest == null || !activeRequest.equals(call.getString("requestId")) || operation != null || copyingAttachment) {
                throw new IllegalStateException("Attachment backup is not ready to finish.");
            }
            JSONObject profile = store.load();
            store.update(profile.getString("id"), value -> {
                value.put("attachmentFilesCopied", call.getInt("copied", 0));
                Integer pending = call.getInt("pending");
                value.put("attachmentFilesPending", pending == null ? JSONObject.NULL : pending);
                value.put("attachmentError", call.getString("errorMessage", ""));
            });
            errorMessage = call.getString("errorMessage");
            phase = errorMessage != null && !errorMessage.isEmpty() ? "failed"
                : call.getInt("pending", -1) == 0 ? "saved" : "pending";
            store.status(phase, errorMessage);
            activeRequest = null;
            emitState(null);
            call.resolve(state());
        } catch (Exception error) { activeRequest = null; failed(error); emitState(null); call.reject(error.getMessage(), error); }
    }
    private void failed(Exception error) {
        phase = "failed"; errorMessage = error.getMessage();
        try { store.status(phase, errorMessage); } catch (Exception statusError) { error.addSuppressed(statusError); }
    }
    private void emitState(JSObject result) {
        try {
            JSObject event = new JSObject().put("state", state());
            if (result != null) event.put("result", result);
            notifyListeners("backupStateChanged", event);
        } catch (Exception error) { android.util.Log.e("FolioleFolderBackup", "Cannot publish backup state", error); }
    }
    private JSObject state() throws Exception {
        return store.state(phase, errorMessage);
    }

    private JSObject response(PluginCall call, boolean cancelled, String[] result) throws Exception {
        return new JSObject().put("requestId", call.getString("requestId")).put("cancelled", cancelled)
            .put("databaseCommitted", result != null && "1".equals(result[1]))
            .put("sourcePages", result == null ? 0 : Long.parseLong(result[3]))
            .put("changedPages", result == null ? 0 : Long.parseLong(result[4])).put("state", state());
    }
    @Override protected synchronized void handleOnDestroy() {
        epoch = null; source = null; attachmentCancelled = true;
        if (operation != null) operation.cancel(null);
        attachmentWork.shutdown();
        super.handleOnDestroy();
    }
}
