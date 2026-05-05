package com.foliole.android;

import android.content.ContentValues;
import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

final class FolioleCompanionAttachmentResourceBatchStore {
    private FolioleCompanionAttachmentResourceBatchStore() {}

    static JSObject syncResources(Context context, SQLiteDatabase database, JSONArray resources) throws Exception {
        if (resources == null) {
            throw new IllegalArgumentException("resources is required.");
        }
        List<String> syncedIds = new ArrayList<>();
        for (int index = 0; index < resources.length(); index += 1) {
            JSONObject resource = resources.getJSONObject(index);
            String attachmentId = requireText(resource.optString("attachment_id", null), "attachment_id");
            try {
                syncResourceFile(context, attachmentId, resource);
                syncedIds.add(attachmentId);
            } catch (Exception error) {
                markFailed(database, attachmentId);
            }
        }
        markCached(database, syncedIds);
        JSArray syncedAttachmentIds = new JSArray();
        for (String attachmentId : syncedIds) {
            syncedAttachmentIds.put(attachmentId);
        }
        JSObject result = new JSObject();
        result.put("synced_attachment_ids", syncedAttachmentIds);
        return result;
    }

    private static void syncResourceFile(Context context, String attachmentId, JSONObject resource) throws Exception {
        String contentHash = requireText(resource.optString("content_hash", null), "content_hash");
        File outputFile = attachmentFile(context, contentHash);
        File parent = outputFile.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new IllegalStateException("Failed to create attachment directory.");
        }
        FolioleCompanionDesktopHttpClient.downloadToFile(
            requireText(resource.optString("url", null), "url"),
            resource.optJSONObject("headers"),
            outputFile
        );
    }

    private static void markCached(SQLiteDatabase database, List<String> attachmentIds) {
        if (attachmentIds.isEmpty()) {
            return;
        }
        String now = Instant.now().toString();
        database.beginTransaction();
        try {
            for (String attachmentId : attachmentIds) {
                ContentValues values = new ContentValues();
                values.put("storage_key", loadContentHash(database, attachmentId));
                values.put("availability", "cached");
                values.put("cached_at", now);
                values.put("last_verified_at", now);
                int updated = database.update("attachment_blobs", values, "attachment_id = ?", new String[] { attachmentId });
                if (updated <= 0) {
                    throw new IllegalStateException("Attachment manifest is missing.");
                }
            }
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
    }

    private static String loadContentHash(SQLiteDatabase database, String attachmentId) {
        try (android.database.Cursor cursor = database.rawQuery(
            "SELECT content_hash FROM attachment_blobs WHERE attachment_id = ? LIMIT 1",
            new String[] { attachmentId }
        )) {
            if (!cursor.moveToFirst()) {
                throw new IllegalStateException("Attachment manifest is missing.");
            }
            return requireText(cursor.getString(0), "content_hash");
        }
    }

    private static void markFailed(SQLiteDatabase database, String attachmentId) {
        ContentValues values = new ContentValues();
        values.put("availability", "failed");
        database.update("attachment_blobs", values, "attachment_id = ?", new String[] { attachmentId });
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
