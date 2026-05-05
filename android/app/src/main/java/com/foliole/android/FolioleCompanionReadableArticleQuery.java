package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

final class FolioleCompanionReadableArticleQuery {

    private static final String ACTIVE_NODE_META_KEY = "active_node_id";

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
            "SELECT n.id, n.title, n.content " +
                "FROM nodes n " +
                "LEFT JOIN node_order no ON no.node_id = n.id " +
                "WHERE TRIM(COALESCE(n.content, '')) <> '' " +
                "ORDER BY COALESCE(no.position, 2147483647) ASC, n.created_at ASC",
            null
        )) {
            if (!cursor.moveToFirst()) {
                return wrap(null);
            }
            return wrap(buildArticle(cursor));
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
        try (Cursor cursor = database.query(
            "nodes",
            new String[] { "id", "title", "content" },
            "id = ? AND TRIM(COALESCE(content, '')) <> ''",
            new String[] { nodeId },
            null,
            null,
            null,
            "1"
        )) {
            if (!cursor.moveToFirst()) {
                return null;
            }
            return buildArticle(cursor);
        }
    }

    private static JSObject buildArticle(Cursor cursor) {
        JSObject article = new JSObject();
        article.put("node_id", cursor.getString(0));
        article.put("title", normalizeTitle(cursor.getString(1)));
        article.put("content", cursor.getString(2));
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
