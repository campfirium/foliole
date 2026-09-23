package com.foliole.android;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleAcceptanceSyncEventProjection {
    private static final String DATABASE_NAME = "foliole-companionSQLite.db";

    private FolioleAcceptanceSyncEventProjection() {}

    static JSONObject read(Context context) throws Exception {
        if (!isAcceptancePackage(context.getPackageName())) {
            throw new IllegalStateException("acceptance_sync_projection_identity_invalid");
        }
        String path = context.getDatabasePath(DATABASE_NAME).getPath();
        try (SQLiteDatabase database = SQLiteDatabase.openDatabase(
            path, null, SQLiteDatabase.OPEN_READONLY
        )) {
            String identity = scalar(database,
                "SELECT local_device_identity_key FROM sync_group_local_state " +
                    "WHERE singleton_id = 1 AND state = 'active' LIMIT 1");
            String groupId = scalar(database,
                "SELECT group_id FROM sync_group_local_state " +
                    "WHERE singleton_id = 1 AND state = 'active' LIMIT 1");
            if (identity.isEmpty()) {
                throw new IllegalStateException("acceptance_sync_projection_device_missing");
            }
            JSONArray source = new JSONArray(scalar(database,
                "SELECT value FROM companion_meta " +
                    "WHERE key = 'workspace_sync_events' LIMIT 1"));
            JSONArray events = new JSONArray();
            JSONArray sourceRuns = new JSONArray();
            JSONArray diagnosticEvents = new JSONArray();
            for (int index = 0; index < source.length(); index += 1) {
                JSONObject event = source.optJSONObject(index);
                if (event == null) continue;
                String kind = event.optString("kind");
                if (diagnosticEvents.length() < 16 &&
                    ("run_finished".equals(kind) || "stage_finished".equals(kind))) {
                    diagnosticEvents.put(new JSONObject()
                        .put("kind", kind)
                        .put("run_id", event.optString("run_id"))
                        .put("trigger_reason", event.optString("trigger_reason"))
                        .put("status", event.optString("status"))
                        .put("result", event.optString("result"))
                        .put("occurred_at", event.optString("occurred_at"))
                        .put("message", boundedMessage(event.optString("message"))));
                }
                if (!event.optString("run_id").isEmpty()) {
                    sourceRuns.put(new JSONObject()
                        .put("kind", event.optString("kind"))
                        .put("run_id", event.optString("run_id"))
                        .put("status", event.optString("status"))
                        .put("trigger_reason", event.optString("trigger_reason")));
                }
                if (!"run_finished".equals(event.optString("kind"))) continue;
                JSONObject projected = new JSONObject()
                    .put("device_identity_key", identity)
                    .put("run_id", required(event, "run_id"))
                    .put("trigger_reason", required(event, "trigger_reason"))
                    .put("status", required(event, "status"));
                copy(event, projected, "result");
                copy(event, projected, "started_at");
                copy(event, projected, "occurred_at");
                if (!projected.has("started_at") && !projected.has("occurred_at")) {
                    throw new IllegalStateException("acceptance_sync_projection_time_missing");
                }
                events.put(projected);
            }
            JSONObject result = new JSONObject().put("application_id", context.getPackageName())
                .put("group_id", groupId).put("diagnostic_events", diagnosticEvents)
                .put("events", events).put("source_runs", sourceRuns)
                .put("syncEventsProjected", true);
            if ("com.foliole.android.t250dense".equals(context.getPackageName())) {
                result.put("dense_facts", denseFacts(database));
            }
            return result;
        }
    }

    private static JSONObject denseFacts(SQLiteDatabase database) throws Exception {
        String articleId = scalar(database, "SELECT id FROM nodes WHERE " +
            "title='T234 Dense Annotation Fixture 20260924' AND deleted_at IS NULL LIMIT 1");
        if (articleId.isEmpty()) throw new IllegalStateException("t250_dense_article_missing");
        String[] article = { articleId };
        String children = scalar(database,
            "SELECT COUNT(*) FROM nodes WHERE parent_id=? AND deleted_at IS NULL", article);
        String readyBodies = scalar(database,
            "SELECT COUNT(*) FROM nodes n LEFT JOIN content_blob_data cbd " +
                "ON cbd.hash=n.body_blob_hash WHERE n.parent_id=? AND n.deleted_at IS NULL " +
                "AND (n.body_blob_hash IS NULL OR cbd.hash IS NOT NULL)", article);
        String targetNote = scalar(database,
            "SELECT CASE WHEN COALESCE(CAST(cbd.data AS TEXT), n.content) " +
                "LIKE '%※ T250 note 0175%' THEN 'true' ELSE 'false' END " +
                "FROM nodes n LEFT JOIN content_blob_data cbd ON cbd.hash=n.body_blob_hash " +
                "WHERE n.parent_id=? AND n.title='T234 unique passage 0175' LIMIT 1", article);
        return new JSONObject().put("article_id", articleId)
            .put("node_count", Integer.parseInt(scalar(database, "SELECT COUNT(*) FROM nodes")))
            .put("child_count", Integer.parseInt(children))
            .put("ready_child_body_count", Integer.parseInt(readyBodies))
            .put("target_note_matches", "true".equals(targetNote));
    }

    static boolean isAcceptancePackage(String packageName) {
        return "com.foliole.android.acceptance".equals(packageName)
            || "com.foliole.android.s220acceptance".equals(packageName)
            || "com.foliole.android.t250dense".equals(packageName);
    }

    private static String scalar(SQLiteDatabase database, String sql) {
        return scalar(database, sql, null);
    }

    private static String scalar(SQLiteDatabase database, String sql, String[] args) {
        try (Cursor cursor = database.rawQuery(sql, args)) {
            return cursor.moveToFirst() && !cursor.isNull(0) ? cursor.getString(0) : "";
        }
    }

    private static String required(JSONObject source, String key) {
        String value = source.optString(key);
        if (value.isEmpty()) throw new IllegalStateException(
            "acceptance_sync_projection_" + key + "_missing");
        return value;
    }

    private static void copy(JSONObject source, JSONObject target, String key) throws Exception {
        if (source.has(key) && !source.isNull(key)) target.put(key, source.get(key));
    }

    private static String boundedMessage(String message) {
        return message.length() <= 240 ? message : message.substring(0, 240);
    }
}
