package com.foliole.android;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.net.Uri;

import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.time.Instant;

final class FolioleCompanionAttachmentResourceStore {
    private FolioleCompanionAttachmentResourceStore() {}

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
