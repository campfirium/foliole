package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;

final class FolioleCompanionAttachmentResourceMissingStore {
    private FolioleCompanionAttachmentResourceMissingStore() {}

    static JSObject loadMissingResources(Context context, SQLiteDatabase database, int limit) throws Exception {
        JSArray resources = new JSArray();
        JSArray rows = FolioleCompanionGeneratedQueryRunner.loadRows(
            context,
            database,
            FolioleCompanionMissingResourceQueryRules.attachmentRowsQueryName(context),
            FolioleCompanionMissingResourceQueryRules.attachmentResultKey(context)
        );
        int maxResources = FolioleCompanionMissingResourceQueryRules.attachmentLimit(context, limit);
        for (int index = 0; index < rows.length() && resources.length() < maxResources; index += 1) {
            JSONObject row = rows.getJSONObject(index);
            JSONObject rowKeys = rowKeys(context);
            if (!isMissingResource(context, row.getString(rowKeys.getString("availability")), nullableString(row, rowKeys.getString("storageKey")))) continue;
            resources.put(toResource(context, row));
        }
        JSObject result = new JSObject();
        result.put(FolioleCompanionMissingResourceQueryRules.attachmentResultKey(context), resources);
        return result;
    }

    static JSObject summarizeMissingResources(Context context, SQLiteDatabase database) throws Exception {
        MissingAttachmentSummary summary = new MissingAttachmentSummary();
        JSArray rows = FolioleCompanionGeneratedQueryRunner.loadRows(
            context,
            database,
            FolioleCompanionMissingResourceQueryRules.attachmentSummaryQueryName(context),
            FolioleCompanionMissingResourceQueryRules.attachmentResultKey(context)
        );
        for (int index = 0; index < rows.length(); index += 1) {
            JSONObject row = rows.getJSONObject(index);
            JSONObject rowKeys = rowKeys(context);
            if (!isMissingResource(context, row.getString(rowKeys.getString("availability")), nullableString(row, rowKeys.getString("storageKey")))) continue;
            summary.add(
                context,
                row.getString(rowKeys.getString("availability")),
                row.getLong(rowKeys.getString("sizeBytes")),
                row.getString(rowKeys.getString("mimeType")),
                row.getLong(rowKeys.getString("dueReview")) > 0,
                row.getLong(rowKeys.getString("activeTopic")) > 0
            );
        }
        return summary.toJson(context);
    }

    static JSObject loadMissingResource(Context context, SQLiteDatabase database, String attachmentId) throws Exception {
        String normalizedAttachmentId = requireText(
            attachmentId,
            FolioleCompanionBridgeContractDefinitions.resourceAttachmentIdRequestKey(context)
        );
        JSObject result = new JSObject();
        JSArray rows = FolioleCompanionGeneratedQueryRunner
            .loadRows(
                context,
                database,
                FolioleCompanionMissingResourceQueryRules.attachmentByIdQueryName(context),
                FolioleCompanionMissingResourceQueryRules.attachmentResultKey(context),
                new String[] { normalizedAttachmentId }
            );
        if (rows.length() <= 0) {
            result.put(FolioleCompanionMissingResourceQueryRules.attachmentEmptyResultKey(context), null);
            return result;
        }
        JSONObject row = rows.getJSONObject(0);
        JSONObject rowKeys = rowKeys(context);
        result.put(
            FolioleCompanionMissingResourceQueryRules.attachmentEmptyResultKey(context),
            isMissingResource(context, row.getString(rowKeys.getString("availability")), nullableString(row, rowKeys.getString("storageKey"))) ? toResource(context, row) : null
        );
        return result;
    }

    private static JSObject toResource(Context context, JSONObject row) throws Exception {
        JSONObject rowKeys = rowKeys(context);
        JSObject resource = new JSObject();
        JSONArray resourceFields = FolioleCompanionMissingResourceQueryRules.attachmentArray(context, "resourceFields");
        for (int index = 0; index < resourceFields.length(); index += 1) {
            JSONObject field = resourceFields.getJSONObject(index);
            String rowKey = rowKeys.getString(field.getString(fieldKey(context, "rowKey")));
            String type = field.getString(fieldKey(context, "type"));
            resource.put(
                field.getString(fieldKey(context, "outputKey")),
                fieldType(context, "long").equals(type) ? row.getLong(rowKey) : row.getString(rowKey)
            );
        }
        return resource;
    }

    private static String nullableString(JSONObject row, String key) {
        return row.isNull(key) ? null : row.optString(key, null);
    }

    private static boolean isMissingResource(Context context, String availability, String storageKey) throws Exception {
        return !FolioleCompanionSyncProtocolDefinitions.resourceStatus(context, "cached").equals(availability) ||
            !hasAttachmentFile(context, storageKey);
    }

    private static boolean hasAttachmentFile(Context context, String storageKey) throws Exception {
        if (storageKey == null || storageKey.trim().isEmpty()) return false;
        File file = new File(new File(context.getFilesDir(), FolioleCompanionResourceReadQueryRules.attachmentString(context, "directoryName")), storageKey.trim());
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

        void add(Context context, String availability, long sizeBytes, String mimeType, boolean dueReview, boolean activeTopic) throws Exception {
            count++;
            bytes += sizeBytes;
            if (FolioleCompanionSyncProtocolDefinitions.resourceStatus(context, "failed").equals(availability)) {
                failedCount++;
                failedBytes += sizeBytes;
            }
            JSONObject categories = FolioleCompanionMissingResourceQueryRules.attachmentObject(context, "mimeCategories");
            if (mimeType.startsWith(categories.getString("imagePrefix"))) {
                imageCount++;
                imageBytes += sizeBytes;
            } else if (mimeType.equals(categories.getString("pdfMimeType"))) {
                pdfCount++;
                pdfBytes += sizeBytes;
            } else {
                otherCount++;
                otherBytes += sizeBytes;
            }
            if (dueReview) dueReviewCount++;
            if (activeTopic) activeTopicCount++;
        }

        JSObject toJson(Context context) throws Exception {
            JSONObject keys = FolioleCompanionMissingResourceQueryRules.attachmentObject(context, "summaryKeys");
            JSObject summary = new JSObject();
            summary.put(keys.getString("count"), count);
            summary.put(keys.getString("bytes"), bytes);
            summary.put(keys.getString("failedCount"), failedCount);
            summary.put(keys.getString("failedBytes"), failedBytes);
            summary.put(keys.getString("imageCount"), imageCount);
            summary.put(keys.getString("imageBytes"), imageBytes);
            summary.put(keys.getString("pdfCount"), pdfCount);
            summary.put(keys.getString("pdfBytes"), pdfBytes);
            summary.put(keys.getString("otherCount"), otherCount);
            summary.put(keys.getString("otherBytes"), otherBytes);
            summary.put(keys.getString("activeTopicCount"), activeTopicCount);
            summary.put(keys.getString("dueReviewCount"), dueReviewCount);
            return summary;
        }
    }

    private static JSONObject rowKeys(Context context) throws Exception {
        return FolioleCompanionMissingResourceQueryRules.attachmentObject(context, "rowKeys");
    }

    private static String fieldKey(Context context, String key) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldKey(context, key);
    }

    private static String fieldType(Context context, String key) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldType(context, key);
    }
}
