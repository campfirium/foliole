package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.util.ArrayList;
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
        JSObject download = downloadResources(context, resources);
        return commitDownloadedResources(context, database, download.getString(batchResponseKey(context, "batchToken")));
    }

    static JSObject downloadResources(Context context, JSONArray resources) throws Exception {
        if (resources == null) {
            throw new IllegalArgumentException(FolioleCompanionBridgeContractDefinitions.resourceResourcesRequestKey(context) + " is required.");
        }
        DownloadResult result = downloadResourceFiles(context, resources);
        String token = FolioleCompanionAttachmentResourceBatchSessions.create(
            result.tempFilesById,
            result.contentHashesById,
            result.failedIds
        );
        JSArray syncedAttachmentIds = new JSArray();
        for (String attachmentId : result.syncedIds) syncedAttachmentIds.put(attachmentId);
        JSObject response = new JSObject();
        response.put(batchResponseKey(context, "batchToken"), token);
        response.put(batchResponseKey(context, "failedAttachmentIds"), strings(result.failedIds));
        response.put(batchResponseKey(context, "syncedAttachmentIds"), syncedAttachmentIds);
        return response;
    }

    static JSObject commitDownloadedResources(Context context, SQLiteDatabase database, String batchToken) throws Exception {
        return FolioleCompanionAttachmentResourceBatchCommitStore.commitDownloadedResources(context, database, batchToken);
    }

    private static DownloadResult downloadResourceFiles(Context context, JSONArray resources) throws Exception {
        int workerCount = Math.max(1, Math.min(DOWNLOAD_CONCURRENCY, resources.length()));
        ExecutorService executor = Executors.newFixedThreadPool(workerCount);
        ExecutorCompletionService<SingleDownloadResult> completionService = new ExecutorCompletionService<>(executor);
        try {
            for (int index = 0; index < resources.length(); index += 1) {
                JSONObject resource = resources.getJSONObject(index);
                completionService.submit(downloadTask(context, resource));
            }
            Map<String, String> contentHashesById = new HashMap<>();
            List<String> failedIds = new ArrayList<>();
            List<String> syncedIds = new ArrayList<>();
            Map<String, File> tempFilesById = new HashMap<>();
            for (int index = 0; index < resources.length(); index += 1) {
                Future<SingleDownloadResult> future = completionService.take();
                SingleDownloadResult result = future.get();
                if (result.synced) {
                    syncedIds.add(result.attachmentId);
                    contentHashesById.put(result.attachmentId, result.contentHash);
                    tempFilesById.put(result.attachmentId, result.tempFile);
                } else {
                    failedIds.add(result.attachmentId);
                }
            }
            return new DownloadResult(contentHashesById, failedIds, syncedIds, tempFilesById);
        } finally {
            executor.shutdownNow();
        }
    }

    private static Callable<SingleDownloadResult> downloadTask(Context context, JSONObject resource) {
        return () -> {
            String attachmentIdKey = FolioleCompanionBridgeContractDefinitions.resourceAttachmentIdRequestKey(context);
            String attachmentId = requireText(resource.optString(attachmentIdKey, null), attachmentIdKey);
            try {
                return downloadResourceFile(context, attachmentId, resource);
            } catch (Exception error) {
                return SingleDownloadResult.failed(attachmentId);
            }
        };
    }

    private static SingleDownloadResult downloadResourceFile(Context context, String attachmentId, JSONObject resource) throws Exception {
        String contentHashKey = FolioleCompanionBridgeContractDefinitions.resourceContentHashRequestKey(context);
        String urlKey = FolioleCompanionBridgeContractDefinitions.resourceUrlRequestKey(context);
        String contentHash = requireText(resource.optString(contentHashKey, null), contentHashKey);
        File tempFile = tempAttachmentFile(context, contentHash);
        File parent = tempFile.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new IllegalStateException("Failed to create attachment directory.");
        }
        FolioleCompanionDesktopHttpClient.downloadToFile(
            requireText(resource.optString(urlKey, null), urlKey),
            resource.optJSONObject(FolioleCompanionBridgeContractDefinitions.resourceHeadersRequestKey(context)),
            tempFile
        );
        if (!contentHash.equals(FolioleCompanionAttachmentResourceHash.digestHex(context, tempFile))) {
            tempFile.delete();
            throw new IllegalStateException("Attachment resource hash mismatch.");
        }
        return SingleDownloadResult.synced(attachmentId, contentHash, tempFile);
    }

    private static File tempAttachmentFile(Context context, String contentHash) throws Exception {
        File root = new File(new File(context.getFilesDir(), resourceRule(context, "directoryName")), ".tmp");
        return new File(new File(root, java.util.UUID.randomUUID().toString()), contentHash);
    }

    private static String requireText(String value, String field) {
        if (value == null || value.trim().isEmpty()) {
            throw new IllegalArgumentException(field + " is required.");
        }
        return value.trim();
    }

    private static String resourceRule(Context context, String key) throws Exception {
        return FolioleCompanionResourceReadQueryRules.attachmentString(context, key);
    }

    private static String batchResponseKey(Context context, String key) throws Exception {
        return FolioleCompanionResourceReadQueryRules.attachmentBatchResponseKey(context, key);
    }

    private static JSArray strings(List<String> values) {
        JSArray result = new JSArray();
        for (String value : values) result.put(value);
        return result;
    }

    private static final class DownloadResult {
        final Map<String, String> contentHashesById;
        final List<String> failedIds;
        final List<String> syncedIds;
        final Map<String, File> tempFilesById;

        DownloadResult(
            Map<String, String> contentHashesById,
            List<String> failedIds,
            List<String> syncedIds,
            Map<String, File> tempFilesById
        ) {
            this.contentHashesById = contentHashesById;
            this.failedIds = failedIds;
            this.syncedIds = syncedIds;
            this.tempFilesById = tempFilesById;
        }
    }

    private static final class SingleDownloadResult {
        final String attachmentId;
        final String contentHash;
        final boolean synced;
        final File tempFile;

        private SingleDownloadResult(String attachmentId, String contentHash, boolean synced, File tempFile) {
            this.attachmentId = attachmentId;
            this.contentHash = contentHash;
            this.synced = synced;
            this.tempFile = tempFile;
        }

        static SingleDownloadResult failed(String attachmentId) {
            return new SingleDownloadResult(attachmentId, null, false, null);
        }

        static SingleDownloadResult synced(String attachmentId, String contentHash, File tempFile) {
            return new SingleDownloadResult(attachmentId, contentHash, true, tempFile);
        }
    }
}
