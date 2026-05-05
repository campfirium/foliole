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
    private static final int DATABASE_VERSION = 14;
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
        return new FolioleCompanionBootstrapState(now, databaseFile.getAbsolutePath(), true, deviceId);
    }

    JSObject loadWorkspaceSyncState() throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionSyncMetaStore.loadWorkspaceSyncState(context, database);
    }

    JSObject recordWorkspaceSyncEvent(String endpointUrl, String status, String message, String occurredAt) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionSyncMetaStore.recordWorkspaceSyncEvent(context, database, endpointUrl, status, message, occurredAt);
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
        return FolioleCompanionNamedQueryStore.loadArray(context, database, "nodeConflicts");
    }

    JSObject loadSyncObjects(JSONArray objectIds, JSONArray objectTypes) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionSyncObjectStore.loadSyncObjects(context, database, objectIds, objectTypes);
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
        return FolioleCompanionContentBlobStore.syncBlob(context, database, hash, url, headers);
    }

    JSObject syncContentBlobs(String url, JSONObject headers, String body) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionContentBlobBatchStore.syncBlobs(context, database, url, headers, body);
    }

    JSObject resolveAttachmentResource(String attachmentId) {
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

    JSObject loadReadableArticle() {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionReadableArticleQuery.loadReadableArticle(database);
    }
}
