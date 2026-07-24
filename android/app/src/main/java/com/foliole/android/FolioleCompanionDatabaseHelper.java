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

    static final String DATABASE_NAME = "foliole-companionSQLite.db";
    private static final int DATABASE_VERSION = 21;
    private final Context context;

    FolioleCompanionDatabaseHelper(Context context) {
        super(context, DATABASE_NAME, null, DATABASE_VERSION);
        this.context = context;
    }

    Context hostContext() {
        return context;
    }

    @Override
    public void onCreate(SQLiteDatabase database) {
        FolioleCompanionDatabaseMigration.create(context, database);
    }

    @Override
    public void onOpen(SQLiteDatabase database) {
        super.onOpen(database);
        FolioleCompanionDatabaseMigration.repairCurrentSchema(context, database);
    }

    @Override
    public void onUpgrade(SQLiteDatabase database, int oldVersion, int newVersion) {
        if (oldVersion < 2) {
            onCreate(database);
            return;
        }
        FolioleCompanionDatabaseMigration.upgrade(context, database, oldVersion);
    }

    FolioleCompanionBootstrapState loadBootstrapState(Context context) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        String now = Instant.now().toString();
        String deviceId = FolioleCompanionMetaRecords.loadOrCreateDeviceId(context, database, now);
        File databaseFile = context.getDatabasePath(DATABASE_NAME);
        return new FolioleCompanionBootstrapState(context, now, databaseFile.getAbsolutePath(), true, deviceId);
    }

    JSObject loadWorkspaceSyncState() throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionSyncMetaStore.loadWorkspaceSyncState(context, database);
    }

    JSObject recordWorkspaceSyncEvent(
        String endpointUrl,
        String status,
        String message,
        String occurredAt
    ) throws Exception {
        return recordWorkspaceSyncEvent(endpointUrl, status, message, occurredAt, null, null, null, null, null);
    }

    JSObject recordWorkspaceSyncEvent(
        String endpointUrl,
        String status,
        String message,
        String occurredAt,
        String kind,
        String result,
        String runId,
        String startedAt
    ) throws Exception {
        return recordWorkspaceSyncEvent(endpointUrl, status, message, occurredAt, kind, result, runId, startedAt, null);
    }

    JSObject recordWorkspaceSyncEvent(
        String endpointUrl,
        String status,
        String message,
        String occurredAt,
        String kind,
        String result,
        String runId,
        String startedAt,
        JSONObject summary
    ) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionSyncMetaStore.recordWorkspaceSyncEvent(
            context,
            database,
            endpointUrl,
            status,
            message,
            occurredAt,
            kind,
            result,
            runId,
            startedAt,
            summary
        );
    }

    JSObject saveSyncOnboardingStatus(String status) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionSyncMetaStore.saveSyncOnboardingStatus(context, database, status);
    }

    JSObject saveWorkspaceSyncEndpoint(String endpointUrl) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionSyncMetaStore.saveWorkspaceSyncEndpoint(context, database, endpointUrl);
    }

    JSObject removeWorkspaceSyncRememberedTarget(String endpointUrl) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionSyncMetaStore.removeWorkspaceSyncRememberedTarget(context, database, endpointUrl);
    }

    JSObject loadSyncIndex() throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionSyncObjectStore.loadSyncIndex(context, database);
    }

    JSObject loadSyncNodeConflicts() throws Exception {
        SQLiteDatabase database = getReadableDatabase();
        return FolioleCompanionGeneratedQueryRunner.load(context, database, FolioleCompanionSyncConflictQueryRules.nodeConflictsQueryName(context));
    }

    JSObject loadSyncObjects(JSONArray objectIds, JSONArray objectTypes) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionSyncObjectStore.loadSyncObjects(context, database, objectIds, objectTypes);
    }

    JSObject downloadAttachmentResourceBatch(JSONArray resources) throws Exception {
        return FolioleCompanionAttachmentResourceBatchStore.downloadResources(context, resources);
    }

    JSObject commitAttachmentResourceBatch(String batchToken) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionAttachmentResourceBatchStore.commitDownloadedResources(context, database, batchToken);
    }

    JSObject loadMissingAttachmentResources(int limit) throws Exception {
        SQLiteDatabase database = getReadableDatabase();
        return FolioleCompanionAttachmentResourceStore.loadMissingResources(context, database, limit);
    }

    JSObject loadMissingAttachmentResource(String attachmentId) throws Exception {
        SQLiteDatabase database = getReadableDatabase();
        return FolioleCompanionAttachmentResourceStore.loadMissingResource(context, database, attachmentId);
    }

    JSObject loadMissingContentBlobHashes(int limit) throws Exception {
        SQLiteDatabase database = getReadableDatabase();
        return FolioleCompanionContentBlobStore.loadMissingHashes(context, database, limit);
    }

    JSObject downloadContentBlobBatch(String url, JSONObject headers, String body) throws Exception {
        return FolioleCompanionContentBlobBatchStore.downloadBlobs(context, url, headers, body);
    }

    JSObject commitContentBlobBatch(String batchToken) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionContentBlobBatchStore.commitDownloadedBlobs(context, database, batchToken);
    }

    JSObject resolveAttachmentResource(String attachmentId) throws Exception {
        SQLiteDatabase database = getReadableDatabase();
        return FolioleCompanionAttachmentResourceStore.resolveResource(context, database, attachmentId);
    }

    JSObject loadPdfPageText(String attachmentId) throws Exception {
        SQLiteDatabase database = getReadableDatabase();
        return FolioleCompanionPdfPageTextStore.loadPageText(context, database, attachmentId);
    }

    JSObject searchPdfPageText(String query, int limit) throws Exception {
        SQLiteDatabase database = getReadableDatabase();
        return FolioleCompanionPdfPageTextStore.searchPageText(context, database, query, limit);
    }

    JSObject searchTopics(String query, int limit) throws Exception {
        SQLiteDatabase database = getReadableDatabase();
        return FolioleCompanionTopicSearchStore.searchTopics(context, database, query, limit);
    }

    JSObject loadExternalDocument(String documentId) throws Exception {
        SQLiteDatabase database = getReadableDatabase();
        return FolioleCompanionExternalDocumentStore.loadDocument(context, database, documentId);
    }

    JSObject loadExternalDirectory() throws Exception {
        SQLiteDatabase database = getReadableDatabase();
        return FolioleCompanionExternalDocumentStore.loadDirectory(context, database);
    }

    JSObject searchExternalDocuments(String query, int limit) throws Exception {
        SQLiteDatabase database = getReadableDatabase();
        return FolioleCompanionExternalDocumentStore.searchDocuments(context, database, query, limit);
    }

    JSObject loadSyncNodeVersions(JSONObject cursor, int limit) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        String deviceId = FolioleCompanionMetaRecords.loadOrCreateDeviceId(context, database, Instant.now().toString());
        return FolioleCompanionSyncNodeVersionStore.loadNodeVersions(context, database, cursor, limit, deviceId);
    }

    JSObject loadSyncReviewLog(JSONObject cursor, int limit) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        String deviceId = FolioleCompanionMetaRecords.loadOrCreateDeviceId(context, database, Instant.now().toString());
        return FolioleCompanionSyncReviewLogStore.loadReviewLog(context, database, cursor, limit, deviceId);
    }

    JSObject loadSyncStateChanges(Integer cursor, int limit) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionSyncObjectStore.loadSyncStateChanges(context, database, cursor == null ? 0 : cursor, limit);
    }

    JSObject saveSyncPushAcks(JSONArray acks) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionSyncPushAckStore.saveAcks(context, database, acks);
    }

    JSObject saveSyncSettingRecord(JSONObject record) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        String deviceId = FolioleCompanionMetaRecords.loadOrCreateDeviceId(context, database, Instant.now().toString());
        return FolioleCompanionSyncStateWriteStore.saveSetting(context, database, record, deviceId);
    }

    JSObject saveSyncNodeReadingRecord(JSONObject record) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        String deviceId = FolioleCompanionMetaRecords.loadOrCreateDeviceId(context, database, Instant.now().toString());
        return FolioleCompanionSyncStateWriteStore.saveNodeReading(context, database, record, deviceId);
    }

    JSObject saveSyncNodeOpenState(JSONObject record) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        String deviceId = FolioleCompanionMetaRecords.loadOrCreateDeviceId(context, database, Instant.now().toString());
        return FolioleCompanionSyncStateWriteStore.saveNodeOpenState(context, database, record, deviceId);
    }

    JSObject saveSyncNodeReviewRecord(JSONObject record) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        String deviceId = FolioleCompanionMetaRecords.loadOrCreateDeviceId(context, database, Instant.now().toString());
        return FolioleCompanionSyncStateWriteStore.saveNodeReview(context, database, record, deviceId);
    }

    JSObject saveSyncActiveViewState(JSONObject record) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        String deviceId = FolioleCompanionMetaRecords.loadOrCreateDeviceId(context, database, Instant.now().toString());
        return FolioleCompanionViewStateSyncStore.saveActiveNode(context, database, record, deviceId);
    }

    JSObject saveSyncNodeViewState(JSONObject record) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        String deviceId = FolioleCompanionMetaRecords.loadOrCreateDeviceId(context, database, Instant.now().toString());
        return FolioleCompanionViewStateSyncStore.saveNodeViewState(context, database, record, deviceId);
    }

    JSObject loadReadableArticle() throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionReadableArticleQuery.loadReadableArticle(context, database);
    }
}
