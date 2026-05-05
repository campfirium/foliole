package com.foliole.android;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import com.getcapacitor.JSObject;

import org.json.JSONObject;
import org.json.JSONArray;

import java.io.File;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

final class FolioleCompanionDatabaseHelper extends SQLiteOpenHelper {

    static final String DATABASE_NAME = "foliole-companion.db";
    private static final int DATABASE_VERSION = 11;
    private static final String META_TABLE = "companion_meta";
    private static final String DEVICE_ID_KEY = "device_id";
    private static final String WORKSPACE_SYNC_ENDPOINT_URL_KEY = "workspace_sync_endpoint_url";
    private static final String WORKSPACE_SYNC_LAST_SYNCED_AT_KEY = "workspace_sync_last_synced_at";
    private static final String WORKSPACE_SYNC_ONBOARDING_STATUS_KEY = "workspace_sync_onboarding_status";
    private static final String WORKSPACE_SYNC_REMEMBERED_TARGETS_KEY = "workspace_sync_remembered_targets";
    private static final String WORKSPACE_SYNC_EVENTS_KEY = "workspace_sync_events";
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
        database.execSQL(
            "CREATE TABLE IF NOT EXISTS " + META_TABLE + " (" +
                "key TEXT PRIMARY KEY NOT NULL," +
                "value TEXT NOT NULL," +
                "updated_at TEXT NOT NULL" +
                ")"
        );
        try {
            FolioleCompanionSchemaInstaller.install(context, database);
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to install companion schema.", exception);
        }
    }

    @Override
    public void onUpgrade(SQLiteDatabase database, int oldVersion, int newVersion) {
        if (oldVersion < 2) {
            onCreate(database);
            return;
        }
        if (oldVersion < 4) {
            try {
                FolioleCompanionSchemaInstaller.install(context, database);
            } catch (Exception exception) {
                throw new IllegalStateException("Failed to upgrade companion schema.", exception);
            }
        }
        if (oldVersion < 5) {
            database.execSQL("DROP TABLE IF EXISTS sync_object_state");
            database.execSQL("DROP TABLE IF EXISTS sync_peer_cursors");
            try {
                FolioleCompanionSchemaInstaller.install(context, database);
            } catch (Exception exception) {
                throw new IllegalStateException("Failed to upgrade companion sync schema.", exception);
            }
        }
        if (oldVersion < 6) {
            try {
                FolioleCompanionSchemaInstaller.install(context, database);
            } catch (Exception exception) {
                throw new IllegalStateException("Failed to upgrade companion node version schema.", exception);
            }
        }
        if (oldVersion < 7) {
            try {
                FolioleCompanionSchemaInstaller.install(context, database);
            } catch (Exception exception) {
                throw new IllegalStateException("Failed to upgrade companion review log schema.", exception);
            }
        }
        if (oldVersion < 8) {
            try {
                FolioleCompanionSchemaInstaller.install(context, database);
            } catch (Exception exception) {
                throw new IllegalStateException("Failed to upgrade companion attachment link schema.", exception);
            }
        }
        if (oldVersion < 9) {
            FolioleCompanionNodeAttachmentStore.backfillNodeAttachmentsFromVersions(database);
        }
        if (oldVersion < 10) {
            try {
                FolioleCompanionSchemaInstaller.install(context, database);
            } catch (Exception exception) {
                throw new IllegalStateException("Failed to upgrade companion content blob schema.", exception);
            }
        }
        if (oldVersion < 11) {
            try {
                FolioleCompanionSchemaInstaller.install(context, database);
            } catch (Exception exception) {
                throw new IllegalStateException("Failed to upgrade companion content blob data schema.", exception);
            }
        }
    }

    FolioleCompanionBootstrapState loadBootstrapState(Context context) {
        SQLiteDatabase database = getWritableDatabase();
        String now = Instant.now().toString();
        String deviceId = loadOrCreateDeviceId(database, now);
        File databaseFile = context.getDatabasePath(DATABASE_NAME);
        return new FolioleCompanionBootstrapState(now, databaseFile.getAbsolutePath(), true, deviceId);
    }

    JSObject loadWorkspaceSyncState() throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        JSObject result = new JSObject();
        String endpointUrl = loadMetaValue(database, WORKSPACE_SYNC_ENDPOINT_URL_KEY);
        String lastSyncedAt = loadMetaValue(database, WORKSPACE_SYNC_LAST_SYNCED_AT_KEY);
        String deviceId = loadOrCreateDeviceId(database, Instant.now().toString());
        JSObject workspaceSnapshot = FolioleCompanionWorkspaceSnapshotExporter.loadWorkspaceSnapshot(database, deviceId);

        result.put("endpoint_url", endpointUrl);
        result.put("last_synced_at", lastSyncedAt);
        result.put("remembered_targets", new JSONArray(loadRememberedTargets(database)));
        result.put("sync_events", new JSONArray(loadSyncEvents(database)));
        result.put("sync_onboarding_status", loadSyncOnboardingStatus(database, lastSyncedAt, workspaceSnapshot));
        result.put("workspace_snapshot", workspaceSnapshot);
        return result;
    }

    JSObject recordWorkspaceSyncEvent(String endpointUrl, String status, String message, String occurredAt) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        saveSyncEvent(database, endpointUrl, status, message, occurredAt);
        return loadWorkspaceSyncState();
    }

    JSObject saveSyncOnboardingStatus(String status) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        saveMetaValue(database, WORKSPACE_SYNC_ONBOARDING_STATUS_KEY, normalizeSyncOnboardingStatus(status), Instant.now().toString());
        return loadWorkspaceSyncState();
    }

    JSObject saveWorkspaceSyncEndpoint(String endpointUrl) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        String now = Instant.now().toString();
        if (endpointUrl == null || endpointUrl.trim().isEmpty()) {
            deleteMetaValue(database, WORKSPACE_SYNC_ENDPOINT_URL_KEY);
        } else {
            String normalizedEndpointUrl = endpointUrl.trim();
            saveMetaValue(database, WORKSPACE_SYNC_ENDPOINT_URL_KEY, normalizedEndpointUrl, now);
            saveRememberedTargets(database, appendRememberedTarget(loadRememberedTargets(database), normalizedEndpointUrl), now);
        }
        return loadWorkspaceSyncState();
    }

    JSObject removeWorkspaceSyncRememberedTarget(String endpointUrl) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        String now = Instant.now().toString();
        String normalizedEndpointUrl = endpointUrl.trim();
        List<String> nextTargets = removeRememberedTarget(loadRememberedTargets(database), normalizedEndpointUrl);
        saveRememberedTargets(database, nextTargets, now);
        String currentEndpointUrl = loadMetaValue(database, WORKSPACE_SYNC_ENDPOINT_URL_KEY);
        if (normalizedEndpointUrl.equals(currentEndpointUrl)) {
            if (nextTargets.isEmpty()) {
                deleteMetaValue(database, WORKSPACE_SYNC_ENDPOINT_URL_KEY);
            } else {
                saveMetaValue(database, WORKSPACE_SYNC_ENDPOINT_URL_KEY, nextTargets.get(0), now);
            }
        }
        return loadWorkspaceSyncState();
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

    JSObject applySyncObjects(JSONArray objects) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        String now = Instant.now().toString();
        String deviceId = loadOrCreateDeviceId(database, now);
        return FolioleCompanionSyncObjectStore.applySyncObjects(database, objects, deviceId);
    }

    JSObject applySyncPack(String packPath) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        String now = Instant.now().toString();
        String deviceId = loadOrCreateDeviceId(database, now);
        File backupFile = FolioleCompanionDatabaseBackup.createPreSyncBackup(context, database, "pack");
        JSObject result = FolioleCompanionSyncPackApply.applyPack(
            database,
            new File(packPath),
            deviceId,
            loadNumberCursorValue(database, SYNC_PACK_CURSOR_KEY)
        );
        int toStateSeq = result.optInt("to_state_seq", 0);
        if (toStateSeq > 0) {
            saveNumberCursorValue(database, SYNC_PACK_CURSOR_KEY, toStateSeq);
        }
        result.put("pre_sync_backup_path", backupFile.getAbsolutePath());
        return result;
    }

    JSObject applyDesktopSyncPack(String url, JSONObject headers) throws Exception {
        File packFile = FolioleCompanionSyncPackTransfer.downloadToCache(context, url, headers);
        try {
            return applySyncPack(packFile.getAbsolutePath());
        } finally {
            if (packFile.exists() && !packFile.delete()) {
                packFile.deleteOnExit();
            }
        }
    }

    JSObject syncAttachmentResource(String attachmentId, String contentHash, String url, JSONObject headers) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionAttachmentResourceStore.syncResource(context, database, attachmentId, contentHash, url, headers);
    }

    JSObject loadMissingContentBlobHashes(int limit) {
        SQLiteDatabase database = getReadableDatabase();
        return FolioleCompanionContentBlobStore.loadMissingHashes(database, limit);
    }

    JSObject syncContentBlob(String hash, String url, JSONObject headers) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionContentBlobStore.syncBlob(database, hash, url, headers);
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

    JSObject searchExternalDocuments(String query, int limit) {
        SQLiteDatabase database = getReadableDatabase();
        return FolioleCompanionExternalDocumentStore.searchDocuments(database, query, limit);
    }

    JSObject applySyncNodeVersions(JSONArray nodes) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionSyncNodeVersionStore.applyNodeVersions(database, nodes);
    }

    JSObject applySyncReviewLog(JSONArray reviews) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionSyncReviewLogStore.applyReviewLog(database, reviews);
    }

    JSObject loadSyncNodeVersions(JSONObject cursor, int limit) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        String deviceId = loadOrCreateDeviceId(database, Instant.now().toString());
        return FolioleCompanionSyncNodeVersionStore.loadNodeVersions(database, cursor, limit, deviceId);
    }

    JSObject loadSyncReviewLog(JSONObject cursor, int limit) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        String deviceId = loadOrCreateDeviceId(database, Instant.now().toString());
        return FolioleCompanionSyncReviewLogStore.loadReviewLog(database, cursor, limit, deviceId);
    }

    JSObject loadSyncStateChanges(Integer cursor, int limit) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionSyncObjectStore.loadSyncStateChanges(database, cursor == null ? 0 : cursor, limit);
    }

    JSObject loadSyncStateCursor() throws Exception {
        return loadNumberCursor(SYNC_STATE_CURSOR_KEY);
    }

    JSObject saveSyncStateCursor(Integer cursor) throws Exception {
        return saveNumberCursor(SYNC_STATE_CURSOR_KEY, cursor);
    }

    JSObject loadSyncPackCursor() throws Exception {
        return loadNumberCursor(SYNC_PACK_CURSOR_KEY);
    }

    JSObject saveSyncPackCursor(Integer cursor) throws Exception {
        return saveNumberCursor(SYNC_PACK_CURSOR_KEY, cursor);
    }

    JSObject loadSyncStatePushCursor() throws Exception {
        return loadNumberCursor(SYNC_STATE_PUSH_CURSOR_KEY);
    }

    JSObject saveSyncStatePushCursor(Integer cursor) throws Exception {
        return saveNumberCursor(SYNC_STATE_PUSH_CURSOR_KEY, cursor);
    }

    JSObject loadSyncNodeVersionCursor() throws Exception {
        return loadSyncEventCursor(SYNC_NODE_VERSION_CURSOR_KEY);
    }

    JSObject saveSyncNodeVersionCursor(JSONObject cursor) throws Exception {
        return saveSyncEventCursor(SYNC_NODE_VERSION_CURSOR_KEY, cursor);
    }

    JSObject loadSyncNodeVersionPushCursor() throws Exception {
        return loadSyncEventCursor(SYNC_NODE_VERSION_PUSH_CURSOR_KEY);
    }

    JSObject saveSyncNodeVersionPushCursor(JSONObject cursor) throws Exception {
        return saveSyncEventCursor(SYNC_NODE_VERSION_PUSH_CURSOR_KEY, cursor);
    }

    JSObject loadSyncReviewLogCursor() throws Exception {
        return loadSyncEventCursor(SYNC_REVIEW_LOG_CURSOR_KEY);
    }

    JSObject saveSyncReviewLogCursor(JSONObject cursor) throws Exception {
        return saveSyncEventCursor(SYNC_REVIEW_LOG_CURSOR_KEY, cursor);
    }

    JSObject loadSyncReviewLogPushCursor() throws Exception {
        return loadSyncEventCursor(SYNC_REVIEW_LOG_PUSH_CURSOR_KEY);
    }

    JSObject saveSyncReviewLogPushCursor(JSONObject cursor) throws Exception {
        return saveSyncEventCursor(SYNC_REVIEW_LOG_PUSH_CURSOR_KEY, cursor);
    }

    JSObject saveSyncSettingRecord(JSONObject record) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        String deviceId = loadOrCreateDeviceId(database, Instant.now().toString());
        return FolioleCompanionSyncStateWriteStore.saveSetting(database, record, deviceId);
    }

    JSObject saveSyncNodeReadingRecord(JSONObject record) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        String deviceId = loadOrCreateDeviceId(database, Instant.now().toString());
        return FolioleCompanionSyncStateWriteStore.saveNodeReading(database, record, deviceId);
    }

    private JSObject loadNumberCursor(String key) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        JSObject result = new JSObject();
        int cursor = loadNumberCursorValue(database, key);
        result.put("cursor", cursor <= 0 ? JSONObject.NULL : cursor);
        return result;
    }

    private JSObject saveNumberCursor(String key, Integer cursor) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        saveNumberCursorValue(database, key, cursor == null ? 0 : cursor);
        return loadNumberCursor(key);
    }

    private int loadNumberCursorValue(SQLiteDatabase database, String key) {
        String stored = loadMetaValue(database, key);
        return stored == null ? 0 : Math.max(0, Integer.parseInt(stored));
    }

    private void saveNumberCursorValue(SQLiteDatabase database, String key, int cursor) {
        if (cursor <= 0) {
            deleteMetaValue(database, key);
        } else {
            saveMetaValue(database, key, String.valueOf(cursor), Instant.now().toString());
        }
    }

    private JSObject loadSyncEventCursor(String key) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        JSObject result = new JSObject();
        String stored = loadMetaValue(database, key);
        result.put("cursor", stored == null ? JSONObject.NULL : new JSONObject(stored));
        return result;
    }

    private JSObject saveSyncEventCursor(String key, JSONObject cursor) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        if (cursor == null || cursor.isNull("created_at") || cursor.isNull("change_id")) {
            deleteMetaValue(database, key);
        } else {
            JSONObject normalized = new JSONObject();
            normalized.put("created_at", cursor.getString("created_at"));
            normalized.put("change_id", cursor.getString("change_id"));
            saveMetaValue(database, key, normalized.toString(), Instant.now().toString());
        }
        return loadSyncEventCursor(key);
    }

    JSObject saveSyncNodeReviewRecord(JSONObject record) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        String deviceId = loadOrCreateDeviceId(database, Instant.now().toString());
        return FolioleCompanionSyncStateWriteStore.saveNodeReview(database, record, deviceId);
    }

    JSObject saveSyncActiveViewState(JSONObject record) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        String deviceId = loadOrCreateDeviceId(database, Instant.now().toString());
        return FolioleCompanionViewStateSyncStore.saveActiveNode(database, record, deviceId);
    }

    JSObject saveSyncNodeViewState(JSONObject record) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        String deviceId = loadOrCreateDeviceId(database, Instant.now().toString());
        return FolioleCompanionViewStateSyncStore.saveNodeViewState(database, record, deviceId);
    }

    JSObject loadReadableArticle() {
        SQLiteDatabase database = getWritableDatabase();
        return FolioleCompanionReadableArticleQuery.loadReadableArticle(database);
    }

    private String loadOrCreateDeviceId(SQLiteDatabase database, String now) {
        String deviceId = loadMetaValue(database, DEVICE_ID_KEY);
        if (deviceId != null) {
            return deviceId;
        }
        String nextDeviceId = "android-" + UUID.randomUUID();
        saveMetaValue(database, DEVICE_ID_KEY, nextDeviceId, now);
        return nextDeviceId;
    }

    private String loadMetaValue(SQLiteDatabase database, String key) {
        try (Cursor cursor = database.query(
            META_TABLE,
            new String[] { "value" },
            "key = ?",
            new String[] { key },
            null,
            null,
            null
        )) {
            if (!cursor.moveToFirst()) {
                return null;
            }
            String stored = cursor.getString(0);
            return stored == null || stored.trim().isEmpty() ? null : stored;
        }
    }

    private void deleteMetaValue(SQLiteDatabase database, String key) {
        database.delete(META_TABLE, "key = ?", new String[] { key });
    }

    private List<JSONObject> loadSyncEvents(SQLiteDatabase database) throws Exception {
        String stored = loadMetaValue(database, WORKSPACE_SYNC_EVENTS_KEY);
        List<JSONObject> events = new ArrayList<>();
        if (stored == null || stored.trim().isEmpty()) {
            return events;
        }
        JSONArray items = new JSONArray(stored);
        for (int index = 0; index < items.length(); index += 1) {
            JSONObject event = items.optJSONObject(index);
            if (event != null) {
                events.add(event);
            }
        }
        return events;
    }

    private void saveSyncEvent(SQLiteDatabase database, String endpointUrl, String status, String message, String occurredAt) throws Exception {
        List<JSONObject> events = loadSyncEvents(database);
        JSONArray nextEvents = new JSONArray();
        JSONObject event = new JSONObject();
        event.put("id", UUID.randomUUID().toString());
        event.put("endpoint_url", endpointUrl == null || endpointUrl.trim().isEmpty() ? JSONObject.NULL : endpointUrl.trim());
        event.put("status", normalizeSyncEventStatus(status));
        event.put("message", message == null || message.trim().isEmpty() ? normalizeSyncEventStatus(status) : message.trim());
        event.put("occurred_at", occurredAt == null || occurredAt.trim().isEmpty() ? Instant.now().toString() : occurredAt.trim());
        nextEvents.put(event);
        for (int index = 0; index < events.size() && index < 19; index += 1) {
            nextEvents.put(events.get(index));
        }
        saveMetaValue(database, WORKSPACE_SYNC_EVENTS_KEY, nextEvents.toString(), Instant.now().toString());
    }

    private String normalizeSyncEventStatus(String status) {
        if (status == null) {
            return "failed";
        }
        String normalized = status.trim();
        if (normalized.equals("started") || normalized.equals("completed") || normalized.equals("failed") || normalized.equals("skipped")) {
            return normalized;
        }
        return "failed";
    }

    private List<String> loadRememberedTargets(SQLiteDatabase database) throws Exception {
        String stored = loadMetaValue(database, WORKSPACE_SYNC_REMEMBERED_TARGETS_KEY);
        List<String> rememberedTargets = new ArrayList<>();
        if (stored == null || stored.trim().isEmpty()) {
            return rememberedTargets;
        }
        JSONArray items = new JSONArray(stored);
        for (int index = 0; index < items.length(); index += 1) {
            String value = items.optString(index, null);
            if (value == null) {
                continue;
            }
            String normalizedValue = value.trim();
            if (!normalizedValue.isEmpty() && !rememberedTargets.contains(normalizedValue)) {
                rememberedTargets.add(normalizedValue);
            }
        }
        return rememberedTargets;
    }

    private List<String> appendRememberedTarget(List<String> rememberedTargets, String endpointUrl) {
        List<String> nextTargets = new ArrayList<>();
        nextTargets.add(endpointUrl);
        for (String target : rememberedTargets) {
            if (!endpointUrl.equals(target)) {
                nextTargets.add(target);
            }
        }
        return nextTargets;
    }

    private List<String> removeRememberedTarget(List<String> rememberedTargets, String endpointUrl) {
        List<String> nextTargets = new ArrayList<>();
        for (String target : rememberedTargets) {
            if (!endpointUrl.equals(target)) {
                nextTargets.add(target);
            }
        }
        return nextTargets;
    }

    private String loadSyncOnboardingStatus(SQLiteDatabase database, String lastSyncedAt, JSObject workspaceSnapshot) {
        String status = loadMetaValue(database, WORKSPACE_SYNC_ONBOARDING_STATUS_KEY);
        if (isValidSyncOnboardingStatus(status)) {
            return status.trim();
        }
        if (lastSyncedAt != null || workspaceSnapshot != null) {
            return "completed";
        }
        return "pending";
    }

    private String normalizeSyncOnboardingStatus(String status) {
        if (isValidSyncOnboardingStatus(status)) {
            return status.trim();
        }
        return "pending";
    }

    private boolean isValidSyncOnboardingStatus(String status) {
        if (status == null) {
            return false;
        }
        String normalized = status.trim();
        return normalized.equals("accepted") ||
            normalized.equals("completed") ||
            normalized.equals("dismissed") ||
            normalized.equals("pending");
    }

    private void saveRememberedTargets(SQLiteDatabase database, List<String> rememberedTargets, String updatedAt) {
        saveMetaValue(
            database,
            WORKSPACE_SYNC_REMEMBERED_TARGETS_KEY,
            new JSONArray(rememberedTargets).toString(),
            updatedAt
        );
    }

    private void saveMetaValue(SQLiteDatabase database, String key, String value, String updatedAt) {
        ContentValues values = new ContentValues();
        values.put("key", key);
        values.put("value", value);
        values.put("updated_at", updatedAt);
        database.insertWithOnConflict(META_TABLE, null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }
}
