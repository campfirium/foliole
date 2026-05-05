package com.foliole.android;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

final class FolioleCompanionSyncDataPluginActions {
    private FolioleCompanionSyncDataPluginActions() {}

    static JSObject loadSyncStateChanges(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.loadSyncStateChanges(readNullableIntCursor(call), call.getData().optInt("limit", 500));
    }

    static JSObject loadSyncObjects(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.loadSyncObjects(
            call.getData().optJSONArray("object_ids"),
            call.getData().optJSONArray("object_types")
        );
    }

    static JSObject loadSyncNodeVersions(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.loadSyncNodeVersions(
            call.getData().optJSONObject("cursor"),
            call.getData().optInt("limit", 500)
        );
    }

    static JSObject loadSyncReviewLog(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.loadSyncReviewLog(
            call.getData().optJSONObject("cursor"),
            call.getData().optInt("limit", 500)
        );
    }

    static JSObject applySyncReviewLog(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.applySyncReviewLog(call.getData().optJSONArray("reviews"));
    }

    private static Integer readNullableIntCursor(PluginCall call) throws Exception {
        return call.getData().has("cursor") && !call.getData().isNull("cursor")
            ? call.getData().getInt("cursor")
            : null;
    }
}
