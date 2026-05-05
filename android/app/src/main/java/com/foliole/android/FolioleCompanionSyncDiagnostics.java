package com.foliole.android;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Instant;

final class FolioleCompanionSyncDiagnostics {
    private FolioleCompanionSyncDiagnostics() {}

    static JSObject diagnose(Context context, SQLiteDatabase database, String databasePath) throws Exception {
        String collectedAt = Instant.now().toString();
        JSObject storage = loadStorage(database);
        JSObject syncState = loadSyncState(database);
        JSObject connection = loadConnection(context, database);
        JSObject result = new JSObject();
        result.put("collected_at", collectedAt);
        result.put("host", "android");
        result.put("identity", loadIdentity(context, databasePath));
        result.put("connection", connection);
        result.put("storage", storage);
        result.put("sync_state", syncState);
        JSObject content = loadContent(database);
        JSArray events = loadEvents(database);
        result.put("content", content);
        result.put("events", events);
        result.put("verdicts", buildVerdicts(connection, storage, syncState, content, events));
        return result;
    }

    private static JSObject loadIdentity(Context context, String databasePath) throws Exception {
        JSObject pairing = FolioleCompanionPairingStore.loadPairingState(context);
        JSObject identity = new JSObject();
        identity.put("app_version", null);
        identity.put("database_path", databasePath);
        identity.put("device_id", pairing.optString("device_id", null));
        identity.put("device_name", pairing.optString("device_name", null));
        return identity;
    }

    private static JSObject loadConnection(Context context, SQLiteDatabase database) throws Exception {
        JSObject pairing = FolioleCompanionPairingStore.loadPairingState(context);
        String endpointUrl = loadMetaValue(database, "workspace_sync_endpoint_url");
        JSObject connection = new JSObject();
        connection.put("endpoint_url", endpointUrl == null ? JSONObject.NULL : endpointUrl);
        connection.put("last_error", JSONObject.NULL);
        connection.put("state", pairing.optBoolean("is_paired", false) && endpointUrl != null ? "ready" : "missing");
        return connection;
    }

    private static JSObject loadStorage(SQLiteDatabase database) throws Exception {
        JSObject storage = new JSObject();
        storage.put("active_node_count", count(database, "SELECT COUNT(*) FROM nodes WHERE deleted_at IS NULL"));
        storage.put("external_document_count", count(database, "SELECT COUNT(*) FROM external_documents"));
        storage.put("content_blob_count", count(database, "SELECT COUNT(*) FROM content_blobs"));
        storage.put("missing_node_state_count", count(database,
            "SELECT COUNT(*) FROM nodes n LEFT JOIN sync_object_state s " +
                "ON s.object_type = 'node' AND s.object_id = n.id " +
                "WHERE n.deleted_at IS NULL AND s.object_id IS NULL"
        ));
        storage.put("missing_node_version_count", count(database,
            "SELECT COUNT(*) FROM nodes WHERE deleted_at IS NULL " +
                "AND (current_version_id IS NULL OR current_version_id = '')"
        ));
        storage.put("node_blob_references_missing_rows", count(database,
            "SELECT COUNT(*) FROM nodes n LEFT JOIN content_blobs cb ON cb.hash = n.body_blob_hash " +
                "WHERE n.deleted_at IS NULL AND n.body_blob_hash IS NOT NULL AND cb.hash IS NULL"
        ));
        return storage;
    }

    private static JSObject loadSyncState(SQLiteDatabase database) throws Exception {
        JSObject state = new JSObject();
        int cursor = loadNumberMetaValue(database, "sync_pack_cursor");
        long maxStateSeq = count(database, "SELECT COALESCE(MAX(state_seq), 0) FROM sync_object_state");
        state.put("pack_cursor", cursor <= 0 ? JSONObject.NULL : cursor);
        state.put("max_state_seq", maxStateSeq <= 0 ? JSONObject.NULL : maxStateSeq);
        state.put("local_dirty_count", count(database, "SELECT COUNT(*) FROM sync_object_state WHERE sync_dirty = 1"));
        state.put("state_counts", loadStateCounts(database));
        return state;
    }

    private static JSObject loadContent(SQLiteDatabase database) throws Exception {
        JSObject content = new JSObject();
        content.put("missing_content_blob_count", count(database,
            "SELECT COUNT(*) FROM content_blobs WHERE availability <> 'cached'"
        ));
        content.put("active_topic", loadActiveTopic(database));
        content.put("recent_topics", loadRecentTopics(database));
        return content;
    }

    private static JSObject loadActiveTopic(SQLiteDatabase database) throws Exception {
        String activeNodeId = loadWorkspaceMetaValue(database, "active_node_id");
        if (activeNodeId == null) {
            return null;
        }
        try (Cursor cursor = database.rawQuery(
            "SELECT n.id, n.title, CASE " +
                "WHEN n.body_blob_hash IS NOT NULL AND cbd.hash IS NULL AND cb.availability IN ('fetching', 'failed') THEN cb.availability " +
                "WHEN n.body_blob_hash IS NOT NULL AND cbd.hash IS NULL THEN 'missing' " +
                "WHEN TRIM(COALESCE(CAST(cbd.data AS TEXT), n.content)) = '' THEN 'empty' ELSE 'ready' END " +
            "FROM nodes n " +
            "LEFT JOIN content_blobs cb ON cb.hash = n.body_blob_hash " +
            "LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash " +
            "WHERE n.id = ? AND n.deleted_at IS NULL LIMIT 1",
            new String[] { activeNodeId }
        )) {
            if (!cursor.moveToFirst()) {
                return null;
            }
            JSObject row = new JSObject();
            row.put("id", cursor.getString(0));
            row.put("title", cursor.getString(1));
            row.put("body_status", cursor.getString(2));
            return row;
        }
    }

    private static JSArray loadStateCounts(SQLiteDatabase database) throws Exception {
        JSArray items = new JSArray();
        try (Cursor cursor = database.rawQuery(
            "SELECT object_type, COUNT(*), MIN(state_seq), MAX(state_seq) " +
                "FROM sync_object_state GROUP BY object_type ORDER BY object_type ASC",
            null
        )) {
            while (cursor.moveToNext()) {
                JSObject row = new JSObject();
                row.put("object_type", cursor.getString(0));
                row.put("count", cursor.getLong(1));
                row.put("min_state_seq", cursor.isNull(2) ? JSONObject.NULL : cursor.getLong(2));
                row.put("max_state_seq", cursor.isNull(3) ? JSONObject.NULL : cursor.getLong(3));
                items.put(row);
            }
        }
        return items;
    }

    private static JSArray loadRecentTopics(SQLiteDatabase database) throws Exception {
        JSArray items = new JSArray();
        try (Cursor cursor = database.rawQuery(
            "SELECT n.id, n.title, n.body_blob_hash, cb.availability FROM nodes n " +
                "LEFT JOIN content_blobs cb ON cb.hash = n.body_blob_hash " +
                "WHERE n.deleted_at IS NULL ORDER BY n.updated_at DESC LIMIT 20",
            null
        )) {
            while (cursor.moveToNext()) {
                JSObject row = new JSObject();
                row.put("id", cursor.getString(0));
                row.put("title", cursor.getString(1));
                row.put("body_blob_hash", cursor.isNull(2) ? JSONObject.NULL : cursor.getString(2));
                row.put("blob_availability", cursor.isNull(3) ? JSONObject.NULL : cursor.getString(3));
                items.put(row);
            }
        }
        return items;
    }

    private static JSArray loadEvents(SQLiteDatabase database) throws Exception {
        String stored = loadMetaValue(database, "workspace_sync_events");
        if (stored == null) {
            return new JSArray();
        }
        JSONArray storedEvents = new JSONArray(stored);
        JSArray events = new JSArray();
        for (int index = 0; index < storedEvents.length(); index += 1) {
            events.put(storedEvents.get(index));
        }
        return events;
    }

    private static JSArray buildVerdicts(
        JSObject connection,
        JSObject storage,
        JSObject syncState,
        JSObject content,
        JSArray events
    ) {
        JSArray verdicts = new JSArray();
        if (connection.optString("endpoint_url", null) == null) {
            addVerdict(verdicts, "android_endpoint_missing", "warning", "This device has no desktop sync address.", connection);
        }
        if (!syncState.has("pack_cursor") || syncState.isNull("pack_cursor")) {
            addVerdict(verdicts, "android_pack_cursor_missing", "info", "This device has not applied a sync pack yet.", syncState);
        }
        if (storage.optLong("active_node_count", 0) == 0 && hasCompletedEvent(events)) {
            addVerdict(verdicts, "android_no_nodes_after_completed_sync", "error", "Completed sync left no topics on this device.", storage);
        }
        if (content.optLong("missing_content_blob_count", 0) > 0) {
            addVerdict(verdicts, "android_missing_content_blobs", "warning", "Some content blobs are not cached.", content);
        }
        JSONObject failed = recentFailedEvent(events);
        if (failed != null) {
            JSObject evidence = new JSObject();
            evidence.put("message", failed.optString("message"));
            evidence.put("occurred_at", failed.optString("occurred_at"));
            addVerdict(verdicts, "android_recent_sync_failed", "error", "Recent sync activity failed.", evidence);
        }
        if (syncState.optLong("local_dirty_count", 0) > 0) {
            addVerdict(verdicts, "android_has_local_dirty_state", "info", "This device has local changes waiting to push.", syncState);
        }
        if (verdicts.length() == 0) {
            addVerdict(verdicts, "android_ready", "ok", "Android sync state is readable.", storage);
        }
        return verdicts;
    }

    private static boolean hasCompletedEvent(JSArray events) {
        for (int index = 0; index < events.length(); index += 1) {
            JSONObject event = events.optJSONObject(index);
            if (event != null && "completed".equals(event.optString("status"))) {
                return true;
            }
        }
        return false;
    }

    private static JSONObject recentFailedEvent(JSArray events) {
        for (int index = 0; index < events.length(); index += 1) {
            JSONObject event = events.optJSONObject(index);
            if (event != null && "failed".equals(event.optString("status"))) {
                return event;
            }
        }
        return null;
    }

    private static void addVerdict(JSArray verdicts, String code, String severity, String message, JSObject evidence) {
        JSObject verdict = new JSObject();
        verdict.put("code", code);
        verdict.put("severity", severity);
        verdict.put("message", message);
        verdict.put("evidence", evidence);
        verdicts.put(verdict);
    }

    private static long count(SQLiteDatabase database, String sql) {
        try (Cursor cursor = database.rawQuery(sql, null)) {
            return cursor.moveToFirst() ? cursor.getLong(0) : 0L;
        }
    }

    private static int loadNumberMetaValue(SQLiteDatabase database, String key) {
        String stored = loadMetaValue(database, key);
        return stored == null ? 0 : Math.max(0, Integer.parseInt(stored));
    }

    private static String loadMetaValue(SQLiteDatabase database, String key) {
        try (Cursor cursor = database.rawQuery(
            "SELECT value FROM companion_meta WHERE key = ? LIMIT 1",
            new String[] { key }
        )) {
            if (!cursor.moveToFirst()) {
                return null;
            }
            String value = cursor.getString(0);
            return value == null || value.trim().isEmpty() ? null : value;
        }
    }

    private static String loadWorkspaceMetaValue(SQLiteDatabase database, String key) {
        try (Cursor cursor = database.rawQuery(
            "SELECT value FROM workspace_meta WHERE key = ? LIMIT 1",
            new String[] { key }
        )) {
            if (!cursor.moveToFirst()) {
                return null;
            }
            String value = cursor.getString(0);
            return value == null || value.trim().isEmpty() ? null : value;
        }
    }
}
