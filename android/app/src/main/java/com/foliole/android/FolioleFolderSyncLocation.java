package com.foliole.android;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.provider.DocumentsContract;

import com.getcapacitor.JSObject;

import org.json.JSONObject;
import java.util.UUID;

final class FolioleFolderSyncLocation {
    private final Context context;
    private final SharedPreferences preferences;
    private static final FolioleFolderSyncLease active = new FolioleFolderSyncLease();

    FolioleFolderSyncLocation(Context context) {
        this.context = context;
        preferences = context.getSharedPreferences("foliole_folder_sync", Context.MODE_PRIVATE);
    }

    synchronized JSObject read() throws Exception {
        String token = preferences.getString("token", null);
        if (token == null) return null;
        Uri uri = Uri.parse(preferences.getString("uri", ""));
        boolean authorized = context.getContentResolver().getPersistedUriPermissions().stream()
            .anyMatch(permission -> permission.getUri().equals(uri) && permission.isReadPermission() && permission.isWritePermission());
        JSObject result = new JSObject().put("token", token).put("name", preferences.getString("name", ""))
            .put("authorized", authorized);
        String completion = preferences.getString("completion", null);
        result.put("completion", completion == null ? JSONObject.NULL : new JSONObject(completion));
        return result;
    }

    void select(Uri uri, int flags) throws Exception {
        synchronized (FolioleFolderSyncLocation.class) {
            if (active.busy()) throw new IllegalStateException("folder_sync_busy");
            int permissions = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
            if ((flags & permissions) != permissions || !DocumentsContract.isTreeUri(uri)) {
                throw new SecurityException("folder_sync_authorization_required");
            }
            context.getContentResolver().takePersistableUriPermission(uri, permissions);
            String name = "";
            Uri root = DocumentsContract.buildDocumentUriUsingTree(uri, DocumentsContract.getTreeDocumentId(uri));
            try (android.database.Cursor cursor = context.getContentResolver().query(root,
                    new String[] { DocumentsContract.Document.COLUMN_DISPLAY_NAME }, null, null, null)) {
                if (cursor == null || !cursor.moveToFirst()) throw new IllegalStateException("folder_sync_directory_unavailable");
                name = cursor.getString(0);
            }
            String oldUri = preferences.getString("uri", null);
            if (uri.toString().equals(oldUri)) return;
            if (!preferences.edit().putString("token", UUID.randomUUID().toString()).putString("uri", uri.toString())
                    .putString("name", name).remove("completion").commit()) throw new IllegalStateException("folder_sync_location_save_failed");
            if (oldUri != null) {
                try { context.getContentResolver().releasePersistableUriPermission(Uri.parse(oldUri), permissions); }
                catch (SecurityException ignored) { /* An already revoked old grant cannot be released again. */ }
            }
        }
    }

    String acquire(String token, Object owner, java.util.concurrent.Executor files) throws Exception {
        synchronized (FolioleFolderSyncLocation.class) {
            requireToken(token);
            return active.acquire(owner, files);
        }
    }

    void release(String token, String lease, Object owner) {
        synchronized (FolioleFolderSyncLocation.class) {
            active.release(lease, owner);
        }
    }

    void close(Object owner) { active.close(owner); }

    Uri requireLease(String token, String lease, Object owner) throws Exception {
        synchronized (FolioleFolderSyncLocation.class) {
            active.require(lease, owner);
            return requireToken(token);
        }
    }

    private Uri requireToken(String token) throws Exception {
        JSObject location = read();
        if (location == null || token == null || !token.equals(location.getString("token")) || !location.getBoolean("authorized")) {
            throw new SecurityException("folder_sync_authorization_required");
        }
        return Uri.parse(preferences.getString("uri", ""));
    }

    void complete(String token, String lease, Object owner, JSObject completion) throws Exception {
        synchronized (FolioleFolderSyncLocation.class) {
            requireLease(token, lease, owner);
            if (completion == null || completion.getString("sourceId", "").isEmpty()
                    || completion.getString("checkedAt", "").isEmpty() || completion.getLong("generation") <= 0
                    || completion.getInt("pendingResources") < 0) throw new IllegalArgumentException("folder_sync_completion_invalid");
            if (!preferences.edit().putString("completion", completion.toString()).commit()) throw new IllegalStateException("folder_sync_completion_save_failed");
        }
    }

    static void clear(Context context) throws Exception {
        synchronized (FolioleFolderSyncLocation.class) {
            if (active.busy()) throw new IllegalStateException("folder_sync_busy");
            SharedPreferences preferences = context.getSharedPreferences("foliole_folder_sync", Context.MODE_PRIVATE);
            String uri = preferences.getString("uri", null);
            if (!preferences.edit().clear().commit()) throw new IllegalStateException("folder_sync_location_save_failed");
            if (uri != null) {
                try { context.getContentResolver().releasePersistableUriPermission(Uri.parse(uri),
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION); }
                catch (SecurityException ignored) { /* Access may already have been revoked. */ }
            }
        }
    }
}
