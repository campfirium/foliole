package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

final class FolioleCompanionSyncDiagnosticStorage {
    private FolioleCompanionSyncDiagnosticStorage() {}

    static JSObject load(SQLiteDatabase database) throws Exception {
        JSObject storage = new JSObject();
        storage.put("active_node_count", count(database, "SELECT COUNT(*) FROM nodes WHERE deleted_at IS NULL"));
        storage.put("external_document_count", count(database, "SELECT COUNT(*) FROM external_documents"));
        storage.put("content_blob_count", count(database, "SELECT COUNT(*) FROM content_blobs"));
        storage.put("missing_node_state_count", count(database,
            "SELECT COUNT(*) FROM nodes n LEFT JOIN sync_object_state s " +
                "ON s.object_type = 'node' AND s.object_id = n.id " +
                "WHERE n.deleted_at IS NULL AND s.object_id IS NULL"
        ));
        storage.put("missing_node_version_count", count(database,
            "SELECT COUNT(*) FROM nodes WHERE deleted_at IS NULL " +
                "AND (current_version_id IS NULL OR current_version_id = '')"
        ));
        storage.put("node_blob_references_missing_rows", count(database,
            "SELECT COUNT(*) FROM nodes n LEFT JOIN content_blobs cb ON cb.hash = n.body_blob_hash " +
                "WHERE n.deleted_at IS NULL AND n.body_blob_hash IS NOT NULL AND cb.hash IS NULL"
        ));
        return storage;
    }

    private static long count(SQLiteDatabase database, String sql) {
        try (Cursor cursor = database.rawQuery(sql, null)) {
            return cursor.moveToFirst() ? cursor.getLong(0) : 0L;
        }
    }
}
