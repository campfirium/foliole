package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;

final class FolioleCompanionSyncDiagnosticContent {
    private FolioleCompanionSyncDiagnosticContent() {}

    static JSObject load(Context context, SQLiteDatabase database) throws Exception {
        JSObject content = new JSObject();
        copyBodySummary(content, FolioleCompanionContentBlobStore.summarizeMissingBodies(context, database));
        copyBodyDetail(content, FolioleCompanionNamedQueryStore.loadLongMetrics(context, database, "diagnosticContentBodyMetrics"));
        copyAttachmentSummary(content, FolioleCompanionAttachmentResourceStore.summarizeMissingResources(context, database));
        content.put("active_topic", loadActiveTopic(context, database));
        content.put("recent_topics", loadRecentTopics(context, database));
        return content;
    }

    private static void copyBodySummary(JSObject content, JSObject summary) throws Exception {
        content.put("missing_content_blob_count", summary.optLong("missing_content_blob_count", 0));
        content.put("missing_content_blob_bytes", summary.optLong("missing_content_blob_bytes", 0));
        content.put("failed_content_blob_count", summary.optLong("failed_content_blob_count", 0));
        content.put("failed_content_blob_bytes", summary.optLong("failed_content_blob_bytes", 0));
    }

    private static void copyBodyDetail(JSObject content, JSObject detail) throws Exception {
        content.put("missing_topic_body_count", detail.optLong("missing_topic_body_count", 0));
        content.put("missing_top_level_topic_body_count", detail.optLong("missing_top_level_topic_body_count", 0));
        content.put("missing_nested_topic_body_count", detail.optLong("missing_nested_topic_body_count", 0));
        content.put("missing_external_document_body_count", detail.optLong("missing_external_document_body_count", 0));
        content.put("missing_due_review_body_count", detail.optLong("missing_due_review_body_count", 0));
        content.put("missing_active_topic_body_count", detail.optLong("missing_active_topic_body_count", 0));
    }

    private static void copyAttachmentSummary(JSObject content, JSObject summary) throws Exception {
        content.put("missing_attachment_resource_count", summary.optLong("missing_attachment_resource_count", 0));
        content.put("missing_attachment_resource_bytes", summary.optLong("missing_attachment_resource_bytes", 0));
        content.put("failed_attachment_resource_count", summary.optLong("failed_attachment_resource_count", 0));
        content.put("failed_attachment_resource_bytes", summary.optLong("failed_attachment_resource_bytes", 0));
        content.put("missing_active_topic_attachment_resource_count", summary.optLong("missing_active_topic_attachment_resource_count", 0));
        content.put("missing_image_attachment_resource_count", summary.optLong("missing_image_attachment_resource_count", 0));
        content.put("missing_image_attachment_resource_bytes", summary.optLong("missing_image_attachment_resource_bytes", 0));
        content.put("missing_pdf_attachment_resource_count", summary.optLong("missing_pdf_attachment_resource_count", 0));
        content.put("missing_pdf_attachment_resource_bytes", summary.optLong("missing_pdf_attachment_resource_bytes", 0));
        content.put("missing_other_attachment_resource_count", summary.optLong("missing_other_attachment_resource_count", 0));
        content.put("missing_other_attachment_resource_bytes", summary.optLong("missing_other_attachment_resource_bytes", 0));
        content.put("missing_due_review_attachment_resource_count", summary.optLong("missing_due_review_attachment_resource_count", 0));
    }

    private static JSObject loadActiveTopic(Context context, SQLiteDatabase database) throws Exception {
        JSONArray topics = FolioleCompanionNamedQueryStore.loadArray(context, database, "diagnosticActiveTopic").getJSONArray("topics");
        if (topics.length() == 0) return null;
        return JSObject.fromJSONObject(topics.getJSONObject(0));
    }

    private static JSArray loadRecentTopics(Context context, SQLiteDatabase database) throws Exception {
        return FolioleCompanionNamedQueryStore.loadRows(context, database, "diagnosticRecentTopics", "topics");
    }
}
