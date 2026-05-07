package com.foliole.android;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionWorkspaceReadQueryRules {
    private FolioleCompanionWorkspaceReadQueryRules() {}

    static String snapshotString(Context context, String key) throws Exception {
        return stringValue("snapshot", key);
    }

    static JSONObject snapshotObject(Context context, String key) throws Exception {
        return group(context, "snapshot").getJSONObject(key);
    }

    static String snapshotOutputKey(Context context, String key) throws Exception {
        return nestedStringValue("snapshot", "outputKeys", key);
    }

    static String snapshotRowString(Context context, JSONObject row, String key) throws Exception {
        return row.getString(snapshotString(context, key));
    }

    static String snapshotRowNullableString(Context context, JSONObject row, String key) throws Exception {
        String rowKey = snapshotString(context, key);
        return row.isNull(rowKey) ? null : row.getString(rowKey);
    }

    static String nestedPayloadOutputKey(Context context, String groupName) throws Exception {
        return snapshotObject(context, groupName).getString(nestedPayloadKey(context, "outputKey"));
    }

    static String nestedPayloadStateRowKey(Context context, JSONObject rules) throws Exception {
        return rules.getString(nestedPayloadKey(context, "stateRowKey"));
    }

    static String nestedPayloadStateRowOptString(Context context, JSONObject row, JSONObject rules) throws Exception {
        return row.optString(nestedPayloadStateRowKey(context, rules), null);
    }

    static String nodePayloadAttachmentsOutputKey(Context context, JSONObject rules) throws Exception {
        return rules.getString(nodePayloadKey(context, "attachmentsOutputKey"));
    }

    static String nodePayloadBodyStatusOutputKey(Context context, JSONObject rules) throws Exception {
        return rules.getString(nodePayloadKey(context, "bodyStatusOutputKey"));
    }

    static String nodePayloadBodyStatusRowKey(Context context, JSONObject rules) throws Exception {
        return rules.getString(nodePayloadKey(context, "bodyStatusRowKey"));
    }

    static String nodePayloadBodyStatusRowString(Context context, JSONObject row, JSONObject rules) throws Exception {
        return row.getString(nodePayloadBodyStatusRowKey(context, rules));
    }

    static String nodePayloadDefaultKind(Context context, JSONObject rules) throws Exception {
        return rules.getString(nodePayloadKey(context, "defaultKind"));
    }

    static String nodePayloadDefaultTitle(Context context, JSONObject rules) throws Exception {
        return rules.getString(nodePayloadKey(context, "defaultTitle"));
    }

    static JSONArray nodePayloadValidKinds(Context context, JSONObject rules) throws Exception {
        return rules.getJSONArray(nodePayloadKey(context, "validKinds"));
    }

    static String nodePayloadVisibleBodyStatusGroup(Context context, JSONObject rules) throws Exception {
        return rules.getString(nodePayloadKey(context, "visibleBodyStatusGroup"));
    }

    static String viewStateString(Context context, String key) throws Exception {
        return stringValue("viewState", key);
    }

    static JSONArray viewStateArray(Context context, String key) throws Exception {
        return group(context, "viewState").getJSONArray(key);
    }

    static String viewStateRowString(Context context, JSONObject row, String key) throws Exception {
        return row.getString(viewStateString(context, key));
    }

    private static JSONObject group(Context context, String groupName) throws Exception {
        return FolioleCompanionQueryAssetKeys.ruleGroup(context, "workspaceRead", groupName);
    }

    private static String stringValue(String groupName, String key) {
        return FolioleCompanionResourceQueryStringKeys.string("workspaceRead", groupName, key);
    }

    private static String nestedStringValue(String groupName, String objectName, String key) {
        return FolioleCompanionResourceQueryStringKeys.nestedString("workspaceRead", groupName, objectName, key);
    }

    private static String nestedPayloadKey(Context context, String key) throws Exception {
        return snapshotShape(context, "nestedPayload").getString(key);
    }

    private static String nodePayloadKey(Context context, String key) throws Exception {
        return snapshotShape(context, "nodePayload").getString(key);
    }

    private static JSONObject snapshotShape(Context context, String groupName) throws Exception {
        return FolioleCompanionQueryAssetKeys.section(context, "workspaceRead").getJSONObject("snapshotShape").getJSONObject(groupName);
    }
}
