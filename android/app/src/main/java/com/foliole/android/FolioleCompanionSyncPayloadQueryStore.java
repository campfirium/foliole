package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Iterator;
import java.util.Map;

final class FolioleCompanionSyncPayloadQueryStore {
    private static final String QUERY_ASSET_PATH = "companion-query-definitions.json";

    private FolioleCompanionSyncPayloadQueryStore() {}

    static String metadata(Context context, String queryName, String key) throws Exception {
        String value = loadQuery(context, queryName).getJSONObject("syncPayload").optString(key, "");
        if (value.trim().isEmpty()) {
            throw new IllegalStateException("Companion query definitions asset is missing sync payload metadata: " + queryName + "." + key);
        }
        return value;
    }

    static String viewActiveNodeKey(Context context) throws Exception {
        return metadata(context, "syncPayloadViewActiveNode", "objectIdKey");
    }

    static String viewActiveNodeWorkspaceMetaKey(Context context) throws Exception {
        return metadata(context, "syncPayloadViewActiveNode", "workspaceMetaKey");
    }

    static String viewNodeKeyPrefix(Context context) throws Exception {
        return metadata(context, "syncPayloadViewNodeState", "objectIdPrefix");
    }

    static JSObject loadRowsWithPayloads(
        Context context,
        SQLiteDatabase database,
        String queryName,
        String resultKey,
        Map<String, String> replacements,
        String[] args
    ) throws Exception {
        JSObject result = FolioleCompanionNamedQueryStore.loadArray(context, database, queryName, replacements, args);
        JSONArray rows = result.getJSONArray(resultKey);
        for (int index = 0; index < rows.length(); index += 1) {
            JSONObject row = rows.getJSONObject(index);
            row.put(
                "payload_json",
                row.isNull("deleted_at")
                    ? loadPayload(context, database, row.getString("object_type"), row.getString("object_id"))
                    : JSONObject.NULL
            );
        }
        return result;
    }

    private static String loadPayload(Context context, SQLiteDatabase database, String objectType, String objectId) throws Exception {
        String objectIdKey = objectIdKey(objectId);
        String queryName = queryName(context, objectType, objectIdKey);
        if (queryName == null) {
            return "{}";
        }
        String payload = FolioleCompanionNamedQueryStore.loadString(context, database, queryName, queryArgs(context, queryName, objectId, objectIdKey, objectIdDeviceId(objectId)));
        return payload == null ? "{}" : payload;
    }

    private static String queryName(Context context, String objectType, String objectIdKey) throws Exception {
        JSONObject queries = loadQueries(context);
        Iterator<String> names = queries.keys();
        while (names.hasNext()) {
            String queryName = names.next();
            if (matches(queries.getJSONObject(queryName), objectType, objectIdKey)) {
                return queryName;
            }
        }
        return null;
    }

    private static String[] queryArgs(Context context, String queryName, String objectId, String objectIdKey, String deviceId) throws Exception {
        JSONObject payload = loadQuery(context, queryName).getJSONObject("syncPayload");
        String argMode = payload.optString("argMode", "object_id");
        if (argMode.equals("none")) return null;
        if (argMode.equals("view_state_node")) {
            String prefix = metadata(context, queryName, "objectIdPrefix");
            return new String[] { objectIdKey.substring(prefix.length()), deviceId };
        }
        return new String[] { objectId };
    }

    private static JSONObject loadQuery(Context context, String queryName) throws Exception {
        JSONObject query = loadQueries(context).optJSONObject(queryName);
        if (query == null) {
            throw new IllegalStateException("Companion query definitions asset is missing query: " + queryName);
        }
        return query;
    }

    private static JSONObject loadQueries(Context context) throws Exception {
        JSONObject payload = new JSONObject(FolioleCompanionAssetReader.read(context, QUERY_ASSET_PATH));
        JSONObject queries = payload.optJSONObject("queries");
        if (queries == null) {
            throw new IllegalStateException("Companion query definitions asset is missing queries.");
        }
        return queries;
    }

    private static boolean matches(JSONObject query, String objectType, String objectIdKey) {
        JSONObject payload = query.optJSONObject("syncPayload");
        if (payload == null || !objectType.equals(payload.optString("objectType"))) return false;
        String exactKey = payload.optString("objectIdKey", "");
        if (!exactKey.isEmpty()) return exactKey.equals(objectIdKey);
        String prefix = payload.optString("objectIdPrefix", "");
        return prefix.isEmpty() || objectIdKey.startsWith(prefix);
    }

    private static String objectIdDeviceId(String objectId) {
        String[] parts = objectId.split(":", 5);
        return parts.length >= 4 ? parts[3] : "";
    }

    private static String objectIdKey(String objectId) {
        String[] parts = objectId.split(":", 5);
        return parts.length >= 5 ? parts[4] : objectId;
    }
}
