package com.foliole.android;

import android.app.Activity;
import android.content.Intent;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "FolioleFolderSync")
public class FolioleFolderSyncPlugin extends Plugin {
    private final ExecutorService files = Executors.newSingleThreadExecutor();
    private FolioleFolderSyncLocation location;
    private boolean choosing;

    @Override public void load() { location = new FolioleFolderSyncLocation(getContext()); }

    @PluginMethod public void readLocation(PluginCall call) {
        perform(call, () -> new JSObject().put("location", nullable(location.read())));
    }

    @PluginMethod public void chooseLocation(PluginCall call) {
        if (choosing) { call.reject("folder_sync_busy"); return; }
        choosing = true;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        try { startActivityForResult(call, intent, "locationChosen"); }
        catch (Exception error) { choosing = false; call.reject("folder_sync_picker_failed", error); }
    }

    @ActivityCallback private void locationChosen(PluginCall call, ActivityResult result) {
        choosing = false;
        if (call == null) return;
        perform(call, () -> {
            boolean cancelled = result.getResultCode() != Activity.RESULT_OK;
            if (!cancelled) {
                Intent data = result.getData();
                if (data == null || data.getData() == null) throw new IllegalStateException("folder_sync_picker_failed");
                location.select(data.getData(), data.getFlags());
            }
            return new JSObject().put("location", nullable(location.read())).put("cancelled", cancelled);
        });
    }

    @PluginMethod public void acquire(PluginCall call) {
        perform(call, () -> new JSObject().put("lease", location.acquire(call.getString("token"), this, files)));
    }

    @PluginMethod public void release(PluginCall call) {
        perform(call, () -> { location.release(call.getString("token"), call.getString("lease"), this); return new JSObject(); });
    }

    @PluginMethod public void saveCompletion(PluginCall call) {
        perform(call, () -> {
            location.complete(call.getString("token"), call.getString("lease"), this, call.getObject("completion"));
            return new JSObject();
        });
    }

    @PluginMethod public void access(PluginCall call) {
        perform(call, () -> {
            android.net.Uri tree = location.requireLease(call.getString("token"), call.getString("lease"), this);
            return access(new FolioleFolderSyncDocuments(getContext().getContentResolver(), tree), call);
        });
    }

    private JSObject access(FolioleFolderSyncDocuments documents, PluginCall call) throws Exception {
        String key = call.getString("key");
        FolioleFolderSyncPaths.parts(key);
        switch (call.getString("operation", "")) {
            case "read": {
                byte[] bytes = documents.read(key);
                return new JSObject().put("base64", bytes == null ? JSONObject.NULL : Base64.encodeToString(bytes, Base64.NO_WRAP));
            }
            case "write": documents.write(key, bytes(call)); break;
            case "stat": {
                FolioleFolderSyncDocuments.Info info = documents.stat(key);
                return new JSObject().put("present", info.present).put("length", info.length).put("hash", info.hash);
            }
            case "truncate": documents.truncate(key, call.getData().getLong("length")); break;
            case "length": return new JSObject().put("length", documents.length(key));
            case "append": documents.append(key, call.getData().getLong("offset"), bytes(call)); break;
            case "publish": documents.publish(key); break;
            case "remove": documents.remove(key); break;
            default: throw new IllegalArgumentException("folder_sync_operation_invalid");
        }
        return new JSObject();
    }

    private byte[] bytes(PluginCall call) {
        String encoded = call.getString("base64");
        if (encoded == null || encoded.length() > (FolioleFolderSyncPaths.MAX_BRIDGE_BYTES + 2) / 3 * 4) {
            throw new IllegalArgumentException("folder_sync_write_limit");
        }
        return Base64.decode(encoded, Base64.DEFAULT);
    }

    private interface Operation { JSObject run() throws Exception; }
    private void perform(PluginCall call, Operation operation) {
        files.execute(() -> {
            try { call.resolve(operation.run()); }
            catch (Exception error) { call.reject(error.getMessage(), error); }
        });
    }

    private Object nullable(Object value) { return value == null ? JSONObject.NULL : value; }

    @Override protected void handleOnDestroy() {
        files.execute(() -> location.close(this));
        files.shutdown();
    }
}
