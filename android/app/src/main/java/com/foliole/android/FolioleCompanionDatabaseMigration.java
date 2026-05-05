package com.foliole.android;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

final class FolioleCompanionDatabaseMigration {

    private static final String META_TABLE = "companion_meta";

    private FolioleCompanionDatabaseMigration() {}

    static void create(Context context, SQLiteDatabase database) {
        createMetaTable(database);
        installSchema(context, database, "Failed to install companion schema.");
        addSyncBaseContentHashIfMissing(database);
        createSyncPushAckTable(database);
    }

    static void upgrade(Context context, SQLiteDatabase database, int oldVersion) {
        if (oldVersion < 4) {
            installSchema(context, database, "Failed to upgrade companion schema.");
        }
        if (oldVersion < 5) {
            migrateSyncObjectStateSequence(database);
            installSchema(context, database, "Failed to upgrade companion sync schema.");
        }
        if (oldVersion < 6) {
            installSchema(context, database, "Failed to upgrade companion node version schema.");
        }
        if (oldVersion < 7) {
            installSchema(context, database, "Failed to upgrade companion review log schema.");
        }
        if (oldVersion < 8) {
            installSchema(context, database, "Failed to upgrade companion attachment link schema.");
        }
        if (oldVersion < 9) {
            FolioleCompanionNodeAttachmentStore.backfillNodeAttachmentsFromVersions(database);
        }
        if (oldVersion < 10) {
            installSchema(context, database, "Failed to upgrade companion content blob schema.");
        }
        if (oldVersion < 11) {
            installSchema(context, database, "Failed to upgrade companion content blob data schema.");
        }
        if (oldVersion < 12) {
            installSchema(context, database, "Failed to upgrade companion view state source schema.");
            addNodeViewStateSourceIfMissing(database);
        }
        if (oldVersion < 13) {
            installSchema(context, database, "Failed to upgrade companion push base reference schema.");
            addSyncBaseContentHashIfMissing(database);
        }
        if (oldVersion < 14) {
            createSyncPushAckTable(database);
        }
    }

    private static void createMetaTable(SQLiteDatabase database) {
        database.execSQL(
            "CREATE TABLE IF NOT EXISTS " + META_TABLE + " (" +
                "key TEXT PRIMARY KEY NOT NULL," +
                "value TEXT NOT NULL," +
                "updated_at TEXT NOT NULL" +
                ")"
        );
    }

    private static void installSchema(Context context, SQLiteDatabase database, String errorMessage) {
        try {
            FolioleCompanionSchemaInstaller.install(context, database);
        } catch (Exception exception) {
            throw new IllegalStateException(errorMessage, exception);
        }
    }

    private static void migrateSyncObjectStateSequence(SQLiteDatabase database) {
        if (!tableExists(database, "sync_object_state") || columnExists(database, "sync_object_state", "state_seq")) {
            return;
        }
        database.beginTransaction();
        try {
            createSyncObjectStateNextTable(database);
            copyLegacySyncObjectStateRows(database);
            database.execSQL("DROP TABLE sync_object_state");
            database.execSQL("ALTER TABLE sync_object_state_next RENAME TO sync_object_state");
            createSyncObjectStateIndexes(database);
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
    }

    private static void createSyncObjectStateNextTable(SQLiteDatabase database) {
        database.execSQL(
            "CREATE TABLE sync_object_state_next (" +
                "object_type TEXT NOT NULL," +
                "object_id TEXT NOT NULL," +
                "state_seq INTEGER NOT NULL," +
                "current_version_id TEXT," +
                "content_hash TEXT NOT NULL," +
                "last_modified_by_device_id TEXT NOT NULL," +
                "updated_at TEXT NOT NULL," +
                "deleted_at TEXT," +
                "sync_dirty INTEGER NOT NULL DEFAULT 0," +
                "base_content_hash TEXT," +
                "PRIMARY KEY (object_type, object_id)," +
                "UNIQUE (state_seq)" +
                ")"
        );
    }

    private static void copyLegacySyncObjectStateRows(SQLiteDatabase database) {
        try (Cursor cursor = database.query(
            "sync_object_state",
            new String[] {
                "object_type",
                "object_id",
                "current_version_id",
                "content_hash",
                "last_modified_by_device_id",
                "updated_at",
                "deleted_at",
                "sync_dirty"
            },
            null,
            null,
            null,
            null,
            "updated_at ASC, object_type ASC, object_id ASC"
        )) {
            int stateSeq = 1;
            while (cursor.moveToNext()) {
                ContentValues values = new ContentValues();
                values.put("object_type", cursor.getString(0));
                values.put("object_id", cursor.getString(1));
                values.put("state_seq", stateSeq);
                values.put("current_version_id", cursor.isNull(2) ? null : cursor.getString(2));
                values.put("content_hash", cursor.getString(3));
                values.put("last_modified_by_device_id", cursor.getString(4));
                values.put("updated_at", cursor.getString(5));
                values.put("deleted_at", cursor.isNull(6) ? null : cursor.getString(6));
                values.put("sync_dirty", cursor.getInt(7));
                values.put("base_content_hash", (String) null);
                database.insertOrThrow("sync_object_state_next", null, values);
                stateSeq += 1;
            }
        }
    }

    private static void addSyncBaseContentHashIfMissing(SQLiteDatabase database) {
        if (columnExists(database, "sync_object_state", "base_content_hash")) {
            return;
        }
        database.execSQL("ALTER TABLE sync_object_state ADD COLUMN base_content_hash TEXT");
    }

    private static void createSyncPushAckTable(SQLiteDatabase database) {
        database.execSQL(
            "CREATE TABLE IF NOT EXISTS sync_push_ack (" +
                "client_op_id TEXT PRIMARY KEY NOT NULL," +
                "object_type TEXT NOT NULL," +
                "object_id TEXT NOT NULL," +
                "state_seq INTEGER," +
                "status TEXT NOT NULL," +
                "acked_at TEXT NOT NULL" +
                ")"
        );
        database.execSQL(
            "CREATE INDEX IF NOT EXISTS idx_sync_push_ack_identity " +
                "ON sync_push_ack (object_type, object_id, state_seq)"
        );
    }

    private static void addNodeViewStateSourceIfMissing(SQLiteDatabase database) {
        if (columnExists(database, "node_view_state", "source")) {
            return;
        }
        database.execSQL("ALTER TABLE node_view_state ADD COLUMN source TEXT NOT NULL DEFAULT 'user-scroll'");
    }

    private static void createSyncObjectStateIndexes(SQLiteDatabase database) {
        database.execSQL("CREATE INDEX IF NOT EXISTS idx_sync_object_state_seq ON sync_object_state (state_seq)");
        database.execSQL("CREATE INDEX IF NOT EXISTS idx_sync_object_state_type_seq ON sync_object_state (object_type, state_seq)");
    }

    private static boolean tableExists(SQLiteDatabase database, String table) {
        try (Cursor cursor = database.rawQuery(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
            new String[] { table }
        )) {
            return cursor.moveToFirst();
        }
    }

    private static boolean columnExists(SQLiteDatabase database, String table, String column) {
        try (Cursor cursor = database.rawQuery("PRAGMA table_info(" + table + ")", null)) {
            while (cursor.moveToNext()) {
                if (column.equals(cursor.getString(cursor.getColumnIndexOrThrow("name")))) {
                    return true;
                }
            }
        }
        return false;
    }
}
