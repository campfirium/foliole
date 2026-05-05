package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

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

    static String viewActiveNodePayloadKey(Context context) throws Exception {
        return metadata(context, "syncPayloadViewActiveNode", "activeNodePayloadKey");
    }

    static String viewFormFactor(Context context) throws Exception {
        return metadata(context, "syncPayloadViewActiveNode", "formFactor");
    }

    static Set<String> viewHashIgnoredPayloadKeys(Context context) throws Exception {
        return metadataSet(context, "syncPayloadViewNodeState", "hashIgnoredPayloadKeys");
    }

    static String viewLocalSource(Context context) throws Exception {
        return metadata(context, "syncPayloadViewNodeState", "localSource");
    }

    static String viewNodeIdPayloadKey(Context context) throws Exception {
        return metadata(context, "syncPayloadViewNodeState", "nodeIdPayloadKey");
    }

    static String viewActiveNodeWorkspaceMetaKey(Context context) throws Exception {
        return metadata(context, "syncPayloadViewActiveNode", "workspaceMetaKey");
    }

    static String viewNodeKeyPrefix(Context context) throws Exception {
        return metadata(context, "syncPayloadViewNodeState", "objectIdPrefix");
    }

    static String viewPlatform(Context context) throws Exception {
        return metadata(context, "syncPayloadViewActiveNode", "platform");
    }

    static String viewScrollTopPayloadKey(Context context) throws Exception {
        return metadata(context, "syncPayloadViewNodeState", "scrollTopPayloadKey");
    }

    static String viewSelectionFromPayloadKey(Context context) throws Exception {
        return metadata(context, "syncPayloadViewNodeState", "selectionFromPayloadKey");
    }

    static String viewSelectionToPayloadKey(Context context) throws Exception {
        return metadata(context, "syncPayloadViewNodeState", "selectionToPayloadKey");
    }

    static String viewSourcePayloadKey(Context context) throws Exception {
        return metadata(context, "syncPayloadViewNodeState", "sourcePayloadKey");
    }

    static String viewSyncAppliedSource(Context context) throws Exception {
        return metadata(context, "syncPayloadViewNodeState", "appliedSource");
    }

    static String viewScope(Context context) throws Exception {
        return metadata(context, "syncPayloadViewActiveNode", "scope");
    }

    static String viewObjectId(Context context, String deviceId, String key) throws Exception {
        String delimiter = routingString(context, "objectIdDelimiter");
        return viewScope(context) + delimiter + viewPlatform(context) + delimiter + viewFormFactor(context) + delimiter + deviceId + delimiter + key;
    }

    static String viewObjectIdKey(Context context, String objectId) throws Exception {
        String[] parts = objectIdParts(context, objectId);
        int keyIndex = routingInt(context, "objectIdKeyPartIndex");
        return parts.length == routingInt(context, "objectIdPartLimit") ? parts[keyIndex] : objectId;
    }

    static String viewObjectIdDeviceId(Context context, String objectId) throws Exception {
        String[] parts = objectIdParts(context, objectId);
        int deviceIndex = routingInt(context, "objectIdDeviceIdPartIndex");
        return parts.length == routingInt(context, "objectIdPartLimit") ? parts[deviceIndex] : routingString(context, "defaultDeviceId");
    }

    static boolean isViewNodeKey(Context context, String key) throws Exception {
        return key.startsWith(viewNodeKeyPrefix(context));
    }

    static String viewNodeIdFromKey(Context context, String key) throws Exception {
        return key.substring(viewNodeKeyPrefix(context).length());
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
        String objectIdKey = viewObjectIdKey(context, objectId);
        JSONObject route = syncPayloadRoute(context, objectType, objectIdKey);
        if (route == null) {
            return "{}";
        }
        String queryName = route.getString("queryName");
        String payload = FolioleCompanionNamedQueryStore.loadString(
            context,
            database,
            queryName,
            queryArgs(context, route, objectId, objectIdKey, viewObjectIdDeviceId(context, objectId))
        );
        return payload == null ? "{}" : payload;
    }

    private static JSONObject syncPayloadRoute(Context context, String objectType, String objectIdKey) throws Exception {
        JSONArray routes = syncPayloadRouting(context).getJSONArray("routes");
        for (int index = 0; index < routes.length(); index += 1) {
            JSONObject route = routes.getJSONObject(index);
            if (matches(route, objectType, objectIdKey)) return route;
        }
        return null;
    }

    private static String[] queryArgs(Context context, JSONObject route, String objectId, String objectIdKey, String deviceId) throws Exception {
        String argMode = route.optString("argMode", "object_id");
        if (argMode.equals("none")) return null;
        if (argMode.equals("view_state_node")) {
            String prefix = route.getString("objectIdPrefix");
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
        JSONObject queries = loadDefinitions(context).optJSONObject("queries");
        if (queries == null) {
            throw new IllegalStateException("Companion query definitions asset is missing queries.");
        }
        return queries;
    }

    private static JSONObject loadDefinitions(Context context) throws Exception {
        return new JSONObject(FolioleCompanionAssetReader.read(context, QUERY_ASSET_PATH));
    }

    private static JSONObject syncPayloadRouting(Context context) throws Exception {
        JSONObject routing = loadDefinitions(context).optJSONObject("syncPayloadRouting");
        if (routing == null) {
            throw new IllegalStateException("Companion query definitions asset is missing sync payload routing.");
        }
        return routing;
    }

    private static String routingString(Context context, String key) throws Exception {
        String value = syncPayloadRouting(context).optString(key, "");
        if (value.isEmpty()) {
            throw new IllegalStateException("Companion query definitions asset is missing sync payload routing value: " + key);
        }
        return value;
    }

    private static int routingInt(Context context, String key) throws Exception {
        JSONObject routing = syncPayloadRouting(context);
        if (!routing.has(key)) {
            throw new IllegalStateException("Companion query definitions asset is missing sync payload routing value: " + key);
        }
        return routing.getInt(key);
    }

    private static Set<String> metadataSet(Context context, String queryName, String key) throws Exception {
        JSONArray values = loadQuery(context, queryName).getJSONObject("syncPayload").getJSONArray(key);
        Set<String> result = new HashSet<>();
        for (int index = 0; index < values.length(); index += 1) {
            String value = values.getString(index).trim();
            if (!value.isEmpty()) result.add(value);
        }
        return result;
    }

    private static boolean matches(JSONObject route, String objectType, String objectIdKey) {
        if (!objectType.equals(route.optString("objectType"))) return false;
        String exactKey = route.optString("objectIdKey", "");
        if (!exactKey.isEmpty()) return exactKey.equals(objectIdKey);
        String prefix = route.optString("objectIdPrefix", "");
        return prefix.isEmpty() || objectIdKey.startsWith(prefix);
    }

    private static String[] objectIdParts(Context context, String objectId) throws Exception {
        return objectId.split(Pattern.quote(routingString(context, "objectIdDelimiter")), routingInt(context, "objectIdPartLimit"));
    }
}
