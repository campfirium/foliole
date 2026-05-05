package com.foliole.android;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

final class FolioleCompanionSyncDataPluginActions {
    private FolioleCompanionSyncDataPluginActions() {}

    static JSObject loadSyncStateChanges(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.loadSyncStateChanges(
            readNullableIntCursor(databaseHelper, call),
            call.getData().optInt(limitRequestKey(databaseHelper), 500)
        );
    }

    static JSObject loadSyncObjects(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.loadSyncObjects(
            call.getData().optJSONArray(objectIdsRequestKey(databaseHelper)),
            call.getData().optJSONArray(objectTypesRequestKey(databaseHelper))
        );
    }

    static JSObject loadSyncNodeVersions(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.loadSyncNodeVersions(
            call.getData().optJSONObject(cursorRequestKey(databaseHelper)),
            call.getData().optInt(limitRequestKey(databaseHelper), 500)
        );
    }

    static JSObject loadSyncReviewLog(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.loadSyncReviewLog(
            call.getData().optJSONObject(cursorRequestKey(databaseHelper)),
            call.getData().optInt(limitRequestKey(databaseHelper), 500)
        );
    }

    private static Integer readNullableIntCursor(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        String key = cursorRequestKey(databaseHelper);
        return call.getData().has(key) && !call.getData().isNull(key)
            ? call.getData().getInt(key)
            : null;
    }

    private static String cursorRequestKey(FolioleCompanionDatabaseHelper databaseHelper) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.syncPluginCursorRequestKey(databaseHelper.hostContext());
    }

    private static String limitRequestKey(FolioleCompanionDatabaseHelper databaseHelper) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.syncPluginLimitRequestKey(databaseHelper.hostContext());
    }

    private static String objectIdsRequestKey(FolioleCompanionDatabaseHelper databaseHelper) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.syncPluginObjectIdsRequestKey(databaseHelper.hostContext());
    }

    private static String objectTypesRequestKey(FolioleCompanionDatabaseHelper databaseHelper) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.syncPluginObjectTypesRequestKey(databaseHelper.hostContext());
    }
}
