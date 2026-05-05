package com.foliole.android;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import java.io.File;

final class FolioleCompanionAttachmentResourceMissingStore {
    private FolioleCompanionAttachmentResourceMissingStore() {}

    static JSObject loadMissingResources(Context context, SQLiteDatabase database, int limit) {
        JSArray resources = new JSArray();
        try (Cursor cursor = database.rawQuery(
            "WITH attachment_refs AS (" +
                "SELECT na.attachment_id AS attachment_id, " +
                    "CASE WHEN n.id = (SELECT value FROM workspace_meta WHERE key = 'active_node_id' LIMIT 1) THEN 0 " +
                        "WHEN nr.due IS NOT NULL AND nr.due <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now') THEN 1 ELSE 2 END AS priority, " +
                    "n.updated_at AS updated_at FROM node_attachments na JOIN nodes n ON n.id = na.node_id " +
                "LEFT JOIN node_review nr ON nr.node_id = n.id WHERE n.deleted_at IS NULL" +
            "), ranked_refs AS (" +
                "SELECT attachment_id, MIN(priority) AS priority, MAX(updated_at) AS updated_at FROM attachment_refs GROUP BY attachment_id" +
            ") SELECT b.attachment_id, b.content_hash, COALESCE(b.size_bytes, 0), b.availability, b.storage_key FROM attachment_blobs b " +
                "LEFT JOIN ranked_refs refs ON refs.attachment_id = b.attachment_id " +
                "WHERE b.content_hash IS NOT NULL AND TRIM(b.content_hash) != '' " +
                "ORDER BY CASE WHEN refs.priority = 0 THEN 0 WHEN b.availability = 'failed' THEN 2 ELSE 1 END ASC, " +
                    "COALESCE(refs.priority, 3) ASC, refs.updated_at DESC, b.created_at ASC",
            null
        )) {
            int maxResources = Math.max(1, limit);
            while (cursor.moveToNext() && resources.length() < maxResources) {
                if (!isMissingResource(context, cursor.getString(3), cursor.isNull(4) ? null : cursor.getString(4))) continue;
                JSObject resource = new JSObject();
                resource.put("attachment_id", cursor.getString(0));
                resource.put("content_hash", cursor.getString(1));
                resource.put("size_bytes", cursor.getLong(2));
                resources.put(resource);
            }
        }
        JSObject result = new JSObject();
        result.put("resources", resources);
        return result;
    }

    static JSObject summarizeMissingResources(Context context, SQLiteDatabase database) {
        MissingAttachmentSummary summary = new MissingAttachmentSummary();
        try (Cursor cursor = database.rawQuery(
            "SELECT b.availability, b.storage_key, COALESCE(b.size_bytes, 0), lower(COALESCE(b.mime_type, '')), " +
                "EXISTS(SELECT 1 FROM node_attachments na JOIN nodes n ON n.id = na.node_id " +
                    "JOIN node_review nr ON nr.node_id = n.id WHERE na.attachment_id = b.attachment_id " +
                    "AND n.deleted_at IS NULL AND nr.due <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now') LIMIT 1), " +
                "EXISTS(SELECT 1 FROM node_attachments na JOIN nodes n ON n.id = na.node_id " +
                    "WHERE na.attachment_id = b.attachment_id AND n.deleted_at IS NULL " +
                    "AND n.id = (SELECT value FROM workspace_meta WHERE key = 'active_node_id' LIMIT 1) LIMIT 1) " +
            "FROM attachment_blobs b WHERE b.content_hash IS NOT NULL AND TRIM(b.content_hash) != ''",
            null
        )) {
            while (cursor.moveToNext()) {
                if (!isMissingResource(context, cursor.getString(0), cursor.isNull(1) ? null : cursor.getString(1))) continue;
                summary.add(cursor.getString(0), cursor.getLong(2), cursor.getString(3), cursor.getLong(4) > 0, cursor.getLong(5) > 0);
            }
        }
        return summary.toJson();
    }

    static JSObject loadMissingResource(Context context, SQLiteDatabase database, String attachmentId) {
        String normalizedAttachmentId = requireText(attachmentId, "attachment_id");
        JSObject result = new JSObject();
        try (Cursor cursor = database.rawQuery(
            "SELECT attachment_id, content_hash, COALESCE(size_bytes, 0), availability, storage_key FROM attachment_blobs " +
                "WHERE attachment_id = ? AND content_hash IS NOT NULL AND TRIM(content_hash) != '' LIMIT 1",
            new String[] { normalizedAttachmentId }
        )) {
            if (!cursor.moveToFirst()) {
                result.put("resource", null);
                return result;
            }
            if (!isMissingResource(context, cursor.getString(3), cursor.isNull(4) ? null : cursor.getString(4))) {
                result.put("resource", null);
                return result;
            }
            JSObject resource = new JSObject();
            resource.put("attachment_id", cursor.getString(0));
            resource.put("content_hash", cursor.getString(1));
            resource.put("size_bytes", cursor.getLong(2));
            result.put("resource", resource);
            return result;
        }
    }

    private static boolean isMissingResource(Context context, String availability, String storageKey) {
        return !"cached".equals(availability) || !hasAttachmentFile(context, storageKey);
    }

    private static boolean hasAttachmentFile(Context context, String storageKey) {
        if (storageKey == null || storageKey.trim().isEmpty()) return false;
        File file = new File(new File(context.getFilesDir(), "attachments"), storageKey.trim());
        return file.exists() && file.isFile();
    }

    private static String requireText(String value, String field) {
        if (value == null || value.trim().isEmpty()) throw new IllegalArgumentException(field + " is required.");
        return value.trim();
    }

    private static final class MissingAttachmentSummary {
        long count;
        long bytes;
        long failedCount;
        long failedBytes;
        long imageCount;
        long imageBytes;
        long pdfCount;
        long pdfBytes;
        long otherCount;
        long otherBytes;
        long activeTopicCount;
        long dueReviewCount;

        void add(String availability, long sizeBytes, String mimeType, boolean dueReview, boolean activeTopic) {
            count++;
            bytes += sizeBytes;
            if ("failed".equals(availability)) {
                failedCount++;
                failedBytes += sizeBytes;
            }
            if (mimeType.startsWith("image/")) {
                imageCount++;
                imageBytes += sizeBytes;
            } else if (mimeType.equals("application/pdf")) {
                pdfCount++;
                pdfBytes += sizeBytes;
            } else {
                otherCount++;
                otherBytes += sizeBytes;
            }
            if (dueReview) dueReviewCount++;
            if (activeTopic) activeTopicCount++;
        }

        JSObject toJson() {
            JSObject summary = new JSObject();
            summary.put("missing_attachment_resource_count", count);
            summary.put("missing_attachment_resource_bytes", bytes);
            summary.put("failed_attachment_resource_count", failedCount);
            summary.put("failed_attachment_resource_bytes", failedBytes);
            summary.put("missing_image_attachment_resource_count", imageCount);
            summary.put("missing_image_attachment_resource_bytes", imageBytes);
            summary.put("missing_pdf_attachment_resource_count", pdfCount);
            summary.put("missing_pdf_attachment_resource_bytes", pdfBytes);
            summary.put("missing_other_attachment_resource_count", otherCount);
            summary.put("missing_other_attachment_resource_bytes", otherBytes);
            summary.put("missing_active_topic_attachment_resource_count", activeTopicCount);
            summary.put("missing_due_review_attachment_resource_count", dueReviewCount);
            return summary;
        }
    }
}
