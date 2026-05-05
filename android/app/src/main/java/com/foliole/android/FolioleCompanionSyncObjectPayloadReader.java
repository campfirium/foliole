package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

final class FolioleCompanionSyncObjectPayloadReader {
    private FolioleCompanionSyncObjectPayloadReader() {}

    static String readPayloadJson(Context context, SQLiteDatabase database, String objectType, String objectId) throws Exception {
        String queryName = FolioleCompanionNamedQueryStore.syncPayloadQueryName(context, objectType, objectIdKey(objectId));
        if (queryName == null) {
            return "{}";
        }
        String payload = FolioleCompanionNamedQueryStore.loadString(context, database, queryName, queryArgs(objectType, objectId));
        return payload == null ? "{}" : payload;
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

    private static String objectIdDeviceId(String objectId) {
        String[] parts = objectId.split(":", 5);
        return parts.length >= 4 ? parts[3] : "";
    }

    private static String objectIdKey(String objectId) {
        String[] parts = objectId.split(":", 5);
        return parts.length >= 5 ? parts[4] : objectId;
    }
}
