package com.foliole.android;

import android.content.Context;
import android.util.Base64;

import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/** Owns fixed local source snapshots used by the companion as a sync client. */
final class FolioleCompanionSyncIdentityClientView {
    private final Map<String, String> views = new ConcurrentHashMap<>();

    JSObject deviceIdentity(Context context, String databasePath) throws Exception {
        if (databasePath == null || databasePath.isEmpty()) {
            throw new IllegalArgumentException("database_path_required");
        }
        return new JSObject()
            .put("canonical_library_path", FolioleCompanionDeviceAnchorStore
                .canonicalLibraryPath(new File(databasePath)))
            .put("device_anchor", FolioleCompanionDeviceAnchorStore.loadOrCreate(context))
            .put("device_name", android.os.Build.MODEL)
            .put("path_flavor", "posix")
            .put("platform", "android-capacitor");
    }

    JSObject create(Context context) throws Exception {
        File snapshot = File.createTempFile("foliole-provider-source-", ".db", context.getCacheDir());
        if (!snapshot.delete()) throw new IllegalStateException("sync_identity_source_view_prepare_failed");
        String path = snapshot.getAbsolutePath();
        try {
            JSONObject result = FolioleCompanionSyncGroupDataBridge.current().request(
                "create_snapshot", new JSONObject().put("target_path", path)
                    .put("identity_index", true));
            if (!path.equals(result.optString("snapshot_path")) || !snapshot.isFile()) {
                throw new IllegalStateException("sync_identity_source_view_unavailable");
            }
            String viewId = UUID.nameUUIDFromBytes(path.getBytes(StandardCharsets.UTF_8)).toString();
            views.put(path, viewId);
            return new JSObject().put("snapshot_path", path).put("source_view_id", viewId);
        } catch (Exception failure) {
            if (snapshot.exists() && !snapshot.delete()) snapshot.deleteOnExit();
            throw failure;
        }
    }

    JSObject build(Context context, String path, JSONObject page) throws Exception {
        String viewId = views.get(path);
        if (viewId == null || !new File(path).isFile()) {
            throw new IllegalArgumentException("sync_identity_source_view_unavailable");
        }
        FolioleCompanionSyncGroupDataBridge.current().request("prepare_identity_pack",
            new JSONObject().put("snapshot_path", path).put("source_view_id", viewId)
                .put("authenticated_device_id", page.getString("target_peer_id"))
                .put("page", page));
        byte[] archive = FolioleCompanionSyncIdentityPackBuilder.build(context, path, page);
        return new JSObject().put("archive_base64url", Base64.encodeToString(archive,
            Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP));
    }

    JSObject close(String path) {
        if (views.remove(path) == null) {
            throw new IllegalArgumentException("sync_identity_source_view_unavailable");
        }
        File file = new File(path);
        if (file.exists() && !file.delete()) throw new IllegalStateException("sync_identity_source_view_cleanup_failed");
        return new JSObject().put("deleted", true);
    }

    void closeAll() {
        for (String path : views.keySet()) {
            try { close(path); } catch (Exception ignored) { new File(path).deleteOnExit(); }
        }
    }
}
