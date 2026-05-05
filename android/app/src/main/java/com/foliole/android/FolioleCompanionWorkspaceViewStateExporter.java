package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class FolioleCompanionWorkspaceViewStateExporter {

    private FolioleCompanionWorkspaceViewStateExporter() {}

    static JSObject loadPersistedNodeViewById(Context context, SQLiteDatabase database, String deviceId) throws Exception {
        JSObject statesById = new JSObject();
        JSONArray rows = FolioleCompanionNamedQueryStore
            .loadArray(context, database, "nodeViewStatesByDevice", new String[] { deviceId })
            .getJSONArray("states");
        for (int index = 0; index < rows.length(); index += 1) {
            JSONObject row = rows.getJSONObject(index);
            String nodeId = row.getString("node_id");
            statesById.put(nodeId, buildViewState(row, nodeId));
        }
        return statesById;
    }

    private static JSObject buildViewState(JSONObject row, String nodeId) throws JSONException {
        JSObject viewState = new JSObject();
        viewState.put("nodeId", nodeId);
        viewState.put("scrollTop", Math.max(0, row.getLong("scroll_top")));
        viewState.put("selectionFrom", row.isNull("selection_from") ? JSONObject.NULL : Math.max(0, row.getLong("selection_from")));
        viewState.put("selectionTo", row.isNull("selection_to") ? JSONObject.NULL : Math.max(0, row.getLong("selection_to")));
        viewState.put("updatedAt", row.getString("updated_at"));
        viewState.put("source", row.isNull("source") ? "user-scroll" : row.getString("source"));
        return viewState;
    }
}
