package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

final class FolioleCompanionSyncObjectStore {
    private FolioleCompanionSyncObjectStore() {}

    static JSObject loadSyncIndex(Context context, SQLiteDatabase database) throws Exception {
        return FolioleCompanionNamedQueryStore.loadArray(context, database, "syncIndex");
    }

    static JSObject loadSyncObjects(Context context, SQLiteDatabase database, JSONArray objectIds, JSONArray objectTypes) throws Exception {
        List<String> ids = toStringList(objectIds);
        List<String> types = toStringList(objectTypes);
        if (ids.isEmpty()) {
            JSObject empty = new JSObject();
            empty.put("objects", new JSArray());
            return empty;
        }
        JSObject result = FolioleCompanionNamedQueryStore.loadArray(
            context,
            database,
            "syncObjects",
            syncObjectQueryReplacements(ids.size(), types.size()),
            syncObjectQueryArgs(ids, types)
        );
        appendPayloads(context, database, result.getJSONArray("objects"));
        return result;
    }

    static JSObject loadSyncStateChanges(Context context, SQLiteDatabase database, int cursor, int limit) throws Exception {
        JSObject result = FolioleCompanionNamedQueryStore.loadArray(context, database, "syncStateChanges", new String[] {
            String.valueOf(Math.max(0, cursor)),
            String.valueOf(normalizeLimit(limit))
        });
        appendPayloads(context, database, result.getJSONArray("objects"));
        return result;
    }

    private static void appendPayloads(Context context, SQLiteDatabase database, JSONArray objects) throws Exception {
        for (int index = 0; index < objects.length(); index += 1) {
            JSONObject object = objects.getJSONObject(index);
            object.put("payload_json", object.isNull("deleted_at") ?
                FolioleCompanionSyncObjectPayloadReader.readPayloadJson(
                    context,
                    database,
                    object.getString("object_type"),
                    object.getString("object_id")
                ) :
                JSONObject.NULL);
        }
    }

    private static Map<String, String> syncObjectQueryReplacements(int idCount, int typeCount) {
        Map<String, String> replacements = new HashMap<>();
        replacements.put(":objectIds", placeholders(idCount));
        replacements.put(":objectTypes", typeCount > 0 ? placeholders(typeCount) : "NULL");
        return replacements;
    }

    private static String[] syncObjectQueryArgs(List<String> ids, List<String> types) {
        List<String> args = new ArrayList<>(ids);
        args.add(String.valueOf(types.size()));
        args.addAll(types);
        return args.toArray(new String[0]);
    }

    private static List<String> toStringList(JSONArray values) {
        List<String> strings = new ArrayList<>();
        if (values == null) return strings;
        for (int index = 0; index < values.length(); index += 1) {
            String value = values.optString(index, "").trim();
            if (!value.isEmpty()) strings.add(value);
        }
        return strings;
    }

    private static String placeholders(int count) {
        List<String> placeholders = new ArrayList<>();
        for (int index = 0; index < count; index += 1) placeholders.add("?");
        return String.join(",", placeholders);
    }

    private static int normalizeLimit(int limit) {
        return Math.max(1, Math.min(1000, limit <= 0 ? 500 : limit));
    }

}
