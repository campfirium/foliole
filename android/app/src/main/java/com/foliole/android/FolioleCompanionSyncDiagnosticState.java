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
        JSONObject stateKeys = diagnosticObject(context, "stateKeys");
        String maxStateSeqKey = stateKeys.getString("maxStateSeq");
        long maxStateSeq = state.optLong(maxStateSeqKey, 0);
        state.remove(maxStateSeqKey);
        state.put(stateKeys.getString("packCursor"), cursor <= 0 ? JSONObject.NULL : cursor);
        state.put(maxStateSeqKey, maxStateSeq <= 0 ? JSONObject.NULL : maxStateSeq);
        JSONArray rowGroups = FolioleCompanionSyncDiagnosticQueryRules.array(context, "stateRowGroups");
        for (int index = 0; index < rowGroups.length(); index += 1) {
            JSONObject rowGroup = rowGroups.getJSONObject(index);
            state.put(stateKeys.getString(rowGroup.getString("outputKey")), loadRows(context, database, rowGroup.getString("queryKey")));
        }
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

    private static JSONObject diagnosticObject(Context context, String key) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.objectValue(context, "syncDiagnostics", key);
    }
}
