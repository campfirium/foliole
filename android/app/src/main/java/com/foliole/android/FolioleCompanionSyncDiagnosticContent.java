package com.foliole.android;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONObject;

final class FolioleCompanionSyncDiagnosticContent {
    private FolioleCompanionSyncDiagnosticContent() {}

    static JSObject load(Context context, SQLiteDatabase database) throws Exception {
        JSObject content = new JSObject();
        copyBodySummary(content, FolioleCompanionContentBlobStore.summarizeMissingBodies(context, database));
        content.put("missing_topic_body_count", count(database,
            "SELECT COUNT(DISTINCT n.body_blob_hash) FROM nodes n " +
                "JOIN content_blobs cb ON cb.hash = n.body_blob_hash " +
                "LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash " +
                "WHERE n.deleted_at IS NULL AND n.body_blob_hash IS NOT NULL " +
                "AND cb.kind = 'text_body' AND cbd.hash IS NULL"
        ));
        content.put("missing_top_level_topic_body_count", count(database,
            "SELECT COUNT(DISTINCT n.body_blob_hash) FROM nodes n " +
                "JOIN content_blobs cb ON cb.hash = n.body_blob_hash " +
                "LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash " +
                "WHERE n.deleted_at IS NULL AND n.parent_id IS NULL AND n.body_blob_hash IS NOT NULL " +
                "AND cb.kind = 'text_body' AND cbd.hash IS NULL"
        ));
        content.put("missing_nested_topic_body_count", count(database,
            "SELECT COUNT(DISTINCT n.body_blob_hash) FROM nodes n " +
                "JOIN content_blobs cb ON cb.hash = n.body_blob_hash " +
                "LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash " +
                "WHERE n.deleted_at IS NULL AND n.parent_id IS NOT NULL AND n.body_blob_hash IS NOT NULL " +
                "AND cb.kind = 'text_body' AND cbd.hash IS NULL"
        ));
        content.put("missing_external_document_body_count", count(database,
            "SELECT COUNT(DISTINCT ed.body_blob_hash) FROM external_documents ed " +
                "JOIN content_blobs cb ON cb.hash = ed.body_blob_hash " +
                "LEFT JOIN content_blob_data cbd ON cbd.hash = ed.body_blob_hash " +
                "WHERE ed.is_present = 1 AND ed.body_blob_hash IS NOT NULL " +
                "AND cb.kind = 'text_body' AND cbd.hash IS NULL"
        ));
        content.put("missing_due_review_body_count", count(database,
            "SELECT COUNT(DISTINCT n.body_blob_hash) FROM nodes n " +
                "JOIN node_review nr ON nr.node_id = n.id " +
                "JOIN content_blobs cb ON cb.hash = n.body_blob_hash " +
                "LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash " +
                "WHERE n.deleted_at IS NULL AND n.body_blob_hash IS NOT NULL " +
                "AND nr.due <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now') " +
                "AND cb.kind = 'text_body' AND cbd.hash IS NULL"
        ));
        content.put("missing_active_topic_body_count", count(database,
            "SELECT COUNT(DISTINCT n.body_blob_hash) FROM nodes n " +
                "JOIN content_blobs cb ON cb.hash = n.body_blob_hash " +
                "LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash " +
                "WHERE n.deleted_at IS NULL AND n.body_blob_hash IS NOT NULL " +
                "AND n.id = (SELECT value FROM workspace_meta WHERE key = 'active_node_id' LIMIT 1) " +
                "AND cb.kind = 'text_body' AND cbd.hash IS NULL"
        ));
        copyAttachmentSummary(content, FolioleCompanionAttachmentResourceStore.summarizeMissingResources(context, database));
        content.put("active_topic", loadActiveTopic(database));
        content.put("recent_topics", loadRecentTopics(database));
        return content;
    }

    private static void copyBodySummary(JSObject content, JSObject summary) throws Exception {
        content.put("missing_content_blob_count", summary.optLong("missing_content_blob_count", 0));
        content.put("missing_content_blob_bytes", summary.optLong("missing_content_blob_bytes", 0));
        content.put("failed_content_blob_count", summary.optLong("failed_content_blob_count", 0));
        content.put("failed_content_blob_bytes", summary.optLong("failed_content_blob_bytes", 0));
    }

    private static void copyAttachmentSummary(JSObject content, JSObject summary) throws Exception {
        content.put("missing_attachment_resource_count", summary.optLong("missing_attachment_resource_count", 0));
        content.put("missing_attachment_resource_bytes", summary.optLong("missing_attachment_resource_bytes", 0));
        content.put("failed_attachment_resource_count", summary.optLong("failed_attachment_resource_count", 0));
        content.put("failed_attachment_resource_bytes", summary.optLong("failed_attachment_resource_bytes", 0));
        content.put("missing_active_topic_attachment_resource_count", summary.optLong("missing_active_topic_attachment_resource_count", 0));
        content.put("missing_image_attachment_resource_count", summary.optLong("missing_image_attachment_resource_count", 0));
        content.put("missing_image_attachment_resource_bytes", summary.optLong("missing_image_attachment_resource_bytes", 0));
        content.put("missing_pdf_attachment_resource_count", summary.optLong("missing_pdf_attachment_resource_count", 0));
        content.put("missing_pdf_attachment_resource_bytes", summary.optLong("missing_pdf_attachment_resource_bytes", 0));
        content.put("missing_other_attachment_resource_count", summary.optLong("missing_other_attachment_resource_count", 0));
        content.put("missing_other_attachment_resource_bytes", summary.optLong("missing_other_attachment_resource_bytes", 0));
        content.put("missing_due_review_attachment_resource_count", summary.optLong("missing_due_review_attachment_resource_count", 0));
    }

    private static JSObject loadActiveTopic(SQLiteDatabase database) throws Exception {
        String activeNodeId = loadWorkspaceMetaValue(database, "active_node_id");
        if (activeNodeId == null) return null;
        try (Cursor cursor = database.rawQuery(
            "SELECT n.id, n.title, CASE " +
                "WHEN n.body_blob_hash IS NOT NULL AND cbd.hash IS NULL AND cb.availability IN ('fetching', 'failed') THEN cb.availability " +
                "WHEN n.body_blob_hash IS NOT NULL AND cbd.hash IS NULL THEN 'missing' " +
                "WHEN TRIM(COALESCE(CAST(cbd.data AS TEXT), n.content)) = '' THEN 'empty' ELSE 'ready' END " +
            "FROM nodes n LEFT JOIN content_blobs cb ON cb.hash = n.body_blob_hash " +
            "LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash " +
            "WHERE n.id = ? AND n.deleted_at IS NULL LIMIT 1",
            new String[] { activeNodeId }
        )) {
            if (!cursor.moveToFirst()) return null;
            JSObject row = new JSObject();
            row.put("id", cursor.getString(0));
            row.put("title", cursor.getString(1));
            row.put("body_status", cursor.getString(2));
            return row;
        }
    }

    private static JSArray loadRecentTopics(SQLiteDatabase database) throws Exception {
        JSArray items = new JSArray();
        try (Cursor cursor = database.rawQuery(
            "SELECT n.id, n.title, n.body_blob_hash, cb.availability FROM nodes n " +
                "LEFT JOIN content_blobs cb ON cb.hash = n.body_blob_hash " +
                "WHERE n.deleted_at IS NULL ORDER BY n.updated_at DESC LIMIT 20",
            null
        )) {
            while (cursor.moveToNext()) {
                JSObject row = new JSObject();
                row.put("id", cursor.getString(0));
                row.put("title", cursor.getString(1));
                row.put("body_blob_hash", cursor.isNull(2) ? JSONObject.NULL : cursor.getString(2));
                row.put("blob_availability", cursor.isNull(3) ? JSONObject.NULL : cursor.getString(3));
                items.put(row);
            }
        }
        return items;
    }

    private static long count(SQLiteDatabase database, String sql) {
        try (Cursor cursor = database.rawQuery(sql, null)) {
            return cursor.moveToFirst() ? cursor.getLong(0) : 0L;
        }
    }

    private static String loadWorkspaceMetaValue(SQLiteDatabase database, String key) {
        try (Cursor cursor = database.rawQuery("SELECT value FROM workspace_meta WHERE key = ? LIMIT 1", new String[] { key })) {
            if (!cursor.moveToFirst()) return null;
            String value = cursor.getString(0);
            return value == null || value.trim().isEmpty() ? null : value;
        }
    }
}
