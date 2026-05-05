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
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorCompletionService;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

final class FolioleCompanionAttachmentResourceBatchStore {
    private static final int DOWNLOAD_CONCURRENCY = 6;

    private FolioleCompanionAttachmentResourceBatchStore() {}

    static JSObject syncResources(Context context, SQLiteDatabase database, JSONArray resources) throws Exception {
        if (resources == null) {
            throw new IllegalArgumentException("resources is required.");
        }
        DownloadResult result = downloadResources(context, resources);
        for (String attachmentId : result.failedIds) {
            markFailed(database, attachmentId);
        }
        markCached(database, result.syncedIds);
        JSArray syncedAttachmentIds = new JSArray();
        for (String attachmentId : result.syncedIds) {
            syncedAttachmentIds.put(attachmentId);
        }
        JSObject response = new JSObject();
        response.put("synced_attachment_ids", syncedAttachmentIds);
        return response;
    }

    private static DownloadResult downloadResources(Context context, JSONArray resources) throws Exception {
        int workerCount = Math.max(1, Math.min(DOWNLOAD_CONCURRENCY, resources.length()));
        ExecutorService executor = Executors.newFixedThreadPool(workerCount);
        ExecutorCompletionService<SingleDownloadResult> completionService = new ExecutorCompletionService<>(executor);
        try {
            for (int index = 0; index < resources.length(); index += 1) {
                JSONObject resource = resources.getJSONObject(index);
                completionService.submit(downloadTask(context, resource));
            }
            List<String> syncedIds = new ArrayList<>();
            List<String> failedIds = new ArrayList<>();
            for (int index = 0; index < resources.length(); index += 1) {
                Future<SingleDownloadResult> future = completionService.take();
                SingleDownloadResult result = future.get();
                if (result.synced) {
                    syncedIds.add(result.attachmentId);
                } else {
                    failedIds.add(result.attachmentId);
                }
            }
            return new DownloadResult(syncedIds, failedIds);
        } finally {
            executor.shutdownNow();
        }
    }

    private static Callable<SingleDownloadResult> downloadTask(Context context, JSONObject resource) {
        return () -> {
            String attachmentId = requireText(resource.optString("attachment_id", null), "attachment_id");
            try {
                syncResourceFile(context, attachmentId, resource);
                return new SingleDownloadResult(attachmentId, true);
            } catch (Exception error) {
                return new SingleDownloadResult(attachmentId, false);
            }
        };
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

    private static final class DownloadResult {
        final List<String> syncedIds;
        final List<String> failedIds;

        DownloadResult(List<String> syncedIds, List<String> failedIds) {
            this.syncedIds = syncedIds;
            this.failedIds = failedIds;
        }
    }

    private static final class SingleDownloadResult {
        final String attachmentId;
        final boolean synced;

        SingleDownloadResult(String attachmentId, boolean synced) {
            this.attachmentId = attachmentId;
            this.synced = synced;
        }
    }
}
