package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import java.io.File;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

final class FolioleCompanionAttachmentResourceBatchCommitStore {
    private FolioleCompanionAttachmentResourceBatchCommitStore() {}

    static JSObject commitDownloadedResources(Context context, SQLiteDatabase database, String batchToken) throws Exception {
        FolioleCompanionAttachmentResourceBatchSessions.Session session =
            FolioleCompanionAttachmentResourceBatchSessions.get(batchToken);
        if (session == null) {
            throw new IllegalStateException("Attachment resource batch token is unknown or expired.");
        }
        if (session.committed()) {
            return response(context, strings(session.committedIds()));
        }
        List<String> syncedIds = commitSession(context, database, session);
        FolioleCompanionAttachmentResourceBatchSessions.markCommitted(batchToken, syncedIds);
        return response(context, strings(syncedIds));
    }

    private static List<String> commitSession(
        Context context,
        SQLiteDatabase database,
        FolioleCompanionAttachmentResourceBatchSessions.Session session
    ) throws Exception {
        List<String> syncedIds = new ArrayList<>();
        List<String> failedIds = new ArrayList<>(session.failedIds);
        Map<String, String> manifests = loadContentHashes(context, database, new ArrayList<>(session.contentHashesById.keySet()));
        database.beginTransaction();
        try {
            String now = Instant.now().toString();
            for (Map.Entry<String, File> entry : session.tempFilesById.entrySet()) {
                commitOne(context, database, entry.getKey(), entry.getValue(), session, manifests, syncedIds, failedIds, now);
            }
            for (String attachmentId : failedIds) markFailed(context, database, attachmentId);
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
        return syncedIds;
    }

    private static void commitOne(
        Context context,
        SQLiteDatabase database,
        String attachmentId,
        File tempFile,
        FolioleCompanionAttachmentResourceBatchSessions.Session session,
        Map<String, String> manifests,
        List<String> syncedIds,
        List<String> failedIds,
        String now
    ) throws Exception {
        try {
            String contentHash = requireManifestHash(attachmentId, session, manifests);
            moveTempToCas(context, tempFile, contentHash);
            markCached(context, database, attachmentId, contentHash, now);
            syncedIds.add(attachmentId);
        } catch (Exception error) {
            failedIds.add(attachmentId);
            tempFile.delete();
        }
    }

    private static String requireManifestHash(
        String attachmentId,
        FolioleCompanionAttachmentResourceBatchSessions.Session session,
        Map<String, String> manifests
    ) {
        String expectedHash = session.contentHashesById.get(attachmentId);
        String manifestHash = manifests.get(attachmentId);
        if (expectedHash == null || manifestHash == null || !expectedHash.equals(manifestHash)) {
            throw new IllegalStateException("Attachment manifest is missing.");
        }
        return manifestHash;
    }

    private static void moveTempToCas(Context context, File tempFile, String contentHash) throws Exception {
        File outputFile = attachmentFile(context, contentHash);
        File parent = outputFile.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new IllegalStateException("Failed to create attachment directory.");
        }
        if (outputFile.exists()) {
            tempFile.delete();
            return;
        }
        if (!tempFile.renameTo(outputFile)) {
            throw new IllegalStateException("Failed to commit attachment resource file.");
        }
    }

    private static void markCached(
        Context context,
        SQLiteDatabase database,
        String attachmentId,
        String contentHash,
        String now
    ) throws Exception {
        int updated = FolioleCompanionGeneratedMutationRunner.executeChanged(
            context,
            database,
            mutationRule(context, "markCachedMutationName"),
            new Object[] { contentHash, now, now, attachmentId }
        );
        if (updated <= 0) throw new IllegalStateException("Attachment manifest is missing.");
    }

    static Map<String, String> loadContentHashes(
        Context context,
        SQLiteDatabase database,
        List<String> attachmentIds
    ) throws Exception {
        Map<String, String> hashes = new HashMap<>();
        if (attachmentIds.isEmpty()) return hashes;
        StringBuilder placeholders = new StringBuilder();
        String[] args = new String[attachmentIds.size()];
        for (int index = 0; index < attachmentIds.size(); index += 1) {
            if (index > 0) placeholders.append(", ");
            placeholders.append("?");
            args[index] = attachmentIds.get(index);
        }
        org.json.JSONArray rows = FolioleCompanionGeneratedQueryRunner
            .load(context, database, resourceRule(context, "contentHashesByIdsQueryName"), Collections.singletonMap(
                resourceRule(context, "contentHashesReplacement"),
                placeholders.toString()
            ), args)
            .getJSONArray(resourceRule(context, "resultKey"));
        for (int index = 0; index < rows.length(); index += 1) {
            org.json.JSONObject row = rows.getJSONObject(index);
            hashes.put(rowString(context, row, "attachmentIdKey"), rowString(context, row, "contentHashKey"));
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

    private static JSObject response(Context context, JSArray syncedIds) throws Exception {
        JSObject response = new JSObject();
        response.put(batchResponseKey(context, "syncedAttachmentIds"), syncedIds);
        return response;
    }

    private static JSArray strings(List<String> values) {
        JSArray result = new JSArray();
        for (String value : values) result.put(value);
        return result;
    }

    private static File attachmentFile(Context context, String storageKey) throws Exception {
        return new File(new File(context.getFilesDir(), resourceRule(context, "directoryName")), storageKey);
    }

    private static String mutationRule(Context context, String key) throws Exception {
        return FolioleCompanionResourceMutationRules.attachmentString(context, key);
    }

    private static String resourceRule(Context context, String key) throws Exception {
        return FolioleCompanionResourceReadQueryRules.attachmentString(context, key);
    }

    private static String rowString(Context context, org.json.JSONObject row, String key) throws Exception {
        return FolioleCompanionResourceReadQueryRules.attachmentRowString(context, row, key);
    }

    private static String batchResponseKey(Context context, String key) throws Exception {
        return FolioleCompanionResourceReadQueryRules.attachmentBatchResponseKey(context, key);
    }
}
