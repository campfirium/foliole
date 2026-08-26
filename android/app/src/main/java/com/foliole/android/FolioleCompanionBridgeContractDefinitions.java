package com.foliole.android;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionBridgeContractDefinitions {
    private FolioleCompanionBridgeContractDefinitions() {}

    static String resourceRequestKey(Context context, String key) throws Exception {
        return FolioleCompanionBridgeContractAsset.string(context, "resourcePlugin", "requestKeys", key);
    }

    static String resourceAttachmentIdRequestKey(Context context) throws Exception {
        return resourceRequestKey(context, "attachmentId");
    }

    static String resourceBatchTokenRequestKey(Context context) throws Exception {
        return resourceRequestKey(context, "batchToken");
    }

    static String resourceBodyRequestKey(Context context) throws Exception {
        return resourceRequestKey(context, "body");
    }

    static String resourceContentHashRequestKey(Context context) throws Exception {
        return resourceRequestKey(context, "contentHash");
    }

    static String resourceCommittedRequestKey(Context context) throws Exception {
        return resourceRequestKey(context, "committed");
    }

    static String resourceDocumentIdRequestKey(Context context) throws Exception {
        return resourceRequestKey(context, "documentId");
    }

    static String resourceHashRequestKey(Context context) throws Exception {
        return resourceRequestKey(context, "hash");
    }

    static String resourceHeadersRequestKey(Context context) throws Exception {
        return resourceRequestKey(context, "headers");
    }

    static String resourceLimitRequestKey(Context context) throws Exception {
        return resourceRequestKey(context, "limit");
    }

    static String resourceMimeTypeRequestKey(Context context) throws Exception {
        return resourceRequestKey(context, "mimeType");
    }

    static String resourceQueryRequestKey(Context context) throws Exception {
        return resourceRequestKey(context, "query");
    }

    static String resourceResourcesRequestKey(Context context) throws Exception {
        return resourceRequestKey(context, "resources");
    }

    static String resourceStorageKeyRequestKey(Context context) throws Exception {
        return resourceRequestKey(context, "storageKey");
    }

    static String resourceUrlRequestKey(Context context) throws Exception {
        return resourceRequestKey(context, "url");
    }

    static String hostApiString(Context context, String groupName, String objectName, String key) throws Exception {
        return FolioleCompanionBridgeContractAsset.hostApiObject(context, groupName, objectName).getString(key);
    }

    static String hostApiString(Context context, String groupName, String key) throws Exception {
        return FolioleCompanionBridgeContractAsset.hostApiGroup(context, groupName).getString(key);
    }

    static int hostApiInt(Context context, String groupName, String objectName, String key) throws Exception {
        return FolioleCompanionBridgeContractAsset.hostApiObject(context, groupName, objectName).getInt(key);
    }

    static JSONArray hostApiArray(Context context, String groupName, String objectName, String key) throws Exception {
        return FolioleCompanionBridgeContractAsset.hostApiObject(context, groupName, objectName).getJSONArray(key);
    }

    static JSONObject hostApiGroup(Context context, String groupName) throws Exception {
        return FolioleCompanionBridgeContractAsset.hostApiGroup(context, groupName);
    }
}
