package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONObject;

final class FolioleCompanionReadableArticleQuery {
    private FolioleCompanionReadableArticleQuery() {}

    static JSObject loadReadableArticle(Context context, SQLiteDatabase database) throws Exception {
        String activeNodeId = loadActiveNodeId(context, database);

        if (activeNodeId != null) {
            JSObject activeArticle = loadArticleByNodeId(context, database, activeNodeId);
            if (activeArticle != null) {
                return wrap(context, activeArticle);
            }
        }

        JSONObject article = FolioleCompanionGeneratedQueryRunner.loadFirstRow(
            context,
            database,
            stringRule(context, "firstNodeQueryName"),
            stringRule(context, "articlesResultKey"),
            null
        );
        if (article == null) {
            return wrap(context, null);
        }
        return wrap(context, buildArticle(context, database, article));
    }

    private static String loadActiveNodeId(Context context, SQLiteDatabase database) throws Exception {
        String value = FolioleCompanionGeneratedQueryRunner.loadString(context, database, stringRule(context, "activeNodeIdQueryName"), null);
        return value == null || value.trim().isEmpty() ? null : value;
    }

    private static JSObject loadArticleByNodeId(Context context, SQLiteDatabase database, String nodeId) throws Exception {
        JSONObject article = FolioleCompanionGeneratedQueryRunner.loadFirstRow(
            context,
            database,
            stringRule(context, "byNodeIdQueryName"),
            stringRule(context, "articlesResultKey"),
            new String[] { nodeId }
        );
        if (article == null) {
            return null;
        }
        return buildArticle(context, database, article);
    }

    private static String loadReferencePdfAttachmentId(Context context, SQLiteDatabase database, String nodeId) throws Exception {
        return FolioleCompanionGeneratedQueryRunner.loadString(
            context,
            database,
            stringRule(context, "referencePdfAttachmentQueryName"),
            new String[] { nodeId }
        );
    }

    private static String loadPdfPageText(Context context, SQLiteDatabase database, String attachmentId) throws Exception {
        if (attachmentId == null || attachmentId.trim().isEmpty()) {
            return null;
        }
        StringBuilder builder = new StringBuilder();
        JSArray pages = FolioleCompanionGeneratedQueryRunner.loadRows(
            context,
            database,
            stringRule(context, "pdfPagesQueryName"),
            stringRule(context, "pdfPagesResultKey"),
            new String[] { attachmentId.trim() }
        );
        for (int index = 0; index < pages.length(); index += 1) {
            String text = pages.getJSONObject(index).optString(FolioleCompanionResourceReadQueryRules.pdfPageTextString(context, "textKey"), null);
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

    private static boolean isPdfPlaceholderContent(Context context, String content) throws Exception {
        return content != null && content.contains(stringRule(context, "pdfPlaceholderText"));
    }

    private static String resolveArticleContent(Context context, SQLiteDatabase database, String title, String content, String pdfAttachmentId) throws Exception {
        String pdfText = isPdfPlaceholderContent(context, content) ? loadPdfPageText(context, database, pdfAttachmentId) : null;
        if (pdfText == null) {
            return content;
        }
        return "# " + normalizeTitle(context, title) + "\n\n" + pdfText;
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
        String nodeId = rowString(context, row, "id");
        String title = normalizeTitle(context, rowNullableString(context, row, "title"));
        String inlineContent = rowNullableString(context, row, "content");
        String bodyBlobHash = rowNullableString(context, row, "bodyBlobHash");
        String bodyBlobData = rowNullableString(context, row, "bodyBlobData");
        String availability = rowNullableString(context, row, "availability");
        String content = resolveContent(inlineContent, bodyBlobData);
        String pdfAttachmentId = loadReferencePdfAttachmentId(context, database, nodeId);
        JSObject article = new JSObject();
        article.put(outputKey(context, "nodeId"), nodeId);
        article.put(outputKey(context, "title"), title);
        article.put(outputKey(context, "bodyBlobHash"), bodyBlobHash);
        article.put(outputKey(context, "content"), resolveArticleContent(context, database, title, content, pdfAttachmentId));
        article.put(outputKey(context, "contentStatus"), resolveContentStatus(context, inlineContent, bodyBlobHash, bodyBlobData, availability));
        article.put(outputKey(context, "pdfAttachmentId"), pdfAttachmentId);
        return article;
    }

    private static String normalizeTitle(Context context, String title) throws Exception {
        return title == null || title.trim().isEmpty() ? stringRule(context, "untitledTitle") : title.trim();
    }

    private static JSObject wrap(Context context, JSObject article) throws Exception {
        JSObject payload = new JSObject();
        payload.put(stringRule(context, "articleResultKey"), article == null ? null : article);
        return payload;
    }

    private static String stringRule(Context context, String key) throws Exception {
        return FolioleCompanionContentReadQueryRules.readableArticleString(context, key);
    }

    private static String outputKey(Context context, String key) throws Exception {
        return FolioleCompanionContentReadQueryRules.readableArticleOutputKey(context, key);
    }

    private static String rowString(Context context, JSONObject row, String key) throws Exception {
        return FolioleCompanionContentReadQueryRules.readableArticleRowString(context, row, key);
    }

    private static String rowNullableString(Context context, JSONObject row, String key) throws Exception {
        return FolioleCompanionContentReadQueryRules.readableArticleRowNullableString(context, row, key);
    }
}
