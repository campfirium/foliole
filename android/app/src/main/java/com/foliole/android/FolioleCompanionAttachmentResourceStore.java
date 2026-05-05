package com.foliole.android;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.net.Uri;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.time.Instant;

final class FolioleCompanionAttachmentResourceStore {
    private FolioleCompanionAttachmentResourceStore() {}

    static JSObject loadMissingResources(Context context, SQLiteDatabase database, int limit) {
        JSArray resources = new JSArray();
        try (Cursor cursor = database.rawQuery(
            "WITH attachment_refs AS (" +
                "SELECT na.attachment_id AS attachment_id, " +
                    "CASE " +
                        "WHEN n.id = (SELECT value FROM workspace_meta WHERE key = 'active_node_id' LIMIT 1) THEN 0 " +
                        "WHEN nr.due IS NOT NULL AND nr.due <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now') THEN 1 " +
                        "ELSE 2 END AS priority, " +
                    "n.updated_at AS updated_at " +
                "FROM node_attachments na JOIN nodes n ON n.id = na.node_id " +
                "LEFT JOIN node_review nr ON nr.node_id = n.id " +
                "WHERE n.deleted_at IS NULL" +
            "), ranked_refs AS (" +
                "SELECT attachment_id, MIN(priority) AS priority, MAX(updated_at) AS updated_at " +
                "FROM attachment_refs GROUP BY attachment_id" +
            ") " +
            "SELECT b.attachment_id, b.content_hash, COALESCE(b.size_bytes, 0), b.availability, b.storage_key FROM attachment_blobs b " +
                "LEFT JOIN ranked_refs refs ON refs.attachment_id = b.attachment_id " +
                "WHERE b.content_hash IS NOT NULL AND TRIM(b.content_hash) != '' " +
                "ORDER BY COALESCE(refs.priority, 3) ASC, refs.updated_at DESC, b.created_at ASC",
            null
        )) {
            int maxResources = Math.max(1, limit);
            while (cursor.moveToNext() && resources.length() < maxResources) {
                if (!isMissingResource(context, cursor.getString(3), cursor.isNull(4) ? null : cursor.getString(4))) {
                    continue;
                }
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
        long count = 0;
        long bytes = 0;
        long imageCount = 0;
        long imageBytes = 0;
        long pdfCount = 0;
        long pdfBytes = 0;
        long otherCount = 0;
        long otherBytes = 0;
        long activeTopicCount = 0;
        long dueReviewCount = 0;
        try (Cursor cursor = database.rawQuery(
            "SELECT b.availability, b.storage_key, COALESCE(b.size_bytes, 0), lower(COALESCE(b.mime_type, '')), " +
                "EXISTS(" +
                    "SELECT 1 FROM node_attachments na " +
                    "JOIN nodes n ON n.id = na.node_id " +
                    "JOIN node_review nr ON nr.node_id = n.id " +
                    "WHERE na.attachment_id = b.attachment_id AND n.deleted_at IS NULL " +
                    "AND nr.due <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now') LIMIT 1" +
                "), " +
                "EXISTS(" +
                    "SELECT 1 FROM node_attachments na JOIN nodes n ON n.id = na.node_id " +
                    "WHERE na.attachment_id = b.attachment_id AND n.deleted_at IS NULL " +
                    "AND n.id = (SELECT value FROM workspace_meta WHERE key = 'active_node_id' LIMIT 1) LIMIT 1" +
                ") " +
            "FROM attachment_blobs b WHERE b.content_hash IS NOT NULL AND TRIM(b.content_hash) != ''",
            null
        )) {
            while (cursor.moveToNext()) {
                if (!isMissingResource(context, cursor.getString(0), cursor.isNull(1) ? null : cursor.getString(1))) {
                    continue;
                }
                long sizeBytes = cursor.getLong(2);
                String mimeType = cursor.getString(3);
                count++;
                bytes += sizeBytes;
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
                if (cursor.getLong(4) > 0) {
                    dueReviewCount++;
                }
                if (cursor.getLong(5) > 0) {
                    activeTopicCount++;
                }
            }
        }
        JSObject summary = new JSObject();
        summary.put("missing_attachment_resource_count", count);
        summary.put("missing_attachment_resource_bytes", bytes);
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

    static JSObject loadMissingResource(Context context, SQLiteDatabase database, String attachmentId) {
        String normalizedAttachmentId = requireText(attachmentId, "attachment_id");
        JSObject result = new JSObject();
        try (Cursor cursor = database.rawQuery(
            "SELECT attachment_id, content_hash, COALESCE(size_bytes, 0), availability, storage_key FROM attachment_blobs " +
                "WHERE attachment_id = ? AND content_hash IS NOT NULL AND TRIM(content_hash) != '' " +
                "LIMIT 1",
            new String[] { normalizedAttachmentId }
        )) {
            if (!cursor.moveToFirst()) {
                result.put("resource", null);
                return result;
            }
            String availability = cursor.getString(3);
            String storageKey = cursor.isNull(4) ? null : cursor.getString(4);
            if (!isMissingResource(context, availability, storageKey)) {
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
        if (storageKey == null || storageKey.trim().isEmpty()) {
            return false;
        }
        File file = attachmentFile(context, storageKey.trim());
        return file.exists() && file.isFile();
    }

    static JSObject syncResource(
        Context context,
        SQLiteDatabase database,
        String attachmentId,
        String contentHash,
        String url,
        JSONObject headers
    ) throws Exception {
        String normalizedAttachmentId = requireText(attachmentId, "attachment_id");
        String normalizedContentHash = requireText(contentHash, "content_hash");
        byte[] bytes = FolioleCompanionDesktopHttpClient.requestBytes(requireText(url, "url"), headers);
        File outputFile = attachmentFile(context, normalizedContentHash);
        File parent = outputFile.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new IllegalStateException("Failed to create attachment directory.");
        }
        try (FileOutputStream output = new FileOutputStream(outputFile)) {
            output.write(bytes);
        }
        String now = Instant.now().toString();
        ContentValues values = new ContentValues();
        values.put("storage_key", normalizedContentHash);
        values.put("availability", "cached");
        values.put("cached_at", now);
        values.put("last_verified_at", now);
        int updated = database.update("attachment_blobs", values, "attachment_id = ?", new String[] { normalizedAttachmentId });
        if (updated <= 0) {
            throw new IllegalStateException("Attachment manifest is missing.");
        }
        JSObject result = new JSObject();
        result.put("attachment_id", normalizedAttachmentId);
        result.put("availability", "cached");
        return result;
    }

    static JSObject resolveResource(Context context, SQLiteDatabase database, String attachmentId) {
        String normalizedAttachmentId = requireText(attachmentId, "attachment_id");
        try (Cursor cursor = database.rawQuery(
            "SELECT b.storage_key, b.mime_type FROM attachment_blobs b WHERE b.attachment_id = ? LIMIT 1",
            new String[] { normalizedAttachmentId }
        )) {
            if (!cursor.moveToFirst()) {
                return notFound();
            }
            String storageKey = cursor.getString(0);
            String mimeType = cursor.isNull(1) ? null : cursor.getString(1);
            if (storageKey == null || storageKey.trim().isEmpty()) {
                return missingFile(mimeType);
            }
            File file = attachmentFile(context, storageKey.trim());
            if (!file.exists() || !file.isFile()) {
                return missingFile(mimeType);
            }
            JSObject result = new JSObject();
            result.put("status", "ready");
            result.put("mime_type", mimeType);
            result.put("resource_url", Uri.fromFile(file).toString());
            return result;
        }
    }

    private static JSObject missingFile(String mimeType) {
        JSObject result = new JSObject();
        result.put("status", "missing_file");
        result.put("mime_type", mimeType);
        result.put("resource_url", null);
        return result;
    }

    private static JSObject notFound() {
        JSObject result = new JSObject();
        result.put("status", "not_found");
        result.put("resource_url", null);
        return result;
    }

    private static File attachmentFile(Context context, String storageKey) {
        return new File(new File(context.getFilesDir(), "attachments"), storageKey);
    }

    private static String requireText(String value, String field) {
        if (value == null || value.trim().isEmpty()) {
            throw new IllegalArgumentException(field + " is required.");
        }
        return value.trim();
    }
}
