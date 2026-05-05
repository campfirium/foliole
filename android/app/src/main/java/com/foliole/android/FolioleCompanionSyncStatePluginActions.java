package com.foliole.android;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

final class FolioleCompanionSyncStatePluginActions {
    private FolioleCompanionSyncStatePluginActions() {}

    static JSObject loadSyncStateCursor(FolioleCompanionDatabaseHelper databaseHelper) throws Exception {
        return FolioleCompanionMetaRecords.loadNumberCursor(databaseHelper.hostContext(), databaseHelper.getWritableDatabase(), cursorKey(databaseHelper, "state"));
    }

    static JSObject saveSyncStateCursor(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return FolioleCompanionMetaRecords.saveNumberCursor(
            databaseHelper.hostContext(),
            databaseHelper.getWritableDatabase(),
            cursorKey(databaseHelper, "state"),
            readNullableIntCursor(call)
        );
    }

    static JSObject loadSyncPackCursor(FolioleCompanionDatabaseHelper databaseHelper) throws Exception {
        return FolioleCompanionMetaRecords.loadNumberCursor(databaseHelper.hostContext(), databaseHelper.getWritableDatabase(), cursorKey(databaseHelper, "pack"));
    }

    static JSObject saveSyncPackCursor(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return FolioleCompanionMetaRecords.saveNumberCursor(
            databaseHelper.hostContext(),
            databaseHelper.getWritableDatabase(),
            cursorKey(databaseHelper, "pack"),
            readNullableIntCursor(call)
        );
    }

    static JSObject loadSyncStatePushCursor(FolioleCompanionDatabaseHelper databaseHelper) throws Exception {
        return FolioleCompanionMetaRecords.loadNumberCursor(databaseHelper.hostContext(), databaseHelper.getWritableDatabase(), cursorKey(databaseHelper, "statePush"));
    }

    static JSObject saveSyncStatePushCursor(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return FolioleCompanionMetaRecords.saveNumberCursor(
            databaseHelper.hostContext(),
            databaseHelper.getWritableDatabase(),
            cursorKey(databaseHelper, "statePush"),
            readNullableIntCursor(call)
        );
    }

    static JSObject loadSyncNodeVersionCursor(FolioleCompanionDatabaseHelper databaseHelper) throws Exception {
        return FolioleCompanionMetaRecords.loadJsonCursor(databaseHelper.hostContext(), databaseHelper.getWritableDatabase(), cursorKey(databaseHelper, "nodeVersion"));
    }

    static JSObject saveSyncNodeVersionCursor(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return FolioleCompanionMetaRecords.saveJsonCursor(
            databaseHelper.hostContext(),
            databaseHelper.getWritableDatabase(),
            cursorKey(databaseHelper, "nodeVersion"),
            call.getData().optJSONObject("cursor")
        );
    }

    static JSObject loadSyncNodeVersionPushCursor(FolioleCompanionDatabaseHelper databaseHelper) throws Exception {
        return FolioleCompanionMetaRecords.loadJsonCursor(databaseHelper.hostContext(), databaseHelper.getWritableDatabase(), cursorKey(databaseHelper, "nodeVersionPush"));
    }

    static JSObject saveSyncNodeVersionPushCursor(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return FolioleCompanionMetaRecords.saveJsonCursor(
            databaseHelper.hostContext(),
            databaseHelper.getWritableDatabase(),
            cursorKey(databaseHelper, "nodeVersionPush"),
            call.getData().optJSONObject("cursor")
        );
    }

    static JSObject loadSyncReviewLogCursor(FolioleCompanionDatabaseHelper databaseHelper) throws Exception {
        return FolioleCompanionMetaRecords.loadJsonCursor(databaseHelper.hostContext(), databaseHelper.getWritableDatabase(), cursorKey(databaseHelper, "reviewLog"));
    }

    static JSObject saveSyncReviewLogCursor(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return FolioleCompanionMetaRecords.saveJsonCursor(
            databaseHelper.hostContext(),
            databaseHelper.getWritableDatabase(),
            cursorKey(databaseHelper, "reviewLog"),
            call.getData().optJSONObject("cursor")
        );
    }

    static JSObject loadSyncReviewLogPushCursor(FolioleCompanionDatabaseHelper databaseHelper) throws Exception {
        return FolioleCompanionMetaRecords.loadJsonCursor(databaseHelper.hostContext(), databaseHelper.getWritableDatabase(), cursorKey(databaseHelper, "reviewLogPush"));
    }

    static JSObject saveSyncReviewLogPushCursor(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return FolioleCompanionMetaRecords.saveJsonCursor(
            databaseHelper.hostContext(),
            databaseHelper.getWritableDatabase(),
            cursorKey(databaseHelper, "reviewLogPush"),
            call.getData().optJSONObject("cursor")
        );
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

    private static String cursorKey(FolioleCompanionDatabaseHelper databaseHelper, String key) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.stringValue(databaseHelper.hostContext(), "syncMetaCursors", key);
    }
}
