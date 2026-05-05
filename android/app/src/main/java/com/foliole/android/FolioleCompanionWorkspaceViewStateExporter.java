package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionWorkspaceViewStateExporter {

    private FolioleCompanionWorkspaceViewStateExporter() {}

    static JSObject loadPersistedNodeViewById(Context context, SQLiteDatabase database, String deviceId) throws Exception {
        JSObject statesById = new JSObject();
        JSArray rows = FolioleCompanionGeneratedQueryRunner
            .loadRows(
                context,
                database,
                FolioleCompanionWorkspaceReadQueryRules.viewStateString(context, "queryName"),
                FolioleCompanionWorkspaceReadQueryRules.viewStateString(context, "resultKey"),
                new String[] { deviceId }
            );
        for (int index = 0; index < rows.length(); index += 1) {
            JSONObject row = rows.getJSONObject(index);
            String nodeId = row.getString(FolioleCompanionWorkspaceReadQueryRules.viewStateString(context, "nodeIdRowKey"));
            statesById.put(nodeId, buildViewState(context, row));
        }
        return statesById;
    }

    private static JSObject buildViewState(Context context, JSONObject row) throws Exception {
        JSObject viewState = new JSObject();
        JSONArray fields = FolioleCompanionWorkspaceReadQueryRules.viewStateArray(context, "fields");
        for (int index = 0; index < fields.length(); index += 1) {
            JSONObject field = fields.getJSONObject(index);
            viewState.put(fieldOutputKey(context, field), fieldValue(context, row, field));
        }
        return viewState;
    }

    private static Object fieldValue(Context context, JSONObject row, JSONObject field) throws Exception {
        String type = fieldTypeKey(context, field);
        if (fieldType(context, "string").equals(type)) return fieldRowString(context, row, field);
        if (fieldType(context, "nonNegativeLong").equals(type)) return Math.max(0, fieldRowLong(context, row, field));
        if (fieldType(context, "nullableNonNegativeLong").equals(type)) return fieldRowNullableNonNegativeLong(context, row, field);
        if (fieldType(context, "defaultedString").equals(type)) {
            return fieldRowNullableString(context, row, field) == null
                ? FolioleCompanionWorkspaceReadQueryRules.viewStateString(context, fieldDefaultRuleKey(context, field))
                : fieldRowString(context, row, field);
        }
        throw new IllegalStateException("Unsupported workspace view-state field type: " + type);
    }

    private static String fieldDefaultRuleKey(Context context, JSONObject field) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldDefaultRuleKey(context, field);
    }

    private static String fieldOutputKey(Context context, JSONObject field) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldOutputKey(context, field);
    }

    private static long fieldRowLong(Context context, JSONObject row, JSONObject field) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldRowLong(context, row, field);
    }

    private static Object fieldRowNullableNonNegativeLong(Context context, JSONObject row, JSONObject field) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldRowNullableNonNegativeLong(context, row, field);
    }

    private static String fieldRowNullableString(Context context, JSONObject row, JSONObject field) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldRowNullableString(context, row, field);
    }

    private static String fieldRowString(Context context, JSONObject row, JSONObject field) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldRowString(context, row, field);
    }

    private static String fieldTypeKey(Context context, JSONObject field) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldTypeKey(context, field);
    }

    private static String fieldType(Context context, String key) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldType(context, key);
    }
}
