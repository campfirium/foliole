package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONObject;

final class FolioleCompanionReadableArticleQuery {

    private static final String PDF_READER_PLACEHOLDER_TEXT = "Linked PDF source ready for the reader surface.";

    private FolioleCompanionReadableArticleQuery() {}

    static JSObject loadReadableArticle(Context context, SQLiteDatabase database) throws Exception {
        String activeNodeId = loadActiveNodeId(context, database);

        if (activeNodeId != null) {
            JSObject activeArticle = loadArticleByNodeId(context, database, activeNodeId);
            if (activeArticle != null) {
                return wrap(activeArticle);
            }
        }

        JSONObject article = FolioleCompanionNamedQueryStore.loadFirstRow(context, database, "readableArticleFirstNode", "articles", null);
        if (article == null) {
            return wrap(null);
        }
        return wrap(buildArticle(context, database, article));
    }

    private static String loadActiveNodeId(Context context, SQLiteDatabase database) throws Exception {
        String value = FolioleCompanionNamedQueryStore.loadString(context, database, "readableArticleActiveNodeId", null);
        return value == null || value.trim().isEmpty() ? null : value;
    }

    private static JSObject loadArticleByNodeId(Context context, SQLiteDatabase database, String nodeId) throws Exception {
        JSONObject article = FolioleCompanionNamedQueryStore.loadFirstRow(
            context,
            database,
            "readableArticleByNodeId",
            "articles",
            new String[] { nodeId }
        );
        if (article == null) {
            return null;
        }
        return buildArticle(context, database, article);
    }

    private static String loadReferencePdfAttachmentId(Context context, SQLiteDatabase database, String nodeId) throws Exception {
        return FolioleCompanionNamedQueryStore.loadString(
            context,
            database,
            "readableArticleReferencePdfAttachment",
            new String[] { nodeId }
        );
    }

    private static String loadPdfPageText(Context context, SQLiteDatabase database, String attachmentId) throws Exception {
        if (attachmentId == null || attachmentId.trim().isEmpty()) {
            return null;
        }
        StringBuilder builder = new StringBuilder();
        JSArray pages = FolioleCompanionNamedQueryStore.loadRows(
            context,
            database,
            "pdfPageTextPages",
            "pages",
            new String[] { attachmentId.trim() }
        );
        for (int index = 0; index < pages.length(); index += 1) {
            String text = pages.getJSONObject(index).optString("text", null);
            if (text == null || text.trim().isEmpty()) {
                continue;
            }
            if (builder.length() > 0) {
                builder.append("\n\n");
            }
            builder.append(text.trim());
        }
        return builder.length() == 0 ? null : builder.toString();
    }

    private static boolean isPdfPlaceholderContent(String content) {
        return content != null && content.contains(PDF_READER_PLACEHOLDER_TEXT);
    }

    private static String resolveArticleContent(Context context, SQLiteDatabase database, String title, String content, String pdfAttachmentId) throws Exception {
        String pdfText = isPdfPlaceholderContent(content) ? loadPdfPageText(context, database, pdfAttachmentId) : null;
        if (pdfText == null) {
            return content;
        }
        return "# " + normalizeTitle(title) + "\n\n" + pdfText;
    }

    private static String resolveContentStatus(
        Context context,
        String inlineContent,
        String bodyBlobHash,
        String bodyBlobData,
        String availability
    ) throws Exception {
        if (bodyBlobHash != null && !bodyBlobHash.trim().isEmpty() && bodyBlobData == null) {
            if (FolioleCompanionSyncProtocolDefinitions.resourceStatusSet(context, "passthroughAvailabilityStatuses").contains(availability)) {
                return availability;
            }
            return FolioleCompanionSyncProtocolDefinitions.resourceStatus(context, "missing");
        }
        if (resolveContent(inlineContent, bodyBlobData).trim().isEmpty()) {
            return FolioleCompanionSyncProtocolDefinitions.resourceStatus(context, "empty");
        }
        return FolioleCompanionSyncProtocolDefinitions.resourceStatus(context, "ready");
    }

    private static String resolveContent(String inlineContent, String bodyBlobData) {
        return bodyBlobData == null ? inlineContent : bodyBlobData;
    }

    private static JSObject buildArticle(Context context, SQLiteDatabase database, JSONObject row) throws Exception {
        String nodeId = row.getString("id");
        String title = normalizeTitle(nullableString(row, "title"));
        String inlineContent = nullableString(row, "content");
        String bodyBlobHash = nullableString(row, "body_blob_hash");
        String bodyBlobData = nullableString(row, "body_blob_data");
        String availability = nullableString(row, "availability");
        String content = resolveContent(inlineContent, bodyBlobData);
        String pdfAttachmentId = loadReferencePdfAttachmentId(context, database, nodeId);
        JSObject article = new JSObject();
        article.put("node_id", nodeId);
        article.put("title", title);
        article.put("body_blob_hash", bodyBlobHash);
        article.put("content", resolveArticleContent(context, database, title, content, pdfAttachmentId));
        article.put("content_status", resolveContentStatus(context, inlineContent, bodyBlobHash, bodyBlobData, availability));
        article.put("pdf_attachment_id", pdfAttachmentId);
        return article;
    }

    private static String nullableString(JSONObject row, String key) {
        return row.isNull(key) ? null : row.optString(key, null);
    }

    private static String normalizeTitle(String title) {
        return title == null || title.trim().isEmpty() ? "Untitled" : title.trim();
    }

    private static JSObject wrap(JSObject article) {
        JSObject payload = new JSObject();
        payload.put("readable_article", article == null ? null : article);
        return payload;
    }
}
