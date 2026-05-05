package com.foliole.android;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.io.File;
import java.time.Instant;
import java.util.UUID;

final class FolioleCompanionDatabaseHelper extends SQLiteOpenHelper {

    static final String DATABASE_NAME = "foliole-companion.db";
    private static final int DATABASE_VERSION = 2;
    private static final String META_TABLE = "companion_meta";
    private static final String DEVICE_ID_KEY = "device_id";
    private static final String WORKSPACE_SYNC_ENDPOINT_URL_KEY = "workspace_sync_endpoint_url";
    private static final String WORKSPACE_SYNC_LAST_SYNCED_AT_KEY = "workspace_sync_last_synced_at";
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
        JSObject workspaceSnapshot = FolioleCompanionWorkspaceSnapshotExporter.loadWorkspaceSnapshot(database);

        result.put("endpoint_url", endpointUrl);
        result.put("last_synced_at", lastSyncedAt);
        result.put("workspace_snapshot", workspaceSnapshot);
        return result;
    }

    JSObject saveWorkspaceSyncEndpoint(String endpointUrl) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        String now = Instant.now().toString();
        if (endpointUrl == null || endpointUrl.trim().isEmpty()) {
            deleteMetaValue(database, WORKSPACE_SYNC_ENDPOINT_URL_KEY);
        } else {
            saveMetaValue(database, WORKSPACE_SYNC_ENDPOINT_URL_KEY, endpointUrl.trim(), now);
        }
        return loadWorkspaceSyncState();
    }

    JSObject replaceWorkspaceSnapshot(String endpointUrl, String lastSyncedAt, String workspaceSnapshotJson) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        FolioleCompanionSnapshotImporter.replaceWorkspaceSnapshot(database, workspaceSnapshotJson, lastSyncedAt);
        saveMetaValue(database, WORKSPACE_SYNC_ENDPOINT_URL_KEY, endpointUrl.trim(), lastSyncedAt);
        saveMetaValue(database, WORKSPACE_SYNC_LAST_SYNCED_AT_KEY, lastSyncedAt.trim(), lastSyncedAt);
        return loadWorkspaceSyncState();
    }

    JSObject replaceWorkspaceNode(String endpointUrl, String lastSyncedAt, String nodeId, String nodeSnapshotJson) throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        database.beginTransaction();
        try {
            String deviceId = loadOrCreateDeviceId(database, lastSyncedAt);
            FolioleCompanionNodeSnapshotWriter.upsertNodeSnapshot(
                database,
                nodeId,
                new JSONObject(nodeSnapshotJson),
                lastSyncedAt,
                true,
                deviceId
            );
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
        saveMetaValue(database, WORKSPACE_SYNC_ENDPOINT_URL_KEY, endpointUrl.trim(), lastSyncedAt);
        saveMetaValue(database, WORKSPACE_SYNC_LAST_SYNCED_AT_KEY, lastSyncedAt.trim(), lastSyncedAt);
        return loadWorkspaceSyncState();
    }

    JSObject loadDirtyNodes() throws Exception {
        SQLiteDatabase database = getWritableDatabase();
        String now = Instant.now().toString();
        String deviceId = loadOrCreateDeviceId(database, now);
        String lastSyncedAt = loadMetaValue(database, WORKSPACE_SYNC_LAST_SYNCED_AT_KEY);
        return FolioleCompanionDirtyNodeExport.loadDirtyNodes(database, deviceId, lastSyncedAt);
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

    private void saveMetaValue(SQLiteDatabase database, String key, String value, String updatedAt) {
        ContentValues values = new ContentValues();
        values.put("key", key);
        values.put("value", value);
        values.put("updated_at", updatedAt);
        database.insertWithOnConflict(META_TABLE, null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }
}
