package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

final class FolioleCompanionContentBlobMissingStore {
    private FolioleCompanionContentBlobMissingStore() {}

    static JSObject loadMissingHashes(SQLiteDatabase database, int limit) {
        JSArray hashes = new JSArray();
        JSArray blobs = new JSArray();
        try (Cursor cursor = database.rawQuery(
            "WITH body_refs AS (" +
                "SELECT n.body_blob_hash AS hash, " +
                    "CASE WHEN n.id = (SELECT value FROM workspace_meta WHERE key = 'active_node_id' LIMIT 1) THEN 0 " +
                        "WHEN nr.due IS NOT NULL AND nr.due <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now') THEN 1 " +
                        "WHEN n.parent_id IS NULL THEN 2 ELSE 3 END AS priority, " +
                    "COALESCE(rd.last_handled_at, n.updated_at) AS updated_at " +
                "FROM nodes n LEFT JOIN node_review nr ON nr.node_id = n.id " +
                "LEFT JOIN node_reading rd ON rd.node_id = n.id " +
                "WHERE n.body_blob_hash IS NOT NULL AND n.deleted_at IS NULL " +
                "UNION ALL SELECT ed.body_blob_hash AS hash, 4 AS priority, ed.updated_at AS updated_at " +
                "FROM external_documents ed WHERE ed.body_blob_hash IS NOT NULL AND ed.is_present = 1" +
            "), ranked_refs AS (" +
                "SELECT hash, MIN(priority) AS priority, MAX(updated_at) AS updated_at FROM body_refs GROUP BY hash" +
            ") SELECT cb.hash, COALESCE(cb.stored_size_bytes, 0) FROM content_blobs cb " +
                "JOIN ranked_refs refs ON refs.hash = cb.hash LEFT JOIN content_blob_data cbd ON cbd.hash = cb.hash " +
                "WHERE cb.kind = 'text_body' AND cbd.hash IS NULL " +
                "ORDER BY CASE WHEN refs.priority = 0 THEN 0 WHEN cb.availability = 'failed' THEN 2 ELSE 1 END ASC, " +
                    "refs.priority ASC, refs.updated_at DESC, cb.created_at ASC LIMIT ?",
            new String[] { String.valueOf(Math.max(1, limit)) }
        )) {
            while (cursor.moveToNext()) {
                hashes.put(cursor.getString(0));
                JSObject blob = new JSObject();
                blob.put("hash", cursor.getString(0));
                blob.put("size_bytes", cursor.getLong(1));
                blobs.put(blob);
            }
        }
        JSObject result = new JSObject();
        result.put("hashes", hashes);
        result.put("blobs", blobs);
        return result;
    }

    static JSObject summarizeMissingBodies(SQLiteDatabase database) {
        long count = 0;
        long bytes = 0;
        long failedCount = 0;
        long failedBytes = 0;
        try (Cursor cursor = database.rawQuery(
            "WITH body_refs AS (" +
                "SELECT n.body_blob_hash AS hash FROM nodes n WHERE n.body_blob_hash IS NOT NULL AND n.deleted_at IS NULL " +
                "UNION SELECT ed.body_blob_hash AS hash FROM external_documents ed " +
                "WHERE ed.body_blob_hash IS NOT NULL AND ed.is_present = 1" +
            ") SELECT cb.hash, COALESCE(cb.stored_size_bytes, 0), cb.availability FROM content_blobs cb " +
                "JOIN body_refs refs ON refs.hash = cb.hash LEFT JOIN content_blob_data cbd ON cbd.hash = cb.hash " +
                "WHERE cb.kind = 'text_body' AND cbd.hash IS NULL",
            null
        )) {
            while (cursor.moveToNext()) {
                count++;
                long sizeBytes = cursor.getLong(1);
                bytes += sizeBytes;
                if ("failed".equals(cursor.getString(2))) {
                    failedCount++;
                    failedBytes += sizeBytes;
                }
            }
        }
        JSObject summary = new JSObject();
        summary.put("missing_content_blob_count", count);
        summary.put("missing_content_blob_bytes", bytes);
        summary.put("failed_content_blob_count", failedCount);
        summary.put("failed_content_blob_bytes", failedBytes);
        return summary;
    }
}
