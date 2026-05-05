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
            if (!isMissingResource(context, rowString(context, row, "availability"), rowNullableString(context, row, "storageKey"))) continue;
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
            if (!isMissingResource(context, rowString(context, row, "availability"), rowNullableString(context, row, "storageKey"))) continue;
            summary.add(
                context,
                rowString(context, row, "availability"),
                rowLong(context, row, "sizeBytes"),
                rowString(context, row, "mimeType"),
                rowLong(context, row, "dueReview") > 0,
                rowLong(context, row, "activeTopic") > 0
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
        result.put(
            FolioleCompanionMissingResourceQueryRules.attachmentEmptyResultKey(context),
            isMissingResource(context, rowString(context, row, "availability"), rowNullableString(context, row, "storageKey")) ? toResource(context, row) : null
        );
        return result;
    }

    private static JSObject toResource(Context context, JSONObject row) throws Exception {
        JSObject resource = new JSObject();
        JSONArray resourceFields = FolioleCompanionMissingResourceQueryRules.attachmentArray(context, "resourceFields");
        for (int index = 0; index < resourceFields.length(); index += 1) {
            JSONObject field = resourceFields.getJSONObject(index);
            String type = fieldTypeKey(context, field);
            resource.put(
                fieldOutputKey(context, field),
                fieldType(context, "long").equals(type) ? fieldRowLong(context, row, field) : fieldRowString(context, row, field)
            );
        }
        return resource;
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
            if (mimeType.startsWith(FolioleCompanionMissingResourceQueryRules.attachmentMimeCategory(context, "imagePrefix"))) {
                imageCount++;
                imageBytes += sizeBytes;
            } else if (mimeType.equals(FolioleCompanionMissingResourceQueryRules.attachmentMimeCategory(context, "pdfMimeType"))) {
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
            JSObject summary = new JSObject();
            summary.put(FolioleCompanionMissingResourceQueryRules.attachmentSummaryKey(context, "count"), count);
            summary.put(FolioleCompanionMissingResourceQueryRules.attachmentSummaryKey(context, "bytes"), bytes);
            summary.put(FolioleCompanionMissingResourceQueryRules.attachmentSummaryKey(context, "failedCount"), failedCount);
            summary.put(FolioleCompanionMissingResourceQueryRules.attachmentSummaryKey(context, "failedBytes"), failedBytes);
            summary.put(FolioleCompanionMissingResourceQueryRules.attachmentSummaryKey(context, "imageCount"), imageCount);
            summary.put(FolioleCompanionMissingResourceQueryRules.attachmentSummaryKey(context, "imageBytes"), imageBytes);
            summary.put(FolioleCompanionMissingResourceQueryRules.attachmentSummaryKey(context, "pdfCount"), pdfCount);
            summary.put(FolioleCompanionMissingResourceQueryRules.attachmentSummaryKey(context, "pdfBytes"), pdfBytes);
            summary.put(FolioleCompanionMissingResourceQueryRules.attachmentSummaryKey(context, "otherCount"), otherCount);
            summary.put(FolioleCompanionMissingResourceQueryRules.attachmentSummaryKey(context, "otherBytes"), otherBytes);
            summary.put(FolioleCompanionMissingResourceQueryRules.attachmentSummaryKey(context, "activeTopicCount"), activeTopicCount);
            summary.put(FolioleCompanionMissingResourceQueryRules.attachmentSummaryKey(context, "dueReviewCount"), dueReviewCount);
            return summary;
        }
    }

    private static long rowLong(Context context, JSONObject row, String key) throws Exception {
        return FolioleCompanionMissingResourceQueryRules.attachmentRowLong(context, row, key);
    }

    private static String rowNullableString(Context context, JSONObject row, String key) throws Exception {
        return FolioleCompanionMissingResourceQueryRules.attachmentRowNullableString(context, row, key);
    }

    private static String rowString(Context context, JSONObject row, String key) throws Exception {
        return FolioleCompanionMissingResourceQueryRules.attachmentRowString(context, row, key);
    }

    private static long fieldRowLong(Context context, JSONObject row, JSONObject field) throws Exception {
        return FolioleCompanionMissingResourceQueryRules.attachmentFieldRowLong(context, row, field);
    }

    private static String fieldRowString(Context context, JSONObject row, JSONObject field) throws Exception {
        return FolioleCompanionMissingResourceQueryRules.attachmentFieldRowString(context, row, field);
    }

    private static String fieldOutputKey(Context context, JSONObject field) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldOutputKey(context, field);
    }

    private static String fieldTypeKey(Context context, JSONObject field) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldTypeKey(context, field);
    }

    private static String fieldType(Context context, String key) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldType(context, key);
    }
}
