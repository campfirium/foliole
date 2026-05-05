package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import com.getcapacitor.JSObject;

import org.json.JSONObject;
import org.json.JSONArray;

import java.io.File;
import java.time.Instant;

final class FolioleCompanionDatabaseHelper extends SQLiteOpenHelper {

    static final String DATABASE_NAME = "foliole-companion.db";
    private static final int DATABASE_VERSION = 14;
    private static final String SYNC_STATE_CURSOR_KEY = "sync_state_cursor";
    private static final String SYNC_STATE_PUSH_CURSOR_KEY = "sync_state_push_cursor";
    private static final String SYNC_PACK_CURSOR_KEY = "sync_pack_cursor";
    private static final String SYNC_NODE_VERSION_CURSOR_KEY = "sync_node_version_cursor";
    private static final String SYNC_NODE_VERSION_PUSH_CURSOR_KEY = "sync_node_version_push_cursor";
    private static final String SYNC_REVIEW_LOG_CURSOR_KEY = "sync_review_log_cursor";
    private static final String SYNC_REVIEW_LOG_PUSH_CURSOR_KEY = "sync_review_log_push_cursor";
    private final Context context;

    FolioleCompanionDatabaseHelper(Context context) {
        super(context, DATABASE_NAME, null, DATABASE_VERSION);
        this.context = context;
    }

    @Override
    public void onCreate(SQLiteDatabase database) {
        FolioleCompanionDatabaseMigration.create(context, database);
    }

    @Override
    public void onUpgrade(SQLiteDatabase database, int oldVersion, int newVersion) {
        if (oldVersion < 2) {
            onCreate(database);
            return;
        }
        FolioleCompanionDatabaseMigration.upgrade(context, database, oldVersion);
    }

    FolioleCompanionBootstrapState loadBootstrapState(Context context) {
        SQLiteDatabase database = getWritableDatabase();
        String now = Instant.now().toString();
        String deviceId = FolioleCompanionMetaRecords.loadOrCreateDeviceId(database, now);
        File databaseFile = context.getDatabasePath(DATABASE_NAME);
        return new FolioleCompanionBootstrapState(now, databaseFile.getAbsolutePath(), true, deviceId);
    }

    JSObject loadWorkspaceSyncState() throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionSyncMetaStore.loadWorkspaceSyncState(database);
    }

    JSObject recordWorkspaceSyncEvent(String endpointUrl, String status, String message, String occurredAt) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionSyncMetaStore.recordWorkspaceSyncEvent(database, endpointUrl, status, message, occurredAt);
    }

    JSObject saveSyncOnboardingStatus(String status) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionSyncMetaStore.saveSyncOnboardingStatus(database, status);
    }

    JSObject saveWorkspaceSyncEndpoint(String endpointUrl) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionSyncMetaStore.saveWorkspaceSyncEndpoint(database, endpointUrl);
    }

    JSObject removeWorkspaceSyncRememberedTarget(String endpointUrl) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionSyncMetaStore.removeWorkspaceSyncRememberedTarget(database, endpointUrl);
    }

    JSObject loadSyncIndex() throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionSyncObjectStore.loadSyncIndex(database);
    }

    JSObject loadSyncNodeConflicts() throws Exception {
        SQLiteDatabase database = getReadableDatabase();
        return FolioleCompanionSyncConflictStore.loadNodeConflicts(database);
    }

    JSObject loadSyncObjects(JSONArray objectIds, JSONArray objectTypes) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionSyncObjectStore.loadSyncObjects(database, objectIds, objectTypes);
    }

    JSObject syncAttachmentResource(String attachmentId, String contentHash, String url, JSONObject headers) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionAttachmentResourceStore.syncResource(context, database, attachmentId, contentHash, url, headers);
    }

    JSObject syncAttachmentResources(org.json.JSONArray resources) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionAttachmentResourceBatchStore.syncResources(context, database, resources);
    }

    JSObject loadMissingAttachmentResources(int limit) {
        SQLiteDatabase database = getReadableDatabase();
        return FolioleCompanionAttachmentResourceStore.loadMissingResources(context, database, limit);
    }

    JSObject loadMissingAttachmentResource(String attachmentId) {
        SQLiteDatabase database = getReadableDatabase();
        return FolioleCompanionAttachmentResourceStore.loadMissingResource(context, database, attachmentId);
    }

    JSObject loadMissingContentBlobHashes(int limit) {
        SQLiteDatabase database = getReadableDatabase();
        return FolioleCompanionContentBlobStore.loadMissingHashes(database, limit);
    }

    JSObject syncContentBlob(String hash, String url, JSONObject headers) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionContentBlobStore.syncBlob(database, hash, url, headers);
    }

    JSObject syncContentBlobs(String url, JSONObject headers, String body) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionContentBlobBatchStore.syncBlobs(database, url, headers, body);
    }

    JSObject resolveAttachmentResource(String attachmentId) {
        SQLiteDatabase database = getReadableDatabase();
        return FolioleCompanionAttachmentResourceStore.resolveResource(context, database, attachmentId);
    }

    JSObject loadPdfPageText(String attachmentId) {
        SQLiteDatabase database = getReadableDatabase();
        return FolioleCompanionPdfPageTextStore.loadPageText(database, attachmentId);
    }

    JSObject searchPdfPageText(String query, int limit) {
        SQLiteDatabase database = getReadableDatabase();
        return FolioleCompanionPdfPageTextStore.searchPageText(database, query, limit);
    }

    JSObject loadExternalDocument(String documentId) {
        SQLiteDatabase database = getReadableDatabase();
        return FolioleCompanionExternalDocumentStore.loadDocument(database, documentId);
    }

    JSObject loadExternalDirectory() {
        SQLiteDatabase database = getReadableDatabase();
        return FolioleCompanionExternalDocumentStore.loadDirectory(database);
    }

    JSObject searchExternalDocuments(String query, int limit) {
        SQLiteDatabase database = getReadableDatabase();
        return FolioleCompanionExternalDocumentStore.searchDocuments(database, query, limit);
    }

    JSObject loadSyncNodeVersions(JSONObject cursor, int limit) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        String deviceId = FolioleCompanionMetaRecords.loadOrCreateDeviceId(database, Instant.now().toString());
        return FolioleCompanionSyncNodeVersionStore.loadNodeVersions(database, cursor, limit, deviceId);
    }

    JSObject loadSyncReviewLog(JSONObject cursor, int limit) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        String deviceId = FolioleCompanionMetaRecords.loadOrCreateDeviceId(database, Instant.now().toString());
        return FolioleCompanionSyncReviewLogStore.loadReviewLog(database, cursor, limit, deviceId);
    }

    JSObject loadSyncStateChanges(Integer cursor, int limit) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionSyncObjectStore.loadSyncStateChanges(database, cursor == null ? 0 : cursor, limit);
    }

    JSObject loadSyncStateCursor() throws Exception {
        return FolioleCompanionMetaRecords.loadNumberCursor(getWritableDatabase(), SYNC_STATE_CURSOR_KEY);
    }

    JSObject saveSyncStateCursor(Integer cursor) throws Exception {
        return FolioleCompanionMetaRecords.saveNumberCursor(getWritableDatabase(), SYNC_STATE_CURSOR_KEY, cursor);
    }

    JSObject loadSyncPackCursor() throws Exception {
        return FolioleCompanionMetaRecords.loadNumberCursor(getWritableDatabase(), SYNC_PACK_CURSOR_KEY);
    }

    JSObject saveSyncPackCursor(Integer cursor) throws Exception {
        return FolioleCompanionMetaRecords.saveNumberCursor(getWritableDatabase(), SYNC_PACK_CURSOR_KEY, cursor);
    }

    JSObject loadSyncStatePushCursor() throws Exception {
        return FolioleCompanionMetaRecords.loadNumberCursor(getWritableDatabase(), SYNC_STATE_PUSH_CURSOR_KEY);
    }

    JSObject saveSyncStatePushCursor(Integer cursor) throws Exception {
        return FolioleCompanionMetaRecords.saveNumberCursor(getWritableDatabase(), SYNC_STATE_PUSH_CURSOR_KEY, cursor);
    }

    JSObject loadSyncNodeVersionCursor() throws Exception {
        return FolioleCompanionMetaRecords.loadJsonCursor(getWritableDatabase(), SYNC_NODE_VERSION_CURSOR_KEY);
    }

    JSObject saveSyncNodeVersionCursor(JSONObject cursor) throws Exception {
        return FolioleCompanionMetaRecords.saveJsonCursor(getWritableDatabase(), SYNC_NODE_VERSION_CURSOR_KEY, cursor);
    }

    JSObject loadSyncNodeVersionPushCursor() throws Exception {
        return FolioleCompanionMetaRecords.loadJsonCursor(getWritableDatabase(), SYNC_NODE_VERSION_PUSH_CURSOR_KEY);
    }

    JSObject saveSyncNodeVersionPushCursor(JSONObject cursor) throws Exception {
        return FolioleCompanionMetaRecords.saveJsonCursor(getWritableDatabase(), SYNC_NODE_VERSION_PUSH_CURSOR_KEY, cursor);
    }

    JSObject loadSyncReviewLogCursor() throws Exception {
        return FolioleCompanionMetaRecords.loadJsonCursor(getWritableDatabase(), SYNC_REVIEW_LOG_CURSOR_KEY);
    }

    JSObject saveSyncReviewLogCursor(JSONObject cursor) throws Exception {
        return FolioleCompanionMetaRecords.saveJsonCursor(getWritableDatabase(), SYNC_REVIEW_LOG_CURSOR_KEY, cursor);
    }

    JSObject loadSyncReviewLogPushCursor() throws Exception {
        return FolioleCompanionMetaRecords.loadJsonCursor(getWritableDatabase(), SYNC_REVIEW_LOG_PUSH_CURSOR_KEY);
    }

    JSObject saveSyncReviewLogPushCursor(JSONObject cursor) throws Exception {
        return FolioleCompanionMetaRecords.saveJsonCursor(getWritableDatabase(), SYNC_REVIEW_LOG_PUSH_CURSOR_KEY, cursor);
    }

    JSObject saveSyncPushAcks(JSONArray acks) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionSyncPushAckStore.saveAcks(database, acks);
    }

    JSObject saveSyncSettingRecord(JSONObject record) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        String deviceId = FolioleCompanionMetaRecords.loadOrCreateDeviceId(database, Instant.now().toString());
        return FolioleCompanionSyncStateWriteStore.saveSetting(database, record, deviceId);
    }

    JSObject saveSyncNodeReadingRecord(JSONObject record) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        String deviceId = FolioleCompanionMetaRecords.loadOrCreateDeviceId(database, Instant.now().toString());
        return FolioleCompanionSyncStateWriteStore.saveNodeReading(database, record, deviceId);
    }

    JSObject saveSyncNodeReviewRecord(JSONObject record) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        String deviceId = FolioleCompanionMetaRecords.loadOrCreateDeviceId(database, Instant.now().toString());
        return FolioleCompanionSyncStateWriteStore.saveNodeReview(database, record, deviceId);
    }

    JSObject saveSyncActiveViewState(JSONObject record) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        String deviceId = FolioleCompanionMetaRecords.loadOrCreateDeviceId(database, Instant.now().toString());
        return FolioleCompanionViewStateSyncStore.saveActiveNode(database, record, deviceId);
    }

    JSObject saveSyncNodeViewState(JSONObject record) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        String deviceId = FolioleCompanionMetaRecords.loadOrCreateDeviceId(database, Instant.now().toString());
        return FolioleCompanionViewStateSyncStore.saveNodeViewState(database, record, deviceId);
    }

    JSObject loadReadableArticle() {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionReadableArticleQuery.loadReadableArticle(database);
    }
}
