package com.foliole.android;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

final class FolioleCompanionSyncStatePluginActions {
    private FolioleCompanionSyncStatePluginActions() {}

    static JSObject saveSyncStateCursor(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.saveSyncStateCursor(readNullableIntCursor(call));
    }

    static JSObject saveSyncPackCursor(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.saveSyncPackCursor(readNullableIntCursor(call));
    }

    static JSObject saveSyncStatePushCursor(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.saveSyncStatePushCursor(readNullableIntCursor(call));
    }

    static JSObject saveSyncNodeVersionCursor(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.saveSyncNodeVersionCursor(call.getData().optJSONObject("cursor"));
    }

    static JSObject saveSyncNodeVersionPushCursor(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.saveSyncNodeVersionPushCursor(call.getData().optJSONObject("cursor"));
    }

    static JSObject saveSyncReviewLogCursor(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.saveSyncReviewLogCursor(call.getData().optJSONObject("cursor"));
    }

    static JSObject saveSyncReviewLogPushCursor(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.saveSyncReviewLogPushCursor(call.getData().optJSONObject("cursor"));
    }

    static JSObject saveSyncPushAcks(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.saveSyncPushAcks(call.getData().optJSONArray("acks"));
    }

    static JSObject saveSyncSettingRecord(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.saveSyncSettingRecord(call.getData());
    }

    static JSObject saveSyncNodeReadingRecord(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.saveSyncNodeReadingRecord(call.getData());
    }

    static JSObject saveSyncNodeReviewRecord(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.saveSyncNodeReviewRecord(call.getData());
    }

    static JSObject saveSyncActiveViewState(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.saveSyncActiveViewState(call.getData());
    }

    static JSObject saveSyncNodeViewState(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return databaseHelper.saveSyncNodeViewState(call.getData());
    }

    private static Integer readNullableIntCursor(PluginCall call) throws Exception {
        return call.getData().has("cursor") && !call.getData().isNull("cursor")
            ? call.getData().getInt("cursor")
            : null;
    }
}
