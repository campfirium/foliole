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
        if (!"com.foliole.android.acceptance".equals(context.getPackageName())) {
            throw new IllegalStateException("acceptance_sync_projection_identity_invalid");
        }
        String path = context.getDatabasePath(DATABASE_NAME).getPath();
        try (SQLiteDatabase database = SQLiteDatabase.openDatabase(
            path, null, SQLiteDatabase.OPEN_READONLY
        )) {
            String identity = scalar(database,
                "SELECT local_device_identity_key FROM sync_group_local_state " +
                    "WHERE singleton_id = 1 AND state = 'active' LIMIT 1");
            if (identity.isEmpty()) {
                throw new IllegalStateException("acceptance_sync_projection_device_missing");
            }
            JSONArray source = new JSONArray(scalar(database,
                "SELECT value FROM companion_meta " +
                    "WHERE key = 'workspace_sync_events' LIMIT 1"));
            JSONArray events = new JSONArray();
            for (int index = 0; index < source.length(); index += 1) {
                JSONObject event = source.optJSONObject(index);
                if (event == null || !"run_finished".equals(event.optString("kind"))) continue;
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
            return new JSONObject().put("application_id", context.getPackageName())
                .put("events", events).put("syncEventsProjected", true);
        }
    }

    private static String scalar(SQLiteDatabase database, String sql) {
        try (Cursor cursor = database.rawQuery(sql, null)) {
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
}
