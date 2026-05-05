package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONObject;

final class FolioleCompanionSyncDiagnosticState {
    private FolioleCompanionSyncDiagnosticState() {}

    static JSObject load(Context context, SQLiteDatabase database) throws Exception {
        JSObject state = FolioleCompanionNamedQueryStore.loadLongMetrics(context, database, "diagnosticSyncStateMetrics");
        int cursor = loadNumberMetaValue(context, database, "sync_pack_cursor");
        long maxStateSeq = state.optLong("max_state_seq", 0);
        state.remove("max_state_seq");
        state.put("pack_cursor", cursor <= 0 ? JSONObject.NULL : cursor);
        state.put("max_state_seq", maxStateSeq <= 0 ? JSONObject.NULL : maxStateSeq);
        state.put("dirty_objects", loadRows(context, database, "diagnosticDirtyObjects", "objects"));
        state.put("pending_acks", loadRows(context, database, "diagnosticPendingAcks", "acks"));
        state.put("push_issues", loadRows(context, database, "diagnosticPushIssues", "acks"));
        state.put("state_counts", loadRows(context, database, "diagnosticSyncStateCounts", "counts"));
        return state;
    }

    private static JSArray loadRows(Context context, SQLiteDatabase database, String queryName, String resultKey) throws Exception {
        return FolioleCompanionNamedQueryStore.loadRows(context, database, queryName, resultKey);
    }

    private static int loadNumberMetaValue(Context context, SQLiteDatabase database, String key) throws Exception {
        String stored = FolioleCompanionSyncDiagnosticMeta.load(context, database, key);
        return stored == null ? 0 : Math.max(0, Integer.parseInt(stored));
    }
}
