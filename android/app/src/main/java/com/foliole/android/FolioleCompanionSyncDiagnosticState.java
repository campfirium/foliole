package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionSyncDiagnosticState {
    private FolioleCompanionSyncDiagnosticState() {}

    static JSObject load(Context context, SQLiteDatabase database) throws Exception {
        JSObject state = new JSObject();
        int cursor = loadNumberMetaValue(context, database, "sync_pack_cursor");
        long maxStateSeq = copyMetrics(state, FolioleCompanionNamedQueryStore.loadArray(context, database, "diagnosticSyncStateMetrics").getJSONArray("metrics"));
        state.put("pack_cursor", cursor <= 0 ? JSONObject.NULL : cursor);
        state.put("max_state_seq", maxStateSeq <= 0 ? JSONObject.NULL : maxStateSeq);
        state.put("dirty_objects", loadRows(context, database, "diagnosticDirtyObjects", "objects"));
        state.put("pending_acks", loadRows(context, database, "diagnosticPendingAcks", "acks"));
        state.put("push_issues", loadRows(context, database, "diagnosticPushIssues", "acks"));
        state.put("state_counts", loadRows(context, database, "diagnosticSyncStateCounts", "counts"));
        return state;
    }

    private static long copyMetrics(JSObject state, JSONArray metrics) throws Exception {
        long maxStateSeq = 0L;
        for (int index = 0; index < metrics.length(); index += 1) {
            JSONObject metric = metrics.getJSONObject(index);
            String name = metric.getString("metric");
            long value = metric.getLong("value");
            if ("max_state_seq".equals(name)) {
                maxStateSeq = value;
                continue;
            }
            state.put(name, value);
        }
        return maxStateSeq;
    }

    private static JSArray loadRows(Context context, SQLiteDatabase database, String queryName, String resultKey) throws Exception {
        JSArray items = new JSArray();
        JSONArray rows = FolioleCompanionNamedQueryStore.loadArray(context, database, queryName).getJSONArray(resultKey);
        for (int index = 0; index < rows.length(); index += 1) items.put(rows.getJSONObject(index));
        return items;
    }

    private static int loadNumberMetaValue(Context context, SQLiteDatabase database, String key) throws Exception {
        String stored = FolioleCompanionSyncDiagnosticMeta.load(context, database, key);
        return stored == null ? 0 : Math.max(0, Integer.parseInt(stored));
    }
}
