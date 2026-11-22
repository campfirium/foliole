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
    private FolioleFolderBackupRound round;
    private String source, stoppedRequest, pickerRequest;
    /** One worker for every attachment call; the calls of one request are already serialized by JS. */
    private final ExecutorService attachmentWork = Executors.newSingleThreadExecutor(task -> new Thread(task, "FolioleBackupAttachment"));
    private FolioleFolderBackupOperation operation;
    /** A reloaded page's owner waiting for the previous page's database operation to stop. */
    private PluginCall waitingOpen;
    private boolean copyingAttachment, attachmentCancelled;

    @Override public void load() {
        store = new FolioleFolderBackupProfile(getContext());
        String phase = "idle", error = null;
        try { phase = store.resumePhase(); }
        catch (Exception failure) { phase = "failed"; error = failure.getMessage(); }
        round = new FolioleFolderBackupRound(phase, error, (value, message) -> {
            try { store.status(value, message); }
            catch (Exception failure) { android.util.Log.e("FolioleFolderBackup", "Cannot persist backup state", failure); }
        });
    }

    @PluginMethod public synchronized void openSource(PluginCall call) {
        try {
            String name = FolioleCompanionBridgeContractDefinitions.hostApiString(getContext(), "folderBackup", "databaseName");
            File expected = getContext().getDatabasePath(name + "SQLite.db").getCanonicalFile();
            String path = call.getString("databasePath");
            if (call.getString("sourceEpoch") == null || path == null || !expected.isFile() || !expected.equals(new File(path).getCanonicalFile())) {
                throw new IllegalArgumentException("Invalid active database path.");
            }
            openOwner(call, expected.getPath());
        } catch (Exception error) { call.reject(error.getMessage(), error); }
    }
    private void openOwner(PluginCall call, String path) {
        String previous = round.request();
        boolean reclaim = Boolean.TRUE.equals(call.getBoolean("reclaim", false));
        boolean opened = round.open(call.getString("sourceEpoch"), reclaim);
        if (reclaim && previous != null) {
            // The page that owned this round is gone; stop its native work instead of waiting for it.
            attachmentCancelled = true;
            if (operation != null) operation.cancel(null);
            if (!previous.equals(round.request())) emitState(null);
        }
        if (!opened) {
            if (waitingOpen != null) waitingOpen.reject("Database owner was replaced.");
            waitingOpen = call; return;
        }
        source = path; call.resolve();
    }
    private void resumeWaitingOpen() {
        PluginCall call = waitingOpen;
        if (call == null || round.running()) return;
        waitingOpen = null;
        try {
            File expected = getContext().getDatabasePath(FolioleCompanionBridgeContractDefinitions.hostApiString(getContext(),
                "folderBackup", "databaseName") + "SQLite.db").getCanonicalFile();
            openOwner(call, expected.getPath());
        } catch (Exception error) { call.reject(error.getMessage(), error); }
    }
    @PluginMethod public synchronized void closeSource(PluginCall call) {
        if (!round.close(call.getString("sourceEpoch"))) { call.resolve(); return; }
        source = null; attachmentCancelled = true;
        if (operation != null) operation.cancel(call::resolve); else call.resolve();
    }
    @PluginMethod public synchronized void cancelDatabase(PluginCall call) {
        String requestId = call.getString("requestId");
        if (round.owns(requestId)) {
            attachmentCancelled = true;
            // The database round already ended; never leave a released request shown or persisted as running.
            // A failure reported by the caller is the round's real outcome, so it ends as failed with that error.
            if (round.cancel(requestId, call.getString("errorMessage"), operation != null || copyingAttachment)) emitState(null);
        }
        if (operation != null && operation.requestId.equals(requestId)) operation.cancel(null);
        call.resolve();
    }
    @PluginMethod public synchronized void getState(PluginCall call) {
        try { call.resolve(state()); } catch (Exception error) { call.reject(error.getMessage(), error); }
    }
    @PluginMethod public synchronized void clearDirectory(PluginCall call) {
        try {
            if (operation != null || copyingAttachment) throw new IllegalStateException("A backup is still running.");
            round.clear(); store.clear();
            emitState(null); call.resolve(state());
        } catch (Exception error) { call.reject(error.getMessage(), error); }
    }
    @PluginMethod public synchronized void backupDatabase(PluginCall call) {
        // A second request must not release or fail the round that is still running.
        if (round.isOpen()) { call.reject("A database backup is already running."); return; }
        try {
            round.begin(call.getString("sourceEpoch"), call.getString("requestId"));
            if (call.getBoolean("chooseDirectory", false) || store.load() == null) {
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                    | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
                FolioleDocumentPickerLocation.startInDocuments(intent);
                pickerRequest = round.request();
                startActivityForResult(call, intent, "folderSelected");
            } else start(call);
        } catch (Exception error) { round.fail(error.getMessage()); emitState(null); call.reject(error.getMessage(), error); }
    }
    @ActivityCallback private synchronized void folderSelected(PluginCall call, ActivityResult result) {
        String requestId = pickerRequest;
        pickerRequest = null;
        // A reload drops the saved call; only the request that is still open may be released by its picker.
        if (call == null) { round.folderChosen(requestId, true); return; }
        try {
            Intent data = result.getData();
            boolean cancelled = result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null;
            if (!round.folderChosen(call.getString("requestId"), cancelled) || cancelled) {
                call.resolve(response(call, true, null)); return;
            }
            if (round.epoch() == null || !round.epoch().equals(call.getString("sourceEpoch"))) throw new IllegalStateException("Database owner is closed.");
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
        } catch (Exception error) { round.fail(error.getMessage()); emitState(null); call.reject(error.getMessage(), error); }
    }
    private synchronized void start(PluginCall call) throws Exception {
        String epoch = call.getString("sourceEpoch");
        if (round.epoch() == null || !round.epoch().equals(epoch)) throw new IllegalStateException("Database owner is closed.");
        FolioleFolderBackupOperation job = new FolioleFolderBackupOperation(getContext(), store.load(), round.request(), epoch, source, store);
        round.started(epoch);
        operation = job; attachmentCancelled = false;
        emitState(null);
        new Thread(() -> {
            try {
                String[] result = job.run();
                synchronized (this) {
                    round.databaseEnded(job.requestId, "1".equals(result[1]), "1".equals(result[2]));
                    JSObject response = response(call, false, result);
                    operation = null;
                    emitState(response);
                    call.resolve(response);
                    resumeWaitingOpen();
                }
            } catch (Exception error) {
                synchronized (this) {
                    if (operation == job) operation = null;
                    if (round.running()) round.databaseFailed(job.requestId, error.getMessage());
                    else if (round.owns(job.requestId)) round.fail(error.getMessage());
                    emitState(null);
                    resumeWaitingOpen();
                }
                call.reject(error.getMessage(), error);
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
        if (round.owns(requestId)) stoppedRequest = requestId;
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
        return attachmentCancelled || round.epoch() == null || !round.epoch().equals(call.getString("sourceEpoch"));
    }
    private void requireAttachmentRequest(PluginCall call) {
        if (operation != null || round.running() || !round.owns(call.getString("requestId"))) {
            throw new IllegalStateException("Database backup must finish before attachments.");
        }
        if (attachmentStopped(call)) throw new IllegalStateException("Database owner is closed or backup cancelled.");
    }
    @PluginMethod public synchronized void finishAttachments(PluginCall call) {
        try { round.requireFinish(call.getString("requestId"), operation != null || copyingAttachment); }
        catch (Exception error) { call.reject(error.getMessage(), error); return; }
        try {
            JSONObject profile = store.load();
            store.update(profile.getString("id"), value -> {
                value.put("attachmentFilesCopied", call.getInt("copied", 0));
                Integer pending = call.getInt("pending");
                value.put("attachmentFilesPending", pending == null ? JSONObject.NULL : pending);
                value.put("attachmentError", call.getString("errorMessage", ""));
            });
            round.finished(call.getString("errorMessage"), call.getInt("pending", -1));
            emitState(null);
            call.resolve(state());
        } catch (Exception error) { round.fail(error.getMessage()); emitState(null); call.reject(error.getMessage(), error); }
    }
    private void emitState(JSObject result) {
        try {
            JSObject event = new JSObject().put("state", state());
            if (result != null) event.put("result", result);
            notifyListeners("backupStateChanged", event);
        } catch (Exception error) { android.util.Log.e("FolioleFolderBackup", "Cannot publish backup state", error); }
    }
    private JSObject state() throws Exception {
        return store.state(round.phase(), round.error());
    }

    private JSObject response(PluginCall call, boolean cancelled, String[] result) throws Exception {
        return new JSObject().put("requestId", call.getString("requestId")).put("cancelled", cancelled)
            .put("databaseCommitted", result != null && "1".equals(result[1]))
            .put("sourcePages", result == null ? 0 : Long.parseLong(result[3]))
            .put("changedPages", result == null ? 0 : Long.parseLong(result[4])).put("state", state());
    }
    @Override protected synchronized void handleOnDestroy() {
        round.destroy(); source = null; attachmentCancelled = true;
        if (operation != null) operation.cancel(null);
        attachmentWork.shutdown();
        super.handleOnDestroy();
    }
}
