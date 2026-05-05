package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONObject;

final class FolioleCompanionSyncDiagnosticState {
    private FolioleCompanionSyncDiagnosticState() {}

    static JSObject load(Context context, SQLiteDatabase database) throws Exception {
        JSObject state = FolioleCompanionGeneratedQueryRunner.loadLongMetrics(
            context,
            database,
            FolioleCompanionSyncDiagnosticQueryRules.queryName(context, "stateMetrics")
        );
        int cursor = loadNumberMetaValue(
            context,
            database,
            FolioleCompanionSyncProtocolDefinitions.stringValue(context, "syncMetaCursors", "pack")
        );
        long maxStateSeq = state.optLong("max_state_seq", 0);
        state.remove("max_state_seq");
        state.put("pack_cursor", cursor <= 0 ? JSONObject.NULL : cursor);
        state.put("max_state_seq", maxStateSeq <= 0 ? JSONObject.NULL : maxStateSeq);
        state.put("dirty_objects", loadRows(context, database, "dirtyObjects"));
        state.put("pending_acks", loadRows(context, database, "pendingAcks"));
        state.put("push_issues", loadRows(context, database, "pushIssues"));
        state.put("state_counts", loadRows(context, database, "stateCounts"));
        return state;
    }

    private static JSArray loadRows(Context context, SQLiteDatabase database, String key) throws Exception {
        return FolioleCompanionGeneratedQueryRunner.loadRows(
            context,
            database,
            FolioleCompanionSyncDiagnosticQueryRules.queryName(context, key),
            FolioleCompanionSyncDiagnosticQueryRules.resultKey(context, key)
        );
    }

    private static int loadNumberMetaValue(Context context, SQLiteDatabase database, String key) throws Exception {
        String stored = FolioleCompanionSyncDiagnosticMeta.load(context, database, key);
        return stored == null ? 0 : Math.max(0, Integer.parseInt(stored));
    }
}
