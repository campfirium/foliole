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
    static final String EXTERNAL_DOCUMENT_PAYLOAD_QUERY_NAME = "syncPayloadExternalDocument";
    static final String SETTING_PAYLOAD_QUERY_NAME = "syncPayloadSetting";
    static final String VIEW_ACTIVE_NODE_PAYLOAD_QUERY_NAME = "syncPayloadViewActiveNode";
    static final String VIEW_NODE_STATE_PAYLOAD_QUERY_NAME = "syncPayloadViewNodeState";

    private FolioleCompanionSyncPayloadQueryStore() {}

    static String metadata(Context context, String queryName, String key) throws Exception {
        String value = syncPayload(context, queryName).optString(key, "");
        if (value.trim().isEmpty() && !key.startsWith("default")) {
            throw new IllegalStateException("Companion query definitions asset is missing sync payload metadata: " + queryName + "." + key);
        }
        return value;
    }

    static String metadataArrayText(Context context, String queryName, String key) throws Exception {
        JSONArray values = syncPayload(context, queryName).optJSONArray(key);
        if (values == null) {
            throw new IllegalStateException("Companion query definitions asset is missing sync payload metadata: " + queryName + "." + key);
        }
        return values.toString();
    }

    static String viewActiveNodeKey(Context context) throws Exception {
        return metadata(context, VIEW_ACTIVE_NODE_PAYLOAD_QUERY_NAME, "objectIdKey");
    }

    static String viewActiveNodePayloadKey(Context context) throws Exception {
        return metadata(context, VIEW_ACTIVE_NODE_PAYLOAD_QUERY_NAME, "activeNodePayloadKey");
    }

    static String viewFormFactor(Context context) throws Exception {
        return metadata(context, VIEW_ACTIVE_NODE_PAYLOAD_QUERY_NAME, "formFactor");
    }

    static Set<String> viewHashIgnoredPayloadKeys(Context context) throws Exception {
        return metadataSet(context, VIEW_NODE_STATE_PAYLOAD_QUERY_NAME, "hashIgnoredPayloadKeys");
    }

    static String viewLocalSource(Context context) throws Exception {
        return metadata(context, VIEW_NODE_STATE_PAYLOAD_QUERY_NAME, "localSource");
    }

    static String viewNodeIdPayloadKey(Context context) throws Exception {
        return metadata(context, VIEW_NODE_STATE_PAYLOAD_QUERY_NAME, "nodeIdPayloadKey");
    }

    static String viewActiveNodeWorkspaceMetaKey(Context context) throws Exception {
        return metadata(context, VIEW_ACTIVE_NODE_PAYLOAD_QUERY_NAME, "workspaceMetaKey");
    }

    static String viewNodeKeyPrefix(Context context) throws Exception {
        return metadata(context, VIEW_NODE_STATE_PAYLOAD_QUERY_NAME, "objectIdPrefix");
    }

    static String viewPlatform(Context context) throws Exception {
        return metadata(context, VIEW_ACTIVE_NODE_PAYLOAD_QUERY_NAME, "platform");
    }

    static String viewScrollTopPayloadKey(Context context) throws Exception {
        return metadata(context, VIEW_NODE_STATE_PAYLOAD_QUERY_NAME, "scrollTopPayloadKey");
    }

    static String viewSelectionFromPayloadKey(Context context) throws Exception {
        return metadata(context, VIEW_NODE_STATE_PAYLOAD_QUERY_NAME, "selectionFromPayloadKey");
    }

    static String viewSelectionToPayloadKey(Context context) throws Exception {
        return metadata(context, VIEW_NODE_STATE_PAYLOAD_QUERY_NAME, "selectionToPayloadKey");
    }

    static String viewSourcePayloadKey(Context context) throws Exception {
        return metadata(context, VIEW_NODE_STATE_PAYLOAD_QUERY_NAME, "sourcePayloadKey");
    }

    static String viewSyncAppliedSource(Context context) throws Exception {
        return metadata(context, VIEW_NODE_STATE_PAYLOAD_QUERY_NAME, "appliedSource");
    }

    static String viewScope(Context context) throws Exception {
        return metadata(context, VIEW_ACTIVE_NODE_PAYLOAD_QUERY_NAME, "scope");
    }

    static String viewObjectId(Context context, String deviceId, String key) throws Exception {
        return scopedObjectId(context, viewScope(context), viewPlatform(context), viewFormFactor(context), deviceId, key);
    }

    static String scopedObjectId(Context context, String scope, String platform, String formFactor, String deviceId, String key) throws Exception {
        String delimiter = routingString(context, "objectIdDelimiter");
        return scope + delimiter + platform + delimiter + formFactor + delimiter + deviceId + delimiter + key;
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
        JSObject result = FolioleCompanionGeneratedQueryRunner.load(context, database, queryName, replacements, args);
        JSONArray rows = result.getJSONArray(resultKey);
        for (int index = 0; index < rows.length(); index += 1) {
            JSONObject row = rows.getJSONObject(index);
            row.put(
                routingString(context, "payloadJsonKey"),
                FolioleCompanionSyncPayloadRoutingRules.rowIsNull(context, row, "deletedAtKey")
                    ? loadPayload(
                        context,
                        database,
                        FolioleCompanionSyncPayloadRoutingRules.rowString(context, row, "objectTypeKey"),
                        FolioleCompanionSyncPayloadRoutingRules.rowString(context, row, "objectIdKey")
                    )
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
        String queryName = FolioleCompanionSyncPayloadRoutingRules.routeString(context, route, "queryNameKey");
        String[] args = queryArgs(context, route, objectId, objectIdKey, viewObjectIdDeviceId(context, objectId));
        if (loadQuery(context, queryName).optJSONArray(FolioleCompanionQueryDefinitionShapeKeys.queryKey(context, "columns")) != null) {
            JSONObject payload = FolioleCompanionGeneratedQueryRunner.loadFirstRow(context, database, queryName, args);
            return payload == null ? "{}" : payload.toString();
        }
        String payload = FolioleCompanionGeneratedQueryRunner.loadString(
            context,
            database,
            queryName,
            args
        );
        return payload == null ? "{}" : payload;
    }

    private static JSONObject syncPayloadRoute(Context context, String objectType, String objectIdKey) throws Exception {
        JSONArray routes = syncPayloadRouting(context).getJSONArray(FolioleCompanionQueryDefinitionShapeKeys.routingKey(context, "routes"));
        for (int index = 0; index < routes.length(); index += 1) {
            JSONObject route = routes.getJSONObject(index);
            if (matches(context, route, objectType, objectIdKey)) return route;
        }
        return null;
    }

    private static String[] queryArgs(Context context, JSONObject route, String objectId, String objectIdKey, String deviceId) throws Exception {
        String argMode = FolioleCompanionSyncPayloadRoutingRules.routeOptString(context, route, "argModeKey", "objectIdArgMode");
        if (argMode.equals(routingString(context, "noneArgMode"))) return null;
        if (argMode.equals(routingString(context, "viewStateNodeArgMode"))) {
            String prefix = FolioleCompanionSyncPayloadRoutingRules.routeString(context, route, "objectIdPrefixKey");
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
        JSONObject queries = loadDefinitions(context).optJSONObject(FolioleCompanionQueryAssetKeys.key(context, "queries"));
        if (queries == null) {
            throw new IllegalStateException("Companion query definitions asset is missing queries.");
        }
        return queries;
    }

    private static JSONObject loadDefinitions(Context context) throws Exception {
        return FolioleCompanionJsonAssetCache.object(context, QUERY_ASSET_PATH);
    }

    private static JSONObject syncPayloadRouting(Context context) throws Exception {
        JSONObject routing = loadDefinitions(context).optJSONObject(FolioleCompanionQueryAssetKeys.key(context, "syncPayloadRouting"));
        if (routing == null) {
            throw new IllegalStateException("Companion query definitions asset is missing sync payload routing.");
        }
        return routing;
    }

    private static JSONObject syncPayload(Context context, String queryName) throws Exception {
        return loadQuery(context, queryName).getJSONObject(FolioleCompanionQueryDefinitionShapeKeys.queryKey(context, "syncPayload"));
    }

    private static String routingString(Context context, String key) throws Exception {
        return FolioleCompanionSyncPayloadRoutingRules.string(context, key);
    }
    private static int routingInt(Context context, String key) throws Exception {
        return FolioleCompanionSyncPayloadRoutingRules.intValue(context, key);
    }

    private static Set<String> metadataSet(Context context, String queryName, String key) throws Exception {
        JSONArray values = syncPayload(context, queryName).getJSONArray(key);
        Set<String> result = new HashSet<>();
        for (int index = 0; index < values.length(); index += 1) {
            String value = values.getString(index).trim();
            if (!value.isEmpty()) result.add(value);
        }
        return result;
    }

    private static boolean matches(Context context, JSONObject route, String objectType, String objectIdKey) throws Exception {
        if (!objectType.equals(FolioleCompanionSyncPayloadRoutingRules.routeOptString(context, route, "objectTypeRouteKey"))) return false;
        String exactKey = FolioleCompanionSyncPayloadRoutingRules.routeOptString(context, route, "objectIdRouteKey");
        if (!exactKey.isEmpty()) return exactKey.equals(objectIdKey);
        String prefix = FolioleCompanionSyncPayloadRoutingRules.routeOptString(context, route, "objectIdPrefixKey");
        return prefix.isEmpty() || objectIdKey.startsWith(prefix);
    }

    private static String[] objectIdParts(Context context, String objectId) throws Exception {
        return objectId.split(Pattern.quote(routingString(context, "objectIdDelimiter")), routingInt(context, "objectIdPartLimit"));
    }
}
