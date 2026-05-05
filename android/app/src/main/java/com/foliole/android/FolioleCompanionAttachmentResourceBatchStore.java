package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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
            throw new IllegalArgumentException(FolioleCompanionBridgeContractDefinitions.resourceResourcesRequestKey(context) + " is required.");
        }
        DownloadResult result = downloadResources(context, resources);
        for (String attachmentId : result.failedIds) {
            markFailed(context, database, attachmentId);
        }
        markCached(context, database, result.syncedIds);
        JSArray syncedAttachmentIds = new JSArray();
        for (String attachmentId : result.syncedIds) {
            syncedAttachmentIds.put(attachmentId);
        }
        JSObject response = new JSObject();
        response.put(batchResponseKey(context, "syncedAttachmentIds"), syncedAttachmentIds);
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
            String attachmentIdKey = FolioleCompanionBridgeContractDefinitions.resourceAttachmentIdRequestKey(context);
            String attachmentId = requireText(resource.optString(attachmentIdKey, null), attachmentIdKey);
            try {
                syncResourceFile(context, attachmentId, resource);
                return new SingleDownloadResult(attachmentId, true);
            } catch (Exception error) {
                return new SingleDownloadResult(attachmentId, false);
            }
        };
    }

    private static void syncResourceFile(Context context, String attachmentId, JSONObject resource) throws Exception {
        String contentHashKey = FolioleCompanionBridgeContractDefinitions.resourceContentHashRequestKey(context);
        String urlKey = FolioleCompanionBridgeContractDefinitions.resourceUrlRequestKey(context);
        String contentHash = requireText(resource.optString(contentHashKey, null), contentHashKey);
        File outputFile = attachmentFile(context, contentHash);
        File parent = outputFile.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new IllegalStateException("Failed to create attachment directory.");
        }
        FolioleCompanionDesktopHttpClient.downloadToFile(
            requireText(resource.optString(urlKey, null), urlKey),
            resource.optJSONObject(FolioleCompanionBridgeContractDefinitions.resourceHeadersRequestKey(context)),
            outputFile
        );
    }

    private static void markCached(Context context, SQLiteDatabase database, List<String> attachmentIds) throws Exception {
        if (attachmentIds.isEmpty()) {
            return;
        }
        String now = Instant.now().toString();
        Map<String, String> contentHashes = loadContentHashes(context, database, attachmentIds);
        database.beginTransaction();
        try {
            for (String attachmentId : attachmentIds) {
                String contentHash = contentHashes.get(attachmentId);
                if (contentHash == null) {
                    throw new IllegalStateException("Attachment manifest is missing.");
                }
                int updated = FolioleCompanionGeneratedMutationRunner.executeChanged(
                    context,
                    database,
                    mutationRule(context, "markCachedMutationName"),
                    new Object[] { contentHash, now, now, attachmentId }
                );
                if (updated <= 0) {
                    throw new IllegalStateException("Attachment manifest is missing.");
                }
            }
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
    }

    private static Map<String, String> loadContentHashes(Context context, SQLiteDatabase database, List<String> attachmentIds) throws Exception {
        Map<String, String> hashes = new HashMap<>();
        StringBuilder placeholders = new StringBuilder();
        String[] args = new String[attachmentIds.size()];
        for (int index = 0; index < attachmentIds.size(); index += 1) {
            if (index > 0) placeholders.append(", ");
            placeholders.append("?");
            args[index] = attachmentIds.get(index);
        }
        JSONArray rows = FolioleCompanionGeneratedQueryRunner
            .load(
                context,
                database,
                resourceRule(context, "contentHashesByIdsQueryName"),
                Collections.singletonMap(resourceRule(context, "contentHashesReplacement"), placeholders.toString()),
                args
            )
            .getJSONArray(resourceRule(context, "resultKey"));
        for (int index = 0; index < rows.length(); index += 1) {
            JSONObject row = rows.getJSONObject(index);
            String attachmentId = row.getString(resourceRule(context, "attachmentIdKey"));
            String contentHash = row.getString(resourceRule(context, "contentHashKey"));
            hashes.put(attachmentId, requireText(contentHash, resourceRule(context, "contentHashKey")));
        }
        return hashes;
    }

    private static void markFailed(Context context, SQLiteDatabase database, String attachmentId) throws Exception {
        FolioleCompanionGeneratedMutationRunner.executeChanged(
            context,
            database,
            mutationRule(context, "markFailedMutationName"),
            new Object[] { attachmentId }
        );
    }

    private static File attachmentFile(Context context, String storageKey) throws Exception {
        return new File(new File(context.getFilesDir(), resourceRule(context, "directoryName")), storageKey);
    }

    private static String requireText(String value, String field) {
        if (value == null || value.trim().isEmpty()) {
            throw new IllegalArgumentException(field + " is required.");
        }
        return value.trim();
    }

    private static String mutationRule(Context context, String key) throws Exception {
        return FolioleCompanionResourceMutationRules.attachmentString(context, key);
    }

    private static String resourceRule(Context context, String key) throws Exception {
        return FolioleCompanionResourceReadQueryRules.attachmentString(context, key);
    }

    private static String batchResponseKey(Context context, String key) throws Exception {
        return FolioleCompanionResourceReadQueryRules.attachmentBatchResponseKey(context, key);
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
