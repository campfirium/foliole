package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

final class FolioleCompanionReadableArticleQuery {

    private static final String ACTIVE_NODE_META_KEY = "active_node_id";
    private static final String PDF_READER_PLACEHOLDER_TEXT = "Linked PDF source ready for the reader surface.";

    private FolioleCompanionReadableArticleQuery() {}

    static JSObject loadReadableArticle(SQLiteDatabase database) {
        String activeNodeId = loadActiveNodeId(database);

        if (activeNodeId != null) {
            JSObject activeArticle = loadArticleByNodeId(database, activeNodeId);
            if (activeArticle != null) {
                return wrap(activeArticle);
            }
        }

        try (Cursor cursor = database.rawQuery(
            "SELECT n.id, n.title, n.content, n.body_blob_hash, CAST(cbd.data AS TEXT) AS body_blob_data, cb.availability " +
                "FROM nodes n " +
                "LEFT JOIN content_blobs cb ON cb.hash = n.body_blob_hash " +
                "LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash " +
                "LEFT JOIN node_order no ON no.node_id = n.id " +
                "WHERE n.body_blob_hash IS NOT NULL OR TRIM(COALESCE(n.content, '')) <> '' " +
                "ORDER BY COALESCE(no.position, 2147483647) ASC, n.created_at ASC",
            null
        )) {
            if (!cursor.moveToFirst()) {
                return wrap(null);
            }
            return wrap(buildArticle(database, cursor));
        }
    }

    private static String loadActiveNodeId(SQLiteDatabase database) {
        try (Cursor cursor = database.query(
            "workspace_meta",
            new String[] { "value" },
            "key = ?",
            new String[] { ACTIVE_NODE_META_KEY },
            null,
            null,
            null
        )) {
            if (!cursor.moveToFirst()) {
                return null;
            }
            String value = cursor.getString(0);
            return value == null || value.trim().isEmpty() ? null : value;
        }
    }

    private static JSObject loadArticleByNodeId(SQLiteDatabase database, String nodeId) {
        try (Cursor cursor = database.rawQuery(
            "SELECT n.id, n.title, n.content, n.body_blob_hash, CAST(cbd.data AS TEXT) AS body_blob_data, cb.availability " +
                "FROM nodes n " +
                "LEFT JOIN content_blobs cb ON cb.hash = n.body_blob_hash " +
                "LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash " +
                "WHERE n.id = ? LIMIT 1",
            new String[] { nodeId }
        )) {
            if (!cursor.moveToFirst()) {
                return null;
            }
            return buildArticle(database, cursor);
        }
    }

    private static String loadReferencePdfAttachmentId(SQLiteDatabase database, String nodeId) {
        try (Cursor cursor = database.rawQuery(
            "SELECT na.attachment_id " +
                "FROM node_attachments na " +
                "INNER JOIN attachments a ON a.id = na.attachment_id AND a.mime_type = 'application/pdf' " +
                "WHERE na.node_id = ? AND na.role = 'reference' " +
                "ORDER BY na.attachment_id ASC LIMIT 1",
            new String[] { nodeId }
        )) {
            if (!cursor.moveToFirst()) {
                return null;
            }
            return cursor.getString(0);
        }
    }

    private static String loadPdfPageText(SQLiteDatabase database, String attachmentId) {
        if (attachmentId == null || attachmentId.trim().isEmpty()) {
            return null;
        }
        StringBuilder builder = new StringBuilder();
        try (Cursor cursor = database.query(
            "pdf_page_text",
            new String[] { "text" },
            "attachment_id = ? AND TRIM(COALESCE(text, '')) <> ''",
            new String[] { attachmentId.trim() },
            null,
            null,
            "page ASC"
        )) {
            while (cursor.moveToNext()) {
                String text = cursor.getString(0);
                if (text == null || text.trim().isEmpty()) {
                    continue;
                }
                if (builder.length() > 0) {
                    builder.append("\n\n");
                }
                builder.append(text.trim());
            }
        }
        return builder.length() == 0 ? null : builder.toString();
    }

    private static boolean isPdfPlaceholderContent(String content) {
        return content != null && content.contains(PDF_READER_PLACEHOLDER_TEXT);
    }

    private static String resolveArticleContent(SQLiteDatabase database, String title, String content, String pdfAttachmentId) {
        String pdfText = isPdfPlaceholderContent(content) ? loadPdfPageText(database, pdfAttachmentId) : null;
        if (pdfText == null) {
            return content;
        }
        return "# " + normalizeTitle(title) + "\n\n" + pdfText;
    }

    private static String resolveContentStatus(String inlineContent, String bodyBlobHash, String bodyBlobData, String availability) {
        if (bodyBlobHash != null && !bodyBlobHash.trim().isEmpty() && bodyBlobData == null) {
            if ("fetching".equals(availability) || "failed".equals(availability)) {
                return availability;
            }
            return "missing";
        }
        if (resolveContent(inlineContent, bodyBlobData).trim().isEmpty()) {
            return "empty";
        }
        return "ready";
    }

    private static String resolveContent(String inlineContent, String bodyBlobData) {
        return bodyBlobData == null ? inlineContent : bodyBlobData;
    }

    private static JSObject buildArticle(SQLiteDatabase database, Cursor cursor) {
        String nodeId = cursor.getString(0);
        String title = normalizeTitle(cursor.getString(1));
        String inlineContent = cursor.getString(2);
        String bodyBlobHash = cursor.isNull(3) ? null : cursor.getString(3);
        String bodyBlobData = cursor.isNull(4) ? null : cursor.getString(4);
        String availability = cursor.isNull(5) ? null : cursor.getString(5);
        String content = resolveContent(inlineContent, bodyBlobData);
        String pdfAttachmentId = loadReferencePdfAttachmentId(database, nodeId);
        JSObject article = new JSObject();
        article.put("node_id", nodeId);
        article.put("title", title);
        article.put("content", resolveArticleContent(database, title, content, pdfAttachmentId));
        article.put("content_status", resolveContentStatus(inlineContent, bodyBlobHash, bodyBlobData, availability));
        article.put("pdf_attachment_id", pdfAttachmentId);
        return article;
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
