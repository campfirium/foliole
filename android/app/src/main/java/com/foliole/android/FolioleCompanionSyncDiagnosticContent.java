package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionSyncDiagnosticContent {
    private FolioleCompanionSyncDiagnosticContent() {}

    static JSObject load(Context context, SQLiteDatabase database) throws Exception {
        JSObject content = new JSObject();
        copyBodySummary(context, content, FolioleCompanionContentBlobStore.summarizeMissingBodies(context, database));
        copyBodyDetail(context, content, FolioleCompanionGeneratedQueryRunner.loadLongMetrics(
            context,
            database,
            FolioleCompanionSyncDiagnosticQueryRules.queryName(context, "contentBodyMetrics")
        ));
        copyAttachmentSummary(context, content, FolioleCompanionAttachmentResourceStore.summarizeMissingResources(context, database));
        content.put(contentOutputKey(context, "activeTopic"), loadActiveTopic(context, database));
        content.put(contentOutputKey(context, "recentTopics"), loadRecentTopics(context, database));
        return content;
    }

    private static void copyBodySummary(Context context, JSObject content, JSObject summary) throws Exception {
        copyMappedLongs(content, summary, FolioleCompanionMissingResourceQueryRules.contentObject(context, "summaryKeys"));
    }

    private static void copyAttachmentSummary(Context context, JSObject content, JSObject summary) throws Exception {
        copyMappedLongs(content, summary, FolioleCompanionMissingResourceQueryRules.attachmentObject(context, "summaryKeys"));
    }

    private static void copyBodyDetail(Context context, JSObject content, JSObject detail) throws Exception {
        JSONArray keys = FolioleCompanionSyncDiagnosticQueryRules.array(context, "content", "bodyMetricKeys");
        for (int index = 0; index < keys.length(); index += 1) {
            String key = keys.getString(index);
            content.put(key, detail.optLong(key, 0));
        }
    }

    private static void copyMappedLongs(JSObject target, JSObject source, JSONObject keys) throws Exception {
        JSONArray names = keys.names();
        if (names == null) return;
        for (int index = 0; index < names.length(); index += 1) {
            String key = keys.getString(names.getString(index));
            target.put(key, source.optLong(key, 0));
        }
    }

    private static JSObject loadActiveTopic(Context context, SQLiteDatabase database) throws Exception {
        JSONObject topic = FolioleCompanionGeneratedQueryRunner.loadFirstRow(
            context,
            database,
            FolioleCompanionSyncDiagnosticQueryRules.queryName(context, "activeTopic"),
            FolioleCompanionSyncDiagnosticQueryRules.resultKey(context, "activeTopic"),
            null
        );
        return topic == null ? null : JSObject.fromJSONObject(topic);
    }

    private static JSArray loadRecentTopics(Context context, SQLiteDatabase database) throws Exception {
        return FolioleCompanionGeneratedQueryRunner.loadRows(
            context,
            database,
            FolioleCompanionSyncDiagnosticQueryRules.queryName(context, "recentTopics"),
            FolioleCompanionSyncDiagnosticQueryRules.resultKey(context, "recentTopics")
        );
    }

    private static String contentOutputKey(Context context, String key) throws Exception {
        return FolioleCompanionSyncDiagnosticQueryRules.contentOutputKey(context, key);
    }
}
