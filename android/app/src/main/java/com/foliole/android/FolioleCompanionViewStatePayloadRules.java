package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionViewStatePayloadRules {
    private FolioleCompanionViewStatePayloadRules() {}

    static boolean isActiveDeleted(Context context, JSONObject record) throws Exception {
        return isDeleted(context, record, FolioleCompanionSyncPayloadQueryStore.VIEW_ACTIVE_NODE_PAYLOAD_QUERY_NAME);
    }

    static boolean isNodeDeleted(Context context, JSONObject record) throws Exception {
        return isDeleted(context, record, FolioleCompanionSyncPayloadQueryStore.VIEW_NODE_STATE_PAYLOAD_QUERY_NAME);
    }

    static String activeNodeId(Context context, JSONObject payload) throws Exception {
        return string(
            context,
            payload,
            FolioleCompanionSyncPayloadQueryStore.VIEW_ACTIVE_NODE_PAYLOAD_QUERY_NAME,
            "activeNodePayloadKey",
            activeMetadata(context, "defaultActiveNodeId")
        );
    }

    static int scrollTop(Context context, JSONObject payload) throws Exception {
        return payload.optInt(
            metadata(context, FolioleCompanionSyncPayloadQueryStore.VIEW_NODE_STATE_PAYLOAD_QUERY_NAME, "scrollTopPayloadKey"),
            Integer.parseInt(metadata(context, FolioleCompanionSyncPayloadQueryStore.VIEW_NODE_STATE_PAYLOAD_QUERY_NAME, "defaultScrollTop"))
        );
    }

    static String activeUpdatedAt(Context context, JSONObject record) throws Exception {
        return updatedAt(context, record, FolioleCompanionSyncPayloadQueryStore.VIEW_ACTIVE_NODE_PAYLOAD_QUERY_NAME);
    }

    static String nodeUpdatedAt(Context context, JSONObject record) throws Exception {
        return updatedAt(context, record, FolioleCompanionSyncPayloadQueryStore.VIEW_NODE_STATE_PAYLOAD_QUERY_NAME);
    }

    private static boolean isDeleted(Context context, JSONObject record, String queryName) throws Exception {
        return !record.isNull(metadata(context, queryName, "recordDeletedAtKey"));
    }

    private static String updatedAt(Context context, JSONObject record, String queryName) throws Exception {
        return record.optString(metadata(context, queryName, "recordUpdatedAtKey"));
    }

    private static String string(Context context, JSONObject payload, String queryName, String keyName, String fallback) throws Exception {
        return payload.optString(metadata(context, queryName, keyName), fallback);
    }

    private static String activeMetadata(Context context, String key) throws Exception {
        return metadata(context, FolioleCompanionSyncPayloadQueryStore.VIEW_ACTIVE_NODE_PAYLOAD_QUERY_NAME, key);
    }

    private static String metadata(Context context, String queryName, String key) throws Exception {
        return FolioleCompanionSyncPayloadQueryStore.metadata(context, queryName, key);
    }
}
