package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

final class FolioleCompanionSyncObjectPayloadReader {
    private FolioleCompanionSyncObjectPayloadReader() {}

    static String readPayloadJson(Context context, SQLiteDatabase database, String objectType, String objectId) throws Exception {
        String queryName = queryName(objectType, objectId);
        if (queryName == null) {
            return "{}";
        }
        String payload = FolioleCompanionNamedQueryStore.loadString(context, database, queryName, queryArgs(objectType, objectId));
        return payload == null ? "{}" : payload;
    }

    private static String queryName(String objectType, String objectId) {
        if (objectType.equals("attachment")) return "syncPayloadAttachment";
        if (objectType.equals("external_document")) return "syncPayloadExternalDocument";
        if (objectType.equals("external_folder")) return "syncPayloadExternalFolder";
        if (objectType.equals("import_source")) return "syncPayloadImportSource";
        if (objectType.equals("node_reading")) return "syncPayloadNodeReading";
        if (objectType.equals("node_review")) return "syncPayloadNodeReview";
        if (objectType.equals("pdf_page_text")) return "syncPayloadPdfPageText";
        if (objectType.equals("setting")) return "syncPayloadSetting";
        if (objectType.equals("view_state")) return viewStateQueryName(objectId);
        return null;
    }

    private static String[] queryArgs(String objectType, String objectId) {
        if (!objectType.equals("view_state")) {
            return new String[] { objectId };
        }
        String key = objectIdKey(objectId);
        if (key.equals("active_node")) {
            return null;
        }
        return new String[] { key.substring(5), objectIdDeviceId(objectId) };
    }

    private static String viewStateQueryName(String objectId) {
        String key = objectIdKey(objectId);
        if (key.equals("active_node")) return "syncPayloadViewActiveNode";
        if (key.startsWith("node:")) return "syncPayloadViewNodeState";
        return null;
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
