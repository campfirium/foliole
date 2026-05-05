package com.foliole.android;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

final class FolioleCompanionSyncStatePluginActions {
    private static final String SYNC_STATE_CURSOR_KEY = "sync_state_cursor";
    private static final String SYNC_STATE_PUSH_CURSOR_KEY = "sync_state_push_cursor";
    private static final String SYNC_PACK_CURSOR_KEY = "sync_pack_cursor";
    private static final String SYNC_NODE_VERSION_CURSOR_KEY = "sync_node_version_cursor";
    private static final String SYNC_NODE_VERSION_PUSH_CURSOR_KEY = "sync_node_version_push_cursor";
    private static final String SYNC_REVIEW_LOG_CURSOR_KEY = "sync_review_log_cursor";
    private static final String SYNC_REVIEW_LOG_PUSH_CURSOR_KEY = "sync_review_log_push_cursor";

    private FolioleCompanionSyncStatePluginActions() {}

    static JSObject loadSyncStateCursor(FolioleCompanionDatabaseHelper databaseHelper) throws Exception {
        return FolioleCompanionMetaRecords.loadNumberCursor(databaseHelper.getWritableDatabase(), SYNC_STATE_CURSOR_KEY);
    }

    static JSObject saveSyncStateCursor(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return FolioleCompanionMetaRecords.saveNumberCursor(
            databaseHelper.hostContext(),
            databaseHelper.getWritableDatabase(),
            SYNC_STATE_CURSOR_KEY,
            readNullableIntCursor(call)
        );
    }

    static JSObject loadSyncPackCursor(FolioleCompanionDatabaseHelper databaseHelper) throws Exception {
        return FolioleCompanionMetaRecords.loadNumberCursor(databaseHelper.getWritableDatabase(), SYNC_PACK_CURSOR_KEY);
    }

    static JSObject saveSyncPackCursor(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return FolioleCompanionMetaRecords.saveNumberCursor(
            databaseHelper.hostContext(),
            databaseHelper.getWritableDatabase(),
            SYNC_PACK_CURSOR_KEY,
            readNullableIntCursor(call)
        );
    }

    static JSObject loadSyncStatePushCursor(FolioleCompanionDatabaseHelper databaseHelper) throws Exception {
        return FolioleCompanionMetaRecords.loadNumberCursor(databaseHelper.getWritableDatabase(), SYNC_STATE_PUSH_CURSOR_KEY);
    }

    static JSObject saveSyncStatePushCursor(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return FolioleCompanionMetaRecords.saveNumberCursor(
            databaseHelper.hostContext(),
            databaseHelper.getWritableDatabase(),
            SYNC_STATE_PUSH_CURSOR_KEY,
            readNullableIntCursor(call)
        );
    }

    static JSObject loadSyncNodeVersionCursor(FolioleCompanionDatabaseHelper databaseHelper) throws Exception {
        return FolioleCompanionMetaRecords.loadJsonCursor(databaseHelper.getWritableDatabase(), SYNC_NODE_VERSION_CURSOR_KEY);
    }

    static JSObject saveSyncNodeVersionCursor(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return FolioleCompanionMetaRecords.saveJsonCursor(
            databaseHelper.hostContext(),
            databaseHelper.getWritableDatabase(),
            SYNC_NODE_VERSION_CURSOR_KEY,
            call.getData().optJSONObject("cursor")
        );
    }

    static JSObject loadSyncNodeVersionPushCursor(FolioleCompanionDatabaseHelper databaseHelper) throws Exception {
        return FolioleCompanionMetaRecords.loadJsonCursor(databaseHelper.getWritableDatabase(), SYNC_NODE_VERSION_PUSH_CURSOR_KEY);
    }

    static JSObject saveSyncNodeVersionPushCursor(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return FolioleCompanionMetaRecords.saveJsonCursor(
            databaseHelper.hostContext(),
            databaseHelper.getWritableDatabase(),
            SYNC_NODE_VERSION_PUSH_CURSOR_KEY,
            call.getData().optJSONObject("cursor")
        );
    }

    static JSObject loadSyncReviewLogCursor(FolioleCompanionDatabaseHelper databaseHelper) throws Exception {
        return FolioleCompanionMetaRecords.loadJsonCursor(databaseHelper.getWritableDatabase(), SYNC_REVIEW_LOG_CURSOR_KEY);
    }

    static JSObject saveSyncReviewLogCursor(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return FolioleCompanionMetaRecords.saveJsonCursor(
            databaseHelper.hostContext(),
            databaseHelper.getWritableDatabase(),
            SYNC_REVIEW_LOG_CURSOR_KEY,
            call.getData().optJSONObject("cursor")
        );
    }

    static JSObject loadSyncReviewLogPushCursor(FolioleCompanionDatabaseHelper databaseHelper) throws Exception {
        return FolioleCompanionMetaRecords.loadJsonCursor(databaseHelper.getWritableDatabase(), SYNC_REVIEW_LOG_PUSH_CURSOR_KEY);
    }

    static JSObject saveSyncReviewLogPushCursor(FolioleCompanionDatabaseHelper databaseHelper, PluginCall call) throws Exception {
        return FolioleCompanionMetaRecords.saveJsonCursor(
            databaseHelper.hostContext(),
            databaseHelper.getWritableDatabase(),
            SYNC_REVIEW_LOG_PUSH_CURSOR_KEY,
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
}
