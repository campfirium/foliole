package com.foliole.android;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

final class FolioleCompanionSyncDataPluginActions {
    private FolioleCompanionSyncDataPluginActions() {}

    static JSObject loadSyncStateChanges(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.loadSyncStateChanges(readNullableIntCursor(databaseHelper, call), call.getData().optInt(requestKey(databaseHelper, "limit"), 500));
    }

    static JSObject loadSyncObjects(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.loadSyncObjects(
            call.getData().optJSONArray(requestKey(databaseHelper, "objectIds")),
            call.getData().optJSONArray(requestKey(databaseHelper, "objectTypes"))
        );
    }

    static JSObject loadSyncNodeVersions(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.loadSyncNodeVersions(
            call.getData().optJSONObject(requestKey(databaseHelper, "cursor")),
            call.getData().optInt(requestKey(databaseHelper, "limit"), 500)
        );
    }

    static JSObject loadSyncReviewLog(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.loadSyncReviewLog(
            call.getData().optJSONObject(requestKey(databaseHelper, "cursor")),
            call.getData().optInt(requestKey(databaseHelper, "limit"), 500)
        );
    }

    private static Integer readNullableIntCursor(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        String key = requestKey(databaseHelper, "cursor");
        return call.getData().has(key) && !call.getData().isNull(key)
            ? call.getData().getInt(key)
            : null;
    }

    private static String requestKey(FolioleCompanionDatabaseHelper databaseHelper, String key) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.stringValue(databaseHelper.hostContext(), "syncPluginRequestKeys", key);
    }
}
