package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import org.json.JSONArray;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

final class FolioleMobileLinkStateAudit {
    private final Map<String, Map<String, JSONObject>> before;
    private final String host;
    private final long startedAt = System.currentTimeMillis();

    FolioleMobileLinkStateAudit(Context context) throws Exception {
        before = read(context);
        host = before.get("companion_meta").get("host_name").getString("value");
    }

    JSONArray verify(Context context, List<String> topics) throws Exception {
        Map<String, Map<String, JSONObject>> after = read(context);
        JSONArray changes = new JSONArray();
        for (String table : before.keySet()) {
            Map<String, JSONObject> previous = before.get(table);
            Map<String, JSONObject> current = after.get(table);
            assertTrue("No state rows may disappear: " + table, current.keySet().containsAll(previous.keySet()));
            for (String key : current.keySet()) {
                JSONObject row = current.get(key);
                JSONObject old = previous.get(key);
                if (old != null && old.toString().equals(row.toString())) continue;
                validate(table, key, old, row, after, topics);
                changes.put(new JSONObject().put("table", table).put("key", key).put("after", row));
            }
        }
        assertEquals(topics.get(0), after.get("workspace_meta").get("active_node_id").getString("value"));
        return changes;
    }

    private void validate(String table, String key, JSONObject old, JSONObject row,
        Map<String, Map<String, JSONObject>> after, List<String> topics) throws Exception {
        if (table.equals("companion_meta")) {
            // Bootstrap and the existing workspace-state writer refresh these timestamps.
            assertTrue(java.util.Arrays.asList("host_name", "workspace_sync_endpoint_url",
                "workspace_sync_events", "workspace_sync_last_synced_at",
                "workspace_sync_onboarding_status", "workspace_sync_remembered_targets").contains(key));
            assertTrue(old != null);
            assertEquals("Metadata values must remain unchanged: " + key, old.getString("value"), row.getString("value"));
            fresh(row.getString("updated_at"));
        } else if (table.equals("workspace_meta")) {
            assertEquals("active_node_id", key);
            assertTrue(topics.contains(row.getString("value")));
            fresh(row.getString("updated_at"));
        } else if (table.equals("node_open_state")) {
            assertTrue("Only opened topics may change", topics.contains(key));
            fresh(row.getString("last_opened_at"));
        } else if (table.equals("node_view_state")) {
            assertTrue(topics.contains(row.getString("node_id")));
            assertEquals(host, row.getString("host_name"));
            assertTrue(row.getInt("scroll_top") >= 0);
            assertTrue(row.isNull("selection_from") && row.isNull("selection_to"));
            assertEquals("user-scroll", row.getString("source"));
            fresh(row.getString("updated_at"));
        } else {
            validateSync(old, row, after, topics);
        }
    }

    private void validateSync(JSONObject old, JSONObject row,
        Map<String, Map<String, JSONObject>> after, List<String> topics) throws Exception {
        String type = row.getString("object_type");
        String id = row.getString("object_id");
        JSONObject payload;
        if (type.equals("node_open_state")) {
            assertTrue(topics.contains(id));
            JSONObject opened = after.get("node_open_state").get(id);
            assertTrue("Open state must exist", opened != null);
            payload = new JSONObject().put("node_id", id).put("last_opened_at", opened.getString("last_opened_at"));
        } else {
            assertEquals("view_state", type);
            String prefix = "session_resume:android:phone:" + host + ":";
            assertTrue(id.startsWith(prefix));
            String key = id.substring(prefix.length());
            payload = new JSONObject().put("host_name", host).put("form_factor", "phone")
                .put("key", key).put("platform", "android").put("scope", "session_resume");
            if (key.equals("active_node")) {
                payload.put("active_node_id", after.get("workspace_meta").get("active_node_id").getString("value"));
            } else {
                assertTrue(key.startsWith("node:") && topics.contains(key.substring(5)));
                JSONObject view = after.get("node_view_state").get(key.substring(5) + "|" + host);
                assertTrue(view != null);
                payload.put("node_id", view.getString("node_id")).put("scroll_top", view.getInt("scroll_top"))
                    .put("selection_from", JSONObject.NULL).put("selection_to", JSONObject.NULL);
            }
        }
        assertEquals(hash(payload), row.getString("content_hash"));
        assertEquals(host, row.getString("last_modified_by_host_name"));
        assertEquals(1, row.getInt("sync_dirty"));
        assertTrue(row.isNull("deleted_at") && row.isNull("current_version_id"));
        assertTrue(old == null || row.getLong("state_seq") > old.getLong("state_seq"));
        Object base = old == null ? JSONObject.NULL : old.get("content_hash");
        if (old != null && old.getInt("sync_dirty") == 1 && !old.isNull("base_content_hash")) base = old.get("base_content_hash");
        if (old != null) assertEquals(base.toString(), row.get("base_content_hash").toString());
        else assertTrue(row.isNull("base_content_hash") || row.getString("base_content_hash").matches("[a-f0-9]{64}"));
        fresh(row.getString("updated_at"));
    }

    private void fresh(String timestamp) {
        long millis = java.time.Instant.parse(timestamp).toEpochMilli();
        assertTrue("Timestamp belongs to this navigation run", millis >= startedAt && millis <= System.currentTimeMillis());
    }

    private static String hash(JSONObject payload) throws Exception {
        Map<String, String> values = new TreeMap<>();
        for (java.util.Iterator<String> keys = payload.keys(); keys.hasNext();) {
            String key = keys.next();
            String encoded = new JSONArray().put(payload.get(key)).toString();
            values.put(key, JSONObject.quote(key) + ":" + encoded.substring(1, encoded.length() - 1));
        }
        String canonical = "{" + String.join(",", values.values()) + "}";
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8));
        StringBuilder result = new StringBuilder();
        for (byte value : digest) result.append(String.format("%02x", value & 0xff));
        return result.toString();
    }

    private static Map<String, Map<String, JSONObject>> read(Context context) throws Exception {
        Map<String, Map<String, JSONObject>> result = new TreeMap<>();
        String path = context.getDatabasePath("foliole-companionSQLite.db").getAbsolutePath();
        try (SQLiteDatabase db = SQLiteDatabase.openDatabase(path, null, SQLiteDatabase.OPEN_READONLY)) {
            for (String table : new String[] { "companion_meta", "workspace_meta", "node_open_state", "node_view_state", "sync_object_state" }) {
                Map<String, JSONObject> rows = new TreeMap<>();
                try (Cursor cursor = db.rawQuery("SELECT * FROM " + table, null)) {
                    while (cursor.moveToNext()) {
                        JSONObject row = new JSONObject();
                        for (int index = 0; index < cursor.getColumnCount(); index++) {
                            row.put(cursor.getColumnName(index), cursor.isNull(index) ? JSONObject.NULL : cursor.getString(index));
                        }
                        String key = table.endsWith("meta") ? row.getString("key") : row.getString(table.equals("sync_object_state") ? "object_id" : "node_id");
                        if (table.equals("node_view_state")) key += "|" + row.getString("host_name");
                        if (table.equals("sync_object_state")) key = row.getString("object_type") + "|" + key;
                        rows.put(key, row);
                    }
                }
                result.put(table, rows);
            }
        }
        return result;
    }
}
