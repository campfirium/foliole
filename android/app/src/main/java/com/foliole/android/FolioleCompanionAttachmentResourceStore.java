package com.foliole.android;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.net.Uri;

import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.io.File;
import java.time.Instant;

final class FolioleCompanionAttachmentResourceStore {
    private FolioleCompanionAttachmentResourceStore() {}

    static JSObject loadMissingResources(Context context, SQLiteDatabase database, int limit) {
        return FolioleCompanionAttachmentResourceMissingStore.loadMissingResources(context, database, limit);
    }

    static JSObject summarizeMissingResources(Context context, SQLiteDatabase database) {
        return FolioleCompanionAttachmentResourceMissingStore.summarizeMissingResources(context, database);
    }

    static JSObject loadMissingResource(Context context, SQLiteDatabase database, String attachmentId) {
        return FolioleCompanionAttachmentResourceMissingStore.loadMissingResource(context, database, attachmentId);
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
        try {
            File outputFile = attachmentFile(context, normalizedContentHash);
            File parent = outputFile.getParentFile();
            if (parent != null && !parent.exists() && !parent.mkdirs()) {
                throw new IllegalStateException("Failed to create attachment directory.");
            }
            FolioleCompanionDesktopHttpClient.downloadToFile(requireText(url, "url"), headers, outputFile);
            String now = Instant.now().toString();
            int updated = FolioleCompanionNamedMutationStore.executeChanged(
                context,
                database,
                "attachmentResourceMarkCached",
                new Object[] { normalizedContentHash, now, now, normalizedAttachmentId }
            );
            if (updated <= 0) {
                throw new IllegalStateException("Attachment manifest is missing.");
            }
        } catch (Exception error) {
            markFailed(context, database, normalizedAttachmentId);
            throw error;
        }
        JSObject result = new JSObject();
        result.put("attachment_id", normalizedAttachmentId);
        result.put("availability", "cached");
        return result;
    }

    private static void markFailed(Context context, SQLiteDatabase database, String attachmentId) throws Exception {
        FolioleCompanionNamedMutationStore.executeChanged(
            context,
            database,
            "attachmentResourceMarkFailed",
            new Object[] { attachmentId }
        );
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
