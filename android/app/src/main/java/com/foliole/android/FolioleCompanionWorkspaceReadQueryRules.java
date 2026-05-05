package com.foliole.android;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionWorkspaceReadQueryRules {
    private FolioleCompanionWorkspaceReadQueryRules() {}

    static String snapshotString(Context context, String key) throws Exception {
        return group(context, "snapshot").getString(key);
    }

    static JSONObject snapshotObject(Context context, String key) throws Exception {
        return group(context, "snapshot").getJSONObject(key);
    }

    static String snapshotOutputKey(Context context, String key) throws Exception {
        return snapshotObject(context, "outputKeys").getString(key);
    }

    static String nestedPayloadOutputKey(Context context, String groupName) throws Exception {
        return snapshotObject(context, groupName).getString(nestedPayloadKey(context, "outputKey"));
    }

    static String nestedPayloadStateRowKey(Context context, JSONObject rules) throws Exception {
        return rules.getString(nestedPayloadKey(context, "stateRowKey"));
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
        return group(context, "viewState").getString(key);
    }

    static JSONArray viewStateArray(Context context, String key) throws Exception {
        return group(context, "viewState").getJSONArray(key);
    }

    private static JSONObject group(Context context, String groupName) throws Exception {
        return FolioleCompanionQueryAssetKeys.ruleGroup(context, "workspaceRead", groupName);
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
