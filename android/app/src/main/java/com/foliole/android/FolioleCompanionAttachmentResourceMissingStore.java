package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.io.File;

final class FolioleCompanionAttachmentResourceMissingStore {
    private FolioleCompanionAttachmentResourceMissingStore() {}

    static JSObject loadMissingResources(Context context, SQLiteDatabase database, int limit) throws Exception {
        JSArray resources = new JSArray();
        JSArray rows = FolioleCompanionNamedQueryStore.loadRows(
            context,
            database,
            FolioleCompanionMissingResourceQueryRules.attachmentRowsQueryName(context),
            FolioleCompanionMissingResourceQueryRules.attachmentResultKey(context)
        );
        int maxResources = FolioleCompanionMissingResourceQueryRules.attachmentLimit(context, limit);
        for (int index = 0; index < rows.length() && resources.length() < maxResources; index += 1) {
            JSONObject row = rows.getJSONObject(index);
            if (!isMissingResource(context, row.getString("availability"), nullableString(row, "storage_key"))) continue;
            resources.put(toResource(row));
        }
        JSObject result = new JSObject();
        result.put(FolioleCompanionMissingResourceQueryRules.attachmentResultKey(context), resources);
        return result;
    }

    static JSObject summarizeMissingResources(Context context, SQLiteDatabase database) throws Exception {
        MissingAttachmentSummary summary = new MissingAttachmentSummary();
        JSArray rows = FolioleCompanionNamedQueryStore.loadRows(
            context,
            database,
            FolioleCompanionMissingResourceQueryRules.attachmentSummaryQueryName(context),
            FolioleCompanionMissingResourceQueryRules.attachmentResultKey(context)
        );
        for (int index = 0; index < rows.length(); index += 1) {
            JSONObject row = rows.getJSONObject(index);
            if (!isMissingResource(context, row.getString("availability"), nullableString(row, "storage_key"))) continue;
            summary.add(
                context,
                row.getString("availability"),
                row.getLong("size_bytes"),
                row.getString("mime_type"),
                row.getLong("due_review") > 0,
                row.getLong("active_topic") > 0
            );
        }
        return summary.toJson();
    }

    static JSObject loadMissingResource(Context context, SQLiteDatabase database, String attachmentId) throws Exception {
        String normalizedAttachmentId = requireText(attachmentId, "attachment_id");
        JSObject result = new JSObject();
        JSArray rows = FolioleCompanionNamedQueryStore
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
            isMissingResource(context, row.getString("availability"), nullableString(row, "storage_key")) ? toResource(row) : null
        );
        return result;
    }

    private static JSObject toResource(JSONObject row) throws Exception {
        JSObject resource = new JSObject();
        resource.put("attachment_id", row.getString("attachment_id"));
        resource.put("content_hash", row.getString("content_hash"));
        resource.put("size_bytes", row.getLong("size_bytes"));
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
            if (mimeType.startsWith("image/")) {
                imageCount++;
                imageBytes += sizeBytes;
            } else if (mimeType.equals("application/pdf")) {
                pdfCount++;
                pdfBytes += sizeBytes;
            } else {
                otherCount++;
                otherBytes += sizeBytes;
            }
            if (dueReview) dueReviewCount++;
            if (activeTopic) activeTopicCount++;
        }

        JSObject toJson() {
            JSObject summary = new JSObject();
            summary.put("missing_attachment_resource_count", count);
            summary.put("missing_attachment_resource_bytes", bytes);
            summary.put("failed_attachment_resource_count", failedCount);
            summary.put("failed_attachment_resource_bytes", failedBytes);
            summary.put("missing_image_attachment_resource_count", imageCount);
            summary.put("missing_image_attachment_resource_bytes", imageBytes);
            summary.put("missing_pdf_attachment_resource_count", pdfCount);
            summary.put("missing_pdf_attachment_resource_bytes", pdfBytes);
            summary.put("missing_other_attachment_resource_count", otherCount);
            summary.put("missing_other_attachment_resource_bytes", otherBytes);
            summary.put("missing_active_topic_attachment_resource_count", activeTopicCount);
            summary.put("missing_due_review_attachment_resource_count", dueReviewCount);
            return summary;
        }
    }
}
