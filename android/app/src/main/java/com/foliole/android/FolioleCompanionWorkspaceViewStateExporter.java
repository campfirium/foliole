package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

import org.json.JSONException;
import org.json.JSONObject;

final class FolioleCompanionWorkspaceViewStateExporter {

    private FolioleCompanionWorkspaceViewStateExporter() {}

    static JSObject loadPersistedNodeViewById(SQLiteDatabase database, String deviceId) throws JSONException {
        JSObject statesById = new JSObject();
        try (Cursor cursor = database.rawQuery(
            "SELECT node_id, scroll_top, selection_from, selection_to, updated_at, source " +
            "FROM node_view_state WHERE device_id = ?",
            new String[] { deviceId }
        )) {
            while (cursor.moveToNext()) {
                String nodeId = cursor.getString(0);
                statesById.put(nodeId, buildViewState(cursor, nodeId));
            }
        }
        return statesById;
    }

    private static JSObject buildViewState(Cursor cursor, String nodeId) throws JSONException {
        JSObject viewState = new JSObject();
        viewState.put("nodeId", nodeId);
        viewState.put("scrollTop", Math.max(0, cursor.getLong(1)));
        viewState.put("selectionFrom", cursor.isNull(2) ? JSONObject.NULL : Math.max(0, cursor.getLong(2)));
        viewState.put("selectionTo", cursor.isNull(3) ? JSONObject.NULL : Math.max(0, cursor.getLong(3)));
        viewState.put("updatedAt", cursor.getString(4));
        viewState.put("source", cursor.isNull(5) ? "user-scroll" : cursor.getString(5));
        return viewState;
    }
}
