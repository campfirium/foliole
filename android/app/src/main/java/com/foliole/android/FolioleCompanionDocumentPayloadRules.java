package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionDocumentPayloadRules {
    private FolioleCompanionDocumentPayloadRules() {}

    static String deletedAt(Context context, JSONObject record) throws Exception {
        return record.optString(metadata(context, "recordDeletedAtKey"));
    }

    static String updatedAt(Context context, JSONObject record) throws Exception {
        return record.optString(metadata(context, "recordUpdatedAtKey"));
    }

    static String string(Context context, JSONObject payload, String keyName, String fallback) throws Exception {
        return payload.optString(metadata(context, keyName), fallback);
    }

    static String contentHash(Context context, JSONObject payload, JSONObject record) throws Exception {
        return string(context, payload, "contentHashPayloadKey", record.optString(metadata(context, "recordContentHashKey")));
    }

    static String filePart(Context context, JSONObject payload, String keyName) throws Exception {
        return string(context, payload, keyName, metadata(context, "defaultFilePart"));
    }

    static String nullableString(Context context, JSONObject payload, String keyName) throws Exception {
        String value = string(context, payload, keyName, "");
        return value == null || value.trim().isEmpty() ? null : value;
    }

    static long longValue(Context context, JSONObject payload, String keyName) throws Exception {
        return payload.optLong(metadata(context, keyName), Long.parseLong(metadata(context, "defaultLong")));
    }

    static int isPresent(Context context, JSONObject payload) throws Exception {
        return payload.optInt(metadata(context, "isPresentPayloadKey"), Integer.parseInt(metadata(context, "defaultIsPresent")));
    }

    private static String metadata(Context context, String key) throws Exception {
        return FolioleCompanionSyncPayloadQueryStore.metadata(
            context,
            FolioleCompanionSyncPayloadQueryStore.EXTERNAL_DOCUMENT_PAYLOAD_QUERY_NAME,
            key
        );
    }
}
