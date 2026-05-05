package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONObject;

final class FolioleCompanionWorkspaceViewStateExporter {

    private FolioleCompanionWorkspaceViewStateExporter() {}

    static JSObject loadPersistedNodeViewById(Context context, SQLiteDatabase database, String deviceId) throws Exception {
        JSObject statesById = new JSObject();
        JSArray rows = FolioleCompanionNamedQueryStore
            .loadRows(
                context,
                database,
                FolioleCompanionWorkspaceReadQueryRules.viewStateString(context, "queryName"),
                FolioleCompanionWorkspaceReadQueryRules.viewStateString(context, "resultKey"),
                new String[] { deviceId }
            );
        for (int index = 0; index < rows.length(); index += 1) {
            JSONObject row = rows.getJSONObject(index);
            String nodeId = row.getString("node_id");
            statesById.put(nodeId, buildViewState(context, row, nodeId));
        }
        return statesById;
    }

    private static JSObject buildViewState(Context context, JSONObject row, String nodeId) throws Exception {
        JSObject viewState = new JSObject();
        viewState.put("nodeId", nodeId);
        viewState.put("scrollTop", Math.max(0, row.getLong("scroll_top")));
        viewState.put("selectionFrom", row.isNull("selection_from") ? JSONObject.NULL : Math.max(0, row.getLong("selection_from")));
        viewState.put("selectionTo", row.isNull("selection_to") ? JSONObject.NULL : Math.max(0, row.getLong("selection_to")));
        viewState.put("updatedAt", row.getString("updated_at"));
        viewState.put(
            "source",
            row.isNull("source") ? FolioleCompanionWorkspaceReadQueryRules.viewStateString(context, "defaultSource") : row.getString("source")
        );
        return viewState;
    }
}
