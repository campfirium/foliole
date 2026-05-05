package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;
import android.net.Uri;

import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.io.File;
import java.time.Instant;

final class FolioleCompanionAttachmentResourceStore {
    private FolioleCompanionAttachmentResourceStore() {}

    static JSObject loadMissingResources(Context context, SQLiteDatabase database, int limit) throws Exception {
        return FolioleCompanionAttachmentResourceMissingStore.loadMissingResources(context, database, limit);
    }

    static JSObject summarizeMissingResources(Context context, SQLiteDatabase database) throws Exception {
        return FolioleCompanionAttachmentResourceMissingStore.summarizeMissingResources(context, database);
    }

    static JSObject loadMissingResource(Context context, SQLiteDatabase database, String attachmentId) throws Exception {
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
        String normalizedAttachmentId = requireText(
            attachmentId,
            FolioleCompanionBridgeContractDefinitions.resourceAttachmentIdRequestKey(context)
        );
        String normalizedContentHash = requireText(
            contentHash,
            FolioleCompanionBridgeContractDefinitions.resourceContentHashRequestKey(context)
        );
        try {
            File outputFile = attachmentFile(context, normalizedContentHash);
            File parent = outputFile.getParentFile();
            if (parent != null && !parent.exists() && !parent.mkdirs()) {
                throw new IllegalStateException("Failed to create attachment directory.");
            }
            FolioleCompanionDesktopHttpClient.downloadToFile(
                requireText(url, FolioleCompanionBridgeContractDefinitions.resourceUrlRequestKey(context)),
                headers,
                outputFile
            );
            String now = Instant.now().toString();
            int updated = FolioleCompanionGeneratedMutationRunner.executeChanged(
                context,
                database,
                mutationRule(context, "markCachedMutationName"),
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
        result.put(syncResponseKey(context, "attachmentId"), normalizedAttachmentId);
        result.put(syncResponseKey(context, "availability"), FolioleCompanionSyncProtocolDefinitions.resourceStatus(context, "cached"));
        return result;
    }

    private static void markFailed(Context context, SQLiteDatabase database, String attachmentId) throws Exception {
        FolioleCompanionGeneratedMutationRunner.executeChanged(
            context,
            database,
            mutationRule(context, "markFailedMutationName"),
            new Object[] { attachmentId }
        );
    }

    static JSObject resolveResource(Context context, SQLiteDatabase database, String attachmentId) throws Exception {
        String normalizedAttachmentId = requireText(
            attachmentId,
            FolioleCompanionBridgeContractDefinitions.resourceAttachmentIdRequestKey(context)
        );
        JSONObject row = FolioleCompanionGeneratedQueryRunner.loadFirstRow(
            context,
            database,
            resourceRule(context, "resolveQueryName"),
            resourceRule(context, "resultKey"),
            new String[] { normalizedAttachmentId }
        );
        if (row == null) {
            return notFound(context);
        }
        String storageKey = nullableString(row, resourceRule(context, "storageKey"));
        String mimeType = nullableString(row, resourceRule(context, "mimeTypeKey"));
        if (storageKey == null || storageKey.trim().isEmpty()) {
            return missingFile(context, mimeType);
        }
        File file = attachmentFile(context, storageKey.trim());
        if (!file.exists() || !file.isFile()) {
            return missingFile(context, mimeType);
        }
        JSObject result = new JSObject();
        result.put(resolveResponseKey(context, "status"), FolioleCompanionSyncProtocolDefinitions.resourceStatus(context, resolveStatus(context, "readyStatusKey")));
        result.put(resolveResponseKey(context, "mimeType"), mimeType);
        result.put(resolveResponseKey(context, "resourceUrl"), Uri.fromFile(file).toString());
        return result;
    }

    private static JSObject missingFile(Context context, String mimeType) throws Exception {
        JSObject result = new JSObject();
        result.put(resolveResponseKey(context, "status"), resolveStatus(context, "missingFile"));
        result.put(resolveResponseKey(context, "mimeType"), mimeType);
        result.put(resolveResponseKey(context, "resourceUrl"), null);
        return result;
    }

    private static JSObject notFound(Context context) throws Exception {
        JSObject result = new JSObject();
        result.put(resolveResponseKey(context, "status"), resolveStatus(context, "notFound"));
        result.put(resolveResponseKey(context, "resourceUrl"), null);
        return result;
    }

    private static File attachmentFile(Context context, String storageKey) {
        try {
            return new File(new File(context.getFilesDir(), resourceRule(context, "directoryName")), storageKey);
        } catch (Exception error) {
            throw new IllegalStateException("Companion query definitions asset is missing attachment resource storage rules.", error);
        }
    }

    private static String resourceRule(Context context, String key) throws Exception {
        return FolioleCompanionResourceReadQueryRules.attachmentString(context, key);
    }

    private static String resolveResponseKey(Context context, String key) throws Exception {
        return FolioleCompanionResourceReadQueryRules.attachmentResolveResponseKey(context, key);
    }

    private static String resolveStatus(Context context, String key) throws Exception {
        return FolioleCompanionResourceReadQueryRules.attachmentResolveStatus(context, key);
    }

    private static String syncResponseKey(Context context, String key) throws Exception {
        return FolioleCompanionResourceReadQueryRules.attachmentSyncResponseKey(context, key);
    }

    private static String mutationRule(Context context, String key) throws Exception {
        return FolioleCompanionResourceMutationRules.attachmentString(context, key);
    }

    private static String nullableString(JSONObject row, String key) {
        return row.isNull(key) ? null : row.optString(key, null);
    }

    private static String requireText(String value, String field) {
        if (value == null || value.trim().isEmpty()) {
            throw new IllegalArgumentException(field + " is required.");
        }
        return value.trim();
    }
}
